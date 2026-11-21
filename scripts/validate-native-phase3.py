#!/usr/bin/env python3
"""Native validation of Phase 3: the production binary, its real SQLite database, driven like a user.

Three launches under Xvfb, in a temporary data folder (`ARCHIVE_DATA_DIR`), never the user's data:

1. First run: the onboarding shows; two workspaces are created with Ctrl+Shift+N and the keyboard
   (xdotool types uppercase accented letters in lowercase: the names only use lowercase accents).
2. Content is added to the first workspace directly in the database, as the Library and Notes modules
   will do (one folder, two notes). The workspace is then deleted from its page, with the default
   protected option: its content must move into the other workspace, inside a folder named after it.
3. Relaunch: everything must still be there.

The database is checked after each launch; screenshots go to visual-audit/native-phase3/. Prerequisites:
`npm run tauri build -- --no-bundle`, then Xvfb, xdotool and ImageMagick (`import`).
Exit code 0 only if every check passes.
"""

from __future__ import annotations

import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parent.parent
BINARY = ROOT / "src-tauri" / "target" / "release" / "archive"
OUT = ROOT / "visual-audit" / "native-phase3"
DISPLAY = ":97"

checks: list[tuple[str, bool]] = []


def check(name: str, condition: bool) -> None:
    checks.append((name, condition))
    print(("PASS " if condition else "FAIL ") + name, flush=True)


class Session:
    def __init__(self, data_dir: pathlib.Path) -> None:
        self.data_dir = data_dir
        self.env = {**os.environ, "DISPLAY": DISPLAY, "ARCHIVE_DATA_DIR": str(data_dir)}
        self.log = open(OUT / "native-output.log", "a", encoding="utf-8")  # noqa: SIM115

    def run(self, *args: str) -> None:
        subprocess.run(args, check=True, env=self.env)

    def key(self, *keys: str) -> None:
        self.run("xdotool", "key", "--clearmodifiers", *keys)
        time.sleep(0.7)

    def type(self, text: str) -> None:
        self.run("xdotool", "type", "--delay", "80", text)
        time.sleep(0.5)

    def click(self, x: int, y: int) -> None:
        self.run("xdotool", "mousemove", str(x), str(y), "click", "1")
        time.sleep(1.0)

    def shot(self, name: str) -> None:
        self.run("import", "-window", "root", str(OUT / f"{name}.png"))

    def launch(self) -> subprocess.Popen[bytes]:
        process = subprocess.Popen([str(BINARY)], env=self.env, stdout=self.log, stderr=self.log)
        for _ in range(60):
            found = subprocess.run(
                ["xdotool", "search", "--name", "ARCHIVE"],
                env=self.env,
                capture_output=True,
                text=True,
                check=False,
            )
            if found.stdout.strip():
                break
            time.sleep(0.5)
        time.sleep(8)  # interface loaded and data fetched
        # Gives the keyboard focus to the web view (an empty area of the content).
        self.click(1400, 880)
        return process

    @staticmethod
    def stop(process: subprocess.Popen[bytes]) -> None:
        process.terminate()
        process.wait(timeout=20)
        time.sleep(1)

    def database(self) -> sqlite3.Connection:
        return sqlite3.connect(self.data_dir / "archive.db")


def first_launch(session: Session) -> None:
    process = session.launch()
    session.shot("01-first-run")
    for name in ("Mécanique", "Projets"):
        session.key("ctrl+shift+n")
        session.type(name)
        session.key("Return")
        time.sleep(1.5)
    session.shot("02-workspaces-created")
    session.stop(process)

    with session.database() as db:
        rows = db.execute("SELECT name, color, icon FROM workspaces ORDER BY sort_order").fetchall()
        events = db.execute(
            "SELECT event_type, description FROM timeline_events ORDER BY created_at"
        ).fetchall()
    check("two workspaces created through the interface", [r[0] for r in rows] == ["Mécanique", "Projets"])
    check("default colour and icon stored as token names", all(r[1:] == ("amber", "folder") for r in rows))
    check(
        "each creation recorded in the timeline",
        events == [("workspace_created", "Mécanique"), ("workspace_created", "Projets")],
    )


