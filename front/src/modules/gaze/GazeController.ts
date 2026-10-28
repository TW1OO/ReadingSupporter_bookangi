import type { WebGazerApi } from 'webgazer';
import { OneEuro2D } from './oneEuro';
import { DwellDetector } from './dwell';
import { resolveRegion } from './regionMapper';
import type { ValidationSample } from './calibration';
import {
  DEFAULT_OPTIONS,
  type GazeInputEvent,
  type GazeListener,
  type GazeOptions,
  type GazeRegion,
  type GazeStatus,
} from './types';


let scriptPromise: Promise<WebGazerApi> | null = null;

function loadWebGazer(): Promise<WebGazerApi> {
  const w = window as unknown as { webgazer?: WebGazerApi };
  if (w.webgazer) return Promise.resolve(w.webgazer);
  if (!scriptPromise) {
    scriptPromise = new Promise<WebGazerApi>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${import.meta.env.BASE_URL}webgazer.js`;
      s.async = true;
      s.onload = () =>
        w.webgazer
          ? resolve(w.webgazer)
          : reject(new Error('webgazer.js는 로드됐지만 window.webgazer가 없습니다.'));
      s.onerror = () => reject(new Error('webgazer.js를 불러오지 못했습니다. npm install 후 서버를 다시 시작하세요.'));
      document.head.appendChild(s);
    }).catch((e) => {
      scriptPromise = null; // 재시도 가능
      throw e;
    });
  }
  return scriptPromise;
}

const OFFSET_KEY = 'bookangi.gaze.offset.v1';

interface StoredOffset {
  dx: number;
  dy: number;
  w: number;
  h: number;
  at: number;
}

/**
 * WebGazer 위에 얹은 "프리미엄" 시선 파이프라인.
 *
 *   WebGazer raw → 뷰포트 클램프 → One Euro 스무딩 → 편향 보정 →
 *   (머무름 감지 / 문단·줄 매핑) → InputEvent
 *
 * 손 모듈과 서로 모른다. 바깥으로는 GazeInputEvent만 내보낸다.
 */
export class GazeController {
  private opts: GazeOptions;
  private listeners = new Set<GazeListener>();
  private wg: WebGazerApi | null = null;
  private status: GazeStatus = 'idle';

  private filter: OneEuro2D;
  private dwell: DwellDetector;
  private offset = { dx: 0, dy: 0 };

  private lastEmitAt = 0;
  private lastRegionAt = 0;
  private lastFaceAt = 0;
  private faceDetected = true;
  private region: GazeRegion | null = null;
  private pendingParagraph: { id: string | null; count: number } = { id: null, count: 0 };

  /** 바이어스 적용 전 평활 좌표 (검증용) */
  private lastSmoothed: { x: number; y: number; t: number } | null = null;
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private calibrating = false;

  constructor(options: Partial<GazeOptions> = {}) {
    this.opts = {
      ...DEFAULT_OPTIONS,
      ...options,
      smoothing: { ...DEFAULT_OPTIONS.smoothing, ...options.smoothing },
      dwell: { ...DEFAULT_OPTIONS.dwell, ...options.dwell },
    };
    this.filter = new OneEuro2D(this.opts.smoothing);
    this.dwell = new DwellDetector(this.opts.dwell);
    this.loadOffset();
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

  getOffset() {
    return { ...this.offset };
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
      // Vite로 번들하지 않고 완성본(/webgazer.js)을 <script>로 로드 → window.webgazer
      const wg = await loadWebGazer();
      this.wg = wg;
      // 얼굴 모델 파일 위치 (기본값 './mediapipe/face_mesh'는 페이지 기준 상대경로라 깨진다)
      wg.params.faceMeshSolutionPath = `${import.meta.env.BASE_URL}mediapipe/face_mesh`;

      wg.setRegression('ridge');
      wg.saveDataAcrossSessions?.(this.opts.persistTraining);
      wg.applyKalmanFilter?.(false); // 필터링은 우리 파이프라인이 담당
      wg.showVideoPreview?.(false);
      wg.showPredictionPoints?.(false);
      wg.showFaceOverlay?.(false);
      wg.showFaceFeedbackBox?.(false);

      wg.setGazeListener((data) => this.handleRaw(data));
      this.lastFaceAt = performance.now();
      await wg.begin();

      // WebGazer는 begin() 안에서 click/mousemove 리스너를 등록한다.
      // 마우스 위치를 "시선 정답"으로 학습하면 회귀 모델이 오염되므로 begin 이후에 반드시 제거.
      wg.removeMouseEventListeners?.();
      if (this.opts.implicitClickTraining) {
        // 읽기 중 단어를 클릭할 때는 그 단어를 보고 있다고 가정하고 클릭만 학습 (보정 중에는 제외)
        this.clickHandler = (e) => {
          if (!this.calibrating) wg.recordScreenPosition?.(e.clientX, e.clientY, 'click');
        };
        window.addEventListener('click', this.clickHandler, true);
      }
      wg.showPredictionPoints?.(false);
      this.setPreview(false);

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
    this.wg?.pause();
    this.setStatus('paused');
  }

  async resume() {
    if (this.status !== 'paused') return;
    await this.wg?.resume();
    this.setStatus('ready');
  }

  stop() {
    if (this.clickHandler) {
      window.removeEventListener('click', this.clickHandler, true);
      this.clickHandler = null;
    }
    try {
      this.wg?.end();
    } catch {
      /* 이미 종료됨 */
    }
    this.wg = null;
    this.filter.reset();
    this.dwell.reset();
    this.region = null;
    this.setStatus('idle');
  }

  /* ---------- 보정 / 검증 ---------- */

  /** 보정 중 여부. true인 동안은 암묵 클릭 학습을 끈다(보정 클릭이 이중 학습되는 것 방지). */
  setCalibrating(on: boolean) {
    this.calibrating = on;
  }

  /**
   * 카메라 미리보기(영상 + 얼굴 인식 상자) 표시. 얼굴 위치/조명 확인용.
   * 주의: showVideoPreview(true)는 이전에 false로 둔 값을 되살리지 못하므로 개별 호출한다.
   */
  setPreview(visible: boolean) {
    const wg = this.wg;
    if (!wg) return;
    wg.showVideo?.(visible);
    wg.showFaceOverlay?.(visible);
    wg.showFaceFeedbackBox?.(visible);
    const box = document.getElementById('webgazerVideoContainer');
    if (box) {
      box.style.zIndex = '9500'; // 보정 오버레이(9000) 위
      box.style.left = 'auto';
      box.style.right = '24px';
      box.style.top = '24px';
    }
  }

  /** 보정 점을 사용자가 클릭할 때마다 호출: 시선↔화면 좌표 학습 데이터 추가 */
  recordCalibrationClick(x: number, y: number) {
    this.wg?.recordScreenPosition?.(x, y, 'click');
  }

  /**
   * 한 목표점에 대한 시선 샘플 수집. settle 동안은 버리고 collect 동안만 모은다.
   * (편향 보정 전 좌표를 쓴다 → 새 bias를 정확히 계산)
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
      const timer = window.setInterval(() => {
        const now = performance.now();
        const s = this.lastSmoothed;
        if (s && now >= startAt && now - s.t < 150) {
          samples.push({ targetX: x, targetY: y, gazeX: s.x, gazeY: s.y });
        }
        if (now >= endAt) {
          window.clearInterval(timer);
          resolve(samples);
        }
      }, 33);
    });
  }

  applyBias(bias: { dx: number; dy: number }) {
    // 이미 적용된 offset 위에 누적하지 않도록, 측정은 offset 적용 전 좌표 기준 → 대체
    this.offset = { dx: -bias.dx, dy: -bias.dy };
    this.saveOffset();
  }

  clearBias() {
    this.offset = { dx: 0, dy: 0 };
    try {
      localStorage.removeItem(OFFSET_KEY);
    } catch {
      /* ignore */
    }
  }

  async resetTraining() {
    this.clearBias();
    await this.wg?.clearData?.();
    this.filter.reset();
    this.dwell.reset();
  }

  private loadOffset() {
    try {
      const raw = localStorage.getItem(OFFSET_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as StoredOffset;
      const sameSize =
        Math.abs(s.w - window.innerWidth) / s.w < 0.1 &&
        Math.abs(s.h - window.innerHeight) / s.h < 0.1;
      if (sameSize && Date.now() - s.at < 1000 * 60 * 60 * 12) {
        this.offset = { dx: s.dx, dy: s.dy };
      }
    } catch {
      /* ignore */
    }
  }

  private saveOffset() {
    try {
      const s: StoredOffset = {
        ...this.offset,
        w: window.innerWidth,
        h: window.innerHeight,
        at: Date.now(),
      };
      localStorage.setItem(OFFSET_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }

  /* ---------- 파이프라인 ---------- */

  private handleRaw(data: { x: number; y: number } | null) {
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

    const x = Math.min(w, Math.max(0, sm.x + this.offset.dx));
    const y = Math.min(h, Math.max(0, sm.y + this.offset.dy));

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
