"""로컬 LLM API. 시선·손 모듈과 무관하며, 프론트에는 SSE(text/event-stream)로 토큰을 흘려 보낸다."""
from __future__ import annotations

import asyncio
import json
import threading
from typing import Any, AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from app.schemas import ChatRequest, ExplainRequest, LlmStatus
from app.services import llm as engine

router = APIRouter(prefix="/llm", tags=["llm"])


def _sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _require_ready() -> None:
    st = engine.status()["state"]
    if st == "ready":
        return
    detail = {
        "disabled": "로컬 LLM이 꺼져 있습니다 (LLM_ENABLED=true 필요).",
        "unloaded": "모델이 아직 로드되지 않았습니다. POST /api/llm/load 로 올려 주세요.",
        "loading": "모델을 올리는 중입니다. 잠시 후 다시 시도해 주세요.",
        "error": f"모델 로딩에 실패했습니다: {engine.status()['error']}",
    }[st]
    raise HTTPException(status_code=503, detail=detail)


@router.get("/status", response_model=LlmStatus)
def get_status() -> dict[str, Any]:
    return engine.status()


@router.post("/load", status_code=202)
def load_model() -> dict[str, str]:
    st = engine.status()["state"]
    if st == "disabled":
        raise HTTPException(status_code=503, detail="LLM_ENABLED=true 가 필요합니다.")
    if st in ("unloaded", "error"):
        engine.load_in_background()
    return {"state": engine.status()["state"]}


async def _event_stream(request: Request, req: ChatRequest) -> AsyncIterator[str]:
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
    cancel = threading.Event()

    def worker() -> None:
        try:
            for ev in engine.stream_chat(req, cancel):
                loop.call_soon_threadsafe(queue.put_nowait, ev)
        except Exception as e:
            loop.call_soon_threadsafe(
                queue.put_nowait, {"type": "error", "code": "unavailable", "message": str(e)}
            )
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    threading.Thread(target=worker, name="llm-gen", daemon=True).start()
    try:
        while True:
            ev = await queue.get()
            if ev is None:
                break
            yield _sse(ev)
    finally:
        cancel.set()  # 클라이언트가 끊으면(중지 버튼) 다음 토큰에서 생성을 멈춘다


@router.post("/chat")
async def chat(req: ChatRequest, request: Request):
    _require_ready()
    if req.stream:
        return StreamingResponse(
            _event_stream(request, req),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    parts: list[str] = []
    done: dict[str, Any] = {}
    async for raw in _event_stream(request, req):
        ev = json.loads(raw.removeprefix("data: "))
        if ev["type"] == "token":
            parts.append(ev["text"])
        elif ev["type"] == "error":
            raise HTTPException(status_code=500, detail=ev["message"])
        else:
            done = ev
    return {"content": "".join(parts), "usage": done}


@router.post("/explain")
async def explain(req: ExplainRequest) -> dict[str, str]:
    """사전에 없는 단어의 쉬운 풀이(lookup 의 LLM fallback 자리)."""
    _require_ready()
    try:
        text = await run_in_threadpool(engine.explain_word, req.surface, req.context)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"surface": req.surface, "explanation": text}
