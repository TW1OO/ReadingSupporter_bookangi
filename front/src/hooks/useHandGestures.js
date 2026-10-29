import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { acquireCamera, releaseCamera } from '../lib/camera.js';

const HOLD_MS = 700;
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = `${import.meta.env.BASE_URL}mediapipe/hand_landmarker.task`;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

// 손 방향이 바뀌어도 주먹을 0개로 판정하도록 손목까지의 거리를 함께 확인합니다.
function isFist(lm) {
  const wrist = lm[0];
  const fingers = [[8, 6], [12, 10], [16, 14], [20, 18]];
  const folded = fingers.every(([tip, pip]) => distance(lm[tip], wrist) <= distance(lm[pip], wrist) + 0.035);
  // 네 손가락이 모두 접힌 경우 엄지 방향 오판과 관계없이 주먹으로 처리합니다.
  return folded;
}

function fingerCount(lm, handedness) {
  if (isFist(lm)) return 0;
  let count = 0;
  for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) {
    if (lm[tip].y < lm[pip].y - 0.015) count += 1;
  }
  const hand = String(handedness || '').toLowerCase();
  const thumbExtended = hand.includes('right')
    ? lm[4].x < lm[3].x - 0.035
    : lm[4].x > lm[3].x + 0.035;
  if (thumbExtended) count += 1;
  return count;
}

export function useHandGestures({ enabled, videoRef, onGesture, onPoint, onStatus }) {
  const [cameraOn, setCameraOn] = useState(false);
  const [fingerCountNow, setFingerCountNow] = useState(null);
  const [error, setError] = useState('');
  const callbacks = useRef({});
  callbacks.current = { onGesture, onPoint, onStatus };

  useEffect(() => {
    if (!enabled) {
      setCameraOn(false);
      setFingerCountNow(null);
      callbacks.current.onPoint?.(null);
      return;
    }

    let cancelled = false;
    let raf = 0;
    let stream = null;
    let landmarker = null;
    let lastVideoTime = -1;
    let currentCount = null;
    let since = 0;
    let fired = false;
    const votes = [];
    const status = (message) => callbacks.current.onStatus?.(message);

    async function start() {
      try {
        setError('');
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('카메라를 사용할 수 없습니다. localhost 또는 HTTPS에서 실행해 주세요.');
        }
        status('카메라 권한을 요청하는 중입니다.');
        stream = await acquireCamera();
        if (cancelled) { releaseCamera(); stream = null; return; }
        const video = videoRef.current;
        if (!video) throw new Error('카메라 화면을 찾을 수 없습니다.');
        if (video.srcObject !== stream) video.srcObject = stream;
        await video.play();

        status('손 인식 모델을 불러오는 중입니다.');
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        try {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1,
            minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.55, minTrackingConfidence: 0.55,
          });
        } catch {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 1,
            minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.55, minTrackingConfidence: 0.55,
          });
        }
        if (cancelled) { landmarker.close(); return; }
        setCameraOn(true);
        status('손을 카메라에 보여 주세요. 1=뜻, 2=해설, 3=예시');
        const loop = () => {
          if (cancelled) return;
          if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            try {
              const result = landmarker.detectForVideo(video, performance.now());
              const lm = result.landmarks?.[0];
              if (lm) {
                const handedness = result.handednesses?.[0]?.[0]?.categoryName || result.handedness?.[0]?.[0]?.categoryName;
                votes.push(fingerCount(lm, handedness));
                if (votes.length > 7) votes.shift();
                const counts = new Map();
                for (const n of votes) counts.set(n, (counts.get(n) || 0) + 1);
                let count = votes[votes.length - 1], best = -1;
                for (const [n, c] of counts) if (c > best) { best = c; count = n; }
                setFingerCountNow(count);
                const point = { x: (1 - lm[8].x) * window.innerWidth, y: lm[8].y * window.innerHeight };
                callbacks.current.onPoint?.(count === 1 ? point : null);
                const now = performance.now();
                if (count !== currentCount) { currentCount = count; since = now; fired = false; }
                else if (!fired && now - since >= HOLD_MS) {
                  fired = true;
                  if (count >= 0 && count <= 3) callbacks.current.onGesture?.(count, point);
                }
              } else {
                votes.length = 0; currentCount = null; fired = false;
                setFingerCountNow(null); callbacks.current.onPoint?.(null);
              }
            } catch (e) { console.error('Hand landmark detection failed', e); }
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : '손 인식을 시작하지 못했습니다.';
        setError(message); status(message);
      }
    }
    start();
    return () => {
      cancelled = true; cancelAnimationFrame(raf);
      const cameraStopped = stream ? releaseCamera() : false;
      if (cameraStopped && videoRef.current && videoRef.current.srcObject === stream) videoRef.current.srcObject = null;
      landmarker?.close(); setCameraOn(false); callbacks.current.onPoint?.(null);
    };
  }, [enabled, videoRef]);
  return { cameraOn, fingerCountNow, error };
}
