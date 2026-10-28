"""시선 보정/정확도 측정 결과 수집. (11/02 '오차·정확도 측정' 일정용)

WebGazer는 브라우저에서만 돈다. 백엔드는 시선을 계산하지 않고,
프론트가 보낸 보정 결과를 JSONL로 쌓아 평가표/그래프에 쓴다.
"""
from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/gaze", tags=["gaze"])

DATA_FILE = Path(os.getenv("GAZE_METRICS_FILE", "data/gaze_metrics.jsonl"))
_lock = threading.Lock()


class GazeMetricsIn(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    mean_error_px: float = Field(ge=0, le=5000)
    p90_error_px: float = Field(ge=0, le=5000)
    bias_dx: float = Field(ge=-5000, le=5000)
    bias_dy: float = Field(ge=-5000, le=5000)
    sample_count: int = Field(ge=0, le=100000)
    grade: Literal["excellent", "good", "fair", "poor"]
    viewport_w: int = Field(ge=1, le=20000)
    viewport_h: int = Field(ge=1, le=20000)
    bias_applied: bool = False


@router.post("/metrics", status_code=201)
def post_metrics(body: GazeMetricsIn) -> dict:
    row = body.model_dump()
    row["at"] = datetime.now(timezone.utc).isoformat()
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with _lock, DATA_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return {"ok": True}


@router.get("/metrics/summary")
def summary() -> dict:
    if not DATA_FILE.exists():
        return {"count": 0}
    with _lock:
        rows = [json.loads(line) for line in DATA_FILE.read_text(encoding="utf-8").splitlines() if line]
    if not rows:
        return {"count": 0}
    errs = [r["mean_error_px"] for r in rows]
    grades: dict[str, int] = {}
    for r in rows:
        grades[r["grade"]] = grades.get(r["grade"], 0) + 1
    return {
        "count": len(rows),
        "mean_error_px": sum(errs) / len(errs),
        "best_px": min(errs),
        "worst_px": max(errs),
        "grades": grades,
    }
