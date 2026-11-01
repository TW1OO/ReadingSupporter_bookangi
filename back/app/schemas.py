from typing import Literal

from pydantic import BaseModel, Field


class LookupRequest(BaseModel):
    surface: str
    context: str | None = None


class LookupResponse(BaseModel):
    surface: str
    lemma: str
    pos: str
    meaning: str | None = None
    explanation: str | None = None
    examples: list[str] = []


class ExplainRequest(BaseModel):
    surface: str
    lemma: str | None = None
    meaning: str | None = None
    context: str | None = None


class ExplainResponse(BaseModel):
    status: Literal["ready", "unavailable"]
    explanation: str | None = None
    examples: list[str] = []


# ---- 로컬 LLM ----
class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1, max_length=20000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=100)
    temperature: float = Field(default=0.7, ge=0, le=2)
    top_p: float = Field(default=0.9, ge=0, le=1)
    max_tokens: int = Field(default=1024, ge=1, le=4096)
    repeat_penalty: float = Field(default=1.1, ge=1, le=2)
    stream: bool = True


class LlmExplainRequest(BaseModel):
    surface: str = Field(min_length=1, max_length=100)
    context: str | None = Field(default=None, max_length=2000)


class LlmStatus(BaseModel):
    state: Literal["disabled", "unloaded", "loading", "ready", "error"]
    model: str
    n_ctx: int
    n_gpu_layers: int
    error: str | None = None
