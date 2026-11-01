import { describe, expect, it } from 'vitest';
import { buildWords, isNewBlock, nearestWordIndex, sentenceText } from './pdfWords.js';

const plain = (...texts) => texts.map((text) => ({ text, newBlock: false }));

describe('buildWords', () => {
  it('문장 끝에서 문장 번호를 올린다', () => {
    const w = buildWords(plain('협상은 지지부진했다. 조건은 맞췄다! 정말?'));
    expect(w.map((x) => [x.word, x.sentence])).toEqual([
      ['협상은', 0],
      ['지지부진했다', 0],
      ['조건은', 1],
      ['맞췄다', 1],
      ['정말', 2],
    ]);
  });
  it('닫는 따옴표 뒤 문장 끝도 인식한다', () => {
    const w = buildWords(plain('“끝내야 해”. 그렇게 말했다'));
    expect(w.map((x) => x.sentence)).toEqual([0, 0, 1, 1]);
  });
  it('소수점은 문장 끝이 아니다', () => {
    expect(buildWords(plain('값은 3.5 정도다')).every((x) => x.sentence === 0)).toBe(true);
  });
  it('줄이 나뉘어도 문장은 이어진다', () => {
    const w = buildWords(plain('하위 레이어의 노드', '들과 연결된다.', '다음 문장'));
    expect(w.map((x) => x.sentence)).toEqual([0, 0, 0, 0, 0, 1, 1]);
  });
  it('마침표 없는 제목도 떨어져 있으면 따로 나눈다', () => {
    const w = buildWords([
      { text: 'CNN의 구조', newBlock: false },
      { text: '입력층을 둔다', newBlock: true },
    ]);
    expect(w.map((x) => x.sentence)).toEqual([0, 0, 1, 1]);
  });
  it('어느 조각의 몇 번째 글자인지 기록한다', () => {
    expect(buildWords(plain('가', '“나다”'))[1]).toMatchObject({ id: 'w1', word: '나다', span: 1, start: 1, end: 3 });
  });
  it('글자가 없으면 빈 목록', () => expect(buildWords(plain(' ... '))).toEqual([]));
});

describe('sentenceText', () => {
  it('문장의 단어를 잇는다', () => {
    const w = buildWords(plain('협상은 지지부진했다. 조건은 맞췄다.'));
    expect(sentenceText(w, 1)).toBe('조건은 맞췄다');
  });
});

describe('nearestWordIndex', () => {
  const rects = [
    { left: 0, top: 0, right: 50, bottom: 20 },
    { left: 60, top: 0, right: 110, bottom: 20 },
  ];
  it('가장 가까운 단어', () => {
    expect(nearestWordIndex(rects, 20, 10)).toBe(0);
    expect(nearestWordIndex(rects, 100, 80)).toBe(1);
  });
  it('너무 멀면 -1', () => expect(nearestWordIndex(rects, 900, 900)).toBe(-1));
  it('거리 제한을 풀면 멀어도 찾는다', () => expect(nearestWordIndex(rects, 900, 900, Infinity)).toBe(1));
  it('단어가 없으면 -1', () => expect(nearestWordIndex([], 0, 0)).toBe(-1));
});

describe('isNewBlock', () => {
  const r = (top) => ({ top, bottom: top + 20 });
  it('첫 조각은 아니다', () => expect(isNewBlock(null, r(0))).toBe(false));
  it('바로 다음 줄은 같은 문단', () => expect(isNewBlock(r(0), r(24))).toBe(false));
  it('같은 줄의 다음 조각도 같은 문단', () => expect(isNewBlock(r(0), r(0))).toBe(false));
  it('간격이 벌어지면 새 문단', () => expect(isNewBlock(r(0), r(60))).toBe(true));
  it('위로 크게 돌아가면(다음 단) 새 문단', () => expect(isNewBlock(r(500), r(50))).toBe(true));
});
