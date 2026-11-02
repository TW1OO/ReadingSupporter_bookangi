import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { isBrightEnough, isInHandBox, meanLuma } from './brightness';
import type { GazeController } from './GazeController';
import {
  FINISH_MODE_LABEL_KO,
  GRADE_LABEL_KO,
  RECHECK_GRID,
  VALIDATION_GRID,
  buildPoints,
  formatReport,
  summarizeValidation,
  type CalibrationReport,
  type FinishMode,
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
const POINT_DONE_MS = 220;
/** 자세가 이 시간 동안 계속 좋아야 시작할 수 있다 */
const FRAMING_STABLE_MS = 800;
/** 자세 맞추기가 안 풀려도 이 시간이 지나면 그대로 시작할 수 있게 한다(부스 흐름을 막지 않기 위해) */
const FRAMING_OVERRIDE_MS = 6000;
const MODE_KEY = 'bookangi.gaze.finishMode';

type Phase = 'intro' | 'calibrate' | 'validate' | 'recheck' | 'result';

interface Props {
  controller: GazeController;
  onDone: (report: CalibrationReport) => void;
  onCancel: () => void;
  /** reader: 읽기 화면용 안내(카메라 영상 포함, 비교 실험 UI 없음). 기본은 ?gaze 실험 화면 */
  variant?: 'demo' | 'reader';
  /** 손 위치 확인용. 손 인식이 꺼져 있으면 null 을 돌려준다 */
  getHandCenter?: () => { x: number; y: number } | null;
  handOn?: boolean;
  /** 손 제스처 구독. ok: 시작·완료, palm: 클릭과 같다. 손 모듈은 앱이 연결한다 */
  subscribeGesture?: (listener: (g: 'ok' | 'palm') => void) => () => void;
}

function loadMode(): FinishMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'bias' ? 'bias' : 'retrain';
  } catch {
    return 'retrain';
  }
}

/**
 * 자세 맞추기 → 13점 클릭 보정 → 검증 1(4점) → 마무리(재학습 또는 쏠림 보정) → 검증 2(새 4점) → 결과.
 * 보정 점은 "바라보면서 4번 클릭". 클릭 위치는 실제 마우스 좌표가 아니라 점의 중심을 학습시킨다.
 * 검증 2는 보정·검증 1과 겹치지 않는 위치라서 두 마무리 방식의 효과를 공정하게 비교할 수 있다.
 */
