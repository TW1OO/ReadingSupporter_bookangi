import json

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
    sample_count=120, grade="good", viewport_w=1440, viewport_h=900,
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


def test_tracker_defaults_to_mediapipe(tmp_path, monkeypatch):
    c = make_client(tmp_path, monkeypatch)
    assert c.post("/api/gaze/metrics", json=BODY).status_code == 201
    assert list(c.get("/api/gaze/metrics/summary").json()["by_tracker"]) == ["mediapipe"]


def test_summary_keeps_history_from_old_trackers(tmp_path, monkeypatch):
    c = make_client(tmp_path, monkeypatch)
    # 비교 실험 때 쌓인 기록(다른 추정기 이름, tracker 필드 없는 아주 예전 행)도 그대로 묶여 나온다
    old = [{**BODY, "tracker": "mediapipe-poly", "mean_error_px": 80}, {**BODY, "mean_error_px": 200}]
    (tmp_path / "m.jsonl").write_text("".join(json.dumps(r) + "\n" for r in old), encoding="utf-8")
    for err in (60, 100):
        assert c.post("/api/gaze/metrics", json={**BODY, "mean_error_px": err}).status_code == 201
    s = c.get("/api/gaze/metrics/summary").json()
    assert s["count"] == 4
    assert s["by_tracker"]["webgazer"]["mean_error_px"] == 200
    assert s["by_tracker"]["mediapipe-poly"]["count"] == 1
    assert s["by_tracker"]["mediapipe"]["median_error_px"] == 80


def test_rejects_unknown_tracker(tmp_path, monkeypatch):
    c = make_client(tmp_path, monkeypatch)
    assert c.post("/api/gaze/metrics", json={**BODY, "tracker": "webgazer"}).status_code == 422


def test_accuracy_is_optional_and_summarized(tmp_path, monkeypatch):
    c = make_client(tmp_path, monkeypatch)
    assert c.post("/api/gaze/metrics", json=BODY).status_code == 201
    assert "mean_accuracy_px" not in c.get("/api/gaze/metrics/summary").json()
    for acc in (70, 90):
        assert c.post("/api/gaze/metrics", json={**BODY, "accuracy_px": acc}).status_code == 201
    assert c.get("/api/gaze/metrics/summary").json()["mean_accuracy_px"] == 80


def test_pose_drift_is_optional_and_stored(tmp_path, monkeypatch):
    c = make_client(tmp_path, monkeypatch)
    assert c.post("/api/gaze/metrics", json=BODY).status_code == 201
    body = {**BODY, "pose_drift_pos": 0.03, "pose_drift_size": 0.05, "pose_drift_angle": 0.1}
    assert c.post("/api/gaze/metrics", json=body).status_code == 201
    rows = [json.loads(l) for l in (tmp_path / "m.jsonl").read_text(encoding="utf-8").splitlines()]
    assert rows[0]["pose_drift_pos"] is None
    assert rows[1]["pose_drift_angle"] == 0.1
    assert c.post("/api/gaze/metrics", json={**BODY, "pose_drift_pos": -1}).status_code == 422


def test_summary_compares_finish_modes(tmp_path, monkeypatch):
    c = make_client(tmp_path, monkeypatch)
    runs = [
        ("retrain", 100, 70),
        ("retrain", 120, 90),
        ("bias", 110, 100),
    ]
    for mode, before, after in runs:
        body = {**BODY, "accuracy_px": before, "finish_mode": mode, "after_accuracy_px": after}
        assert c.post("/api/gaze/metrics", json=body).status_code == 201
    # 마무리 결과가 없는 예전 기록은 비교에서 빠진다
    assert c.post("/api/gaze/metrics", json=BODY).status_code == 201
    s = c.get("/api/gaze/metrics/summary").json()["by_finish_mode"]
    assert s["retrain"]["count"] == 2
    assert s["retrain"]["before_accuracy_px"] == 110
    assert s["retrain"]["after_accuracy_px"] == 80
    assert s["bias"]["after_accuracy_px"] == 100


def test_rejects_unknown_finish_mode(tmp_path, monkeypatch):
    c = make_client(tmp_path, monkeypatch)
    assert c.post("/api/gaze/metrics", json={**BODY, "finish_mode": "magic"}).status_code == 422
