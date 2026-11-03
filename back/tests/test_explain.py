from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_explain_is_placeholder_until_llm_is_connected():
    r = client.post(
        "/api/explain",
        json={"surface": "지지부진했다", "lemma": "지지부진하다", "meaning": "더디다", "context": "협상은 지지부진했다."},
    )
    assert r.status_code == 200
    assert r.json() == {"status": "unavailable", "explanation": None, "search": None, "examples": []}


def test_explain_needs_only_surface():
    assert client.post("/api/explain", json={"surface": "서류"}).status_code == 200
    assert client.post("/api/explain", json={}).status_code == 422


# ---- LLM 연동 (가짜 엔진) ----
from app.services import explain as svc, llm as engine  # noqa: E402


def _ready(monkeypatch, replies):
    monkeypatch.setattr(engine, "is_ready", lambda: True)
    calls = []

    def fake(system, user, **kw):
        calls.append(user)
        return replies[min(len(calls) - 1, len(replies) - 1)]

    monkeypatch.setattr(engine, "complete", fake)
    return calls


def test_sentence_mode_returns_short_explanation(monkeypatch):
    _ready(monkeypatch, ["아무도 없는 곳에서 한 말도 결국 퍼지니 항상 말조심해야 한다."])
    r = client.post("/api/explain", json={"surface": "새", "context": "낮말은 새가 듣고 밤말은 쥐가 듣는다.", "mode": "sentence"})
    body = r.json()
    assert body["status"] == "ready" and 0 < len(body["explanation"]) <= 60 and body["search"] is None


def test_sentence_over_limit_retries_then_clamps(monkeypatch):
    long = "가나다라 " * 30
    calls = _ready(monkeypatch, [long, long])
    r = client.post("/api/explain", json={"surface": "x", "context": "문장입니다.", "mode": "sentence"})
    assert len(calls) == 2  # 한 번만 다시 시킨다
    assert len(r.json()["explanation"]) <= 60


def test_search_mode_limit_200(monkeypatch):
    _ready(monkeypatch, ["뜻 풀이. " * 80])
    r = client.post("/api/explain", json={"surface": "지지부진했다", "lemma": "지지부진하다", "mode": "search"})
    body = r.json()
    assert body["status"] == "ready" and len(body["search"]) <= 200 and body["explanation"] is None


def test_clean_strips_quotes_and_prefix():
    assert svc.clean('해설: "말조심해야 한다."\n') == "말조심해야 한다."


def test_llm_failure_is_unavailable(monkeypatch):
    monkeypatch.setattr(engine, "is_ready", lambda: True)

    def boom(*a, **k):
        raise RuntimeError("x")

    monkeypatch.setattr(engine, "complete", boom)
    assert client.post("/api/explain", json={"surface": "서류"}).json()["status"] == "unavailable"


def test_search_output_is_kept_as_is_under_limit(monkeypatch):
    raw = "**지지부진**: 매우 더디다.\n예문: 공사가 지지부진하다."
    calls = _ready(monkeypatch, [raw])
    body = client.post("/api/explain", json={"surface": "지지부진했다", "mode": "search"}).json()
    assert body["search"] == raw and len(calls) == 1  # 후처리·재시도 없음
