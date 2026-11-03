"""로컬 LLM(EXAONE GGUF) 서비스. llama-cpp-python 위에서 돈다.

- 모델은 프로세스에 하나만 올린다. llama.cpp 컨텍스트는 동시에 두 요청을 처리하지 못하므로
  요청은 락으로 줄을 세운다(먼저 온 요청이 끝나야 다음 요청이 시작).
- llama_cpp 는 여기서만 import 한다(지연 import). 설치되지 않은 PC에서도 서버는 뜬다.
- 엔진을 바꾸고 싶으면 이 파일 안에서만 교체한다(routers/llm.py 는 이 파일의 함수만 쓴다).
"""
from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any, Iterator

from app.config import settings
from app.schemas import ChatMessage, ChatRequest

_load_lock = threading.Lock()  # 모델 로딩 중복 방지
_gen_lock = threading.Lock()  # 생성은 한 번에 하나
_llm: Any = None
_state = "disabled" if not settings.llm_enabled else "unloaded"
_error: str | None = None

# 토큰 수를 못 잴 때(모델 미로드 등)의 보수적 추정. 한국어는 대략 글자당 1토큰 안팎.
_MSG_OVERHEAD_TOKENS = 12


class LlmUnavailable(RuntimeError):
    """LLM 이 꺼져 있거나 아직 준비되지 않았다."""


def status() -> dict[str, Any]:
    return {
        "state": _state,
        "model": settings.llm_model_name,
        "n_ctx": settings.llm_n_ctx,
        "n_gpu_layers": settings.llm_n_gpu_layers,
        "error": _error,
    }


def load() -> None:
    """모델을 메모리(GPU)에 올린다. 이미 올라가 있으면 아무것도 하지 않는다. 블로킹 호출."""
    global _llm, _state, _error
    if not settings.llm_enabled:
        raise LlmUnavailable("LLM_ENABLED=true 로 켜야 합니다.")
    with _load_lock:
        if _llm is not None:
            return
        _state, _error = "loading", None
        try:
            path = Path(settings.llm_model_path)
            if not settings.llm_model_path or not path.is_file():
                raise FileNotFoundError(f"모델 파일을 찾을 수 없습니다: {settings.llm_model_path or '(LLM_MODEL_PATH 비어 있음)'}")
            try:
                from llama_cpp import Llama
            except ImportError as e:  # pragma: no cover - 환경 의존
                raise RuntimeError("llama-cpp-python 이 설치되지 않았습니다. docs/LLM_SERVER.md 를 보세요.") from e

            kwargs: dict[str, Any] = dict(
                model_path=str(path),
                n_ctx=settings.llm_n_ctx,
                n_gpu_layers=settings.llm_n_gpu_layers,
                n_batch=settings.llm_n_batch,
                flash_attn=settings.llm_flash_attn,
                verbose=False,
            )
            if settings.llm_n_threads:
                kwargs["n_threads"] = settings.llm_n_threads
            if settings.llm_chat_format:
                kwargs["chat_format"] = settings.llm_chat_format
            _llm = Llama(**kwargs)
            _state = "ready"
        except Exception as e:
            _state, _error = "error", f"{type(e).__name__}: {e}"
            raise


def load_in_background() -> None:
    def run() -> None:
        try:
            load()
        except Exception:  # 실패 사유는 status() 의 error 로 노출된다
            pass

    threading.Thread(target=run, name="llm-load", daemon=True).start()


def fit_messages(
    messages: list[ChatMessage],
    max_tokens: int,
    n_ctx: int,
    count_tokens: Any,
) -> list[ChatMessage]:
    """컨텍스트에 맞게 오래된 대화부터 버린다. system 과 마지막 user 메시지는 남긴다."""
    budget = n_ctx - max_tokens - 64  # 생성 공간 + 템플릿 여유
    cost = [count_tokens(m.content) + _MSG_OVERHEAD_TOKENS for m in messages]
    system = [i for i, m in enumerate(messages) if m.role == "system"]
    keep = set(system) | {len(messages) - 1}
    used = sum(cost[i] for i in keep)
    # 최신 메시지부터 거꾸로 채운다.
    for i in range(len(messages) - 2, -1, -1):
        if i in keep:
            continue
        if used + cost[i] > budget:
            break
        keep.add(i)
        used += cost[i]
    return [m for i, m in enumerate(messages) if i in keep]


