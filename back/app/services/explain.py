"""문장 해설(탭 2, 60자 이내)과 LLM 검색(탭 3, 200자 이내).

- 로컬 LLM 호출은 services/llm.py 의 complete() 만 쓴다. 엔진을 바꿔도 이 파일은 그대로다.
- 문장 해설: 모델이 규칙을 어길 수 있으므로 프롬프트 → 한 번 재시도 → 문장 경계에서 자르기 순으로 60자를 지킨다.
- LLM 검색: 출력을 그대로 보여 주고 200자 제한만 건다.
"""
from __future__ import annotations

import re

from fastapi.concurrency import run_in_threadpool

from app.schemas import ExplainRequest, ExplainResponse
from app.services import llm

SENTENCE_LIMIT = 60
SEARCH_LIMIT = 200

SENTENCE_SYSTEM = """[작업]
사용자가 준 문장의 해설을 작성합니다.

[규칙]
1. 해설은 공백 포함 60자 이내로 씁니다.
2. 해설 내용만 바로 씁니다. 다음 표현은 쓰지 않습니다.
   - "이 문장은", "위 문장은", "해당 문장은" 등 문장을 가리키는 주어
   - "~라는 의미입니다", "~라는 뜻입니다", "~를 나타냅니다", "~를 말합니다" 등 설명형 어미
3. 원문을 그대로 반복하지 말고, 숨은 의도나 핵심 의미를 풀어 씁니다.
4. 한 문장으로 끝냅니다. 따옴표, 머리말, 부연 설명은 붙이지 않습니다.
5. 출력 전에 글자 수를 세고, 60자를 넘으면 줄입니다.

[예시]
입력: 낮말은 새가 듣고 밤말은 쥐가 듣는다.
좋은 출력: 아무도 없는 곳에서 한 말도 결국 퍼지니 항상 말조심해야 한다.
나쁜 출력: 이 문장은 아무도 없는 곳에서도 말조심해야 한다는 의미입니다.

입력: 그는 회의 내내 시계만 쳐다봤다.
좋은 출력: 회의에 관심이 없고 빨리 끝나기만을 바라는 지루한 마음.
나쁜 출력: 그가 회의가 지루했다는 것을 나타냅니다."""

SEARCH_SYSTEM = (
    "당신은 한국어 독서 보조 도우미입니다. 독자가 모르는 단어의 뜻을 문맥에 맞게 쉬운 말로 설명하세요. "
    "답변은 공백 포함 200자 이내로 쓰세요."
)

_QUOTES = "\"'“”‘’「」『』"
# 규칙 2 위반: 문장을 가리키는 주어, "~라는 의미입니다/뜻입니다", "~를 나타냅니다/말합니다".
_BAD_ENDINGS = re.compile(
    r"^(이|위|해당|본)\s*문장(은|이|에서)"
    r"|(의미|뜻)\s*(입니다|이다|이에요|이라고)\.?$"
    r"|(를|을)\s*(나타냅니다|나타낸다|말합니다|말한다)\.?$"
)


def clean(text: str) -> str:
    """머리말·따옴표·마크다운 기호를 걷어내고 줄바꿈을 공백으로 편다."""
    t = re.sub(r"```.*?```", "", text, flags=re.S)
    t = re.sub(r"^\s*(해설|출력|답변|풀이)\s*[:：]\s*", "", t.strip())
    t = re.sub(r"[*#`>]+", "", t)
    t = re.sub(r"^\s*[-•]\s*", "", t, flags=re.M)
    t = re.sub(r"\s*\n\s*", " ", t).strip()
    return t.strip(_QUOTES + " ")


def clamp(text: str, limit: int) -> str:
    """limit 자를 넘으면 문장 끝(마침표 등) → 공백 순으로 가장 가까운 곳에서 자른다."""
    if len(text) <= limit:
        return text
    cut = text[:limit]
    for pat in (r"[.!?。]\s", r"[.!?。]$", r"\s"):
        hits = [m.end() for m in re.finditer(pat, cut)]
        if hits and hits[-1] >= limit // 2:
            return cut[: hits[-1]].strip()
    return cut.rstrip()


def _fits(text: str, limit: int) -> bool:
    return 0 < len(text) <= limit


def _sentence_of(req: ExplainRequest) -> str:
    # 단어 모드에서는 context 가 그 단어가 들어 있는 문장이다. 없으면 표면형이라도 쓴다.
    return (req.context or req.surface).strip()


def _gen_sentence(sentence: str) -> str:
    out = clean(llm.complete(SENTENCE_SYSTEM, f"입력: {sentence}", temperature=0.3, max_tokens=160))
    if _fits(out, SENTENCE_LIMIT) and not _BAD_ENDINGS.search(out):
        return out
    # 규칙을 어겼으면 한 번만 다시 시킨다(글자 수를 알려 주면 대부분 지킨다).
    retry = (
        f"입력: {sentence}\n\n직전 출력은 {len(out)}자였습니다. "
        f"설명형 어미 없이 {SENTENCE_LIMIT - 10}자 이내로 해설만 다시 쓰세요."
    )
    out2 = clean(llm.complete(SENTENCE_SYSTEM, retry, temperature=0.2, max_tokens=160))
    return clamp(out2 or out, SENTENCE_LIMIT)


def _gen_search(req: ExplainRequest) -> str:
    """LLM 검색: 모델 출력을 그대로 쓰고 200자 제한만 건다(후처리·재시도 없음)."""
    lines = [f"단어: {req.lemma or req.surface}"]
    if req.lemma and req.lemma != req.surface:
        lines.append(f"문장 속 모양: {req.surface}")
    if req.meaning:
        lines.append(f"사전 뜻: {req.meaning}")
    if req.context:
        lines.append(f"문맥: {req.context}")
    out = llm.complete(SEARCH_SYSTEM, "\n".join(lines), temperature=0.3, max_tokens=400).strip()
    return clamp(out, SEARCH_LIMIT)


def _generate(req: ExplainRequest) -> ExplainResponse:
    if req.mode == "search":
        text = _gen_search(req)
        return ExplainResponse(status="ready", search=text) if text else ExplainResponse(status="unavailable")
    text = _gen_sentence(_sentence_of(req))
    return ExplainResponse(status="ready", explanation=text) if text else ExplainResponse(status="unavailable")


async def generate_explanation(req: ExplainRequest) -> ExplainResponse:
    """LLM 이 꺼져 있거나 실패하면 unavailable 로 돌려준다(프론트는 이 경우 안내 문구를 보여 준다)."""
    if not llm.is_ready():
        return ExplainResponse(status="unavailable")
    try:
        return await run_in_threadpool(_generate, req)
    except Exception:
        return ExplainResponse(status="unavailable")
