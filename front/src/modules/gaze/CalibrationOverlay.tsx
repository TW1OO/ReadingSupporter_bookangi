import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { GazeController } from './GazeController';
import {
  GRADE_LABEL_KO,
  VALIDATION_GRID,
  buildPoints,
  summarizeValidation,
  type ValidationResult,
  type ValidationSample,
} from './calibration';
import {
  averagePoses,
  checkDrift,
  checkFraming,
  describePose,
  postureDrift,
  type FramingCheck,
  type Pose,
} from './framing';
import './gaze.css';

const CLICKS_PER_POINT = 4;
/** 자세가 이 시간 동안 계속 좋아야 시작할 수 있다 */
const FRAMING_STABLE_MS = 800;
/** 자세 맞추기가 안 풀려도 이 시간이 지나면 그대로 시작할 수 있게 한다(부스 흐름을 막지 않기 위해) */
const FRAMING_OVERRIDE_MS = 6000;

type Phase = 'intro' | 'calibrate' | 'validate' | 'result';

interface Props {
  controller: GazeController;
  onDone: (result: ValidationResult) => void;
  onCancel: () => void;
}

/**
 * 자세 맞추기 → 13점 클릭 보정 → 4점 검증(정확도 측정) → 검증 점까지 합쳐 재학습.
 * 보정 점은 "바라보면서 4번 클릭". 클릭 위치는 실제 마우스 좌표가 아니라 점의 중심을 학습시킨다.
 */