export function CalibrationOverlay({ controller, onDone, onCancel, variant = 'demo', getHandCenter, handOn = false, subscribeGesture }: Props) {
  const reader = variant === 'reader';
  const [phase, setPhase] = useState<Phase>('intro');
  const [idx, setIdx] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [measuring, setMeasuring] = useState(false);
  const [mode, setMode] = useState<FinishMode>(() => (reader ? 'retrain' : loadMode()));
  const [bright, setBright] = useState<boolean | null>(null);
  const [handIn, setHandIn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [before, setBefore] = useState<ValidationResult | null>(null);
  const [report, setReport] = useState<CalibrationReport | null>(null);
  const [copied, setCopied] = useState(false);
  const samples = useRef<ValidationSample[]>([]);

  const [framing, setFraming] = useState<FramingCheck>({ ok: false, hints: [] });
  const [framingStable, setFramingStable] = useState(false);
  const [framingOverride, setFramingOverride] = useState(false);
  const [poseText, setPoseText] = useState('');
  const [driftHints, setDriftHints] = useState<string[]>([]);
  const calPoses = useRef<Pose[]>([]);
  const valPoses = useRef<Pose[]>([]);

  // 점 위치는 보정을 시작할 때의 화면 크기로 정한다 (패드를 돌린 뒤에도 맞도록)
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [videoRatio, setVideoRatio] = useState(16 / 9);
  const [rotated, setRotated] = useState(false);
  const calPoints = useMemo(() => buildPoints(viewport.w, viewport.h), [viewport]);
  const valPoints = useMemo(() => buildPoints(viewport.w, viewport.h, VALIDATION_GRID), [viewport]);
  const recheckPoints = useMemo(() => buildPoints(viewport.w, viewport.h, RECHECK_GRID), [viewport]);

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
    controller.setPreview(!reader && phase === 'intro');
  }, [controller, phase, reader]);

  // 읽기 화면 안내: 카메라 영상을 카드 안에 보여 주고 조명과 손 위치를 확인한다
  useEffect(() => {
    if (!reader || phase !== 'intro') return;
    const video = videoRef.current;
    if (video) video.srcObject = controller.getStream();
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 24;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const id = window.setInterval(() => {
      setHandIn(isInHandBox(getHandCenter?.()));
      if (!video || !ctx || video.readyState < 2) return;
      if (video.videoWidth && video.videoHeight) setVideoRatio(video.videoWidth / video.videoHeight);
      ctx.drawImage(video, 0, 0, 32, 24);
      setBright(isBrightEnough(meanLuma(ctx.getImageData(0, 0, 32, 24).data)));
    }, 400);
    return () => window.clearInterval(id);
  }, [controller, phase, reader, getHandCenter]);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

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
    if (phase !== 'calibrate' && phase !== 'validate' && phase !== 'recheck') return;
    const id = window.setInterval(() => {
      const d = controller.getDrift();
      setDriftHints(d ? checkDrift(d).hints : []);
      const p = controller.getPose();
      if (p && phase === 'calibrate') calPoses.current.push(p);
      if (p && phase === 'validate') valPoses.current.push(p);
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
    if (clicks >= CLICKS_PER_POINT) return;
    const p = calPoints[idx];
    controller.recordCalibrationClick(p.x, p.y);
    setClicks(clicks + 1);
  }, [calPoints, clicks, controller, idx]);

  // 네 칸이 다 찬 모습을 잠깐 보여 준 뒤 다음 점으로 넘어간다
  useEffect(() => {
    if (phase !== 'calibrate' || clicks < CLICKS_PER_POINT) return;
    const id = window.setTimeout(() => {
      setClicks(0);
      if (idx + 1 >= calPoints.length) {
        samples.current = [];
        setPhase('validate');
        setIdx(0);
      } else setIdx(idx + 1);
    }, POINT_DONE_MS);
    return () => window.clearTimeout(id);
  }, [phase, clicks, idx, calPoints.length]);

  // 검증 1 / 검증 2: 점마다 자동 수집
  useEffect(() => {
    if (phase !== 'validate' && phase !== 'recheck') return;
    const points = phase === 'validate' ? valPoints : recheckPoints;
    let cancelled = false;
    (async () => {
      setMeasuring(true);
      const p = points[idx];
      // 검증 2에서 모은 샘플은 학습에 쓰지 않는다 (두 방식이 같은 조건에서 비교되도록)
      const s = await controller.measureTarget(p.x, p.y, { capture: phase === 'validate' });
      if (cancelled) return;
      setMeasuring(false);
      samples.current.push(...s);
      if (idx + 1 < points.length) {
        setIdx(idx + 1);
        return;
      }

      const result = summarizeValidation(samples.current);
      samples.current = [];
      setIdx(0);
      if (phase === 'validate') {
        // 보정 때와 검증 때 자세 차이. 오차와 같이 기록해 머리 움직임의 영향을 본다
        const cal = averagePoses(calPoses.current);
        const val = averagePoses(valPoses.current);
        const first = { ...result, postureDrift: cal && val ? postureDrift(cal, val) : undefined };
        setBefore(first);
        if (mode === 'retrain') {
          controller.commitValidationTraining();
        } else {
          controller.discardValidationTraining();
          controller.applyBias(first.bias);
        }
        setPhase('recheck');
      } else {
        setReport({
          mode,
          before: before!,
          after: result,
          viewport: { w: window.innerWidth, h: window.innerHeight },
          at: new Date(),
        });
        setPhase('result');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, idx, controller, valPoints, recheckPoints, mode, before]);

  const restart = () => {
    // 이전 학습 데이터와 쏠림 보정을 지우고 새로 시작
    void controller.resetTraining();
    controller.captureReference(); // 지금 자세를 기준으로 삼는다
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    setRotated(false);
    calPoses.current = [];
    valPoses.current = [];
    samples.current = [];
    setPhase('calibrate');
    setIdx(0);
    setClicks(0);
    setBefore(null);
    setReport(null);
    setCopied(false);
  };

  // 다시 보정: 안내 화면으로 돌아가 자세(와 마무리 방식)부터 다시 고른다
  const retry = () => {
    controller.clearReference();
    setFraming({ ok: false, hints: [] });
    setFramingStable(false);
    setFramingOverride(false);
    setPhase('intro');
    setIdx(0);
    setClicks(0);
    setBefore(null);
    setReport(null);
    setCopied(false);
  };

  const finish = () => {
    if (report) onDone(report);
  };

  // 보정 중에 화면을 돌리면 지금까지 모은 값이 맞지 않으므로 처음으로 돌아간다
  const onRotate = useRef(() => {});
  onRotate.current = () => {
    if (phase === 'intro') return;
    setRotated(true);
    retry();
  };
  useEffect(() => {
    const listener = () => onRotate.current();
    window.addEventListener('orientationchange', listener);
    return () => window.removeEventListener('orientationchange', listener);
  }, []);

  const onGesture = useRef<(g: 'ok' | 'palm') => void>(() => {});
  onGesture.current = (g) => {
    if (g === 'palm' && phase === 'calibrate') handleTargetClick();
    if (g === 'ok' && phase === 'intro' && (framingStable || framingOverride)) restart();
    if (g === 'ok' && phase === 'result') finish();
  };
  useEffect(() => subscribeGesture?.((g) => onGesture.current(g)), [subscribeGesture]);

  const reportText = report ? formatReport(report) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const px = (v: number) => (Number.isFinite(v) ? `${Math.round(v)}px` : '-');
  const measurePoints = phase === 'validate' ? valPoints : recheckPoints;

  return (
    <div className={`gz-scrim${reader && (phase === 'intro' || phase === 'result') ? ' gz-scrim--soft' : ''}`} role="dialog" aria-modal="true" aria-label="시선 보정">
      {reader && phase === 'intro' && (
        <div className="gz-setup">
          <small>시작 전 한 번만</small>
          <h2>카메라 위치를 맞춰 주세요</h2>
          {rotated && <p role="status">화면 방향이 바뀌어 보정을 처음부터 다시 해요.</p>}
          <div
            className={`gz-setup-view${videoRatio < 1 ? ' gz-setup-view--portrait' : ''}`}
            style={{ '--gz-ar': videoRatio } as CSSProperties}
          >
            <video ref={videoRef} autoPlay muted playsInline />
            <span className={`gz-face-chip${poseText !== '얼굴 없음' && poseText ? ' ok' : ''}`}>
              <i />{poseText !== '얼굴 없음' && poseText ? '얼굴 인식됨' : '얼굴을 찾는 중'}
            </span>
            <div className={`gz-face-oval${framing.ok ? ' ok' : ''}`} />
            <div className={`gz-hand-box${handIn ? ' ok' : ''}`}><span>손 위치</span></div>
          </div>
          <ul className="gz-checks">
            <li className={framing.ok ? 'ok' : ''}>{framing.ok ? '얼굴이 화면 가운데에 있어요' : framing.hints[0] || '얼굴 위치를 확인하는 중이에요'}</li>
            <li className={bright ? 'ok' : ''}>{bright === null ? '조명을 확인하는 중이에요' : bright ? '조명이 충분해요' : '조금 더 밝은 곳으로 옮겨 주세요'}</li>
            <li className={handIn ? 'ok' : ''}>{!handOn ? '손 인식은 읽기 도구에서 켤 수 있어요' : handIn ? '손이 상자 안에 있어요' : '손을 오른쪽 아래 상자 안에 들어 주세요'}</li>
          </ul>
          <p>다음으로 화면에 나타나는 점 {calPoints.length}개를 차례로 바라보며 {handOn ? '손을 펴거나 클릭해' : '클릭해'} 시선을 보정해요. {handOn && '준비되면 손으로 OK 표시를 해 주세요. '}보정이 끝나면 카메라 화면은 사라지고, 오른쪽 위 작은 표시로만 인식 상태를 알려 드려요. 카메라 영상은 이 기기 안에서만 처리돼요.</p>
          <div className="gz-actions">
            <button className="gz-btn" onClick={onCancel}>나중에</button>
            <button className="gz-btn gz-btn--primary" onClick={restart} disabled={!framingStable && !framingOverride}>
              {framingStable || framingOverride ? '시선 보정 시작' : '자세를 맞춰 주세요'}
            </button>
          </div>
        </div>
      )}
      {!reader && phase === 'intro' && (
        <div className="gz-card">
          <h2>시선 보정</h2>
          <p>화면에 나타나는 점을 바라보며 각각 4번 클릭해 주세요. 약 1분 걸립니다.</p>
          <ul className="gz-tips">
            <li>얼굴 전체가 카메라에 보이고, 앞쪽에서 조명이 비추는 곳이 좋습니다.</li>
            <li>역광(창문 등을 등지는 자리)은 피해 주세요.</li>
            <li>오른쪽 위 영상의 점선 상자 안에 얼굴 중앙이 오게 앉아 주세요.</li>
            <li>보정 중에는 머리를 크게 움직이지 말고, 점만 바라봐 주세요.</li>
          </ul>
          <fieldset className="gz-mode">
            <legend>마무리 방식 (비교용)</legend>
            {(['retrain', 'bias'] as const).map((m) => (
              <label key={m}>
                <input type="radio" name="gz-mode" checked={mode === m} onChange={() => setMode(m)} />
                {FINISH_MODE_LABEL_KO[m]}
                <span className="gz-mode-desc">
                  {m === 'retrain' ? ' — 검증 점까지 합쳐 다시 학습' : ' — 검증에서 잰 쏠림만큼 좌표를 옮김'}
                </span>
              </label>
            ))}
          </fieldset>
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

      {driftHints.length > 0 && phase !== 'intro' && phase !== 'result' && (
        <div className="gz-warn" role="status">{driftHints.join(' · ')}</div>
      )}

      {phase === 'calibrate' && (
        <>
          <div className="gz-hud">
            점을 보며 {handOn ? '손을 펴거나 클릭' : '클릭'} · {idx + 1}/{calPoints.length} ({clicks}/{CLICKS_PER_POINT})
          </div>
          <button
            key={idx}
            className="gz-target gz-target--clicks"
            style={
              {
                left: calPoints[idx].x,
                top: calPoints[idx].y,
                '--p': `${(clicks / CLICKS_PER_POINT) * 360}deg`,
              } as CSSProperties
            }
            onClick={handleTargetClick}
            aria-label={`보정 점 ${idx + 1}, ${clicks}/${CLICKS_PER_POINT}번 클릭함`}
          />
        </>
      )}

      {(phase === 'validate' || phase === 'recheck') && (
        <>
          <div className="gz-hud">
            {phase === 'validate' ? '정확도 측정' : `마무리(${FINISH_MODE_LABEL_KO[mode]}) 확인`} · 점을 가만히
            바라보세요 ({idx + 1}/{measurePoints.length})
          </div>
          <div
            key={`${phase}-${idx}`}
            className={`gz-target ${measuring ? '' : 'gz-target--idle'}`}
            style={
              { left: measurePoints[idx].x, top: measurePoints[idx].y, '--p': '360deg' } as CSSProperties
            }
          />
        </>
      )}

      {reader && phase === 'result' && report && (
        <div className="gz-setup gz-setup--result">
          <small>시선 보정 완료</small>
          <h2>보정 결과: {GRADE_LABEL_KO[report.after.grade]}</h2>
          <p>시선 오차는 약 {px(report.after.accuracyPx)}예요. 문장을 대략 잡는 데 쓰고, 단어는 제스처로 맞춰 고르면 돼요.</p>
          {report.after.grade === 'poor' && <p>오차가 커요. 조명을 밝게 하고 카메라와 눈높이를 맞춘 뒤 다시 보정해 보세요.</p>}
          <div className="gz-actions">
            <button className="gz-btn" onClick={retry}>다시 보정</button>
            <button className="gz-btn gz-btn--primary" onClick={finish}>읽기 시작</button>
          </div>
        </div>
      )}
      {!reader && phase === 'result' && report && (
        <div className="gz-card">
          <h2>보정 결과: {GRADE_LABEL_KO[report.after.grade]}</h2>
          <table className="gz-compare">
            <thead>
              <tr>
                <th />
                <th>검증 1 (마무리 전)</th>
                <th>검증 2 ({FINISH_MODE_LABEL_KO[report.mode]} 후)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>정확도(점별 중심)</th>
                <td>{px(report.before.accuracyPx)}</td>
                <td>{px(report.after.accuracyPx)}</td>
              </tr>
              <tr>
                <th>평균 오차(떨림 포함)</th>
                <td>{px(report.before.meanErrorPx)}</td>
                <td>{px(report.after.meanErrorPx)}</td>
              </tr>
              <tr>
                <th>90% 오차 이내</th>
                <td>{px(report.before.p90ErrorPx)}</td>
                <td>{px(report.after.p90ErrorPx)}</td>
              </tr>
              <tr>
                <th>쏠림 (x, y)</th>
                <td>
                  {Math.round(report.before.bias.dx)}, {Math.round(report.before.bias.dy)}
                </td>
                <td>
                  {Math.round(report.after.bias.dx)}, {Math.round(report.after.bias.dy)}
                </td>
              </tr>
            </tbody>
          </table>
          {report.after.grade === 'poor' && (
            <p>오차가 큽니다. 조명을 밝게 하고 카메라와 눈높이를 맞춘 뒤 다시 보정해 보세요.</p>
          )}
          <div className="gz-copy">
            <textarea
              readOnly
              value={reportText}
              rows={reportText.split('\n').length}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="복사용 결과"
            />
            <button className="gz-btn" onClick={copy}>{copied ? '복사됨' : '결과 복사'}</button>
          </div>
          <div className="gz-actions">
            <button className="gz-btn" onClick={retry}>다시 보정</button>
            <button className="gz-btn gz-btn--primary" onClick={finish}>이대로 시작</button>
          </div>
        </div>
      )}
    </div>
  );
}
