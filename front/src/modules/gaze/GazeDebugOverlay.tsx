import { useEffect, useRef, useState } from 'react';
import type { GazeController } from './GazeController';
import type { GazeRegion } from './types';
import './gaze.css';

/** 시선 점 / 추정 줄 하이라이트 / 상태 칩. 좌표는 React state가 아니라 transform으로 직접 갱신. */
export function GazeDebugOverlay({ controller }: { controller: GazeController }) {
  const dot = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState<GazeRegion | null>(null);
  const [face, setFace] = useState(true);

  useEffect(
    () =>
      controller.on((e) => {
        if (e.type === 'gaze.point' && dot.current) {
          dot.current.style.transform = `translate(${e.x}px, ${e.y}px)`;
        } else if (e.type === 'gaze.region') setRegion(e.region);
        else if (e.type === 'gaze.quality') setFace(e.faceDetected);
      }),
    [controller],
  );

  const line = region?.lineRect;
  return (
    <>
      <div ref={dot} className="gz-debug-dot" />
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
