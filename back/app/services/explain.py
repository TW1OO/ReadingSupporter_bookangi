from app.schemas import ExplainRequest, ExplainResponse


async def generate_explanation(req: ExplainRequest) -> ExplainResponse:
    """문맥 해설과 예문 생성. TODO: 서버의 로컬 LLM 연동은 이 함수 안에서만 한다."""
    return ExplainResponse(status="unavailable")
