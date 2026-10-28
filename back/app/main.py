from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import lookup
from app.routers import gaze_metrics

app = FastAPI(title="Book항이 API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(lookup.router, prefix="/api")
app.include_router(gaze_metrics.router)

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
