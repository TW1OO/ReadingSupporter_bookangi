from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import explain, llm, lookup
from .services import llm as llm_engine
from app.routers import gaze_metrics


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 로컬 LLM: 켜져 있고 preload 이면 서버 시작과 동시에 백그라운드로 모델을 올린다.
    if settings.llm_enabled and settings.llm_preload:
        llm_engine.load_in_background()
    yield


app = FastAPI(title="Book항이 API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(lookup.router, prefix="/api")
app.include_router(explain.router, prefix="/api")
app.include_router(llm.router, prefix="/api")
app.include_router(gaze_metrics.router)

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
