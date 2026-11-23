#!/usr/bin/env python3
"""Native validation of Phase 7: the memory engine of the production binary works in the background, on real data.

Three launches under Xvfb, in a temporary data folder (`ARCHIVE_DATA_DIR`), never the user's data:

1. The files of tests/fixtures/library are imported with Ctrl+O, with a PDF built here that declares its title,
   author, dates and language, and a note is written with Ctrl+N. With no other action, the worker of the
   running application processes every item: each background stage is completed in `processing_jobs`; the
   content of each item is described (`content_profiles`), with what the Word document and the PDF declare,
   read by the core and by pdf.js; each item gets its distinctive terms; and the note and the PDF on the NE555
   are suggested as related, with the shared terms as provenance and a confidence: a suggestion, never
   accepted on its own. The note page shows the suggestion and the analysis (screenshots).
2. As if the application had stopped during a job, and the user had rejected the suggestion: at the next launch
   the interrupted job runs again, and the rejection stands; nothing is suggested twice.
3. As after an update that changes the engine's rules: every item is processed again at the next launch (the log
   says how many), the descriptions and terms come back, and the user's decision still stands.

The log holds no error and no Content Security Policy violation. Screenshots go to visual-audit/native-phase7/.
Prerequisites: `npm run tauri build -- --no-bundle`, then Xvfb, xdotool and ImageMagick (`import`).
Exit code 0 only if every check passes.
"""

from __future__ import annotations

import importlib.util
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
FIXTURES = ROOT / "tests" / "fixtures" / "library"
OUT = ROOT / "visual-audit" / "native-phase7"
DISPLAY = ":93"

# Places in the 1440×900 window (the layout of the visual audit at that size).
EMPTY_AREA = (1400, 880)
SIDE_PANEL = (1260, 600)

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
ITEMS = len(FIXTURE_FILES) + 2  # the fixtures, the declared PDF and the note
STAGES = 3  # normalization, analysis, relationships

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
    """A two-page PDF declaring its title, author, dates and language, built by the fixtures' generator."""
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
        info={
            "Title": "Cours Arduino",
            "Author": "Bob Martin",
            "CreationDate": "D:20260901080000Z",
            "ModDate": "D:20261015093000+02'00'",
        },
        lang="fr-FR",
    )


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

    def scroll_down(self, position: tuple[int, int], steps: int) -> None:
        self.run("xdotool", "mousemove", str(position[0]), str(position[1]), "click", "--repeat", str(steps), "5")
        time.sleep(1)

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
        self.shot("01-picker-selection")
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

    def log_text(self) -> str:
        log = self.data_dir / "logs" / "archive.log"
        return log.read_text(encoding="utf-8") if log.exists() else ""


def jobs(session: Session) -> tuple[int, int]:
    """Number of background jobs, and of those completed."""
    with session.database() as db:
        total, completed = db.execute(
            "SELECT count(*), coalesce(sum(status = 'completed'), 0) FROM processing_jobs"
        ).fetchone()
    return int(total), int(completed)


def processed(session: Session) -> bool:
    total, completed = jobs(session)
    return total == ITEMS * STAGES and completed == total


def item_id(session: Session, *, filename: str | None = None, note: str | None = None) -> str:
    with session.database() as db:
        if filename:
            return str(db.execute("SELECT id FROM documents WHERE original_filename = ?", (filename,)).fetchone()[0])
        return str(db.execute("SELECT id FROM notes WHERE title = ?", (note,)).fetchone()[0])


def profile(session: Session, kind: str, entity_id: str) -> dict[str, object]:
    with session.database() as db:
        row = db.execute(
            "SELECT * FROM content_profiles WHERE entity_type = ? AND entity_id = ?", (kind, entity_id)
        ).fetchone()
    return dict(row) if row else {}


def terms(session: Session, kind: str, entity_id: str) -> list[str]:
    with session.database() as db:
        rows = db.execute(
            "SELECT term FROM entity_terms WHERE entity_type = ? AND entity_id = ? ORDER BY weight DESC",
            (kind, entity_id),
        ).fetchall()
    return [str(row[0]) for row in rows]


def relations_between(session: Session, a: str, b: str) -> list[dict[str, object]]:
    with session.database() as db:
        rows = db.execute(
            "SELECT * FROM relations WHERE (source_id = ?1 AND target_id = ?2) OR (source_id = ?2 AND target_id = ?1)",
            (a, b),
        ).fetchall()
    return [dict(row) for row in rows]


def relation_count(session: Session) -> int:
    with session.database() as db:
        return int(db.execute("SELECT count(*) FROM relations").fetchone()[0])


