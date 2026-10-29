import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  BLINK_OPEN,
  FEATURE_DIM,
  FEATURE_MIN_STD,
  LinearGazeModel,
  extractFeatures,
  type Landmark,
  type TrainSample,
} from './linearGaze';
import { FRAMING, averagePoses, extractPose, type Pose } from './framing';
import { centerCrop, cropToFull, followFace, type CropRect } from './cropFollow';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const WASM_DIR = `${BASE}/mediapipe/wasm`;
const MODEL_PATH = `${BASE}/mediapipe/face_landmarker.task`;

const STORE_KEY = 'bookangi.gaze.samples.v2';
const MAX_SAMPLES = 300;
/** 클릭 순간의 특징은 직전 이 시간 동안의 프레임 평균으로 쓴다(눈 깜빡임/떨림 완화). */
const CLICK_WINDOW_MS = 300;
/** 화면 밖으로 이만큼까지는 예측을 허용한다(정규화 좌표). */
const CLAMP_MIN = -0.2;
const CLAMP_MAX = 1.2;
/** 홍채 오프셋 4개(앞쪽 특징)만 2차항으로 확장한다. 머리 자세는 선형으로 둔다. */
const POLY_COUNT = 4;

/** 오토 프레이밍: 모델에 넣는 정사각형 입력 한 변(px). 원본에서 잘라 이 크기로 그린다. */
const CROP_OUT = 480;
/**
 * 오토 프레이밍에서는 얼굴을 따라가는 창 안의 행렬 translation(tx, ty)이 항상 ≈0이라 머리 위치 정보가 사라진다.
 * 그래서 그 두 특징을 "전체 프레임 기준 코끝 위치"로 바꿔 넣는다. 영상 폭 ≈ 60cm라고 가정한 cm 환산(표준편차 하한과 단위를 맞추기 위함).
 */
const POS_SCALE = 60;
const PREVIEW_W = 200;

export interface RawGaze {
  x: number;
  y: number;
}

/**
 * 웹캠 → 화면 좌표(px) 원시 시선 추정. 스무딩/머무름/영역 매핑은 GazeController가 맡는다.
 *
 *   1280×720 원본 → 얼굴을 따라가는 정사각형 창만 잘라 480×480으로(오토 프레이밍) →
 *   MediaPipe Face Landmarker(홍채·눈꺼풀·머리 자세) → 특징 13개 →
 *   ridge 회귀(홍채 2차항, 교차검증 lambda, 이상치 제거) → 화면 좌표
 *
 * 얼굴이 안 잡히면 null을 넘긴다. 아직 학습 전이라 좌표를 못 낼 때는 아무것도 넘기지 않는다.
 */
export class MediaPipeBackend {
  private landmarker: FaceLandmarker | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private box: HTMLDivElement | null = null; // 미리보기 래퍼(영상 + 안내 상자)
  private guide: HTMLDivElement | null = null;
  private cropBox: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private crop: CropRect | null = null;
  private onSample: ((p: RawGaze | null) => void) | null = null;

  private model = new LinearGazeModel(1.0, FEATURE_MIN_STD, true, POLY_COUNT);
  private samples: TrainSample[] = [];
  private recent: { t: number; f: number[] }[] = [];
  private poses: { t: number; p: Pose }[] = [];
  private persist = false;

  private running = false;
  private rafId = 0;
  private vfcId = 0;
  private lastVideoTime = -1;

