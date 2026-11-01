// 손과 시선이 같은 카메라를 쓰므로 요청 값을 맞춘다. 4:3 으로 요청하면 16:9 카메라는 양옆을 잘라 낸다.
export const WIDE_VIDEO: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: 'user',
}
