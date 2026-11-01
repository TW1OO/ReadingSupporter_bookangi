import { useEffect, useRef } from 'react';
import type { GazeController } from './GazeController';
import { DEFAULT_HEATMAP, GazeHeatmap, type HeatmapOptions } from './heatmap';
import './gaze.css';

/**
 * 시선 잔상 캔버스. 저해상도 격자를 작은 캔버스에 그리고 화면 크기로 늘려(브라우저가 부드럽게 보간) 테두리 없는 그라데이션이 되게 한다.
 * 좌표는 React state를 거치지 않는다(리렌더 폭주 방지).
 */
export function GazeHeatLayer({
  controller,
  options = DEFAULT_HEATMAP,
}: {
  controller: GazeController;
  options?: HeatmapOptions;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let heat = new GazeHeatmap(window.innerWidth, window.innerHeight, options);
    let img = ctx.createImageData(heat.cols, heat.rows);
    const setup = () => {
      heat = new GazeHeatmap(window.innerWidth, window.innerHeight, options);
      canvas.width = heat.cols;
      canvas.height = heat.rows;
      img = ctx.createImageData(heat.cols, heat.rows);
    };
    setup();

    let raf = 0;
    let last = performance.now();
    let drawn = false; // 직전 프레임에 무언가 그렸는가 (다 옅어진 뒤 한 번 지우고 멈추기 위해)
    const loop = (now: number) => {
      heat.decay(now - last);
      last = now;
      if (heat.visible || drawn) {
        heat.render(img.data);
        ctx.putImageData(img, 0, 0);
        drawn = heat.visible;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const off = controller.on((e) => {
      if (e.type === 'gaze.point') heat.add(e.x, e.y);
    });
    window.addEventListener('resize', setup);
    return () => {
      cancelAnimationFrame(raf);
      off();
      window.removeEventListener('resize', setup);
    };
  }, [controller, options]);

  return <canvas ref={canvasRef} className="gz-heat" aria-hidden="true" />;
}
