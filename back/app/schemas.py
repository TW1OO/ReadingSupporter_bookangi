from typing import Literal

from pydantic import BaseModel


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