def first_launch(session: Session) -> None:
    process = session.launch()
    session.pick_folder()
    session.key("ctrl+n")
    time.sleep(2)
    session.type(NOTE_TITLE)
    session.key("Return")
    session.type(NOTE_TEXT)
    time.sleep(3)  # autosave
    session.shot("02-note")
    # The note is processed once the typing has paused (15 s), the PDFs once pdf.js has read them.
    done = wait_for(lambda: processed(session), timeout=120)
    check(
        f"the worker completes every background stage of the {ITEMS} items, without any action",
        done,
        jobs(session),
    )

    docx = profile(session, "document", item_id(session, filename="cours-electronique.docx"))
    check(
        "the Word document is described with the title and author it declares",
        docx.get("title_in_file") == "Électricité générale" and docx.get("author") == "Alice",
        docx,
    )
    declared = profile(session, "document", item_id(session, filename=DECLARED_PDF))
    check(
        "the PDF is described with the title, author, dates and language it declares, read by pdf.js",
        declared.get("title_in_file") == "Cours Arduino"
        and declared.get("author") == "Bob Martin"
        and declared.get("authored_at") == 1_788_249_600_000
        and declared.get("revised_at") == 1_792_049_400_000
        and declared.get("language") == "fr"
        and declared.get("language_source") == "declared"
        and declared.get("page_count") == 2,
        declared,
    )
    plain = profile(session, "document", item_id(session, filename="fiche-ne555.pdf"))
    check(
        "a PDF that declares nothing has no title, author or language invented",
        plain.get("page_count") == 2
        and plain.get("title_in_file") is None
        and plain.get("author") is None
        and plain.get("language") is None,
        plain,
    )

    note_id = item_id(session, note=NOTE_TITLE)
    pdf_id = item_id(session, filename=DECLARED_PDF)
    note_terms = terms(session, "note", note_id)
    check(
        "the note's distinctive terms come from its text",
        {"ne555", "astable", "condensateur"} <= set(note_terms),
        note_terms,
    )
    found = relations_between(session, note_id, pdf_id)
    suggestion = found[0] if found else {}
    provenance = json.loads(str(suggestion.get("provenance_json") or "{}"))
    confidence = suggestion.get("confidence")
    check(
        "the note and the PDF on the NE555 are suggested as related, with why and how sure",
        len(found) == 1
        and suggestion.get("origin") == "rule"
        and suggestion.get("relation_type") == "related_to"
        and "NE555" in provenance.get("terms", [])
        and isinstance(confidence, float)
        and 0 < confidence < 1,
        found,
    )
    check("a suggestion is never accepted on its own", suggestion.get("status") == "suggested", suggestion)

    # The PDF and the note show their suggestion and their analysis.
    for query, name in (("cours arduino", "03-pdf"), (NOTE_TITLE, "04-note")):
        session.key("ctrl+k")
        time.sleep(1)
        session.type(query)
        time.sleep(2)
        session.key("Return")
        time.sleep(3)
        session.scroll_down(SIDE_PANEL, 10)
        session.shot(f"{name}-relations")
        session.scroll_down(SIDE_PANEL, 10)
        session.shot(f"{name}-analysis")
    session.stop(process)


def second_launch(session: Session) -> None:
    note_id = item_id(session, note=NOTE_TITLE)
    pdf_id = item_id(session, filename=DECLARED_PDF)
    relations_before = relation_count(session)
    with session.database() as db:
        # The user rejected the suggestion; the application stopped while the note's relationships ran.
        db.execute(
            "UPDATE relations SET status = 'rejected' WHERE origin = 'rule' AND "
            "((source_id = ?1 AND target_id = ?2) OR (source_id = ?2 AND target_id = ?1))",
            (note_id, pdf_id),
        )
        db.execute(
            "UPDATE processing_jobs SET status = 'processing' WHERE entity_id = ? AND stage = 'relations'",
            (note_id,),
        )
    log_before = len(session.log_text())
    process = session.launch()
    done = wait_for(lambda: processed(session), timeout=60)
    session.shot("05-relaunch")
    session.stop(process)
    log = session.log_text()[log_before:]
    check("the job interrupted by the stop runs again at the next launch", done and "1 interrupted jobs queued again" in log, jobs(session))
    found = relations_between(session, note_id, pdf_id)
    check(
        "the rejection stands and nothing is suggested twice",
        [relation.get("status") for relation in found] == ["rejected"],
        found,
    )
    check("no relation is added or lost", relation_count(session) == relations_before, relation_count(session))


def third_launch(session: Session) -> None:
    note_id = item_id(session, note=NOTE_TITLE)
    pdf_id = item_id(session, filename=DECLARED_PDF)
    relations_before = relation_count(session)
    with session.database() as db:
        # As after an update that changes the rules: the derived data is out of date.
        db.executescript(
            "UPDATE memory_state SET version = 0; DELETE FROM content_profiles; DELETE FROM entity_terms;"
        )
    log_before = len(session.log_text())
    process = session.launch()
    done = wait_for(lambda: processed(session), timeout=90)
    session.stop(process)
    log = session.log_text()[log_before:]
    check(
        f"after a change of the rules, the {ITEMS} items are processed again (the log says so)",
        done and f"memory engine: {ITEMS} items queued for processing" in log,
        [line for line in log.splitlines() if "memory engine" in line],
    )
    with session.database() as db:
        profiles = int(db.execute("SELECT count(*) FROM content_profiles").fetchone()[0])
        version = int(db.execute("SELECT version FROM memory_state").fetchone()[0])
    check("descriptions and terms come back", profiles == ITEMS and bool(terms(session, "note", note_id)), profiles)
    check("the engine's rules are current again", version == 1, version)
    found = relations_between(session, note_id, pdf_id)
    check(
        "the user's decision still stands after the whole knowledge base was processed again",
        [relation.get("status") for relation in found] == ["rejected"] and relation_count(session) == relations_before,
        (found, relation_count(session), relations_before),
    )

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
    workdir = pathlib.Path(tempfile.mkdtemp(prefix="archive-phase7-"))
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
