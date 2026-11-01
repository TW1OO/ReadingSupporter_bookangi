// PDF 텍스트 조각 → 문서 순서의 단어와 문장 번호. 시선·제스처 단어 조정에 쓴다.
const WORD = /[\p{L}\p{N}_'-]+/gu;
const SENTENCE_END = /^[)\]"'”’」』]*[.?!。…]+(?!\d)/;

/**
 * @param spans [{ text, newBlock }] newBlock: 앞 조각과 떨어져 있어(제목, 항목 등) 문장을 새로 시작해야 하는가
 * @returns [{ id, word, sentence, span, start, end }]
 */
export function buildWords(spans) {
  const words = [];
  let sentence = 0;
  let open = false; // 지금 문장에 단어가 있는가
  spans.forEach(({ text, newBlock }, span) => {
    if (newBlock && open) {
      sentence += 1;
      open = false;
    }
    for (const m of text.matchAll(WORD)) {
      const end = m.index + m[0].length;
      words.push({ id: `w${words.length}`, word: m[0], sentence, span, start: m.index, end });
      open = true;
      if (SENTENCE_END.test(text.slice(end))) {
        sentence += 1;
        open = false;
      }
    }
  });
  return words;
}

export function sentenceText(words, sentence) {
  return words.filter((w) => w.sentence === sentence).map((w) => w.word).join(' ');
}

// 좌표에서 가장 가까운 단어의 위치. maxDist(px) 밖이면 -1. rects 는 words 와 같은 순서다.
export function nearestWordIndex(rects, x, y, maxDist = 200) {
  let best = -1;
  let bestD = maxDist;
  rects.forEach((r, i) => {
    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    const d = Math.hypot(dx, dy);
    if (d < bestD || (best < 0 && d <= maxDist)) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// 앞 조각과 세로로 벌어졌는지 (줄 간격의 1.6배 이상이면 다른 문단으로 본다)
export function isNewBlock(prev, cur) {
  if (!prev) return false;
  const height = Math.max(1, Math.min(prev.bottom - prev.top, cur.bottom - cur.top));
  return cur.top - prev.bottom > height * 0.6 || cur.top < prev.top - height * 2;
}
