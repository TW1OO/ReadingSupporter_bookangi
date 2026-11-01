from fastapi import APIRouter

from app.schemas import ExplainRequest, ExplainResponse
from app.services.explain import generate_explanation

router = APIRouter(prefix="/explain", tags=["explain"])


# LLM은 느릴 수 있어 /lookup 과 분리한다. 뜻은 먼저 보여 주고 해설·예시 탭을 열 때만 호출한다.
@router.post("", response_model=ExplainResponse)
async def explain_word(req: ExplainRequest) -> ExplainResponse:
    return await generate_explanation(req)