def _count_tokens(text: str) -> int:
    if _llm is None:
        return len(text)
    return len(_llm.tokenize(text.encode("utf-8"), add_bos=False))


def stream_chat(req: ChatRequest, cancel: threading.Event) -> Iterator[dict[str, Any]]:
    """이벤트를 하나씩 내보낸다: {"type": "token"|"done"|"error", ...}. cancel 이 켜지면 즉시 멈춘다."""
    if _state != "ready" or _llm is None:
        raise LlmUnavailable(f"모델이 준비되지 않았습니다 (state={_state}).")

    messages = fit_messages(req.messages, req.max_tokens, settings.llm_n_ctx, _count_tokens)
    dropped = len(req.messages) - len(messages)

    with _gen_lock:
        if cancel.is_set():
            return
        started = time.perf_counter()
        first_at: float | None = None
        completion = 0
        finish = None
        try:
            chunks = _llm.create_chat_completion(
                messages=[m.model_dump() for m in messages],
                temperature=req.temperature,
                top_p=req.top_p,
                max_tokens=req.max_tokens,
                repeat_penalty=req.repeat_penalty,
                stream=True,
            )
            for chunk in chunks:
                if cancel.is_set():
                    finish = "cancelled"
                    break
                choice = chunk["choices"][0]
                text = choice.get("delta", {}).get("content")
                if text:
                    if first_at is None:
                        first_at = time.perf_counter()
                    completion += 1  # 스트리밍 청크 ≈ 토큰 1개
                    yield {"type": "token", "text": text}
                finish = choice.get("finish_reason") or finish
        except ValueError as e:  # 컨텍스트 초과 등
            yield {"type": "error", "code": "context_overflow", "message": str(e)}
            return
        except Exception as e:
            yield {"type": "error", "code": "generation_failed", "message": f"{type(e).__name__}: {e}"}
            return

        ended = time.perf_counter()
        gen_time = (ended - first_at) if first_at else 0.0
        n_total = getattr(_llm, "n_tokens", None)
        yield {
            "type": "done",
            "finish_reason": finish or "stop",
            "ttft_ms": int((first_at - started) * 1000) if first_at else None,
            "tokens_per_s": round((completion - 1) / gen_time, 1) if gen_time > 0 and completion > 1 else None,
            "completion_tokens": completion,
            "prompt_tokens": (n_total - completion) if isinstance(n_total, int) else None,
            "n_ctx": settings.llm_n_ctx,
            "dropped_messages": dropped,
        }


EXPLAIN_SYSTEM = (
    "당신은 한국어 독서 보조 도우미입니다. 독자가 모르는 단어를 만나면 중학생도 이해할 수 있는 "
    "쉬운 말로 뜻을 한두 문장으로 풀이하고, 짧은 예문을 하나 보여 주세요. "
    "문맥이 주어지면 그 문맥에서의 뜻을 우선합니다. 확실하지 않은 단어는 지어내지 말고 모른다고 답하세요."
)


def explain_word(surface: str, context: str | None) -> str:
    """사전에 없는 단어의 쉬운 풀이. 짧게 끝나는 단발 호출."""
    prompt = f"단어: {surface}" + (f"\n문맥: {context}" if context else "")
    req = ChatRequest(
        messages=[ChatMessage(role="system", content=EXPLAIN_SYSTEM), ChatMessage(role="user", content=prompt)],
        temperature=0.3,
        max_tokens=256,
        stream=False,
    )
    parts: list[str] = []
    for ev in stream_chat(req, threading.Event()):
        if ev["type"] == "token":
            parts.append(ev["text"])
        elif ev["type"] == "error":
            raise RuntimeError(ev["message"])
    return "".join(parts).strip()


def is_ready() -> bool:
    return _state == "ready" and _llm is not None


def complete(system: str, user: str, *, temperature: float = 0.3, max_tokens: int = 256) -> str:
    """system/user 한 쌍으로 단발 생성한다. 블로킹 호출이라 라우터에서는 threadpool 로 부른다."""
    req = ChatRequest(
        messages=[ChatMessage(role="system", content=system), ChatMessage(role="user", content=user)],
        temperature=temperature,
        max_tokens=max_tokens,
        stream=False,
    )
    parts: list[str] = []
    for ev in stream_chat(req, threading.Event()):
        if ev["type"] == "token":
            parts.append(ev["text"])
        elif ev["type"] == "error":
            raise RuntimeError(ev["message"])
    return "".join(parts).strip()
