#!/usr/bin/env python3
"""Native validation of Phase 5: the production binary edits notes like a user.

Four launches under Xvfb, in a temporary data folder (`ARCHIVE_DATA_DIR`), never the user's data:

1. Ctrl+N creates a note; its title and its text are typed with the keyboard, formatted by the Markdown
   shortcuts of the editor (heading, bold, list, task). The autosave writes it to SQLite: TipTap JSON, plain
   text, revision. A second note links to the first through the link picker: the relation `links_to` is
   stored, and the first note lists the second among its backlinks.
2. A note is typed and the window is closed at once, by a real close request (WM_DELETE_WINDOW): the log
   shows the request arriving while the save was pending, the window closes, the text is in the database.
   Without a window manager, Xvfb sometimes loses the request before the application sees it (the log then
   holds no request): the attempt is then repeated, up to three times, and never counted as a success.
3. « Importer du Markdown » opens the native file picker (GTK, Markdown files only): the `.md` file of a
   temporary « Documents » folder becomes a note, the `.txt` file is not offered, the original is untouched.
   The note is exported as Markdown through the native save dialog: the file keeps its structure.
4. Relaunch: notes, link and contents are still there; the log holds no error and no CSP violation.

Screenshots go to visual-audit/native-phase5/. Prerequisites: `npm run tauri build -- --no-bundle`, then Xvfb,
xdotool, ImageMagick (`import`) and python-xlib (`pip install python-xlib`, to send the close request).
Exit code 0 only if every check passes.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
BINARY = ROOT / "src-tauri" / "target" / "release" / "archive"
OUT = ROOT / "visual-audit" / "native-phase5"
DISPLAY = ":95"

# Places in the 1440×900 window (the layout of the visual audit at that size).
NAV_NOTES = (72, 168)
EMPTY_AREA = (1400, 880)
IMPORT_MARKDOWN = (1170, 109)
FIRST_NOTE_OF_LIST = (370, 221)
EDITOR_FIRST_LINE = (700, 262)
INTERNAL_LINK_BUTTON = (665, 207)
NOTE_ACTIONS = (1080, 108)
# A note without workspace: its « Liens de cette note » card starts higher.
FIRST_LINK_OF_PANEL = (1215, 499)

MARKDOWN = """# Diodes

Une **jonction PN** ne conduit que dans un sens.

| Diode | Seuil |
| --- | --- |
| 1N4148 | 0,6 V |

- [x] Relever la caractéristique
- [ ] Comparer avec la fiche

