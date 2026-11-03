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
from app.services.translator import translate_to_korean
from app.services.llm import explain_word  # 프로젝트 내 LLM 서비스 함수 임포트

router = APIRouter(prefix="/lookup", tags=["lookup"])

@router.post("")
async def lookup_word(req: LookupRequest):
    if not req.surface:
        raise HTTPException(status_code=400, detail="단어가 입력되지 않았습니다.")

    # 1. 형태소 분석하여 원형(lemma)과 품사 태그 추출
    lemma, tag = to_lemma(req.surface)
    
    # 2. 영단어/외래어(tag == "SL")인 경우 -> DeepL 번역 후 한글 표제어로 우리말샘 조회
    if tag == "SL":
        translated_korean = await translate_to_korean(req.surface)
        if translated_korean:
            # 번역된 한글 단어를 원형 복원하여 우리말샘 사전 조회
            k_lemma, _ = to_lemma(translated_korean["translated_text"])
            dict_result = await fetch_dictionary_meaning(k_lemma)
            
            # 사전에 검색 결과가 있으면 사전 뜻풀이 반환
            if dict_result:
                return {
                    "status": "success",
                    "source": "dictionary",
                    "original": req.surface,
                    "lemma": lemma,
                    "translated_korean": translated_korean,
                    "tag": tag,
                    "result": dict_result
                }

    # 3. 우리말샘 사전 API 조회 (한국어이거나 영단어 사전 조회가 실패했을 때)
    dict_result = await fetch_dictionary_meaning(lemma)
    if dict_result:
        return {
            "status": "success",
            "source": "dictionary",
            "original": req.surface,
            "lemma": lemma,
            "tag": tag,
            "result": dict_result
        }

    # 4. 사전 검색 결과가 없는 경우 -> LLM Fallback 실행
    try:
        # explain_word(surface, context) 형태로 호출 (동기 함수를 fastapi run_in_threadpool 또는 직접 호출)
        from starlette.concurrency import run_in_threadpool
        
        llm_text = await run_in_threadpool(explain_word, req.surface, "")
        if llm_text:
            return {
                "status": "success",
                "source": "llm",
                "original": req.surface,
                "lemma": lemma,
                "tag": tag,
                "result": llm_text
            }
    except Exception as e:
        # LLM 서비스 미작동(disabled/unloaded 등) 시 예외 처리
        pass

    # 5. 모든 서비스(사전, 번역, LLM) 조회 실패 시
    return {
        "status": "not_found",
        "original": req.surface,
        "lemma": lemma,
        "tag": tag,
        "result": None,
        "message": "사전, 번역 및 LLM 설명을 생성할 수 없습니다."
    }