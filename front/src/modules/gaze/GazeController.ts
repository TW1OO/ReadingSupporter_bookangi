import { OneEuro2D } from './oneEuro';
import { DwellDetector } from './dwell';
import { resolveRegion } from './regionMapper';
import type { ValidationSample } from './calibration';
import type { TrainSample } from './linearGaze';
import { MediaPipeBackend, type RawGaze } from './mediapipeBackend';
import { checkDrift, postureDrift, type Pose, type PostureDrift } from './framing';
import {
  DEFAULT_OPTIONS,
  type GazeInputEvent,
  type GazeListener,
  type GazeOptions,
  type GazeRegion,
  type GazeStatus,
} from './types';

/** 검증 중 목표점마다 이 간격으로 학습 샘플을 따로 모아 둔다(검증이 끝나면 재학습에 쓴다). */
const VALIDATION_CAPTURE_MS = 300;

/**
 * MediaPipe 시선 추정 위에 얹은 시선 파이프라인.
 *
 *   추정기 raw → 뷰포트 클램프 → One Euro 스무딩 →
 *   (머무름 감지 / 문단·줄 매핑) → InputEvent
 *
 * 손 모듈과 서로 모른다. 바깥으로는 GazeInputEvent만 내보낸다.
 */
export class GazeController {
  private opts: GazeOptions;
  private listeners = new Set<GazeListener>();
  private backend = new MediaPipeBackend();
  private status: GazeStatus = 'idle';

  private filter: OneEuro2D;
  private dwell: DwellDetector;

  private lastEmitAt = 0;
  private lastRegionAt = 0;
  private lastFaceAt = 0;
  private faceDetected = true;
  private region: GazeRegion | null = null;
  private pendingParagraph: { id: string | null; count: number } = { id: null, count: 0 };

  /** 마지막 평활 좌표 (검증용) */
  private lastSmoothed: { x: number; y: number; t: number } | null = null;
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private referencePose: Pose | null = null;
  private postureTimer: number | null = null;
  private postureOk = true;
  private calibrating = false;
  /** 검증 중 모은 학습 샘플. 검증 오차를 정직하게 재려고 측정이 끝날 때까지 모델에 넣지 않는다. */
  private validationSamples: TrainSample[] = [];

  constructor(options: Partial<GazeOptions> = {}) {
    this.opts = {
      ...DEFAULT_OPTIONS,
      ...options,
      smoothing: { ...DEFAULT_OPTIONS.smoothing, ...options.smoothing },
      dwell: { ...DEFAULT_OPTIONS.dwell, ...options.dwell },
    };
    this.filter = new OneEuro2D(this.opts.smoothing);
    this.dwell = new DwellDetector(this.opts.dwell);
  }

  /* ---------- 구독 ---------- */

  on(listener: GazeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: GazeInputEvent) {
    this.listeners.forEach((l) => {
      try {
        l(e);
      } catch (err) {
        console.error('[gaze] listener error', err);
      }
    });
  }

  getStatus() {
    return this.status;
  }

  setRoot(el: HTMLElement | null) {
    this.opts.root = el;
  }

  private setStatus(status: GazeStatus, error?: string) {
    this.status = status;
    this.emit({ type: 'gaze.status', status, error });
  }

  /* ---------- 생명주기 ---------- */

