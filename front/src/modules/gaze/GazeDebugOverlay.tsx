import { useEffect, useState } from 'react';
import type { GazeController } from './GazeController';
import { GazeHeatLayer } from './GazeHeatLayer';
import type { GazeRegion } from './types';
import './gaze.css';

/**
 * 시선 잔상 / 추정 줄 하이라이트 / 상태 칩.
 * 시선은 점이 따라다니는 대신 잔상으로 그린다: 오래 본 곳은 진한 주황, 지나온 곳은 연한 주황으로 남았다가 옅어진다.
 */
export function GazeDebugOverlay({ controller }: { controller: GazeController }) {
  const [region, setRegion] = useState<GazeRegion | null>(null);
  const [face, setFace] = useState(true);

  useEffect(() => {
    const off = controller.on((e) => {
      if (e.type === 'gaze.region') setRegion(e.region);
      else if (e.type === 'gaze.quality') setFace(e.faceDetected);
    });
    return off;
  }, [controller]);

  const line = region?.lineRect;
  return (
    <>
      <GazeHeatLayer controller={controller} />
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
