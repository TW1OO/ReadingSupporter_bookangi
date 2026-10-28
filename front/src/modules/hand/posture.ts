// 손 자세 안내 — 인식이 불안정한 상황을 감지해서 사용자에게 바로잡도록 알려준다.
//
// level
//   "block" : 이 상태에선 판정을 믿을 수 없음 → 선택 확정을 막고 안내
//   "hint"  : 판정은 하되, 이렇게 하면 더 정확하다고 안내
//   "ok"    : 문제 없음
//
// 한두 프레임만 걸리는 건 무시하고, 최근 프레임 중 일정 비율 이상 계속될 때만 안내한다
// (안내 문구가 깜빡거리지 않게).

import { nearEdge, type FingersResult } from './fingers';

export const GUIDE = {
  windowN: 12,          // 최근 몇 프레임을 볼지
  ratio: 0.6,           // 그중 몇 % 이상 문제가 있어야 안내할지
  holdMs: 800,          // 안내가 뜨면 최소 이만큼은 유지 (깜빡임 방지)
  palmMin: 0.13,        // 손바닥 길이 ÷ 화면 높이. 이보다 작으면 너무 멂
  palmMax: 0.55,        // 이보다 크면 너무 가까움
  flipMax: 4,           // 최근 windowN 프레임 동안 손가락 개수가 이 횟수 이상 바뀌면 "흔들림"
  sideWidth: 0.4,       // 손바닥 폭 ÷ 길이가 이보다 작으면 손을 옆으로 세운 것
  scoreMin: 0.75,       // MediaPipe 손 인식 확신도. 이보다 낮으면 손 모양이 애매함
};

export type GuideLevel = 'block' | 'hint' | 'ok'
interface Rule { key: string; level: GuideLevel; msg: string }
export interface PostureResult {
  key: string | null; level: GuideLevel; msg: string
  blocked: boolean; palm: number; flips: number; score: number
}

// 우선순위 순서 (위에 있을수록 먼저 안내)
const RULES: Rule[] = [
  { key: "edge",   level: "block", msg: "손 전체가 화면 안에 들어오게 해주세요" },
  { key: "far",    level: "block", msg: "손을 카메라에 조금 더 가까이 가져와 주세요" },
  { key: "near",   level: "block", msg: "손을 카메라에서 조금 떨어뜨려 주세요" },
  { key: "flip",   level: "block", msg: "인식이 흔들려요 — 손을 잠깐 멈추고 손가락을 분명하게 해주세요" },
  { key: "unsure", level: "hint",  msg: "손 모양이 애매하게 보여요 — 손가락을 또렷하게 펴거나 접어주세요" },
  { key: "side",   level: "hint",  msg: "손바닥이나 손등이 카메라를 보게 하면 더 정확해요" },
];

export class PostureGuard {
  private o: typeof GUIDE
  private flags: Set<string>[] = []   // 프레임별 문제 목록
  private counts: number[] = []       // 프레임별 손가락 개수 (흔들림 판단용)
  private shown: Rule | null = null   // 현재 화면에 띄운 안내
  private shownAt = 0

  constructor(opts: Partial<typeof GUIDE> = {}) {
    this.o = { ...GUIDE, ...opts };
  }

  reset() { this.flags = []; this.counts = []; this.shown = null; }

  // lm: 화면 좌표, f: fingersUp 결과, score: MediaPipe 손 인식 확신도(0~1), aspect: 가로/세로
  update(
    lm: { x: number; y: number }[],
    f: FingersResult,
    score: number,
    aspect: number,
    now: number,
  ): PostureResult {
    const o = this.o;
    const palm = Math.hypot((lm[9].x - lm[0].x) * aspect, lm[9].y - lm[0].y);

    this.counts.push(f.count);
    if (this.counts.length > o.windowN) this.counts.shift();
    let flips = 0;
    for (let i = 1; i < this.counts.length; i++) if (this.counts[i] !== this.counts[i - 1]) flips++;

    const now_ = new Set<string>();
    if (nearEdge(lm)) now_.add("edge");
    if (palm < o.palmMin) now_.add("far");
    if (palm > o.palmMax) now_.add("near");
    if (score < o.scoreMin) now_.add("unsure");
    if (flips >= o.flipMax) now_.add("flip");
    if (f.m.thumb.width < o.sideWidth) now_.add("side");

    this.flags.push(now_);
    if (this.flags.length > o.windowN) this.flags.shift();

    // 최근 프레임 중 ratio 이상 계속된 문제만 채택
    const need = Math.ceil(this.flags.length * o.ratio);
    const active = RULES.find((r) => this.flags.filter((s) => s.has(r.key)).length >= need);

    // 깜빡임 방지: 새 안내가 없어도 holdMs 동안은 이전 안내 유지
    if (active) { this.shown = active; this.shownAt = now; }
    else if (this.shown && now - this.shownAt > o.holdMs) this.shown = null;

    // 화면 끝·크기는 즉시 막아야 오선택이 안 생김 (이번 프레임 기준)
    const instantBlock = now_.has("edge") || now_.has("far") || now_.has("near");
    const g: { key: string | null; level: GuideLevel; msg: string } = this.shown || { key: null, level: 'ok', msg: '' };
    return { ...g, blocked: g.level === "block" || instantBlock, palm, flips, score };
  }
}