export function CalibrationOverlay({ controller, onDone, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [idx, setIdx] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [measuring, setMeasuring] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [samples, setSamples] = useState<ValidationSample[]>([]);

  const [framing, setFraming] = useState<FramingCheck>({ ok: false, hints: [] });
  const [framingStable, setFramingStable] = useState(false);
  const [framingOverride, setFramingOverride] = useState(false);
  const [poseText, setPoseText] = useState('');
  const [driftHints, setDriftHints] = useState<string[]>([]);
  const calPoses = useRef<Pose[]>([]);
  const valPoses = useRef<Pose[]>([]);

  const calPoints = useMemo(() => buildPoints(window.innerWidth, window.innerHeight), []);
  const valPoints = useMemo(
    () => buildPoints(window.innerWidth, window.innerHeight, VALIDATION_GRID),
    [],
  );

  // 보정 중에는 암묵 학습 off, 종료 시 복구 + 미리보기 숨김
  useEffect(() => {
    controller.setCalibrating(true);
    return () => {
      controller.setCalibrating(false);
      controller.setPreview(false);
    };
  }, [controller]);

  // 안내 화면에서만 카메라 미리보기 (점 위치와 겹치지 않게)
  useEffect(() => {
    controller.setPreview(phase === 'intro');
  }, [controller, phase]);

  // 안내 화면: 자세를 계속 검사해서 충분히 안정적으로 맞았을 때만 시작할 수 있게 한다
  useEffect(() => {
    if (phase !== 'intro') return;
    let okSince: number | null = null;
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const pose = controller.getPose();
      const c = checkFraming(pose);
      setFraming(c);
      controller.setGuideState(c.ok);
      setPoseText(describePose(pose));
      okSince = c.ok ? (okSince ?? now) : null;
      setFramingStable(okSince !== null && now - okSince >= FRAMING_STABLE_MS);
      if (now - t0 >= FRAMING_OVERRIDE_MS) setFramingOverride(true);
    }, 250);
    return () => window.clearInterval(id);
  }, [phase, controller]);

  // 보정/검증 중: 시작 때 자세에서 벗어나면 경고하고, 검증 오차와 비교할 자세를 모은다
  useEffect(() => {
    if (phase !== 'calibrate' && phase !== 'validate') return;
    const id = window.setInterval(() => {
      const d = controller.getDrift();
      setDriftHints(d ? checkDrift(d).hints : []);
      const p = controller.getPose();
      if (p) (phase === 'calibrate' ? calPoses : valPoses).current.push(p);
    }, 300);
    return () => {
      window.clearInterval(id);
      setDriftHints([]);
    };
  }, [phase, controller]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const handleTargetClick = useCallback(() => {
    const p = calPoints[idx];
    controller.recordCalibrationClick(p.x, p.y);
    const next = clicks + 1;
    if (next >= CLICKS_PER_POINT) {
      setClicks(0);
      if (idx + 1 >= calPoints.length) {
        setPhase('validate');
        setIdx(0);
      } else setIdx(idx + 1);
    } else setClicks(next);
  }, [calPoints, clicks, controller, idx]);

  // 검증 단계: 점마다 자동 수집
  useEffect(() => {
    if (phase !== 'validate') return;
    let cancelled = false;
    (async () => {
      setMeasuring(true);
      const p = valPoints[idx];
      const s = await controller.measureTarget(p.x, p.y);
      if (cancelled) return;
      setMeasuring(false);
      setSamples((prev) => [...prev, ...s]);
      if (idx + 1 >= valPoints.length) setPhase('result');
      else setIdx(idx + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, idx, controller, valPoints]);

  useEffect(() => {
    if (phase !== 'result') return;
    const base = summarizeValidation(samples);
    const cal = averagePoses(calPoses.current);
    const val = averagePoses(valPoses.current);
    // 보정 때와 검증 때 자세 차이. 오차와 같이 기록해 머리 움직임의 영향을 본다
    const drift = cal && val ? postureDrift(cal, val) : undefined;
    setResult({ ...base, postureDrift: drift });
  }, [phase, samples]);

  const restart = () => {
    // 이전 학습 데이터(저장분 포함)를 지우고 새로 시작
    void controller.resetTraining();
    controller.captureReference(); // 지금 자세를 기준으로 삼는다
    calPoses.current = [];
    valPoses.current = [];
    setPhase('calibrate');
    setIdx(0);
    setClicks(0);
    setSamples([]);
    setResult(null);
  };

  // 다시 보정: 안내 화면으로 돌아가 자세부터 다시 맞춘다
  const retry = () => {
    controller.clearReference();
    setFraming({ ok: false, hints: [] });
    setFramingStable(false);
    setFramingOverride(false);
    setPhase('intro');
    setIdx(0);
    setClicks(0);
    setSamples([]);
    setResult(null);
  };

  const finish = () => {
    if (!result) return;
    // 검증 오차는 이미 쟀으니, 검증 점도 학습에 합쳐 남은 쏠림까지 줄인다
    controller.commitValidationTraining();
    onDone(result);
  };

  return (
    <div className="gz-scrim" role="dialog" aria-modal="true" aria-label="시선 보정">
      {phase === 'intro' && (
        <div className="gz-card">
          <h2>시선 보정</h2>
          <p>화면에 나타나는 점을 바라보며 각각 4번 클릭해 주세요. 약 50초 걸립니다.</p>
          <ul className="gz-tips">
            <li>얼굴 전체가 카메라에 보이고, 앞쪽에서 조명이 비추는 곳이 좋습니다.</li>
            <li>역광(창문 등을 등지는 자리)은 피해 주세요.</li>
            <li>오른쪽 위 영상의 점선 상자 안에 얼굴 중앙이 오게 앉아 주세요.</li>
            <li>보정 중에는 머리를 크게 움직이지 말고, 점만 바라봐 주세요.</li>
          </ul>
          <p className={`gz-frame ${framing.ok ? 'gz-frame--ok' : ''}`}>
            {framingStable
              ? '자세가 좋습니다. 이 자세를 유지한 채 시작하세요.'
              : framing.ok
                ? '좋아요. 그대로 잠시만 유지해 주세요…'
                : framing.hints.join(' · ') || '자세를 확인하는 중…'}
          </p>
          <p className="gz-frame-debug">현재 자세: {poseText}</p>
          <div className="gz-actions">
            <button className="gz-btn" onClick={onCancel}>나중에</button>
            <button
              className="gz-btn gz-btn--primary"
              onClick={restart}
              disabled={!framingStable && !framingOverride}
            >
              {framingStable ? '시작' : framingOverride ? '그대로 시작' : '자세를 맞춰 주세요'}
            </button>
          </div>
        </div>
      )}

      {driftHints.length > 0 && (phase === 'calibrate' || phase === 'validate') && (
        <div className="gz-warn" role="status">{driftHints.join(' · ')}</div>
      )}

      {phase === 'calibrate' && (
        <>
          <div className="gz-hud">
            점을 보며 클릭 · {idx + 1}/{calPoints.length} ({clicks}/{CLICKS_PER_POINT})
          </div>
          <button
            key={idx}
            className="gz-target gz-target--idle"
            style={
              {
                left: calPoints[idx].x,
                top: calPoints[idx].y,
                '--p': `${(clicks / CLICKS_PER_POINT) * 360}deg`,
              } as CSSProperties
            }
            onClick={handleTargetClick}
            aria-label={`보정 점 ${idx + 1}`}
          />
        </>
      )}

      {phase === 'validate' && (
        <>
          <div className="gz-hud">
            정확도 측정 · 점을 가만히 바라보세요 ({idx + 1}/{valPoints.length})
          </div>
          <div
            key={idx}
            className={`gz-target ${measuring ? '' : 'gz-target--idle'}`}
            style={
              { left: valPoints[idx].x, top: valPoints[idx].y, '--p': '360deg' } as CSSProperties
            }
          />
        </>
      )}

      {phase === 'result' && result && (
        <div className="gz-card">
          <h2>보정 결과: {GRADE_LABEL_KO[result.grade]}</h2>
          <dl className="gz-stat">
            <dt>정확도(점별 중심)</dt>
            <dd>{Math.round(result.accuracyPx)}px</dd>
            <dt>평균 오차(떨림 포함)</dt>
            <dd>{Math.round(result.meanErrorPx)}px</dd>
            <dt>90% 오차 이내</dt>
            <dd>{Math.round(result.p90ErrorPx)}px</dd>
            <dt>쏠림(편향)</dt>
            <dd>
              x {Math.round(result.bias.dx)}px, y {Math.round(result.bias.dy)}px
            </dd>
          </dl>
          <p className="gz-frame-debug">"이대로 시작"을 누르면 검증 점도 학습에 합쳐 쏠림을 더 줄입니다.</p>
          {result.grade === 'poor' && (
            <p>오차가 큽니다. 조명을 밝게 하고 카메라와 눈높이를 맞춘 뒤 다시 보정해 보세요.</p>
          )}
          <div className="gz-actions">
            <button className="gz-btn" onClick={retry}>다시 보정</button>
            <button className="gz-btn gz-btn--primary" onClick={finish}>이대로 시작</button>
          </div>
        </div>
      )}
    </div>
  );
}
