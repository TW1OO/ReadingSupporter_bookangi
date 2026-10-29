import { describe, expect, it } from 'vitest';
import { DEFAULT_HEATMAP, GazeHeatmap, heatColor } from './heatmap';

describe('heatColor', () => {
  it('쌓인 양이 많을수록 불투명하고 진한(초록·파랑이 적은) 주황이 된다', () => {
    const light = heatColor(1);
    const deep = heatColor(30);
    expect(deep.a).toBeGreaterThan(light.a);
    expect(deep.g).toBeLessThan(light.g);
    expect(deep.b).toBeLessThan(light.b);
  });
  it('아무리 오래 봐도 최대 불투명도를 넘지 않는다 (글을 가리지 않도록)', () => {
    expect(heatColor(1e6).a).toBeLessThanOrEqual(DEFAULT_HEATMAP.maxAlpha);
  });
  it('0이면 투명', () => {
    expect(heatColor(0).a).toBe(0);
  });
});

describe('GazeHeatmap', () => {
  it('오래 본 곳이 스쳐 지나간 곳보다 진하다', () => {
    const h = new GazeHeatmap(800, 600);
    for (let i = 0; i < 30; i++) h.add(200, 300); // 1초 응시(30Hz)
    for (let x = 400; x < 700; x += 30) h.add(x, 300); // 훑고 지나감
    expect(h.intensityAt(200, 300)).toBeGreaterThan(h.intensityAt(550, 300) * 5);
    expect(h.intensityAt(550, 300)).toBeGreaterThan(0);
  });

  it('떨림(±40px)은 한 덩어리로 번져 보인다', () => {
    const h = new GazeHeatmap(800, 600);
    for (let i = 0; i < 30; i++) h.add(400 + (i % 2 ? 40 : -40), 300);
    // 가운데(실제로는 한 번도 안 찍힌 곳)도 양옆 못지않게 진하다 → 두 점이 아니라 하나로 보인다
    expect(h.intensityAt(400, 300)).toBeGreaterThan(h.intensityAt(440, 300) * 0.8);
  });

  it('반감기마다 절반으로 옅어지고, 결국 완전히 사라진다', () => {
    const h = new GazeHeatmap(800, 600);
    for (let i = 0; i < 30; i++) h.add(200, 300);
    const v0 = h.intensityAt(200, 300);
    h.decay(DEFAULT_HEATMAP.halfLifeMs);
    expect(h.intensityAt(200, 300)).toBeCloseTo(v0 / 2, 4);
    h.decay(DEFAULT_HEATMAP.halfLifeMs * 20);
    expect(h.visible).toBe(false);
    expect(h.intensityAt(200, 300)).toBe(0);
  });

  it('화면 밖 좌표는 무시한다', () => {
    const h = new GazeHeatmap(800, 600);
    h.add(-500, -500);
    h.add(5000, 5000);
    expect(h.visible).toBe(false);
  });

  it('render는 격자 크기의 RGBA를 채운다', () => {
    const h = new GazeHeatmap(80, 40);
    h.add(40, 20);
    const out = new Uint8ClampedArray(h.cols * h.rows * 4);
    h.render(out);
    const center = (Math.floor(20 / 8) * h.cols + Math.floor(40 / 8)) * 4;
    expect(out[center + 3]).toBeGreaterThan(0);
    expect(out[3]).toBeLessThan(out[center + 3]); // 모서리는 더 옅다
  });
});
