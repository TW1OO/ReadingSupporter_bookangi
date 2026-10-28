import type { GazeSample } from './types';

export interface DwellOptions {
  minDurationMs: number;
  maxDispersionPx: number;
  releaseRadiusPx: number;
  windowMs: number;
}

export interface DwellEvent {
  x: number;
  y: number;
  durationMs: number;
  startedAt: number;
}

/**
 * 분산 기반 고정(I-DT) 머무름 감지.
 * 최근 샘플 중 "분산(x범위+y범위)이 기준 이하인 가장 긴 꼬리 구간"이 minDuration을 넘으면 1회 발화.
 * 발화 후에는 시선이 releaseRadius 밖으로 나가야 다시 무장(re-arm)된다 → 한 번 머물렀는데 계속 발화하는 것을 방지.
 */
export class DwellDetector {
  private win: GazeSample[] = [];
  private fired = false;
  private anchor: { x: number; y: number } | null = null;
  private _progress = 0;

  constructor(private opts: DwellOptions) {}

  /** 0~1: 현재 머무름이 minDuration 대비 얼마나 찼는지 */
  get progress() {
    return this.fired ? 1 : this._progress;
  }

  push(s: GazeSample): DwellEvent | null {
    this.win.push(s);
    const cutoff = s.t - this.opts.windowMs;
    while (this.win.length > 1 && this.win[0].t < cutoff) this.win.shift();

    if (this.fired && this.anchor) {
      const d = Math.hypot(s.x - this.anchor.x, s.y - this.anchor.y);
      if (d > this.opts.releaseRadiusPx) {
        this.fired = false;
        this.anchor = null;
        this.win = [s];
        this._progress = 0;
      }
      return null;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let startIdx = this.win.length - 1;
    for (let i = this.win.length - 1; i >= 0; i--) {
      const p = this.win[i];
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      if (maxX - minX + (maxY - minY) > this.opts.maxDispersionPx) break;
      startIdx = i;
    }

    const duration = s.t - this.win[startIdx].t;
    this._progress = Math.min(1, duration / this.opts.minDurationMs);

    if (duration >= this.opts.minDurationMs) {
      const seg = this.win.slice(startIdx);
      const cx = seg.reduce((a, p) => a + p.x, 0) / seg.length;
      const cy = seg.reduce((a, p) => a + p.y, 0) / seg.length;
      this.fired = true;
      this.anchor = { x: cx, y: cy };
      return { x: cx, y: cy, durationMs: duration, startedAt: this.win[startIdx].t };
    }
    return null;
  }

  reset() {
    this.win = [];
    this.fired = false;
    this.anchor = null;
    this._progress = 0;
  }
}
