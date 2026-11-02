from functools import lru_cache

@lru_cache(maxsize=1)
def _kiwi():
    from kiwipiepy import Kiwi
    return Kiwi()

def to_lemma(surface: str) -> tuple[str, str]:
    """활용형 -> (원형, 품사). 용언 및 파생 형용사/동사 원형 복원."""
    tokens = _kiwi().tokenize(surface)
    if not tokens:
        return surface, "UNK"
    
    # 1. 단일 토큰 처리
    if len(tokens) == 1:
        head = tokens[0]
        if head.tag.startswith(("V", "XSV", "XSA")):
            return f"{head.form}다", head.tag
        return head.form, head.tag

    # 2. 모든 토큰이 명사/외래어 계열인 경우 (복합명사/고유명사 보존)
    noun_tags = ("NNG", "NNP", "NNB", "NR", "NP", "SL", "SH", "SN")
    if all(t.tag in noun_tags for t in tokens):
        combined_form = "".join(t.form for t in tokens)
        combined_tag = "NNP" if any(t.tag == "NNP" for t in tokens) else "NNG"
        return combined_form, combined_tag

    # 3. [명사/어근 + 접사(XSA/XSV)] 구조 ("건전하다", "사랑스럽다", "자랑스럽다")
    # XSA-I, XSV-I 등 하위 세부 태그 대응을 위해 startswith 사용
    if len(tokens) >= 2:
        first, second = tokens[0], tokens[1]
        if second.tag.startswith(("XSA", "XSV")):
            pos_tag = "VA" if second.tag.startswith("XSA") else "VV"
            return f"{first.form}{second.form}다", pos_tag

    # 4. 일반 용언 활용형 ("달렸다", "먹었다") -> 첫 번째 어간 기준 복원
    head = tokens[0]
    if head.tag.startswith(("V", "XSV", "XSA")):
        return f"{head.form}다", head.tag

    # 5. Fallback (조사 등이 붙어 분리된 경우 첫 어휘 반환)
    return head.form, head.tag