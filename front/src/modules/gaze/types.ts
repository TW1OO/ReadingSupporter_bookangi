/** 시선 모듈이 바깥(state reducer)으로 내보내는 이벤트와 공용 타입. */

export type GazeStatus =
  | 'idle'
  | 'loading'
  | 'ready' // 카메라 켜짐, 추적 중
  | 'paused'
  | 'error';

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface GazeSample {
  x: number;
  y: number;
  t: number; // ms (performance.now 기준)
}

/** 시선이 가리키는 문단/줄. 시선 오차(~100px)를 감안해 "영역" 수준으로만 말한다. */
export interface GazeRegion {
  paragraphId: string;
  paragraphRect: RectLike;
  lineIndex: number | null;
  lineRect: RectLike | null;
  /** 줄과 겹치는 단어(data-word-id) 후보. 뷰어가 data-word-id를 달아주면 채워진다. */
  wordIds: string[];
  /** 0~1. 시선이 문단 안쪽이면 1, 허용 거리 끝이면 0에 가깝다. */
  confidence: number;
}

export type GazeInputEvent =
  | { type: 'gaze.status'; status: GazeStatus; error?: string }
  | {
      type: 'gaze.point';
      t: number;
      x: number;
      y: number;
      rawX: number;
      rawY: number;
      /** 머무름 진행률 0~1 (UI 링 표시용) */
      dwellProgress: number;
    }
  | { type: 'gaze.region'; t: number; region: GazeRegion | null }
  | {
      type: 'gaze.dwell';
      t: number;
      x: number;
      y: number;
      durationMs: number;
      region: GazeRegion | null;
    }
  | { type: 'gaze.quality'; t: number; faceDetected: boolean }
  /** 보정 시작 때의 자세에서 벗어났는지(ok=false면 hints를 사용자에게 보여 준다). 자세를 아는 추정기에서만 발행 */
  | { type: 'gaze.posture'; t: number; ok: boolean; hints: string[] };

export type GazeListener = (e: GazeInputEvent) => void;

export interface GazeOptions {
  /** 이 요소 안의 [data-gaze-paragraph]만 영역 추정 대상으로 본다. 기본 document.body */
  root: HTMLElement | null;
  /** point 이벤트 최대 발행 빈도 */
  maxEmitHz: number;
  /** One Euro 필터 */
  smoothing: { minCutoff: number; beta: number; dCutoff: number };
  dwell: {
    minDurationMs: number;
    maxDispersionPx: number;
    releaseRadiusPx: number;
    windowMs: number;
  };
  /** 문단 허용 거리(px). 시선 오차 ~100px 기준 */
  regionTolerancePx: number;
  /** 얼굴이 이 시간 이상 안 잡히면 quality 이벤트 발행 */
  faceLostMs: number;
  /** 마우스 이동은 학습에서 제외하고, 클릭만 학습 데이터로 쓴다 */
  implicitClickTraining: boolean;
  /** 보정 학습 데이터를 저장해 다음 방문 때 재사용 (부스처럼 사용자가 바뀌면 끈다) */
  persistTraining: boolean;
}

export const DEFAULT_OPTIONS: GazeOptions = {
  root: null,
  maxEmitHz: 30,
  // beta는 px/s 속도에 곱해진다. 시선 좌표는 프레임마다 수십 px 튀어서 beta가 크면 그 튐 때문에 필터가 열려 버린다.
  smoothing: { minCutoff: 0.6, beta: 0.001, dCutoff: 1.0 },
  dwell: {
    minDurationMs: 700,
    maxDispersionPx: 140, // x범위+y범위 합. 오차 ~100px를 감안해 넉넉히
    releaseRadiusPx: 180,
    windowMs: 2000,
  },
  regionTolerancePx: 70,
  faceLostMs: 800,
  implicitClickTraining: true,
  persistTraining: false, // 부스: 방문자마다 보정하므로 이전 사람의 학습 데이터를 불러오지 않는다
};