  async start(): Promise<void> {
    if (this.status === 'ready' || this.status === 'loading') return;
    this.setStatus('loading');
    try {
      this.lastFaceAt = performance.now();
      await this.backend.start((p) => this.handleRaw(p), {
        persistTraining: this.opts.persistTraining,
      });

      if (this.opts.implicitClickTraining) {
        // 읽기 중 단어를 클릭할 때는 그 단어를 보고 있다고 가정하고 클릭만 학습 (보정 중에는 제외)
        this.clickHandler = (e) => {
          if (!this.calibrating) this.backend.addTrainingPoint(e.clientX, e.clientY);
        };
        window.addEventListener('click', this.clickHandler, true);
      }
      this.setPreview(false);

      this.startPostureMonitor();
      this.setStatus('ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const denied = /permission|denied|NotAllowed/i.test(msg);
      this.setStatus('error', denied ? '카메라 권한이 필요합니다.' : msg);
      throw err;
    }
  }

  pause() {
    if (this.status !== 'ready') return;
    this.backend.pause();
    this.setStatus('paused');
  }

  async resume() {
    if (this.status !== 'paused') return;
    await this.backend.resume();
    this.setStatus('ready');
  }

  stop() {
    this.stopPostureMonitor();
    this.referencePose = null;
    if (this.clickHandler) {
      window.removeEventListener('click', this.clickHandler, true);
      this.clickHandler = null;
    }
    this.backend.stop();
    this.filter.reset();
    this.dwell.reset();
    this.region = null;
    this.setStatus('idle');
  }

  /* ---------- 카메라 프레이밍(자세) ---------- */

  getPose(): Pose | null {
    return this.backend.getPose();
  }

  /** 미리보기의 시작 가능 구역 색 (자세가 좋으면 초록) */
  setGuideState(ok: boolean) {
    this.backend.setGuide(ok);
  }

  /** 지금 자세를 기준으로 삼는다. 얼굴이 안 잡혀 있으면 false */
  captureReference(): boolean {
    const p = this.getPose();
    if (!p) return false;
    this.referencePose = p;
    this.postureOk = true;
    return true;
  }

  clearReference() {
    this.referencePose = null;
  }

  /** 기준 자세 대비 현재 자세 이동량. 기준이나 얼굴이 없으면 null */
  getDrift(): PostureDrift | null {
    const cur = this.getPose();
    return this.referencePose && cur ? postureDrift(this.referencePose, cur) : null;
  }

  private startPostureMonitor() {
    if (this.postureTimer !== null) return;
    // 상태가 바뀔 때만 이벤트를 낸다 (읽는 동안 자세가 흐트러지면 앱이 안내할 수 있다)
    this.postureTimer = window.setInterval(() => {
      const d = this.getDrift();
      if (!d) return;
      const c = checkDrift(d);
      if (c.ok !== this.postureOk) {
        this.postureOk = c.ok;
        this.emit({ type: 'gaze.posture', t: performance.now(), ok: c.ok, hints: c.hints });
      }
    }, 500);
  }

  private stopPostureMonitor() {
    if (this.postureTimer !== null) window.clearInterval(this.postureTimer);
    this.postureTimer = null;
  }

  /* ---------- 보정 / 검증 ---------- */

  /** 보정 중 여부. true인 동안은 암묵 클릭 학습을 끈다(보정 클릭이 이중 학습되는 것 방지). */
  setCalibrating(on: boolean) {
    this.calibrating = on;
  }

  /** 카메라 미리보기 표시. 얼굴 위치/조명 확인용. */
  setPreview(visible: boolean) {
    this.backend.setPreview(visible);
  }

  /** 보정 점을 사용자가 클릭할 때마다 호출: 시선↔화면 좌표 학습 데이터 추가 */
  recordCalibrationClick(x: number, y: number) {
    this.backend.addTrainingPoint(x, y);
  }

  /**
   * 한 목표점에 대한 시선 샘플 수집. settle 동안은 버리고 collect 동안만 모은다.
   * 같은 시간에 이 목표점의 학습 샘플도 따로 모아 둔다(commitValidationTraining에서 사용).
   */
  measureTarget(
    x: number,
    y: number,
    { settleMs = 700, collectMs = 1200 }: { settleMs?: number; collectMs?: number } = {},
  ): Promise<ValidationSample[]> {
    return new Promise((resolve) => {
      const samples: ValidationSample[] = [];
      const startAt = performance.now() + settleMs;
      const endAt = startAt + collectMs;
      let lastCaptureAt = 0;
      const timer = window.setInterval(() => {
        const now = performance.now();
        const s = this.lastSmoothed;
        if (s && now >= startAt && now - s.t < 150) {
          samples.push({ targetX: x, targetY: y, gazeX: s.x, gazeY: s.y });
        }
        if (now >= startAt && now - lastCaptureAt >= VALIDATION_CAPTURE_MS) {
          const t = this.backend.capturePoint(x, y);
          if (t) {
            this.validationSamples.push(t);
            lastCaptureAt = now;
          }
        }
        if (now >= endAt) {
          window.clearInterval(timer);
          resolve(samples);
        }
      }, 33);
    });
  }

  /**
   * 검증 점들도 정답을 아는 데이터다. 검증 오차를 잰 뒤 모델에 합쳐 다시 학습한다.
   * 보정 점(13곳) 사이의 빈 위치가 채워져 일반화가 좋아지고, 남아 있던 쏠림도 같이 줄어든다.
   */
  commitValidationTraining() {
    this.backend.addSamples(this.validationSamples);
    this.validationSamples = [];
  }

  async resetTraining() {
    this.validationSamples = [];
    await this.backend.clearData();
    this.filter.reset();
    this.dwell.reset();
  }

  /* ---------- 파이프라인 ---------- */

  private handleRaw(data: RawGaze | null) {
    const now = performance.now();

    if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.y)) {
      if (this.faceDetected && now - this.lastFaceAt > this.opts.faceLostMs) {
        this.faceDetected = false;
        this.dwell.reset();
        this.emit({ type: 'gaze.quality', t: now, faceDetected: false });
      }
      return;
    }

