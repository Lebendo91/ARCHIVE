#!/usr/bin/env python3
"""Native validation of Phase 6: the production binary searches what the user imported and wrote.

Three launches under Xvfb, in a temporary data folder (`ARCHIVE_DATA_DIR`), never the user's data:

1. The files of tests/fixtures/library are imported with Ctrl+O (native picker) and a note is written with
   Ctrl+N. The full-text index (SQLite FTS5) then holds every document and the note: the PDF page by page (its
   text extracted by pdf.js in the web view), the Word document, the note. Ctrl+K searches like a user, and
   Enter opens the first result, which the database records: « alimentation » opens the PDF, whose page 2 holds
   the word; « resistances serie », typed without accents, the Word document; « attachInterrupt » the note.
   The note is edited: its new words are found at once. Ctrl+Enter shows every result of « ne555 » on the
   search page, and a date expression is shown as the filter it became. Each search is in the history.
2. Relaunch: the index is current, so it is not rebuilt; the history is still there; searching still opens
   the PDF.
3. The index is marked out of date and emptied, as after an update that changes its rules: at the next launch
   it is rebuilt from the data (the log says so, with its size), and searching works again.

The log holds no error and no Content Security Policy violation. Screenshots go to visual-audit/native-phase6/.
Prerequisites: `npm run tauri build -- --no-bundle`, then Xvfb, xdotool and ImageMagick (`import`).
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

ROOT = pathlib.Path(__file__).resolve().parent.parent
BINARY = ROOT / "src-tauri" / "target" / "release" / "archive"
FIXTURES = ROOT / "tests" / "fixtures" / "library"
OUT = ROOT / "visual-audit" / "native-phase6"
DISPLAY = ":94"

# Places in the 1440×900 window (the layout of the visual audit at that size).
EMPTY_AREA = (1400, 880)
EDITOR_FIRST_LINE = (700, 262)

IMPORTED = {
    "fiche-ne555.pdf",
    "cours-electronique.docx",
    "schema-montage.png",
    "notes-de-cours.txt",
    "composants.csv",
    "brochage.json",
    "export-casse.json",
}
NOTE_TITLE = "Interruptions"

checks: list[tuple[str, bool]] = []


def check(name: str, condition: bool, detail: object = None) -> None:
    checks.append((name, condition))
    print(("PASS " if condition else "FAIL ") + name, flush=True)
    if not condition and detail is not None:
        print(f"  got: {detail!r}", flush=True)


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
        self.output = open(OUT / "native-output.log", "a", encoding="utf-8")  # noqa: SIM115

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

    def main_windows(self) -> list[str]:
        found = subprocess.run(
            ["xdotool", "search", "--onlyvisible", "--name", "ARCHIVE"],
            env=self.env,
            capture_output=True,
            text=True,
            check=False,
        )
        return found.stdout.split()

    def launch(self) -> subprocess.Popen[bytes]:
        process = subprocess.Popen([str(BINARY)], env=self.env, stdout=self.output, stderr=self.output)
        wait_for(lambda: bool(self.main_windows()), timeout=30)
        time.sleep(8)  # interface loaded and data fetched
        # Gives the keyboard focus to the web view (an empty area of the content).
        self.click(EMPTY_AREA)
        return process

    def pick_folder(self, name: str) -> None:
        """Ctrl+O, then in the GTK file picker: go to the folder, select every file, open them."""
        before = set(self.windows())
        self.key("ctrl+o")
        wait_for(lambda: bool(set(self.windows()) - before), timeout=15)
        time.sleep(2)
        # Without a window manager, the keyboard follows the pointer: move it over the picker, which opens in
        # the top left corner, above the main window.
        self.run("xdotool", "mousemove", "600", "400")
        time.sleep(0.5)
        self.key("ctrl+l")
        self.type(f"{self.documents}/")
        self.key("Return")
        time.sleep(1.5)
        # The first file of the list (below the path bar and the column headers), then every file, then « Open ».
        self.click((300, 83))
        self.key("ctrl+a")
        self.shot(f"{name}-picker-selection")
        self.key("Return")
        time.sleep(8)  # copies, extraction, then pdf.js in the web view
        self.run("xdotool", "mousemove", str(EMPTY_AREA[0]), str(EMPTY_AREA[1]))

    def search(self, text: str, shot: str | None = None, *, every: bool = False) -> None:
        """Ctrl+K, the words typed, then Enter: the first result opens (Ctrl+Enter: the search page)."""
        self.key("ctrl+k")
        time.sleep(1)
        self.type(text)
        time.sleep(2)  # the palette searches 150 ms after the last key
        if shot:
            self.shot(shot)
        self.key("ctrl+Return" if every else "Return")
        time.sleep(3)

    @staticmethod
    def stop(process: subprocess.Popen[bytes]) -> None:
        process.terminate()
        process.wait(timeout=20)
        time.sleep(1)

    def database(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.data_dir / "archive.db")
        connection.row_factory = sqlite3.Row
        return connection

    def log_text(self) -> str:
        log = self.data_dir / "logs" / "archive.log"
        return log.read_text(encoding="utf-8") if log.exists() else ""


def opened_at(session: Session, table: str, where: str, value: str) -> int:
    """When the item was last opened (0 if never)."""
    with session.database() as db:
        row = db.execute(f"SELECT last_opened_at FROM {table} WHERE {where} = ?", (value,)).fetchone()  # noqa: S608
    return int(row["last_opened_at"] or 0) if row else 0


def document_opened(session: Session, filename: str) -> int:
    return opened_at(session, "documents", "original_filename", filename)


def note_opened(session: Session) -> int:
    return opened_at(session, "notes", "title", NOTE_TITLE)


def history(session: Session) -> list[str]:
    with session.database() as db:
        rows = db.execute("SELECT query FROM search_history ORDER BY searched_at DESC").fetchall()
    return [str(row["query"]) for row in rows]


def indexed(session: Session) -> dict[str, int]:
    """Number of items of each kind in the full-text index."""
    with session.database() as db:
        rows = db.execute(
            "SELECT entity_type, COUNT(DISTINCT entity_id) AS items FROM search_entries"
            " WHERE index_name = 'text' GROUP BY entity_type"
        ).fetchall()
    return {str(row["entity_type"]): int(row["items"]) for row in rows}


def index_rows(session: Session) -> int:
    with session.database() as db:
        return int(db.execute("SELECT COUNT(*) FROM search_entries").fetchone()[0])


def pages_holding(session: Session, word: str) -> list[tuple[str, int | None]]:
    """The documents and pages whose passage holds `word`, read in the index itself."""
    with session.database() as db:
        rows = db.execute(
            "SELECT d.original_filename AS name, s.page AS page FROM search_index s"
            " JOIN documents d ON d.id = s.entity_id"
            " WHERE s.entity_type = 'document' AND search_index MATCH ?",
            (f'body:"{word}"',),
        ).fetchall()
    return [(str(row["name"]), row["page"]) for row in rows]


def first_launch(session: Session) -> None:
    process = session.launch()
    session.shot("01-start")
    session.pick_folder("02")
    session.shot("03-imported")

    # A note written with the keyboard.
    session.key("ctrl+n")
    time.sleep(2)
    session.type(NOTE_TITLE)
    session.key("Return")
    session.type("La routine attachInterrupt doit rester courte.")
    time.sleep(3)  # autosave
    session.shot("04-note")

    with session.database() as db:
        names = {str(row[0]) for row in db.execute("SELECT original_filename FROM documents").fetchall()}
        version = db.execute("SELECT version FROM search_index_state WHERE id = 1").fetchone()[0]
    check("the fixtures are imported", names == IMPORTED, sorted(names))
    check("the index is at its current version", version == 1, version)
    check(
        "every document and the note are in the full-text index",
        indexed(session) == {"document": len(IMPORTED), "note": 1},
        indexed(session),
    )
    check(
        "the text extracted from the PDF is indexed page by page",
        pages_holding(session, "alimentation") == [("fiche-ne555.pdf", 2)]
        and pages_holding(session, "astable") == [("fiche-ne555.pdf", 1)],
        (pages_holding(session, "alimentation"), pages_holding(session, "astable")),
    )

    # Ctrl+K, then Enter on the first result.
    check("the PDF was never opened before", document_opened(session, "fiche-ne555.pdf") == 0)
    session.search("alimentation", "05-palette-pdf-page")
    check(
        "« alimentation » finds the PDF by the text of its page 2, and Enter opens it",
        document_opened(session, "fiche-ne555.pdf") > 0,
    )
    session.shot("06-pdf-opened")

    session.search("resistances serie", "07-palette-docx")
    check(
        "« resistances serie », typed without accents, finds and opens the Word document",
        document_opened(session, "cours-electronique.docx") > 0,
    )

    before = note_opened(session)
    session.search("attachInterrupt", "08-palette-note")
    check("« attachInterrupt » finds and opens the note", note_opened(session) > before)
    session.shot("09-note-opened")

    # Words added to the note are found once it is saved.
    session.click(EDITOR_FIRST_LINE)
    session.key("ctrl+End")
    session.type(" Les variables partagees sont volatile.")
    time.sleep(3)  # autosave
    session.search("alimentation")  # elsewhere first, so that opening the note again is recorded
    before = note_opened(session)
    session.search("volatile", "10-palette-edited-note")
    check("the words just added to the note are found, and open it", note_opened(session) > before)

    # Every result on the search page, and a date expression shown as the filter it became.
    session.search("ne555", every=True)
    session.shot("11-search-page")
    session.search("documents importes aujourd'hui", every=True)
    session.shot("12-search-page-recognized")

    recorded = history(session)
    check(
        "each search run is in the history, the latest first",
        recorded[:2] == ["documents importes aujourd'hui", "ne555"]
        and {"alimentation", "resistances serie", "attachInterrupt", "volatile"} <= set(recorded),
        recorded,
    )
    session.key("ctrl+k")
    time.sleep(1.5)
    session.shot("13-palette-history")
    session.key("Escape")
    session.stop(process)


def second_launch(session: Session) -> None:
    rows = index_rows(session)
    log_before = len(session.log_text())
    opened_before = document_opened(session, "fiche-ne555.pdf")
    process = session.launch()
    session.search("alimentation")
    session.shot("14-relaunch-search")
    session.stop(process)
    check(
        "after a relaunch, searching still opens the PDF",
        document_opened(session, "fiche-ne555.pdf") > opened_before,
    )
    check("the index is not rebuilt when it is current", "search index built" not in session.log_text()[log_before:])
    check("the index is unchanged", index_rows(session) == rows, (index_rows(session), rows))
    check("the history is kept", "ne555" in history(session), history(session))


def third_launch(session: Session) -> None:
    rows = index_rows(session)
    with session.database() as db:
        db.execute("UPDATE search_index_state SET version = 0 WHERE id = 1")
        db.executescript("DELETE FROM search_index; DELETE FROM search_titles; DELETE FROM search_entries;")
    check("the index is emptied and marked out of date", index_rows(session) == 0)
    log_before = len(session.log_text())
    before = note_opened(session)
    process = session.launch()
    session.search("volatile")
    session.shot("15-rebuilt-search")
    session.stop(process)
    log = session.log_text()[log_before:]
    built = [line for line in log.splitlines() if "search index built" in line]
    check("the index is rebuilt at startup, and the log says so", len(built) == 1, built)
    check(
        "the rebuilt index holds what it held",
        index_rows(session) == rows and indexed(session) == {"document": len(IMPORTED), "note": 1},
        (index_rows(session), rows, indexed(session)),
    )
    check("searching works again after the rebuild", note_opened(session) > before)
    with session.database() as db:
        version = db.execute("SELECT version FROM search_index_state WHERE id = 1").fetchone()[0]
    check("the index is current again", version == 1, version)

    text = session.log_text()
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
    if missing:
        print(
            f"Missing tools: {', '.join(missing)}. On Ubuntu: apt-get install -y xvfb xdotool imagemagick",
            file=sys.stderr,
        )
        return 2
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    xvfb = subprocess.Popen(["Xvfb", DISPLAY, "-screen", "0", "1440x900x24", "-nolisten", "tcp"])
    time.sleep(2)
    workdir = pathlib.Path(tempfile.mkdtemp(prefix="archive-phase6-"))
    data_dir = workdir / "data"
    documents = workdir / "Documents"
    documents.mkdir()
    for name in sorted(IMPORTED):
        shutil.copy2(FIXTURES / name, documents / name)
    try:
        session = Session(data_dir, documents)
        first_launch(session)
        second_launch(session)
        third_launch(session)
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
