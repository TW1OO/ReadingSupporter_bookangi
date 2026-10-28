# from fastapi import APIRouter

# from ..schemas import LookupRequest, LookupResponse
# from ..services import dictionary

# router = APIRouter()


# @router.post("/lookup", response_model=LookupResponse)
# def lookup(req: LookupRequest) -> LookupResponse:
#     # TODO: 형태소 분석(원형 복원)은 팀원 구현. 지금은 표면형 그대로 조회.
#     meaning = dictionary.find_meaning(req.surface, "")
#     return LookupResponse(surface=req.surface, lemma=req.surface, pos="", meaning=meaning)
from fastapi import APIRouter, HTTPException
from app.schemas import LookupRequest
from app.services.morph import to_lemma
from app.services.dictionary import fetch_dictionary_meaning
from app.services.translator import translate_to_korean  # DeepL 번역 서비스 추가

router = APIRouter(prefix="/lookup", tags=["lookup"])

@router.post("")
async def lookup_word(req: LookupRequest):
    if not req.surface:
        raise HTTPException(status_code=400, detail="단어가 입력되지 않았습니다.")

    # 1. 형태소 분석하여 원형(lemma)과 품사 태그 추출
    lemma, tag = to_lemma(req.surface)
    
    # 2. 영단어/외래어(tag == "SL")인 경우 -> DeepL 번역 우선 시도
    if tag == "SL":
        trans_result = await translate_to_korean(req.surface)
        if trans_result:
            return {
                "status": "success",
                "original": req.surface,
                "lemma": lemma,
                "tag": tag,
                "result": trans_result
            }

    # 3. 우리말샘 사전 API 조회 (한국어이거나 DeepL 결과가 없을 때)
    dict_result = await fetch_dictionary_meaning(lemma)
    if dict_result:
        return {
            "status": "success",
            "original": req.surface,
            "lemma": lemma,
            "tag": tag,
            "result": dict_result
        }

    # 4. 사전 및 번역 결과가 모두 없는 경우 (추후 LLM Fallback 연결 구간)
    return {
        "status": "not_found",
        "original": req.surface,
        "lemma": lemma,
        "tag": tag,
        "result": None,
        "message": "사전 및 번역 결과를 찾을 수 없습니다."
    }