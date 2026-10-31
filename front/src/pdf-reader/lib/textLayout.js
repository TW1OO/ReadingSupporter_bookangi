// PDF 텍스트 조각 → 화면 배치. 투명 텍스트가 캔버스 글자와 겹쳐야 드래그·손 포인팅이 맞는다.
// tx 는 viewport.transform 과 item.transform 을 곱한 행렬, style 은 textContent.styles[item.fontName].
export function layoutTextItem(item, tx, style, scale) {
  const fontSize = Math.max(1, Math.hypot(tx[2], tx[3]));
  const angle = Math.atan2(tx[1], tx[0]) + (style?.vertical ? Math.PI / 2 : 0);
  const ascent = style?.ascent || (style?.descent ? 1 + style.descent : 0.8);
  return {
    left: tx[4] + fontSize * ascent * Math.sin(angle),
    top: tx[5] - fontSize * ascent * Math.cos(angle),
    fontSize,
    angle,
    width: (style?.vertical ? item.height : item.width) * scale, // 실제 글자 폭. 표시 폭을 여기에 맞춘다
    fontFamily: style?.fontFamily || 'sans-serif',
  };
}

// 텍스트 조각 → 단어와 위치. PDF 텍스트 레이어는 단어가 아니라 조각 단위라 손 포인팅용으로 나눈다.
export function splitWords(text) {
  return Array.from(text.matchAll(/[\p{L}\p{N}_'-]+/gu), (m) => ({
    word: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
}