  async start(onSample: (p: RawGaze | null) => void, opts: { persistTraining: boolean }): Promise<void> {
    this.onSample = onSample;
    this.persist = opts.persistTraining;
    this.loadSamples();

    const vision = await FilesetResolver.forVisionTasks(WASM_DIR);
    const make = (delegate: 'GPU' | 'CPU') =>
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true, // 머리 자세 특징용
      });
    try {
      this.landmarker = await make('GPU');
    } catch {
      this.landmarker = await make('CPU');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      // 잘라 쓰므로 원본 해상도가 높을수록 얼굴(홍채) 픽셀이 늘어난다.
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    });
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.srcObject = this.stream;
    await video.play();
    this.video = video;
    this.buildPreview(video);

    this.canvas = document.createElement('canvas');
    this.canvas.width = CROP_OUT;
    this.canvas.height = CROP_OUT;
    this.ctx = this.canvas.getContext('2d');
    this.crop = centerCrop(video.videoWidth, video.videoHeight);

    this.running = true;
    this.schedule();
  }

  stop() {
    this.running = false;
    this.cancelSchedule();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.box?.remove();
    this.box = this.guide = this.cropBox = null;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.crop = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.onSample = null;
    this.recent = [];
    this.poses = [];
  }

  pause() {
    this.running = false;
    this.cancelSchedule();
  }

  async resume() {
    if (this.running || !this.video) return;
    this.running = true;
    this.schedule();
  }

  /**
   * 사용자가 지금 (x, y)를 보고 있다고 보고 학습 샘플을 만든다(모델에는 아직 넣지 않는다).
   * 얼굴이 안 잡혀 있으면 null.
   */
  capturePoint(x: number, y: number): TrainSample | null {
    const now = performance.now();
    const win = this.recent.filter((r) => now - r.t <= CLICK_WINDOW_MS);
    if (win.length === 0) return null;
    const f = new Array<number>(FEATURE_DIM).fill(0);
    for (const r of win) r.f.forEach((v, j) => (f[j] += v / win.length));
    // 목표를 뷰포트 크기로 정규화해 저장 → ridge 규제가 의도대로 먹고, 창 크기가 바뀌어도 쓸 수 있다.
    return {
      features: f,
      x: x / window.innerWidth,
      y: y / window.innerHeight,
      group: `${Math.round(x)},${Math.round(y)}`, // 같은 목표점에서 모은 샘플끼리 묶는다
    };
  }

  addSamples(list: ReadonlyArray<TrainSample>) {
    if (!list.length) return;
    this.samples.push(...list);
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    this.model.fit(this.samples);
    this.saveSamples();
  }

  /** 사용자가 (x, y)를 보고 있다고 가정하고 학습 샘플을 바로 추가 */
  addTrainingPoint(x: number, y: number) {
    const s = this.capturePoint(x, y);
    if (s) this.addSamples([s]); // 얼굴이 안 잡힌 상태의 클릭은 버린다
  }

  /** 최근 400ms 자세 평균. 그보다 오래 얼굴이 안 잡혔으면 null. */
  getPose(): Pose | null {
    const now = performance.now();
    return averagePoses(this.poses.filter((r) => now - r.t <= 400).map((r) => r.p));
  }

  setPreview(visible: boolean) {
    // display:none이면 일부 브라우저가 프레임 갱신을 멈추므로 화면 밖으로 치운다.
    if (this.box) this.box.style.right = visible ? '24px' : '-9999px';
  }

  /** 미리보기의 시작 가능 구역 색 (자세가 좋으면 초록 실선) */
  setGuide(ok: boolean) {
    if (!this.guide) return;
    this.guide.style.borderColor = ok ? '#4caf50' : '#e0a458';
    this.guide.style.borderStyle = ok ? 'solid' : 'dashed';
  }

  async clearData() {
    this.samples = [];
    this.model.reset();
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
  }

  /* ---------- 내부 ---------- */

  /** 미리보기: 거울처럼 보이는 영상 + 시작 가능 구역(점선) + 지금 잘라 쓰는 창(흰 실선). */
  private buildPreview(video: HTMLVideoElement) {
    const aspect = video.videoWidth / video.videoHeight || 16 / 9;
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed',
      zIndex: '9500',
      width: `${PREVIEW_W}px`,
      height: `${Math.round(PREVIEW_W / aspect)}px`,
      right: '-9999px',
      top: '24px',
      borderRadius: '8px',
      border: '2px solid #4caf50',
      background: '#000',
      overflow: 'hidden',
      pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);

    Object.assign(video.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: 'scaleX(-1)',
    } as Partial<CSSStyleDeclaration>);
    box.appendChild(video);

    const [lo, hi] = FRAMING.ABS.xy;
    const guide = document.createElement('div');
    Object.assign(guide.style, {
      position: 'absolute',
      left: `${lo * 100}%`,
      top: `${lo * 100}%`,
      width: `${(hi - lo) * 100}%`,
      height: `${(hi - lo) * 100}%`,
      border: '2px dashed #e0a458',
      borderRadius: '6px',
      boxSizing: 'border-box',
    } as Partial<CSSStyleDeclaration>);
    box.appendChild(guide);
    this.guide = guide;

    const cropBox = document.createElement('div');
    Object.assign(cropBox.style, {
      position: 'absolute',
      border: '1px solid rgba(255,255,255,0.9)',
      boxSizing: 'border-box',
    } as Partial<CSSStyleDeclaration>);
    box.appendChild(cropBox);
    this.cropBox = cropBox;

    document.body.appendChild(box);
    this.box = box;
  }

  private updateCropBox() {
    const v = this.video;
    const c = this.crop;
    if (!this.cropBox || !v || !c) return;
    const w = v.videoWidth;
    const h = v.videoHeight;
    Object.assign(this.cropBox.style, {
      // 영상이 좌우 반전이라 가로 위치도 뒤집어 준다
      left: `${(1 - (c.sx + c.side) / w) * 100}%`,
      top: `${(c.sy / h) * 100}%`,
      width: `${(c.side / w) * 100}%`,
      height: `${(c.side / h) * 100}%`,
    } as Partial<CSSStyleDeclaration>);
  }

  private schedule() {
    const v = this.video;
    if (!v) return;
    if ('requestVideoFrameCallback' in v) {
      this.vfcId = v.requestVideoFrameCallback(() => this.tick());
    } else {
      this.rafId = requestAnimationFrame(() => this.tick());
    }
  }

  private cancelSchedule() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.vfcId && this.video && 'cancelVideoFrameCallback' in this.video) {
      this.video.cancelVideoFrameCallback(this.vfcId);
    }
    this.rafId = 0;
    this.vfcId = 0;
  }

  private tick() {
    if (!this.running) return;
    const v = this.video;
    const lm = this.landmarker;
    const c = this.crop;
    if (v && lm && c && this.ctx && this.canvas && v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      try {
        this.ctx.drawImage(v, c.sx, c.sy, c.side, c.side, 0, 0, CROP_OUT, CROP_OUT);
        const res = lm.detectForVideo(this.canvas, performance.now());
        this.handleResult(res.faceLandmarks[0], res.facialTransformationMatrixes?.[0]?.data, v);
      } catch (err) {
        console.error('[gaze] mediapipe detect error', err);
      }
    }
    this.schedule();
  }

  private handleResult(
    landmarks: Landmark[] | undefined,
    matrix: ArrayLike<number> | undefined,
    v: HTMLVideoElement,
  ) {
    const now = performance.now();
    const crop = this.crop!;
    const w = v.videoWidth;
    const h = v.videoHeight;

    // 창 안 랜드마크 -> 원본 기준 (자세와 머리 위치는 원본 기준이어야 의미가 있다)
    const full = landmarks?.map((p) => cropToFull(p, crop, w, h));

    // 다음 프레임의 창: 얼굴 중심(양 볼의 중간, 이마~턱의 중간)을 따라간다
    const center =
      full && full.length > 454
        ? { x: ((full[234].x + full[454].x) / 2) * w, y: ((full[10].y + full[152].y) / 2) * h }
        : null;
    this.crop = followFace(crop, center, w, h);
    this.updateCropBox();

    const pose = extractPose(full, matrix);
    if (pose) {
      this.poses.push({ t: now, p: pose });
      while (this.poses.length && now - this.poses[0].t > 1000) this.poses.shift();
    }

    // 특징은 창(정사각형) 좌표계에서 계산한다. 눈 모양 비율이라 창 위치와 무관하다.
    const f = extractFeatures(landmarks, matrix, 1, 1);
    if (!f || !full) {
      this.onSample?.(null); // 얼굴 없음
      return;
    }
    if (f.open < BLINK_OPEN) return; // 깜빡임: 얼굴은 있으니 null은 아니고, 학습/예측에서만 제외

    // tx, ty(창 안에서는 ≈0) 대신 원본 프레임 기준 코끝 위치를 넣는다.
    f.vec[7] = full[1].x * POS_SCALE;
    f.vec[8] = full[1].y * (h / w) * POS_SCALE;

    this.recent.push({ t: now, f: f.vec });
    while (this.recent.length && now - this.recent[0].t > 1000) this.recent.shift();

    const p = this.model.predict(f.vec);
    if (!p) return; // 학습 전에는 좌표를 내지 않는다
    const clamp = (x: number) => Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, x));
    this.onSample?.({ x: clamp(p.x) * window.innerWidth, y: clamp(p.y) * window.innerHeight });
  }

  private loadSamples() {
    this.samples = [];
    if (!this.persist) return;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw) as TrainSample[];
      if (Array.isArray(arr) && arr.every((s) => s.features?.length === FEATURE_DIM)) {
        this.samples = arr.slice(-MAX_SAMPLES);
        this.model.fit(this.samples);
      }
    } catch {
      /* ignore */
    }
  }

  private saveSamples() {
    if (!this.persist) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.samples));
    } catch {
      /* ignore */
    }
  }
}
