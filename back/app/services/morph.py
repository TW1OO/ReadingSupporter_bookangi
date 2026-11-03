from functools import lru_cache

@lru_cache(maxsize=1)
def _kiwi():
    from kiwipiepy import Kiwi
    return Kiwi()

def to_lemma(surface: str) -> tuple[str, str]:
    """활용형 -> (원형, 품사). 용언, 파생어, 접두사+명사, 명사+조사 처리."""
    # 0. 전처리: 따옴표 및 주요 특수문자/문장부호 제거
    cleaned = surface.strip(" '\"'“”‘’.,!?~[]{}()")
    if not cleaned:
        cleaned = surface

    all_tokens = _kiwi().tokenize(cleaned)
    if not all_tokens:
        return cleaned, "UNK"

    # 기호 계열(S 태그: SSO, SSC, SF 등) 제거
    tokens = [t for t in all_tokens if not t.tag.startswith("S")]
    if not tokens:
        return all_tokens[0].form, all_tokens[0].tag

    # 품사 태그 그룹 정의
    prefix_tags = ("XPN", "MM")
    noun_tags = ("NNG", "NNP", "NNB", "NR", "NP", "SL", "SH", "SN")

    # 1. [접두사/관형사 + 명사] 복합어 처리 (예: "총"(XPN/MM) + "학생회"(NNG) -> "총학생회")
    if len(tokens) >= 2 and tokens[0].tag in prefix_tags and tokens[1].tag in noun_tags:
        combined_noun = "".join(t.form for t in tokens if t.tag in prefix_tags or t.tag in noun_tags)
        return combined_noun, "NNG"

    # 2. [부사/명사 + 동사] 복합 구조 처리 (예: "함께" + "가다" -> "함께가다")
    for i, token in enumerate(tokens):
        if token.tag.startswith(("V", "XSV", "XSA")):
            if i > 0 and tokens[i-1].tag in ("MAG", "NNG", "NNP"):
                return f"{tokens[i-1].form}{token.form}다", token.tag
            return f"{token.form}다", token.tag

    # 3. [명사 + 조사] 처리 (예: "이"(NNP) + "사장"(NNG) + "은"(JX) -> 조사 전 명사 결합 "이사장")
    j_index = next((i for i, t in enumerate(tokens) if t.tag.startswith("J")), None)
    if j_index is not None:
        nouns_before_j = [t.form for t in tokens[:j_index] if t.tag in noun_tags]
        if nouns_before_j:
            return "".join(nouns_before_j), "NNG"

    # 4. 단일 토큰 처리
    if len(tokens) == 1:
        head = tokens[0]
        if head.tag.startswith(("V", "XSV", "XSA")):
            return f"{head.form}다", head.tag
        return head.form, head.tag

    # 5. 모든 토큰이 명사 계열인 경우 (복합명사/고유명사 보존)
    if all(t.tag in noun_tags for t in tokens):
        combined_form = "".join(t.form for t in tokens)
        combined_tag = "NNP" if any(t.tag == "NNP" for t in tokens) else "NNG"
        return combined_form, combined_tag

    # 6. [명사/어근 + 접사(XSA/XSV)] 구조 (예: "건전하다", "사랑스럽다")
    if len(tokens) >= 2:
        first, second = tokens[0], tokens[1]
        if second.tag.startswith(("XSA", "XSV")):
            pos_tag = "VA" if second.tag.startswith("XSA") else "VV"
            return f"{first.form}{second.form}다", pos_tag

    # 7. 일반 용언 활용형 ("달렸다", "먹었다") -> 첫 어간 기준 복원
    head = tokens[0]
    if head.tag.startswith(("V", "XSV", "XSA")):
        return f"{head.form}다", head.tag

    # 8. Fallback
    return head.form, head.tag