[Fiche technique](https://example.com/1n4148)
"""

checks: list[tuple[str, bool]] = []


def check(name: str, condition: bool, detail: object = None) -> None:
    checks.append((name, condition))
    print(("PASS " if condition else "FAIL ") + name, flush=True)
    if not condition and detail is not None:
        print(f"  got: {detail!r}", flush=True)


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def wait_for(condition, timeout: float = 15.0) -> bool:  # noqa: ANN001
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.5)
    return bool(condition())


class Session:
    def __init__(self, data_dir: pathlib.Path, documents: pathlib.Path) -> None:
        self.data_dir = data_dir
        self.documents = documents
        self.env = {
            **os.environ,
            "DISPLAY": DISPLAY,
            "ARCHIVE_DATA_DIR": str(data_dir),
            # The GTK dialogs open in this folder's parent, like a user's home.
            "HOME": str(documents.parent),
            "GTK_USE_PORTAL": "0",
        }
        self.log = open(OUT / "native-output.log", "a", encoding="utf-8")  # noqa: SIM115

    def run(self, *args: str) -> None:
        subprocess.run(args, check=True, env=self.env)

    def key(self, *keys: str) -> None:
        self.run("xdotool", "key", "--clearmodifiers", *keys)
        time.sleep(0.6)

    def type(self, text: str) -> None:
        self.run("xdotool", "type", "--delay", "40", "--", text)
        time.sleep(0.5)

    def click(self, position: tuple[int, int], pause: float = 1.0) -> None:
        self.run("xdotool", "mousemove", str(position[0]), str(position[1]), "click", "1")
        time.sleep(pause)

    def shot(self, name: str) -> None:
        self.run("import", "-window", "root", str(OUT / f"{name}.png"))

    def windows(self) -> list[str]:
        found = subprocess.run(
            ["xdotool", "search", "--onlyvisible", "--name", "."],
            env=self.env,
            capture_output=True,
            text=True,
            check=False,
        )
        return found.stdout.split()

    def main_windows(self) -> list[int]:
        found = subprocess.run(
            ["xdotool", "search", "--onlyvisible", "--name", "ARCHIVE"],
            env=self.env,
            capture_output=True,
            text=True,
            check=False,
        )
        return [int(window) for window in found.stdout.split()]

    def launch(self) -> subprocess.Popen[bytes]:
        process = subprocess.Popen([str(BINARY)], env=self.env, stdout=self.log, stderr=self.log)
        wait_for(lambda: bool(self.main_windows()), timeout=30)
        time.sleep(8)  # interface loaded and data fetched
        # Gives the keyboard focus to the web view (an empty area of the content).
        self.click(EMPTY_AREA)
        return process

    def request_close(self) -> None:
        """Asks the window to close, as its close button does (WM_DELETE_WINDOW), without killing it."""
        from Xlib import X, display, protocol  # noqa: PLC0415

        connection = display.Display(DISPLAY)
        protocols = connection.intern_atom("WM_PROTOCOLS")
        delete = connection.intern_atom("WM_DELETE_WINDOW")
        for window_id in self.main_windows():
            window = connection.create_resource_object("window", window_id)
            event = protocol.event.ClientMessage(
                window=window, client_type=protocols, data=(32, [delete, X.CurrentTime, 0, 0, 0])
            )
            window.send_event(event, event_mask=X.NoEventMask)
        connection.flush()
        connection.close()

    def wait_for_dialog(self, before: set[str]) -> None:
        wait_for(lambda: bool(set(self.windows()) - before), timeout=15)
        time.sleep(2)
        # Without a window manager, the keyboard follows the pointer: move it over the dialog, which opens in
        # the top left corner, above the main window.
        self.run("xdotool", "mousemove", "600", "400")
        time.sleep(0.5)

    @staticmethod
    def stop(process: subprocess.Popen[bytes]) -> None:
        process.terminate()
        process.wait(timeout=20)
        time.sleep(1)

    def database(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.data_dir / "archive.db")
        connection.row_factory = sqlite3.Row
        return connection


def notes_by_title(session: Session) -> dict[str, dict[str, object]]:
    with session.database() as db:
        rows = db.execute("SELECT * FROM notes WHERE deleted_at IS NULL").fetchall()
    return {str(row["title"]): dict(row) for row in rows}


def block_types(note: dict[str, object]) -> list[str]:
    content = json.loads(str(note.get("content") or "{}"))
    return [str(node.get("type")) for node in content.get("content", [])]


def first_launch(session: Session) -> None:
    process = session.launch()
    session.shot("01-start")

    # A note written with the keyboard only.
    session.key("ctrl+n")
    time.sleep(2)
    session.type("Lois de Kirchhoff")
    session.key("Return")
    session.type("## Loi des noeuds")
    session.key("Return")
    session.type("La somme des courants entrants est egale a celle des courants sortants, ")
    session.key("ctrl+b")
    session.type("toujours")
    session.key("ctrl+b")
    session.type(".")
    session.key("Return")
    session.type("- Premier terme")
    session.key("Return")
    session.type("Second terme")
    session.key("Return", "Return")
    session.type("[ ] Reviser la loi des mailles")
    time.sleep(3)  # autosave
    session.shot("02-note-typed")
    kirchhoff = notes_by_title(session).get("Lois de Kirchhoff", {})
    check("Ctrl+N creates a note, saved with the title typed", bool(kirchhoff), sorted(notes_by_title(session)))
    check(
        "the Markdown shortcuts give a heading, a list and a task, stored as TipTap JSON",
        kirchhoff.get("content_format") == "tiptap-json"
        and block_types(kirchhoff)[:4] == ["heading", "paragraph", "bulletList", "taskList"],
        block_types(kirchhoff),
    )
    check(
        "bold typed with Ctrl+B is kept as a mark",
        '"type":"bold"' in str(kirchhoff.get("content", "")).replace(" ", ""),
    )
    check(
        "the plain text is stored for search, one line per block",
        kirchhoff.get("content_text")
        == "Loi des noeuds\nLa somme des courants entrants est egale a celle des courants sortants, toujours."
        "\nPremier terme\nSecond terme\nReviser la loi des mailles",
        kirchhoff.get("content_text"),
    )
    check("each save raises the revision", int(kirchhoff.get("revision") or 0) >= 2, kirchhoff.get("revision"))

    # A second note links to the first through the link picker.
    session.key("ctrl+n")
    time.sleep(2)
    session.type("Loi d'Ohm")
    session.key("Return")
    session.type("U = R x I, voir aussi ")
    session.click(INTERNAL_LINK_BUTTON, pause=1.5)
    session.type("kirch")
    time.sleep(1.5)
    session.shot("03-link-picker")
    session.key("Tab")
    session.key("Return")
    time.sleep(3)
    session.shot("04-linked")
    notes = notes_by_title(session)
    ohm = notes.get("Loi d'Ohm", {})
    with session.database() as db:
        relations = db.execute(
            "SELECT source_id, target_id, relation_type, origin FROM relations"
            " WHERE source_type = 'note' AND target_type = 'note'"
        ).fetchall()
    check(
        "the link chosen in the picker is stored as a relation links_to",
        [tuple(row) for row in relations] == [(ohm.get("id"), kirchhoff.get("id"), "links_to", "user")],
        [tuple(row) for row in relations],
    )
    check(
        "the link is in the text as an archive:// address",
        f"archive://note/{kirchhoff.get('id')}" in str(ohm.get("content", "")),
    )

    # The link of the side panel opens the first note, which lists the second among its backlinks.
    session.click(FIRST_LINK_OF_PANEL, pause=2.5)
    session.shot("05-backlinks")
    time.sleep(1)
    session.stop(process)


def log_text(session: Session) -> str:
    log = session.data_dir / "logs" / "archive.log"
    return log.read_text(encoding="utf-8") if log.exists() else ""


def closing_launch(session: Session) -> None:
    """A note typed, then the window closed at once: the close waits for the save."""
    for attempt in range(1, 4):
        title = f"Fermeture {attempt}"
        before = log_text(session).count("window close requested")
        process = session.launch()
        session.key("ctrl+n")
        time.sleep(2)
        session.type(title)
        session.key("Return")
        # No pause after typing: the autosave (800 ms after the last change) has not started yet.
        session.run("xdotool", "type", "--delay", "40", "--", "Texte tape juste avant de fermer.")
        session.request_close()
        try:
            process.wait(timeout=20)
            closed = True
        except subprocess.TimeoutExpired:
            closed = False
            session.shot(f"06-not-closed-{attempt}")
            session.stop(process)
        log = log_text(session)
        if log.count("window close requested") == before:
            print(f"  attempt {attempt}: the close request never reached the application (Xvfb), repeated")
            continue
        tail = log[log.rfind("window close requested") :]
        check("the close request arrives while the save is pending", "after 1 pending save(s)" in tail, tail)
        check("the window closes once the pending save is done", closed)
        check(
            "the window did not close before the save finished",
            "before every pending save finished" not in tail,
        )
        text = notes_by_title(session).get(title, {}).get("content_text")
        check("the text typed just before closing reached the database", text == "Texte tape juste avant de fermer.", text)
        return
    check("a close request reached the application (three attempts)", False)


def import_launch(session: Session, original: pathlib.Path, original_state: tuple[str, int]) -> None:
    process = session.launch()
    session.click(NAV_NOTES, pause=2)
    session.shot("07-notes")

    before = set(session.windows())
    session.click(IMPORT_MARKDOWN, pause=0.5)
    session.wait_for_dialog(before)
    session.shot("08-markdown-picker")
    session.key("ctrl+l")
    session.type(f"{session.documents}/")
    session.key("Return")
    time.sleep(1.5)
    session.shot("09-markdown-picker-folder")
    # The first file of the list (below the path bar and the column headers), then every file, then « Open ».
    session.click((300, 83))
    session.key("ctrl+a")
    session.key("Return")
    time.sleep(4)
    session.shot("10-imported")
    notes = notes_by_title(session)
    imported = notes.get("cours-diodes", {})
    check("the Markdown file becomes a note named after it", bool(imported), sorted(notes))
    check("the text file is not offered by the Markdown picker", "notes-de-tp" not in notes, sorted(notes))
    check(
        "headings, paragraph, table and tasks are kept",
        block_types(imported)[:4] == ["heading", "paragraph", "table", "taskList"],
        block_types(imported),
    )
    check(
        "the plain text of the imported note is stored",
        "Une jonction PN ne conduit que dans un sens." in str(imported.get("content_text", "")),
        imported.get("content_text"),
    )
    check(
        "the original file is untouched (same SHA-256 and modification date)",
        (sha256(original), original.stat().st_mtime_ns) == original_state,
    )

    # Export through the native save dialog, into the « Documents » folder.
    session.click(FIRST_NOTE_OF_LIST, pause=2.5)
    session.shot("11-imported-note")
    session.click(NOTE_ACTIONS, pause=1)
    session.shot("12-actions-menu")
    before = set(session.windows())
    session.key("Down")
    session.key("Down")
    session.key("Return")
    session.wait_for_dialog(before)
    session.shot("13-save-dialog")
    target = session.documents / "export-diodes.md"
    session.key("ctrl+a")
    session.type(str(target))
    session.key("Return")
    time.sleep(2)
    session.shot("14-exported")
    exported = target.read_text(encoding="utf-8") if target.exists() else ""
    check("the note is written where the user chose, as Markdown", bool(exported), sorted(os.listdir(session.documents)))
    check(
        "the exported file keeps heading, bold, table, tasks and link",
        exported.startswith("# Diodes")
        and "**jonction PN**" in exported
        and "1N4148" in exported
        and "- [x] Relever la caractéristique" in exported
        and "[Fiche technique](https://example.com/1n4148)" in exported,
        exported,
    )
    session.stop(process)


def last_launch(session: Session) -> None:
    process = session.launch()
    session.click(NAV_NOTES, pause=2)
    session.shot("15-relaunch")
    session.stop(process)
    notes = notes_by_title(session)
    check(
        "the notes are still there after a relaunch",
        {"Lois de Kirchhoff", "Loi d'Ohm", "cours-diodes"} <= set(notes),
        sorted(notes),
    )
    with session.database() as db:
        created = db.execute("SELECT count(*) FROM timeline_events WHERE event_type = 'note_created'").fetchone()[0]
    check("each creation recorded in the timeline", created == len(notes), (created, sorted(notes)))
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
    missing = [tool for tool in ("Xvfb", "xdotool", "import") if shutil.which(tool) is None]
    try:
        import Xlib  # noqa: F401, PLC0415
    except ImportError:
        missing.append("python-xlib")
    if missing:
        print(
            f"Missing tools: {', '.join(missing)}. On Ubuntu: apt-get install -y xvfb xdotool imagemagick;"
            " pip install python-xlib",
            file=sys.stderr,
        )
        return 2
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    xvfb = subprocess.Popen(["Xvfb", DISPLAY, "-screen", "0", "1440x900x24", "-nolisten", "tcp"])
    time.sleep(2)
    workdir = pathlib.Path(tempfile.mkdtemp(prefix="archive-phase5-"))
    data_dir = workdir / "data"
    documents = workdir / "Documents"
    documents.mkdir()
    original = documents / "cours-diodes.md"
    original.write_text(MARKDOWN, encoding="utf-8")
    (documents / "notes-de-tp.txt").write_text("Pas du Markdown.\n", encoding="utf-8")
    original_state = (sha256(original), original.stat().st_mtime_ns)
    try:
        session = Session(data_dir, documents)
        first_launch(session)
        closing_launch(session)
        import_launch(session, original, original_state)
        last_launch(session)
    finally:
        xvfb.terminate()
        if (data_dir / "logs").exists():
            shutil.copytree(data_dir / "logs", OUT / "logs", dirs_exist_ok=True)
        shutil.rmtree(workdir, ignore_errors=True)
    failed = [name for name, ok in checks if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
