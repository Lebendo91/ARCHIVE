#!/usr/bin/env python3
"""Native validation of Phase 10 (backup, export, restoration) on the production binary, with real data.

Three launches under Xvfb, in a temporary data folder (`ARCHIVE_DATA_DIR`), never the user's data:
1. The files of tests/fixtures/library are imported with Ctrl+O and a note is written with Ctrl+N. The binary is
   closed; an Anthropic provider is written in the database, as the settings would.
2. A test key is typed in the settings: on Linux there is no credential store, so the core keeps it for the
   session only. In Settings › Storage a backup is created: the core's GTK save dialog receives a path, and the
   ZIP written there holds the manifest, the database and every managed file, each matching its SHA-256, a sound
   database with the documents and the note, and no key anywhere. It is verified from the history. The knowledge
   base is exported into a folder chosen in the core's GTK folder dialog: the original files under their names,
   the note converted to Markdown by the real web view, CSV tables, archive.json, and no key. A second note is
   written after the backup, then the backup is restored after the confirmation: ARCHIVE restarts by itself.
3. The restarted ARCHIVE applied the backup before opening the database: the note written after the backup is
   gone, the documents and their files are there, the replaced data is kept in backups/before-restore-…, the
   history still lists the backup (the restored database is older than it), and the start tells the user. The
   log holds the outcomes, no error, no Content Security Policy violation, and never the key.

Screenshots go to visual-audit/native-phase10/. Prerequisites: `npm run tauri build -- --no-bundle`, then Xvfb,
xdotool and ImageMagick. Exit code 0 only if every check passes.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import pathlib
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("phase8", ROOT / "scripts" / "validate-native-phase8.py")
assert spec is not None and spec.loader is not None
phase8 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(phase8)

OUT = ROOT / "visual-audit" / "native-phase10"
phase8.OUT = OUT
phase8.DISPLAY = ":96"
check = phase8.check
wait_for = phase8.wait_for

KEY = "sk-ant-native-test-" + uuid.uuid4().hex[:16]
NOTE_BEFORE = "Avant la sauvegarde"
NOTE_AFTER = "Apres la sauvegarde"
# Places in the 1440×900 window (the layout of the visual audit at that size).
SIDEBAR_SETTINGS = (89, 780)
SETTINGS_AI = (388, 216)
SETTINGS_TITLE = (600, 108)
SETTINGS_STORAGE = (349, 180)
CONTENT = (900, 500)
# Settings › Storage scrolled to its end, before any backup, then with one backup in the history.
CREATE_BACKUP = (649, 561)
FIRST_VERIFY = (1038, 593)
FIRST_RESTORE = (1143, 593)
# The export card, last of the page: its button once the page is scrolled to its end.
EXPORT = (913, 819)
# « Home » and « Open » in the GTK folder dialog (1096×822 at the top left, without window manager).
FOLDER_DIALOG_HOME = (57, 59)
FOLDER_DIALOG_OPEN = (1046, 798)


def scroll_to_end(session: phase8.Session) -> None:
    session.run("xdotool", "mousemove", str(CONTENT[0]), str(CONTENT[1]))
    session.run("xdotool", "click", "--repeat", "25", "--delay", "40", "5")
    time.sleep(1.0)


def seed_provider(session: phase8.Session) -> None:
    """An Anthropic provider without key, as the settings write it."""
    now = int(time.time() * 1000)
    preferences = json.dumps(
        {"maxOutputTokens": 4000, "refusalFallback": True, "modelMaxOutputTokens": 64000,
         "modelRefusalFallback": False}
    )
    with session.database() as db:
        db.execute(
            "INSERT INTO ai_providers (id, provider, display_name, model, secret_ref, preferences_json, is_default,"
            " created_at, updated_at) VALUES (?, 'anthropic', 'Anthropic', 'claude-test', NULL, ?, 1, ?, ?)",
            (str(uuid.uuid4()), preferences, now, now),
        )


def write_note(session: phase8.Session, title: str) -> None:
    session.key("ctrl+n")
    time.sleep(2)
    session.type(title)
    session.key("Return")
    session.type("Le NE555 oscille en montage astable.")
    time.sleep(3)  # autosave


def save_dialog(session: phase8.Session, target: pathlib.Path, before: set[str]) -> bool:
    """In the GTK save dialog opened by the core: the whole path in the name field, then Enter."""
    opened = wait_for(lambda: bool(set(session.windows()) - before), timeout=15)
    time.sleep(2)
    # Without a window manager, the keyboard follows the pointer: move it over the dialog.
    session.run("xdotool", "mousemove", "600", "400")
    time.sleep(0.5)
    session.key("ctrl+a")
    session.type(str(target))
    session.key("Return", pause=1.0)
    return opened


def zip_checks(path: pathlib.Path, scratch: pathlib.Path, documents: int) -> None:
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        manifest = json.loads(archive.read("manifest.json"))
        entries = [manifest["database"], *manifest["files"]]
        check(
            "the ZIP holds the manifest, the database and one copy per document, nothing else",
            sorted(names) == sorted(["manifest.json", *[entry["path"] for entry in entries]])
            and len(manifest["files"]) == documents,
            names,
        )
        altered = [
            entry["path"]
            for entry in entries
            if hashlib.sha256(archive.read(entry["path"])).hexdigest() != entry["sha256"]
            or archive.getinfo(entry["path"]).file_size != entry["size"]
        ]
        check("every element matches its SHA-256 fingerprint and size in the manifest", not altered, altered)
        check(
            "the manifest says no secret is included",
            manifest.get("secretsIncluded") is False and manifest.get("format") == "archive-backup",
            {key: manifest.get(key) for key in ("format", "secretsIncluded")},
        )
        check("the key is in no element of the ZIP", all(KEY.encode() not in archive.read(name) for name in names))
        database = scratch / "backup-check.db"
        database.write_bytes(archive.read("archive.db"))
    with sqlite3.connect(database) as db:
        integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
        counted = db.execute("SELECT count(*) FROM documents").fetchone()[0]
        notes = [row[0] for row in db.execute("SELECT title FROM notes")]
    check("the database in the backup is sound", integrity == "ok", integrity)
    check(
        "it holds the documents and the note written before",
        counted == documents and notes == [NOTE_BEFORE],
        (counted, notes),
    )


def folder_dialog(session: phase8.Session, target: pathlib.Path, before: set[str]) -> bool:
    """In the GTK folder dialog opened by the core: Home (the test's folder), the folder's name typed, Enter to go
    into it, then « Open » chooses the folder shown."""
    opened = wait_for(lambda: bool(set(session.windows()) - before), timeout=15)
    time.sleep(2)
    session.run("xdotool", "mousemove", "600", "400")
    time.sleep(0.5)
    session.click(FOLDER_DIALOG_HOME, pause=1.5)
    session.type(target.name)
    session.key("Return", pause=1.5)
    session.click(FOLDER_DIALOG_OPEN, pause=1.5)
    return opened and not set(session.windows()) - before


def export_checks(exports: pathlib.Path, documents: pathlib.Path, imported: int) -> None:
    written = sorted(path for path in exports.iterdir())
    check(
        "one export folder is written, complete (no partial folder left)",
        len(written) == 1 and written[0].name.startswith("ARCHIVE-export-") and not written[0].name.endswith(".partial"),
        [path.name for path in written],
    )
    if len(written) != 1:
        return
    root = written[0]
    copies = sorted(path for path in (root / "documents").rglob("*") if path.is_file())
    same = all((documents / path.name).read_bytes() == path.read_bytes() for path in copies)
    check(
        "the original files are exported under their original names, identical",
        len(copies) == imported and same,
        [path.name for path in copies],
    )
    note = root / "notes" / f"{NOTE_BEFORE}.md"
    text = note.read_text(encoding="utf-8") if note.exists() else ""
    check(
        "the note is exported in Markdown (converted by the real web view), with its details in a YAML header",
        text.startswith(f'---\ntitle: "{NOTE_BEFORE}"\n') and text.rstrip().endswith("Le NE555 oscille en montage astable."),
        text[:300],
    )
    table = (root / "metadata" / "documents.csv").read_bytes() if (root / "metadata" / "documents.csv").exists() else b""
    check(
        "the tables are CSV in UTF-8 with a byte order mark",
        table.startswith("\ufeffid,title,file,".encode()) and table.count(b"\r\n") == imported + 1,
        table[:80],
    )
    archive = json.loads((root / "archive.json").read_text(encoding="utf-8")) if (root / "archive.json").exists() else {}
    check(
        "archive.json holds everything",
        archive.get("format") == "archive-export"
        and len(archive.get("documents", [])) == imported
        and [item["title"] for item in archive.get("notes", [])] == [NOTE_BEFORE],
        {key: archive.get(key) for key in ("format", "scope")},
    )
    check(
        "the key is in no exported file",
        all(KEY.encode() not in path.read_bytes() for path in root.rglob("*") if path.is_file()),
    )


def restarted_pid(old: int) -> int | None:
    found = subprocess.run(["pgrep", "-f", str(phase8.BINARY)], capture_output=True, text=True, check=False)
    pids = [int(pid) for pid in found.stdout.split() if int(pid) != old]
    return pids[0] if pids else None


def main() -> int:
    if not phase8.BINARY.exists():
        print("Missing binary: npm run tauri build -- --no-bundle", file=sys.stderr)
        return 2
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    xvfb = subprocess.Popen(["Xvfb", phase8.DISPLAY, "-screen", "0", "1440x900x24", "-nolisten", "tcp"])
    time.sleep(2)
    workdir = pathlib.Path(tempfile.mkdtemp(prefix="archive-phase10-"))
    data_dir = workdir / "data"
    documents = workdir / "Documents"
    documents.mkdir()
    for name in phase8.FIXTURE_FILES:
        shutil.copy2(phase8.FIXTURES / name, documents / name)
    backup = workdir / "Sauvegardes" / "ma-sauvegarde.zip"
    backup.parent.mkdir()
    exports = workdir / "Exports"
    exports.mkdir()
    restarted: int | None = None
    try:
        session = phase8.Session(data_dir, documents)

        # 1. Import and a note; the provider is written while the binary is closed.
        process = session.launch()
        session.pick_folder()
        write_note(session, NOTE_BEFORE)
        session.click(SIDEBAR_SETTINGS, pause=1.5)  # leaves the note: saved
        session.stop(process)
        imported = session.count("SELECT count(*) FROM documents")
        check(f"the {len(phase8.FIXTURE_FILES)} files are imported", imported == len(phase8.FIXTURE_FILES), imported)
        seed_provider(session)

        # 2. The key for the session, then the backup.
        process = session.launch()
        session.click(SIDEBAR_SETTINGS, pause=1.5)
        session.click(SETTINGS_AI, pause=1.5)
        session.click(SETTINGS_TITLE, pause=0.5)
        session.tab(3)  # « Ajouter un fournisseur », « Supprimer », then the key field
        session.type(KEY)
        session.key("Return", pause=2.0)
        session.shot("01-key-for-the-session")

        session.click(SETTINGS_STORAGE, pause=2.0)
        scroll_to_end(session)
        session.shot("02-storage-without-backup")
        before = set(session.windows())
        session.click(CREATE_BACKUP, pause=0.5)
        check("the core opens its save dialog", save_dialog(session, backup, before))
        wait_for(lambda: backup.exists() and session.count("SELECT count(*) FROM backups") == 1, timeout=30)
        time.sleep(1.5)
        scroll_to_end(session)
        session.shot("03-backup-created")
        check("the backup is written where the user chose", backup.is_file())
        check(
            "no partial file is left",
            not any(path.name.endswith(".partial") for path in backup.parent.iterdir()),
        )
        with session.database() as db:
            row = db.execute("SELECT path, verification FROM backups").fetchone()
        check("the history records it, not verified yet", row is not None and row["path"] == str(backup)
              and row["verification"] is None, dict(row) if row else None)
        if backup.is_file():
            zip_checks(backup, workdir, imported)

        session.click(FIRST_VERIFY, pause=3.0)
        session.shot("04-backup-verified")
        with session.database() as db:
            verification = db.execute("SELECT verification FROM backups").fetchone()["verification"]
        check("verified from the history", verification == "valid", verification)

        # The export, in a folder chosen in the core's dialog.
        scroll_to_end(session)
        session.shot("05-export-card")
        before = set(session.windows())
        session.click(EXPORT, pause=0.5)
        check("the core opens its folder dialog", folder_dialog(session, exports, before))
        wait_for(lambda: any(path.name.startswith("ARCHIVE-export-") and not path.name.endswith(".partial")
                             for path in exports.iterdir()), timeout=30)
        time.sleep(1.5)
        scroll_to_end(session)
        session.shot("06-export-done")
        export_checks(exports, documents, imported)

        # After the backup: a second note. Then the restoration, which restarts ARCHIVE.
        write_note(session, NOTE_AFTER)
        session.click(SIDEBAR_SETTINGS, pause=1.5)
        session.click(SETTINGS_STORAGE, pause=2.0)
        notes_now = session.count("SELECT count(*) FROM notes")
        check("the note written after the backup is saved", notes_now == 2, notes_now)
        scroll_to_end(session)
        session.click(FIRST_RESTORE, pause=1.5)
        session.shot("07-restore-confirmation")
        check(
            "nothing is prepared before the confirmation",
            not (data_dir / "restore").exists() and session.count("SELECT count(*) FROM notes") == 2,
        )
        session.key("Tab", pause=0.3)  # from « Annuler », which has the focus, to « Restaurer et redémarrer »
        session.key("Return", pause=0.5)
        exited = wait_for(lambda: process.poll() is not None, timeout=40)
        check("ARCHIVE closes to apply the restoration", exited, process.poll())

        # 3. The new ARCHIVE.
        restarted = None
        wait_for(lambda: restarted_pid(process.pid) is not None, timeout=20)
        restarted = restarted_pid(process.pid)
        check("ARCHIVE starts again by itself", restarted is not None)
        wait_for(lambda: bool(session.main_windows()), timeout=30)
        time.sleep(6)
        session.shot("08-restored")
        notes = [row[0] for row in session.database().execute("SELECT title FROM notes ORDER BY created_at")]
        check("the data is the backup's: the note written after it is gone", notes == [NOTE_BEFORE], notes)
        check(
            "the documents are back, with their files",
            session.count("SELECT count(*) FROM documents") == imported
            and sum(1 for path in (data_dir / "files").rglob("*") if path.is_file()) == imported,
        )
        kept = sorted((data_dir / "backups").glob("before-restore-*"))
        check("the replaced data is kept in the backups folder", len(kept) == 1, kept)
        if kept:
            with sqlite3.connect(kept[0] / "archive.db") as db:
                previous = sorted(row[0] for row in db.execute("SELECT title FROM notes"))
            check("with the note written after the backup", previous == sorted([NOTE_BEFORE, NOTE_AFTER]), previous)
        check("the extracted copy is removed", not (data_dir / "restore").exists())
        with session.database() as db:
            history = [dict(row) for row in db.execute("SELECT path, verification FROM backups")]
        check(
            "the history still lists the backup, verified",
            history == [{"path": str(backup), "verification": "valid"}],
            history,
        )

        session.click(SIDEBAR_SETTINGS, pause=1.5)
        session.click(SETTINGS_STORAGE, pause=2.0)
        scroll_to_end(session)
        session.shot("09-history-after-restoration")
    finally:
        if restarted is not None:
            try:
                os.kill(restarted, signal.SIGTERM)
                time.sleep(2)
            except ProcessLookupError:
                pass
        xvfb.terminate()
        log = (data_dir / "logs" / "archive.log").read_text(encoding="utf-8") if (data_dir / "logs" / "archive.log").exists() else ""
        if (data_dir / "logs").exists():
            shutil.copytree(data_dir / "logs", OUT / "logs", dirs_exist_ok=True)
        shutil.rmtree(workdir, ignore_errors=True)
    check("the log records the backup, its verification, the export and the restoration",
          "backup created:" in log and "verified: valid" in log and "export written:" in log
          and "restoration of backup" in log and "restored; the replaced data is in backups/before-restore-" in log)
    check("the key is nowhere in the log", KEY not in log)
    errors = [line for line in log.splitlines() if "[ERROR]" in line]
    check("no error in the log", not errors, errors[:3])
    check("no Content Security Policy violation reported", "CSP violation" not in log)
    failed = [name for name, ok in phase8.checks if not ok]
    print(f"\n{len(phase8.checks) - len(failed)}/{len(phase8.checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