def add_content(session: Session) -> None:
    """One folder and two notes in « Mécanique », as the Library and Notes modules will create them."""
    now = int(time.time() * 1000)
    with session.database() as db:
        workspace = db.execute("SELECT id FROM workspaces WHERE name = 'Mécanique'").fetchone()[0]
        folder = str(uuid.uuid4())
        db.execute(
            "INSERT INTO folders (id, workspace_id, parent_id, name, name_key, created_at, updated_at)"
            " VALUES (?, ?, NULL, 'Cours', 'cours', ?, ?)",
            (folder, workspace, now, now),
        )
        for title, folder_id in (("Lois de Kirchhoff", folder), ("Idées de projets", None)):
            db.execute(
                "INSERT INTO notes (id, title, content_format, workspace_id, folder_id, created_at, updated_at)"
                " VALUES (?, ?, 'plain', ?, ?, ?, ?)",
                (str(uuid.uuid4()), title, workspace, folder_id, now, now),
            )


def second_launch(session: Session) -> None:
    process = session.launch()
    session.shot("03-overview-with-content")
    session.click(92, 392)  # « Mécanique » in the sidebar
    session.shot("04-workspace-page")
    session.click(1392, 108)  # actions menu of the workspace page
    session.key("Down")  # Archive
    session.key("Down")  # Delete
    session.key("Return")
    time.sleep(1)
    session.shot("05-delete-dialog")
    session.key("Tab")  # from « Cancel », focused first, to « Delete workspace »
    session.key("Return")
    time.sleep(2)
    session.shot("06-after-deletion")
    session.stop(process)

    with session.database() as db:
        workspaces = db.execute("SELECT id, name FROM workspaces").fetchall()
        target = workspaces[0][0] if len(workspaces) == 1 else None
        folders = dict(
            ((name, parent) for name, parent in db.execute(
                "SELECT name, (SELECT name FROM folders p WHERE p.id = f.parent_id)"
                " FROM folders f WHERE workspace_id = ?",
                (target,),
            ))
        )
        notes = db.execute(
            "SELECT n.title, f.name FROM notes n LEFT JOIN folders f ON f.id = n.folder_id"
            " WHERE n.workspace_id = ? AND n.deleted_at IS NULL ORDER BY n.title",
            (target,),
        ).fetchall()
        total_notes = db.execute("SELECT count(*) FROM notes").fetchone()[0]
    check("the deleted workspace is gone, the other one remains", [w[1] for w in workspaces] == ["Projets"])
    check(
        "its folders moved under a folder named after it",
        folders == {"Mécanique": None, "Cours": "Mécanique"},
    )
    check(
        "its notes moved, none deleted",
        total_notes == 2
        and notes == [("Idées de projets", "Mécanique"), ("Lois de Kirchhoff", "Cours")],
    )


def third_launch(session: Session) -> None:
    process = session.launch()
    session.shot("07-relaunch")
    session.stop(process)
    log = session.data_dir / "logs" / "archive.log"
    text = log.read_text(encoding="utf-8") if log.exists() else ""
    errors = [line for line in text.splitlines() if "[ERROR]" in line]
    check("application log written", bool(text))
    check("no error in the log (native core or interface)", not errors)
    check("no Content Security Policy violation reported", "CSP violation" not in text)
    for line in errors:
        print("  " + line)


def main() -> int:
    if not BINARY.exists():
        print(f"Missing {BINARY}: run `npm run tauri build -- --no-bundle` first.", file=sys.stderr)
        return 2
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    xvfb = subprocess.Popen(["Xvfb", DISPLAY, "-screen", "0", "1440x900x24", "-nolisten", "tcp"])
    time.sleep(2)
    data_dir = pathlib.Path(tempfile.mkdtemp(prefix="archive-phase3-"))
    try:
        session = Session(data_dir)
        first_launch(session)
        add_content(session)
        second_launch(session)
        third_launch(session)
    finally:
        xvfb.terminate()
        shutil.copytree(data_dir / "logs", OUT / "logs", dirs_exist_ok=True)
        shutil.rmtree(data_dir, ignore_errors=True)
    failed = [name for name, ok in checks if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
