// 시선 추적과 손동작 추적이 하나의 브라우저 카메라 스트림을 공유합니다.
let streamPromise = null;
let sharedStream = null;
let users = 0;

export async function acquireCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('카메라 접근은 HTTPS 또는 localhost 환경에서만 지원됩니다.');
  }
  users += 1;
  try {
    if (!sharedStream || !sharedStream.active || !sharedStream.getVideoTracks().some((track) => track.readyState === 'live')) {
      if (!streamPromise) {
        streamPromise = navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        }).then((stream) => {
          sharedStream = stream;
          return stream;
        }).finally(() => { streamPromise = null; });
      }
      await streamPromise;
    } else if (streamPromise) {
      await streamPromise;
    }
    if (!sharedStream?.active) throw new Error('카메라 스트림을 시작하지 못했습니다. 브라우저 카메라 권한을 확인해 주세요.');
    return sharedStream;
  } catch (error) {
    users = Math.max(0, users - 1);
    throw error;
  }
}

export function releaseCamera() {
  users = Math.max(0, users - 1);
  if (users === 0 && sharedStream) {
    sharedStream.getTracks().forEach((track) => track.stop());
    sharedStream = null;
    return true;
  }
  return false;
}
