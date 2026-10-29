/**
 * One Euro Filter (Casiez et al., 2012).
 * 가만히 볼 때는 강하게 평활화(떨림 제거), 빠르게 움직일 때는 약하게(지연 최소화).
 * 웹캠 시선 원시 출력은 프레임마다 수십 px씩 튀므로 필수.
 */
export interface OneEuroOptions {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

class LowPass {
  last: number | null = null;
  filter(x: number, a: number) {
    this.last = this.last === null ? x : a * x + (1 - a) * this.last;
    return this.last;
  }
  reset() {
    this.last = null;
  }
}

export class OneEuroFilter {
  private x = new LowPass();
  private dx = new LowPass();
  private lastT: number | null = null;

  constructor(private opts: OneEuroOptions) {}

  filter(value: number, tMs: number): number {
    if (this.lastT === null) {
      this.lastT = tMs;
      this.dx.filter(0, 1);
      return this.x.filter(value, 1);
    }
    const dt = Math.max((tMs - this.lastT) / 1000, 1e-3);
    this.lastT = tMs;
    const prev = this.x.last ?? value;
    const rate = (value - prev) / dt;
    const edx = this.dx.filter(rate, alpha(this.opts.dCutoff, dt));
    const cutoff = this.opts.minCutoff + this.opts.beta * Math.abs(edx);
    return this.x.filter(value, alpha(cutoff, dt));
  }

  reset() {
    this.x.reset();
    this.dx.reset();
    this.lastT = null;
  }
}

export class OneEuro2D {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;
  constructor(opts: OneEuroOptions) {
    this.fx = new OneEuroFilter(opts);
    this.fy = new OneEuroFilter(opts);
  }
  filter(x: number, y: number, tMs: number) {
    return { x: this.fx.filter(x, tMs), y: this.fy.filter(y, tMs) };
  }
  reset() {
    this.fx.reset();
    this.fy.reset();
  }
}
