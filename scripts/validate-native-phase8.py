#!/usr/bin/env python3
"""Native validation of Phase 8: the knowledge graph and the timeline of the production binary, on real data.

Two launches under Xvfb, in a temporary data folder (`ARCHIVE_DATA_DIR`), never the user's data:

1. The files of tests/fixtures/library and a PDF on the NE555 are imported with Ctrl+O, and a note is written with
   Ctrl+N: the core records each import and the note in the timeline. Once the memory engine has suggested
   relations, the graph page draws nothing with its default filters (no link, no decided relation: no invented
   graph); with the engine's suggestions shown, the map draws them (dashed cyan lines, laid out by its worker
   under the production Content Security Policy). Through the graph's search and the keyboard only, a suggestion
   of the note is opened from its details and accepted: the core stores the decision and records it in the
   timeline.
2. At the next launch the graph draws the accepted relation (purple), and the timeline is cleared after the
   confirmation: every event is gone, no document, note or relation is touched.

The log holds no error, no Content Security Policy violation, and no fallback of the layout worker. Screenshots go
to visual-audit/native-phase8/. Prerequisites: `npm run tauri build -- --no-bundle`, then Xvfb, xdotool and
ImageMagick (`import`, `convert`). Exit code 0 only if every check passes.
"""

from __future__ import annotations

import importlib.util
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
OUT = ROOT / "visual-audit" / "native-phase8"
DISPLAY = ":94"

# Places in the 1440×900 window (the layout of the visual audit at that size).
EMPTY_AREA = (1400, 880)
SIDEBAR_GRAPH = (134, 204)
SIDEBAR_TIMELINE = (92, 240)
GRAPH_SEARCH = (500, 109)
GRAPH_FILTERS = (790, 109)
TIMELINE_CLEAR = (1324, 132)
# The map, left of where the details panel opens: x, y, width, height.
MAP_REGION = (290, 150, 780, 700)

# Colour tokens of the specification (§2.3), as the map draws them.
CYAN = "#6fcbc7"  # suggestions of the engine
PURPLE = "#a995e8"  # relations and links
BLUE = "#67a9e8"  # the selection

FIXTURE_FILES = [
    "fiche-ne555.pdf",
    "cours-electronique.docx",
    "schema-montage.png",
    "notes-de-cours.txt",
    "composants.csv",
    "brochage.json",
    "export-casse.json",
]
DECLARED_PDF = "cours-arduino.pdf"
NOTE_TITLE = "Montage astable du NE555"
NOTE_TEXT = (
    "Le NE555 en montage astable : la frequence du NE555 depend du condensateur. "
    "Changer le condensateur change la frequence de l'astable. Le NE555 oscille sans arret."
)
DOCUMENTS = len(FIXTURE_FILES) + 1
ITEMS = DOCUMENTS + 1
STAGES = 3

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


def declared_pdf() -> bytes:
    """A two-page PDF on the NE555, built by the fixtures' generator."""
    spec = importlib.util.spec_from_file_location("fixtures", ROOT / "scripts" / "make-library-fixtures.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.pdf(
        [
            [(18, "Cours Arduino"), (12, "Interruptions et timer NE555")],
            [
                (12, "Le NE555 en montage astable."),
                (12, "La frequence du NE555 astable depend du condensateur."),
                (12, "Changer le condensateur change la frequence."),
            ],
        ],
    )


