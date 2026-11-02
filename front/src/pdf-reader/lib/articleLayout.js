const SPREAD_MIN_WIDTH = 820; // 이보다 좁으면 한쪽만 보여 준다

// 양쪽 펼침은 가로로 긴 화면에서만 쓴다. 세로로 든 큰 패드에서 펼치면 단이 너무 좁고 길어진다.
export const isSpread = (width, height) => width >= SPREAD_MIN_WIDTH && width > height;

// 단 사이 간격. 패드 가로 화면에서는 글 폭을 더 쓴다.
export const columnGap = (width) => (width < 1100 ? 64 : 104);