    this.lastFaceAt = now;
    if (!this.faceDetected) {
      this.faceDetected = true;
      this.emit({ type: 'gaze.quality', t: now, faceDetected: true });
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const rawX = Math.min(w, Math.max(0, data.x));
    const rawY = Math.min(h, Math.max(0, data.y));

    const sm = this.filter.filter(rawX, rawY, now);
    this.lastSmoothed = { x: sm.x, y: sm.y, t: now };

    const x = Math.min(w, Math.max(0, sm.x));
    const y = Math.min(h, Math.max(0, sm.y));

    const dwellEvent = this.dwell.push({ x, y, t: now });

    // 영역 추정은 ~15Hz면 충분 (DOM 측정 비용)
    const regionDue = now - this.lastRegionAt >= 66 || !!dwellEvent;
    if (regionDue) {
      this.lastRegionAt = now;
      this.updateRegion(x, y, now);
    }

    if (now - this.lastEmitAt >= 1000 / this.opts.maxEmitHz) {
      this.lastEmitAt = now;
      this.emit({
        type: 'gaze.point',
        t: now,
        x,
        y,
        rawX,
        rawY,
        dwellProgress: this.dwell.progress,
      });
    }

    if (dwellEvent) {
      this.emit({
        type: 'gaze.dwell',
        t: now,
        x: dwellEvent.x,
        y: dwellEvent.y,
        durationMs: dwellEvent.durationMs,
        region: this.region,
      });
    }
  }

  /**
   * 문단 전환에 히스테리시스: 새 문단이 3회 연속 잡혀야 바뀐다 → 경계에서 깜빡임 방지.
   * 같은 문단 안에서 줄이 바뀌는 것은 즉시 반영.
   */
  private updateRegion(x: number, y: number, t: number) {
    const root = this.opts.root ?? document.body;
    const next = resolveRegion(root, x, y, this.opts.regionTolerancePx);
    const nextId = next?.paragraphId ?? null;
    const curId = this.region?.paragraphId ?? null;

    if (nextId === curId) {
      this.pendingParagraph = { id: null, count: 0 };
      const changed =
        next?.lineIndex !== this.region?.lineIndex ||
        (next && this.region && next.wordIds.join() !== this.region.wordIds.join());
      this.region = next;
      if (changed) this.emit({ type: 'gaze.region', t, region: next });
      return;
    }

    if (this.pendingParagraph.id === nextId) this.pendingParagraph.count++;
    else this.pendingParagraph = { id: nextId, count: 1 };

    if (this.pendingParagraph.count >= 3) {
      this.pendingParagraph = { id: null, count: 0 };
      this.region = next;
      this.emit({ type: 'gaze.region', t, region: next });
    }
  }
}
