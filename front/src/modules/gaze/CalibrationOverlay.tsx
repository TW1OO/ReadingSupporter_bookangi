import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { GazeController } from './GazeController';
import {
  GRADE_LABEL_KO,
  VALIDATION_GRID,
  buildPoints,
  summarizeValidation,
  type ValidationResult,
  type ValidationSample,
} from './calibration';
import './gaze.css';

const CLICKS_PER_POINT = 5;

type Phase = 'intro' | 'calibrate' | 'validate' | 'result';

interface Props {
  controller: GazeController;
  onDone: (result: ValidationResult) => void;
  onCancel: () => void;
}

/**
 * 9점 클릭 보정 → 5점 검증(정확도 측정) → 결과/편향 보정 적용.
 * 보정 점은 "바라보면서 5번 클릭". 클릭 위치는 실제 마우스 좌표가 아니라 점의 중심을 학습시킨다.
 */
export function CalibrationOverlay({ controller, onDone, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [idx, setIdx] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [measuring, setMeasuring] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [samples, setSamples] = useState<ValidationSample[]>([]);

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
    if (phase === 'result') setResult(summarizeValidation(samples));
  }, [phase, samples]);

  const restart = () => {
    // 이전 학습 데이터(IndexedDB 저장분 포함)와 편향 보정을 지우고 새로 시작
    void controller.resetTraining();
    setPhase('calibrate');
    setIdx(0);
    setClicks(0);
    setSamples([]);
    setResult(null);
  };

  const finish = () => {
    if (!result) return;
    if (result.biasWorthApplying) controller.applyBias(result.bias);
    onDone(result);
  };

  return (
    <div className="gz-scrim" role="dialog" aria-modal="true" aria-label="시선 보정">
      {phase === 'intro' && (
        <div className="gz-card">
          <h2>시선 보정</h2>
          <p>화면에 나타나는 점을 바라보며 각각 5번 클릭해 주세요. 약 1분 걸립니다.</p>
          <ul className="gz-tips">
            <li>얼굴 전체가 카메라에 보이고, 앞쪽에서 조명이 비추는 곳이 좋습니다.</li>
            <li>역광(창문 등을 등지는 자리)은 피해 주세요.</li>
            <li>오른쪽 위 영상에서 초록 상자가 얼굴을 따라오는지 확인하세요.</li>
            <li>보정 중에는 머리를 크게 움직이지 말고, 점만 바라봐 주세요.</li>
          </ul>
          <div className="gz-actions">
            <button className="gz-btn" onClick={onCancel}>나중에</button>
            <button className="gz-btn gz-btn--primary" onClick={restart}>시작</button>
          </div>
        </div>
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
            <dt>평균 오차</dt>
            <dd>{Math.round(result.meanErrorPx)}px</dd>
            <dt>90% 오차 이내</dt>
            <dd>{Math.round(result.p90ErrorPx)}px</dd>
            <dt>쏠림(편향)</dt>
            <dd>
              x {Math.round(result.bias.dx)}px, y {Math.round(result.bias.dy)}px
              {result.biasWorthApplying
                ? ` → 적용 시 평균 ${Math.round(result.meanErrorAfterBiasPx)}px`
                : ''}
            </dd>
          </dl>
          {result.grade === 'poor' && (
            <p>오차가 큽니다. 조명을 밝게 하고 카메라와 눈높이를 맞춘 뒤 다시 보정해 보세요.</p>
          )}
          <div className="gz-actions">
            <button className="gz-btn" onClick={restart}>다시 보정</button>
            <button className="gz-btn gz-btn--primary" onClick={finish}>이대로 시작</button>
          </div>
        </div>
      )}
    </div>
  );
}
