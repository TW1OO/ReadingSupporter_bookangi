import json

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import ChatMessage
from app.services import llm as engine

client = TestClient(app)


def _msgs(*pairs):
    return [ChatMessage(role=r, content=c) for r, c in pairs]


def test_status_when_disabled():
    body = client.get("/api/llm/status").json()
    assert body["state"] == "disabled"
    assert body["n_ctx"] > 0


def test_chat_503_when_not_ready():
    r = client.post("/api/llm/chat", json={"messages": [{"role": "user", "content": "안녕"}]})
    assert r.status_code == 503


def test_chat_validates_input():
    assert client.post("/api/llm/chat", json={"messages": []}).status_code == 422
    bad = {"messages": [{"role": "user", "content": "x"}], "temperature": 9}
    assert client.post("/api/llm/chat", json=bad).status_code == 422


def test_fit_messages_drops_oldest_but_keeps_system_and_last():
    msgs = _msgs(
        ("system", "S"),
        ("user", "a" * 100),
        ("assistant", "b" * 100),
        ("user", "c" * 100),
        ("assistant", "d" * 100),
        ("user", "마지막"),
    )
    out = engine.fit_messages(msgs, max_tokens=100, n_ctx=100 + 64 + 3 * 112 + 40, count_tokens=len)
    contents = [m.content for m in out]
    assert contents[0] == "S" and contents[-1] == "마지막"
    assert "a" * 100 not in contents  # 가장 오래된 것부터 버려진다
    assert "d" * 100 in contents


def test_chat_streams_sse_with_fake_engine(monkeypatch):
    monkeypatch.setattr(engine, "_state", "ready")
    monkeypatch.setattr(engine, "_llm", object())

    def fake_stream(req, cancel):
        yield {"type": "token", "text": "안"}
        yield {"type": "token", "text": "녕"}
        yield {"type": "done", "finish_reason": "stop", "completion_tokens": 2}

    monkeypatch.setattr(engine, "stream_chat", fake_stream)
    with client.stream("POST", "/api/llm/chat", json={"messages": [{"role": "user", "content": "hi"}]}) as r:
        assert r.headers["content-type"].startswith("text/event-stream")
        events = [json.loads(line[6:]) for line in r.iter_lines() if line.startswith("data: ")]
    assert "".join(e["text"] for e in events if e["type"] == "token") == "안녕"
    assert events[-1]["type"] == "done"

    r = client.post("/api/llm/chat", json={"messages": [{"role": "user", "content": "hi"}], "stream": False})
    assert r.json()["content"] == "안녕"
