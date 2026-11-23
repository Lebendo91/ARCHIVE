#!/usr/bin/env python3
"""Native validation of Phase 9: the AI assistant of the real binary, against a local server standing in for
Anthropic. No real key, no network: the binary is built with the Cargo feature `test-endpoints`
(`npm run tauri build -- --no-bundle --features test-endpoints`), the only build that accepts
`ARCHIVE_AI_TEST_ENDPOINT=http://127.0.0.1:…`; the distributed builds do not contain that code.

Two launches under Xvfb, in a temporary data folder (`ARCHIVE_DATA_DIR`), never the user's data:
1. The files of tests/fixtures/library are imported with Ctrl+O. The binary is closed; an Anthropic provider
   (with its model) and a conversation sharing the NE555 datasheet are written in the database, as the
   settings and the assistant would.
2. In the settings, a test key is typed and saved: on Linux there is no credential store, so the core keeps it
   for the session only, says so, and writes it nowhere (database, log). The connection test lists the models of
   the local server (the key travels in the `x-api-key` header). In the assistant, the conversation is opened and
   a question sent with Enter: the core sends the passage of the datasheet numbered S1 and the question, streams
   the answer through the Tauri channel into the real web view, and records it with its sources. The log holds
   the outcome only (never the key, the question or the answer), no error and no Content Security Policy
   violation.
Screenshots go to visual-audit/native-phase9/. Prerequisites: the build above, Xvfb, xdotool and ImageMagick.
Exit code 0 only if every check passes.
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("phase8", ROOT / "scripts" / "validate-native-phase8.py")
assert spec is not None and spec.loader is not None
phase8 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(phase8)

OUT = ROOT / "visual-audit" / "native-phase9"
phase8.OUT = OUT
phase8.DISPLAY = ":95"
check = phase8.check
wait_for = phase8.wait_for

KEY = "sk-ant-native-test-" + uuid.uuid4().hex[:16]
QUESTION = "Quelle est la tension du NE555 ?"
ANSWER = "D'apres la fiche, le NE555 fonctionne de 4,5 a 16 V [S1]."
# Places in the 1440×900 window (the layout of the visual audit at that size).
SIDEBAR_SETTINGS = (89, 780)
SETTINGS_AI = (388, 216)
SETTINGS_TITLE = (600, 108)
SIDEBAR_ASSISTANT = (90, 276)
FIRST_CONVERSATION = (407, 195)
COMPOSER = (916, 795)

requests: list[dict[str, object]] = []


class Provider(BaseHTTPRequestHandler):
    """Answers like Anthropic's Models and Messages APIs, and records what it receives."""

    def log_message(self, *_: object) -> None:  # quiet
        return

    def record(self) -> dict[str, object]:
        length = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(length).decode("utf-8") if length else ""
        entry = {"method": self.command, "path": self.path, "headers": dict(self.headers), "body": body}
        requests.append(entry)
        return entry

    def do_GET(self) -> None:  # noqa: N802
        self.record()
        payload = json.dumps(
            {
                "data": [
                    {"type": "model", "id": "claude-test", "display_name": "Claude Test", "max_tokens": 64000,
                     "lifecycle": "active", "allowed_fallback_models": []},
                    {"type": "model", "id": "claude-test-old", "display_name": "Claude Test Old",
                     "max_tokens": 8192, "lifecycle": "deprecated", "allowed_fallback_models": []},
                ],
                "has_more": False,
                "last_id": "claude-test-old",
            }
        ).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self) -> None:  # noqa: N802
        self.record()
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("connection", "close")
        self.end_headers()
        events = [
            {"type": "message_start", "message": {"model": "claude-test", "usage": {"input_tokens": 420}}},
            *[
                {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": piece}}
                for piece in (ANSWER[:20], ANSWER[20:])
            ],
            {"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 24}},
            {"type": "message_stop"},
        ]
        for event in events:
            self.wfile.write(f"event: {event['type']}\ndata: {json.dumps(event)}\n\n".encode())
            self.wfile.flush()
            time.sleep(0.3)


def seed(session: phase8.Session) -> tuple[str, str]:
    """The provider and the conversation, as the settings and the assistant write them."""
    with session.database() as db:
        datasheet = db.execute("SELECT id FROM documents WHERE original_filename = 'fiche-ne555.pdf'").fetchone()[0]
        provider = str(uuid.uuid4())
        now = int(time.time() * 1000)
        preferences = json.dumps(
            {"maxOutputTokens": 4000, "refusalFallback": True, "modelMaxOutputTokens": 64000,
             "modelRefusalFallback": False}
        )
        db.execute(
            "INSERT INTO ai_providers (id, provider, display_name, model, secret_ref, preferences_json, is_default,"
            " created_at, updated_at) VALUES (?, 'anthropic', 'Anthropic', 'claude-test', NULL, ?, 1, ?, ?)",
            (provider, preferences, now, now),
        )
        conversation = str(uuid.uuid4())
        scope = json.dumps({"items": [{"kind": "document", "id": datasheet}], "workspaceId": None})
        db.execute(
            "INSERT INTO conversations (id, title, scope_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (conversation, "Fiche du NE555", scope, now, now),
        )
    return datasheet, conversation


def main() -> int:
    if not phase8.BINARY.exists():
        print("Missing binary: npm run tauri build -- --no-bundle --features test-endpoints", file=sys.stderr)
        return 2
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    endpoint = f"http://127.0.0.1:{server.server_address[1]}"
    xvfb = subprocess.Popen(["Xvfb", phase8.DISPLAY, "-screen", "0", "1440x900x24", "-nolisten", "tcp"])
    time.sleep(2)
    workdir = pathlib.Path(tempfile.mkdtemp(prefix="archive-phase9-"))
    data_dir = workdir / "data"
    documents = workdir / "Documents"
    documents.mkdir()
    shutil.copy2(phase8.FIXTURES / "fiche-ne555.pdf", documents / "fiche-ne555.pdf")
    try:
        session = phase8.Session(data_dir, documents)
        session.env["ARCHIVE_AI_TEST_ENDPOINT"] = endpoint

        # 1. Import, then the provider and the conversation are written while the binary is closed.
        process = session.launch()
        session.pick_folder()
        time.sleep(4)
        session.stop(process)
        datasheet, conversation = seed(session)

        # 2. Key, connection test, question.
        process = session.launch()
        session.click(SIDEBAR_SETTINGS, pause=1.5)
        session.click(SETTINGS_AI, pause=1.5)
        session.shot("1-settings-without-key")
        session.click(SETTINGS_TITLE, pause=0.5)
        session.tab(3)  # « Ajouter un fournisseur », « Supprimer », then the key field
        session.type(KEY)
        session.key("Return", pause=2.0)
        session.shot("2-key-for-the-session")
        session.tab(2)  # « Retirer la clé », then « Tester la connexion »
        session.key("Return", pause=3.0)
        session.shot("3-connection-test")
        models = [r for r in requests if r["method"] == "GET"]
        check("the connection test asked the local provider for the models", len(models) == 1, len(models))
        check(
            "the key travels in the x-api-key header",
            bool(models) and dict(models[0]["headers"]).get("x-api-key") == KEY,
        )
        with session.database() as db:
            row = db.execute("SELECT secret_ref, model FROM ai_providers").fetchone()
        check("no credential store on Linux: the database names no entry", row[0] is None, row[0])
        log = session.log_text()
        check("the core says the key is kept for this session only", "for this session only" in log)

        session.click(SIDEBAR_ASSISTANT, pause=2.0)
        session.click(FIRST_CONVERSATION, pause=2.0)
        session.click(COMPOSER, pause=0.5)
        session.type(QUESTION)
        time.sleep(1.5)  # preview of what will be sent
        session.shot("4-preview")
        session.key("Return", pause=0.3)
        time.sleep(0.8)
        session.shot("5-streaming")
        wait_for(lambda: any(r["method"] == "POST" for r in requests), timeout=10)
        time.sleep(4)
        session.shot("6-answer")
        sent = [r for r in requests if r["method"] == "POST"]
        check("one answer was asked of the provider", len(sent) == 1, len(sent))
        body = json.loads(str(sent[0]["body"])) if sent else {}
        turn = body.get("messages", [{}])[-1].get("content", "") if body else ""
        check("the request follows the Messages API", body.get("stream") is True and body.get("model") == "claude-test")
        check("the passage of the shared datasheet left as S1", '<source id="S1"' in turn, turn[:200])
        check("the question left after the passages", turn.endswith(QUESTION), turn[-80:])
        check(
            "the key travels in the header of the answer too",
            bool(sent) and dict(sent[0]["headers"]).get("x-api-key") == KEY,
        )
        with session.database() as db:
            db.row_factory = sqlite3.Row
            answer = db.execute(
                "SELECT content, status, sources_json, details_json FROM conversation_messages"
                " WHERE conversation_id = ? AND role = 'assistant'",
                (conversation,),
            ).fetchone()
        check("the answer is recorded complete", answer is not None and answer["status"] == "complete",
              dict(answer) if answer else None)
        sources = json.loads(answer["sources_json"]) if answer else []
        check("its sources are the passages sent", [s.get("id") for s in sources][:1] == [datasheet], sources)
        check("its text is the streamed answer", answer is not None and answer["content"] == ANSWER)
        details = json.loads(answer["details_json"]) if answer else {}
        check("the usage of the provider is kept", details.get("usage", {}).get("inputTokens") == 420, details)

        session.stop(process)
        log = session.log_text()
        database_bytes = (data_dir / "archive.db").read_bytes()
        check("the key is nowhere in the database", KEY.encode() not in database_bytes)
        check("the key is nowhere in the log", KEY not in log)
        check("neither the question nor the answer is in the log", QUESTION not in log and ANSWER not in log)
        check("the log records the outcome of the answer", "assistant answer: anthropic" in log and "complete" in log)
        errors = [line for line in log.splitlines() if "[ERROR]" in line]
        check("no error in the log", not errors, errors[:3])
        check("no Content Security Policy violation reported", "CSP violation" not in log)
    finally:
        server.shutdown()
        xvfb.terminate()
        if (data_dir / "logs").exists():
            shutil.copytree(data_dir / "logs", OUT / "logs", dirs_exist_ok=True)
        shutil.rmtree(workdir, ignore_errors=True)
    failed = [name for name, ok in phase8.checks if not ok]
    print(f"\n{len(phase8.checks) - len(failed)}/{len(phase8.checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
