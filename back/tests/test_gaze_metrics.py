from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import gaze_metrics


def make_client(tmp_path, monkeypatch):
    monkeypatch.setattr(gaze_metrics, "DATA_FILE", tmp_path / "m.jsonl")
    app = FastAPI()
    app.include_router(gaze_metrics.router)
    return TestClient(app)


BODY = dict(
    session_id="s1", mean_error_px=96.5, p90_error_px=150.0, bias_dx=20, bias_dy=-12,
    sample_count=120, grade="good", viewport_w=1440, viewport_h=900, bias_applied=True,
)


def test_post_and_summary(tmp_path, monkeypatch):
    c = make_client(tmp_path, monkeypatch)
    assert c.get("/api/gaze/metrics/summary").json() == {"count": 0}
    assert c.post("/api/gaze/metrics", json=BODY).status_code == 201
    s = c.get("/api/gaze/metrics/summary").json()
    assert s["count"] == 1 and s["grades"] == {"good": 1}


def test_rejects_bad_grade(tmp_path, monkeypatch):
    c = make_client(tmp_path, monkeypatch)
    assert c.post("/api/gaze/metrics", json={**BODY, "grade": "amazing"}).status_code == 422
