from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_explain_is_placeholder_until_llm_is_connected():
    r = client.post(
        "/api/explain",
        json={"surface": "지지부진했다", "lemma": "지지부진하다", "meaning": "더디다", "context": "협상은 지지부진했다."},
    )
    assert r.status_code == 200
    assert r.json() == {"status": "unavailable", "explanation": None, "examples": []}


def test_explain_needs_only_surface():
    assert client.post("/api/explain", json={"surface": "서류"}).status_code == 200
    assert client.post("/api/explain", json={}).status_code == 422
