"""시선 보정/정확도 측정 결과 수집. (11/02 '오차·정확도 측정' 일정용)

시선 추정(MediaPipe)은 브라우저에서만 돈다. 백엔드는 시선을 계산하지 않고,
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
    # 정확도: 목표점마다 시선 중앙 위치와 목표의 거리 평균(떨림 제외). 이 필드가 생기기 전 기록에는 없다.
    accuracy_px: float | None = Field(default=None, ge=0, le=5000)
    p90_error_px: float = Field(ge=0, le=5000)
    bias_dx: float = Field(ge=-5000, le=5000)
    bias_dy: float = Field(ge=-5000, le=5000)
    sample_count: int = Field(ge=0, le=100000)
    grade: Literal["excellent", "good", "fair", "poor"]
    viewport_w: int = Field(ge=1, le=20000)
    viewport_h: int = Field(ge=1, le=20000)
    # 보정 중 평균 자세 대비 검증 중 평균 자세의 이동량. 머리 움직임과 오차의 상관 진단용.
    pose_drift_pos: float | None = Field(default=None, ge=0, le=10)
    pose_drift_size: float | None = Field(default=None, ge=0, le=10)
    pose_drift_angle: float | None = Field(default=None, ge=0, le=10)
    # 검증 뒤 마무리 방식(retrain: 검증 점까지 재학습, bias: 쏠림 보정)과, 마무리 후 새 위치에서 다시 잰 결과(검증 2).
    finish_mode: Literal["retrain", "bias"] | None = None
    after_accuracy_px: float | None = Field(default=None, ge=0, le=5000)
    after_mean_error_px: float | None = Field(default=None, ge=0, le=5000)
    after_p90_error_px: float | None = Field(default=None, ge=0, le=5000)
    after_bias_dx: float | None = Field(default=None, ge=-5000, le=5000)
    after_bias_dy: float | None = Field(default=None, ge=-5000, le=5000)
    # 어떤 시선 추정기로 쟀는가. 지금은 하나뿐이지만, 비교 실험 때 쌓인 이전 기록(webgazer, mediapipe-poly 등)과 구분하려고 남긴다.
    tracker: Literal["mediapipe"] = "mediapipe"


@router.post("/metrics", status_code=201)
def post_metrics(body: GazeMetricsIn) -> dict:
    row = body.model_dump()
    row["at"] = datetime.now(timezone.utc).isoformat()
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with _lock, DATA_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return {"ok": True}


def _stats(rows: list[dict]) -> dict:
    errs = [r["mean_error_px"] for r in rows]
    acc = [r["accuracy_px"] for r in rows if r.get("accuracy_px") is not None]
    grades: dict[str, int] = {}
    for r in rows:
        grades[r["grade"]] = grades.get(r["grade"], 0) + 1
    ordered = sorted(errs)
    mid = len(ordered) // 2
    median = ordered[mid] if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2
    return {
        "count": len(rows),
        "mean_error_px": sum(errs) / len(errs),
        "median_error_px": median,
        "best_px": min(errs),
        "worst_px": max(errs),
        "grades": grades,
        **({"mean_accuracy_px": sum(acc) / len(acc)} if acc else {}),
    }


@router.get("/metrics/summary")
def summary() -> dict:
    if not DATA_FILE.exists():
        return {"count": 0}
    with _lock:
        rows = [json.loads(line) for line in DATA_FILE.read_text(encoding="utf-8").splitlines() if line]
    if not rows:
        return {"count": 0}
    by_tracker: dict[str, list[dict]] = {}
    for r in rows:
        # tracker 필드가 생기기 전에 쌓인 행은 WebGazer로 본다.
        by_tracker.setdefault(r.get("tracker", "webgazer"), []).append(r)
    return {
        **_stats(rows),
        "by_tracker": {k: _stats(v) for k, v in by_tracker.items()},
        "by_finish_mode": _finish_stats(rows),
    }


def _mean(rows: list[dict], key: str) -> float | None:
    vals = [r[key] for r in rows if r.get(key) is not None]
    return sum(vals) / len(vals) if vals else None


def _finish_stats(rows: list[dict]) -> dict:
    """마무리 방식별로 검증 1(마무리 전)과 검증 2(마무리 후)를 나란히 본다."""
    groups: dict[str, list[dict]] = {}
    for r in rows:
        if r.get("finish_mode") and r.get("after_accuracy_px") is not None:
            groups.setdefault(r["finish_mode"], []).append(r)
    return {
        mode: {
            "count": len(g),
            "before_accuracy_px": _mean(g, "accuracy_px"),
            "after_accuracy_px": _mean(g, "after_accuracy_px"),
            "before_mean_error_px": _mean(g, "mean_error_px"),
            "after_mean_error_px": _mean(g, "after_mean_error_px"),
        }
        for mode, g in groups.items()
    }
