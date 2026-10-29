import { useEffect, useRef, useState } from 'react';
import type { GazeController } from './GazeController';
import { GazeHeatmap } from './heatmap';
import type { GazeRegion } from './types';
import './gaze.css';

/**
 * 시선 잔상 / 추정 줄 하이라이트 / 상태 칩.
 * 시선은 점이 따라다니는 대신 잔상으로 그린다: 오래 본 곳은 진한 주황, 지나온 곳은 연한 주황으로 남았다가 옅어진다.
 * 잔상은 저해상도 격자를 작은 캔버스에 그리고 화면 크기로 늘려(브라우저가 부드럽게 보간) 테두리 없는 그라데이션이 되게 한다.
 * 좌표는 React state를 거치지 않는다(리렌더 폭주 방지).
 */
export function GazeDebugOverlay({ controller }: { controller: GazeController }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [region, setRegion] = useState<GazeRegion | null>(null);
  const [face, setFace] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let heat = new GazeHeatmap(window.innerWidth, window.innerHeight);
    let img = ctx.createImageData(heat.cols, heat.rows);
    const setup = () => {
      heat = new GazeHeatmap(window.innerWidth, window.innerHeight);
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
      else if (e.type === 'gaze.region') setRegion(e.region);
      else if (e.type === 'gaze.quality') setFace(e.faceDetected);
    });
    window.addEventListener('resize', setup);
    return () => {
      cancelAnimationFrame(raf);
      off();
      window.removeEventListener('resize', setup);
    };
  }, [controller]);

  const line = region?.lineRect;
  return (
    <>
      <canvas ref={canvasRef} className="gz-heat" aria-hidden="true" />
      {line && (
        <div
          className="gz-debug-line"
          style={{
            left: line.left,
            top: line.top,
            width: line.right - line.left,
            height: line.bottom - line.top,
          }}
        />
      )}
      <div className="gz-chip">
        {face ? `시선 추정: ${region ? region.paragraphId : '영역 밖'}` : '얼굴이 보이지 않아요'}
      </div>
    </>
  );
}
