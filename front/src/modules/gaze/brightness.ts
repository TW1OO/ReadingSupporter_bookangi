/** 조명 확인. 영상의 평균 밝기(0~255)로 판단한다. 브라우저 API 없이 숫자만 다루므로 웹캠 없이 테스트한다. */
export const MIN_BRIGHTNESS = 60;

/** RGBA 픽셀의 평균 밝기 */
export function meanLuma(rgba: ArrayLike<number>): number {
  const n = Math.floor(rgba.length / 4);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    sum += 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
  }
  return sum / n;
}

export const isBrightEnough = (luma: number) => luma >= MIN_BRIGHTNESS;

/** 손 위치 안내 상자(거울 화면 기준, 0~1). 시선 보정 안내 화면의 상자와 같은 영역이다. */
export const HAND_BOX = { left: 0.62, right: 0.96, top: 0.48, bottom: 0.96 };

export function isInHandBox(p: { x: number; y: number } | null | undefined): boolean {
  return !!p && p.x >= HAND_BOX.left && p.x <= HAND_BOX.right && p.y >= HAND_BOX.top && p.y <= HAND_BOX.bottom;
}