def pixels(path: pathlib.Path, colour: str, region: tuple[int, int, int, int] = MAP_REGION) -> int:
    """Number of pixels of a colour (within a small tolerance) in a region of a screenshot."""
    x, y, width, height = region
    result = subprocess.run(
        [
            "convert",
            str(path),
            "-crop",
            f"{width}x{height}+{x}+{y}",
            "+repage",
            "-fuzz",
            "6%",
            "-fill",
            "black",
            "+opaque",
            colour,
            "-fill",
            "white",
            "-opaque",
            colour,
            "-colorspace",
            "gray",
            "-format",
            "%[fx:round(mean*w*h)]",
            "info:",
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return int(result.stdout.strip())


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

    def key(self, *keys: str, pause: float = 0.6) -> None:
        self.run("xdotool", "key", "--clearmodifiers", *keys)
        time.sleep(pause)

    def tab(self, times: int) -> None:
        for _ in range(times):
            self.key("Tab", pause=0.3)

    def type(self, text: str) -> None:
        self.run("xdotool", "type", "--delay", "40", "--", text)
        time.sleep(0.5)

    def click(self, position: tuple[int, int], pause: float = 1.0) -> None:
        self.run("xdotool", "mousemove", str(position[0]), str(position[1]), "click", "1")
        time.sleep(pause)

    def shot(self, name: str) -> pathlib.Path:
        path = OUT / f"{name}.png"
        self.run("import", "-window", "root", str(path))
        return path

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

    def pick_folder(self) -> None:
        """Ctrl+O, then in the GTK file picker: go to the folder, select every file, open them."""
        before = set(self.windows())
        self.key("ctrl+o")
        wait_for(lambda: bool(set(self.windows()) - before), timeout=15)
        time.sleep(2)
        # Without a window manager, the keyboard follows the pointer: move it over the picker.
        self.run("xdotool", "mousemove", "600", "400")
        time.sleep(0.5)
        self.key("ctrl+l")
        self.type(f"{self.documents}/")
        self.key("Return")
        time.sleep(1.5)
        self.click((300, 83))
        self.key("ctrl+a")
        self.key("Return")
        time.sleep(8)  # copies, extraction, then pdf.js in the web view
        self.run("xdotool", "mousemove", str(EMPTY_AREA[0]), str(EMPTY_AREA[1]))

    @staticmethod
    def stop(process: subprocess.Popen[bytes]) -> None:
        process.terminate()
        process.wait(timeout=20)
        time.sleep(1)

    def database(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.data_dir / "archive.db")
        connection.row_factory = sqlite3.Row
        return connection

    def count(self, sql: str, *params: object) -> int:
        with self.database() as db:
            return int(db.execute(sql, params).fetchone()[0])

    def log_text(self) -> str:
        log = self.data_dir / "logs" / "archive.log"
        return log.read_text(encoding="utf-8") if log.exists() else ""


def processed(session: Session) -> bool:
    total = session.count("SELECT count(*) FROM processing_jobs")
    completed = session.count("SELECT count(*) FROM processing_jobs WHERE status = 'completed'")
    return total == ITEMS * STAGES and completed == total


def note_id(session: Session) -> str:
    with session.database() as db:
        return str(db.execute("SELECT id FROM notes WHERE title = ?", (NOTE_TITLE,)).fetchone()[0])


def note_relations(session: Session, status: str) -> list[sqlite3.Row]:
    identifier = note_id(session)
    with session.database() as db:
        return db.execute(
            "SELECT * FROM relations WHERE status = ?1 AND (source_id = ?2 OR target_id = ?2)",
            (status, identifier),
        ).fetchall()


def first_launch(session: Session) -> None:
    process = session.launch()
    session.pick_folder()
    session.key("ctrl+n")
    time.sleep(2)
    session.type(NOTE_TITLE)
    session.key("Return")
    session.type(NOTE_TEXT)
    time.sleep(3)  # autosave
    done = wait_for(lambda: processed(session), timeout=120)
    check("the memory engine processes the knowledge base, which gets suggestions", done and bool(note_relations(session, "suggested")))

    imports = session.count("SELECT count(*) FROM timeline_events WHERE event_type = 'document_imported'")
    created = session.count("SELECT count(*) FROM timeline_events WHERE event_type = 'note_created'")
    check(
        f"the timeline records each of the {DOCUMENTS} imports and the note created",
        imports == DOCUMENTS and created == 1,
        (imports, created),
    )

    # The graph with its default filters: links and decided relations only. There is none yet.
    session.click(SIDEBAR_GRAPH, pause=4)
    empty = session.shot("01-graph-without-relations")
    check(
        "without any link or decided relation, nothing is drawn (no invented graph)",
        pixels(empty, CYAN) == 0,
        pixels(empty, CYAN),
    )

    # The engine's suggestions, through the filters and the keyboard: twelve boxes before « Suggestions ».
    session.click(GRAPH_FILTERS, pause=1.5)
    session.tab(12)
    session.key("space", pause=1)
    session.key("Escape", pause=4)
    suggested = session.shot("02-graph-suggestions")
    cyan = pixels(suggested, CYAN)
    check("with the suggestions shown, the map draws them (dashed cyan lines)", cyan > 40, cyan)

    # Found by the search in the graph; its details take the focus; the first connection's details, accepted.
    session.click(GRAPH_SEARCH)
    session.type("Montage astable")
    session.key("Return", pause=2)
    session.shot("03-note-details")
    session.tab(5)  # close, open the note, start from it, the connection, its details
    session.key("Return", pause=2)
    session.shot("04-suggestion-details")
    session.tab(2)  # close, accept
    session.key("Return", pause=3)
    # The search emptied, so that only the selection is drawn in blue.
    session.click(GRAPH_SEARCH)
    session.key("ctrl+a")
    session.key("BackSpace", pause=2)
    accepted_view = session.shot("05-suggestion-accepted")
    accepted = note_relations(session, "accepted")
    check(
        "the suggestion is accepted from the graph, with the keyboard only",
        len(accepted) == 1 and accepted[0]["origin"] == "rule",
        [dict(row) for row in accepted],
    )
    recorded = session.count(
        "SELECT count(*) FROM timeline_events WHERE event_type = 'relation_accepted' AND entity_id = ?",
        accepted[0]["id"] if accepted else "",
    )
    check("the decision is recorded in the timeline", recorded == 1, recorded)
    drawn = (pixels(accepted_view, CYAN), pixels(accepted_view, BLUE))
    check(
        "the accepted relation replaces the suggestion on the map: no dashed cyan line, the selected line drawn",
        drawn[0] == 0 and drawn[1] > 100,
        drawn,
    )

    session.click(SIDEBAR_TIMELINE, pause=3)
    session.shot("06-timeline")
    session.stop(process)


def second_launch(session: Session) -> None:
    documents = session.count("SELECT count(*) FROM documents")
    notes = session.count("SELECT count(*) FROM notes")
    relations = session.count("SELECT count(*) FROM relations")
    events = session.count("SELECT count(*) FROM timeline_events")
    process = session.launch()

    session.click(SIDEBAR_GRAPH, pause=4)
    relaunched = session.shot("07-graph-relaunch")
    purple = pixels(relaunched, PURPLE)
    check("after a restart, the default graph draws the accepted relation", purple > 40, purple)

    session.click(SIDEBAR_TIMELINE, pause=3)
    session.click(TIMELINE_CLEAR, pause=1.5)
    session.shot("08-clear-confirmation")
    check("the timeline is not cleared before the confirmation", session.count("SELECT count(*) FROM timeline_events") == events)
    session.tab(1)  # from « Annuler », which has the focus, to the confirmation
    session.key("Return", pause=3)
    session.shot("09-timeline-cleared")
    session.stop(process)

    check("the timeline is cleared after the confirmation", session.count("SELECT count(*) FROM timeline_events") == 0)
    check(
        "clearing the timeline touches no document, note or relation",
        (
            session.count("SELECT count(*) FROM documents"),
            session.count("SELECT count(*) FROM notes"),
            session.count("SELECT count(*) FROM relations"),
        )
        == (documents, notes, relations),
    )

    text = session.log_text()
    errors = [line for line in text.splitlines() if "[ERROR]" in line]
    check("application log written", bool(text))
    check("the clearing is logged with its number of events", f"timeline cleared ({events} events)" in text)
    check("no error in the log (native core or interface)", not errors)
    check("no Content Security Policy violation reported", "CSP violation" not in text)
    check("the graph is laid out by its worker (no fallback reported)", "layout worker unavailable" not in text)
    for line in errors:
        print("  " + line)


def main() -> int:
    if not BINARY.exists():
        print(f"Missing {BINARY}: run `npm run tauri build -- --no-bundle` first.", file=sys.stderr)
        return 2
    missing = [tool for tool in ("Xvfb", "xdotool", "import", "convert") if shutil.which(tool) is None]
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
    workdir = pathlib.Path(tempfile.mkdtemp(prefix="archive-phase8-"))
    data_dir = workdir / "data"
    documents = workdir / "Documents"
    documents.mkdir()
    for name in FIXTURE_FILES:
        shutil.copy2(FIXTURES / name, documents / name)
    (documents / DECLARED_PDF).write_bytes(declared_pdf())
    try:
        session = Session(data_dir, documents)
        first_launch(session)
        second_launch(session)
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
