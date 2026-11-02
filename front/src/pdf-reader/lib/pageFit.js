// PDF 를 처음 맞출 배율. 보통은 쪽 전체가 들어오게 하고, widthOnly 면 너비에만 맞춘다(세로로 스크롤).
export function pageFitScale({ stageW, stageH, padX, padY, pageW, pageH, widthOnly = false }) {
  const byWidth = (stageW - padX) / pageW;
  return widthOnly ? byWidth : Math.min(byWidth, (stageH - padY) / pageH);
}
