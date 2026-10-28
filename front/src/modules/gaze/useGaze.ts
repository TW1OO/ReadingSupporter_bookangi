import { useEffect, useMemo, useRef, useState } from 'react';
import { GazeController } from './GazeController';
import type { GazeOptions, GazeRegion, GazeStatus } from './types';

/**
 * 컨트롤러를 앱 전체에서 하나만 쓰도록 생성/정리해 주는 훅.
 * 고빈도 좌표(gaze.point)는 state에 넣지 않는다 → 리렌더 폭주 방지.
 * 좌표가 필요하면 controller.on()으로 직접 구독(GazeDebugOverlay 참고).
 */
export function useGaze(options: Partial<GazeOptions> = {}) {
  const controller = useMemo(() => new GazeController(options), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [status, setStatus] = useState<GazeStatus>(controller.getStatus());
  const [error, setError] = useState<string | undefined>();
  const [region, setRegion] = useState<GazeRegion | null>(null);
  const [faceDetected, setFaceDetected] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const off = controller.on((e) => {
      if (!mounted.current) return;
      if (e.type === 'gaze.status') {
        setStatus(e.status);
        setError(e.error);
      } else if (e.type === 'gaze.region') setRegion(e.region);
      else if (e.type === 'gaze.quality') setFaceDetected(e.faceDetected);
    });
    return () => {
      mounted.current = false;
      off();
      controller.stop();
    };
  }, [controller]);

  return {
    controller,
    status,
    error,
    region,
    faceDetected,
    start: () => controller.start(),
    stop: () => controller.stop(),
  };
}
