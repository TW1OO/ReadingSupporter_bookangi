/**
 * 시선 잔상(히트맵). 화면을 저해상도 격자로 나눠 시선이 머문 곳에 가우시안을 쌓고, 시간이 지나면 지수적으로 옅어진다.
 * 오래 본 곳은 진한 주황, 스쳐 지나간 곳은 연한 주황으로 남는다.
 * 점 하나가 따라다니는 것보다 떨림이 번져 보이지 않고, 테두리가 없어 눈이 덜 피곤하다.
 * 브라우저 API 없이 숫자만 다루므로 웹캠 없이 테스트한다.
 */
export interface HeatmapOptions {
  /** 격자 한 칸의 크기(px). 클수록 가볍고 부드럽다 */
  cellPx: number;
  /** 시선 한 점이 퍼지는 정도(px). 시선 오차(~80px)와 비슷하게 잡아 떨림을 덮는다 */
  sigmaPx: number;
  /** 잔상이 절반으로 옅어지는 시간(ms) */
  halfLifeMs: number;
  /** 이 정도 쌓이면 거의 최대로 진해진다 (샘플 30Hz 기준 약 1초 응시) */
  saturation: number;
  /** 가장 진할 때의 불투명도. 글을 가리지 않도록 낮게 둔다 */
  maxAlpha: number;
}

export const DEFAULT_HEATMAP: HeatmapOptions = {
  cellPx: 8,
  sigmaPx: 36,
  halfLifeMs: 4000,
  saturation: 15,
  maxAlpha: 0.5,
};

// 연한 주황 → 진한 주황
const LIGHT = [255, 204, 150];
const DEEP = [230, 106, 18];

/** 쌓인 양(intensity) → 색. t는 0~1로 포화되고, 투명도와 색 진하기가 함께 올라간다. */
export function heatColor(intensity: number, opts: HeatmapOptions = DEFAULT_HEATMAP) {
  const t = 1 - Math.exp(-Math.max(0, intensity) / (opts.saturation / 2));
  const mix = (i: number) => Math.round(LIGHT[i] + (DEEP[i] - LIGHT[i]) * t);
  return { r: mix(0), g: mix(1), b: mix(2), a: opts.maxAlpha * t };
}

export class GazeHeatmap {
  readonly cols: number;
  readonly rows: number;
  private grid: Float32Array;
  private kernel: { dx: number; dy: number; w: number }[];
  private peak = 0;

  constructor(
    widthPx: number,
    heightPx: number,
    private readonly opts: HeatmapOptions = DEFAULT_HEATMAP,
  ) {
    this.cols = Math.max(1, Math.ceil(widthPx / opts.cellPx));
    this.rows = Math.max(1, Math.ceil(heightPx / opts.cellPx));
    this.grid = new Float32Array(this.cols * this.rows);
    // 가우시안 커널을 한 번만 계산해 둔다 (3σ까지)
    const s = opts.sigmaPx / opts.cellPx;
    const r = Math.ceil(3 * s);
    this.kernel = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const w = Math.exp(-(dx * dx + dy * dy) / (2 * s * s));
        if (w > 0.01) this.kernel.push({ dx, dy, w });
      }
    }
  }

  /** 시선 한 점(화면 px)을 쌓는다 */
  add(xPx: number, yPx: number, weight = 1) {
    const cx = Math.floor(xPx / this.opts.cellPx);
    const cy = Math.floor(yPx / this.opts.cellPx);
    for (const k of this.kernel) {
      const x = cx + k.dx;
      const y = cy + k.dy;
      if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
      const i = y * this.cols + x;
      this.grid[i] += k.w * weight;
      if (this.grid[i] > this.peak) this.peak = this.grid[i];
    }
  }

  /** 경과 시간만큼 옅어진다 */
  decay(dtMs: number) {
    if (this.peak === 0 || dtMs <= 0) return;
    const f = Math.pow(0.5, dtMs / this.opts.halfLifeMs);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] *= f;
    this.peak *= f;
    // 눈에 안 보일 만큼 옅어지면 0으로 정리해 그리기를 멈출 수 있게 한다
    if (this.peak < 0.01) {
      this.grid.fill(0);
      this.peak = 0;
    }
  }

  /** 보이는 잔상이 남아 있는가 (없으면 다시 그릴 필요가 없다) */
  get visible() {
    return this.peak > 0;
  }

  intensityAt(xPx: number, yPx: number) {
    const x = Math.floor(xPx / this.opts.cellPx);
    const y = Math.floor(yPx / this.opts.cellPx);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return 0;
    return this.grid[y * this.cols + x];
  }

  /** cols×rows RGBA 버퍼(ImageData.data)에 색을 채운다 */
  render(out: Uint8ClampedArray) {
    for (let i = 0; i < this.grid.length; i++) {
      const o = i * 4;
      const v = this.grid[i];
      if (v <= 0) {
        out[o + 3] = 0;
        continue;
      }
      const c = heatColor(v, this.opts);
      out[o] = c.r;
      out[o + 1] = c.g;
      out[o + 2] = c.b;
      out[o + 3] = Math.round(c.a * 255);
    }
  }

  clear() {
    this.grid.fill(0);
    this.peak = 0;
  }
}
