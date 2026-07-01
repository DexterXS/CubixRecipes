"""Report project files that exceed configured line-count limits."""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path


DEFAULT_WARN_LIMIT = 400
DEFAULT_HARD_LIMIT = 500
DEFAULT_SCAN_PATHS = (
    "AGENTS.md",
    "CHANGELOG.md",
    "README.md",
    "admin_panel.py",
    "start-dev.py",
    "backend/app",
    "frontend/src",
    ".agents/skills",
    "scripts",
)

SKIP_DIRS = {
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    ".codex-remote-attachments",
}

TEXT_EXTENSIONS = {
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".py",
    ".ts",
    ".tsx",
    ".txt",
    ".yml",
    ".yaml",
}


@dataclass(frozen=True)
class FileSizeFinding:
    path: Path
    lines: int
    level: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Report source files above the warning/hard line-count limits. "
            "Use --enforce when the report should fail the command."
        )
    )
    parser.add_argument("--root", default=".", help="Project root to scan.")
    parser.add_argument(
        "--path",
        action="append",
        dest="paths",
        help=(
            "Relative file or directory to scan. Can be provided multiple times. "
            "Defaults to source/governance paths."
        ),
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Scan every text file under --root, excluding known generated/runtime directories.",
    )
    parser.add_argument("--warn", type=int, default=DEFAULT_WARN_LIMIT, help="Warning line limit.")
    parser.add_argument("--limit", type=int, default=DEFAULT_HARD_LIMIT, help="Hard line limit.")
    parser.add_argument("--max-results", type=int, default=50, help="Maximum findings to print.")
    parser.add_argument(
        "--enforce",
        action="store_true",
        help="Exit with code 1 when any file is above the hard limit.",
    )
    return parser.parse_args()


def should_skip(path: Path, root: Path) -> bool:
    rel_parts = path.relative_to(root).parts
    if any(part in SKIP_DIRS for part in rel_parts):
        return True
    if path.suffix.lower() not in TEXT_EXTENSIONS:
        return True
    return False


def count_lines(path: Path) -> int:
    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            return sum(1 for _ in handle)
    except OSError as exc:
        raise RuntimeError(f"Could not read {path}: {exc}") from exc


def collect_findings(
    files: list[Path],
    root: Path,
    warn_limit: int,
    hard_limit: int,
) -> list[FileSizeFinding]:
    findings: list[FileSizeFinding] = []
    for path in files:
        if should_skip(path, root):
            continue
        lines = count_lines(path)
        if lines > hard_limit:
            findings.append(FileSizeFinding(path=path, lines=lines, level="HARD"))
        elif lines > warn_limit:
            findings.append(FileSizeFinding(path=path, lines=lines, level="WARN"))
    return sorted(findings, key=lambda item: (-item.lines, str(item.path)))


def iter_source_files(root: Path, configured_paths: list[str]) -> list[Path]:
    files: list[Path] = []
    for raw_path in configured_paths:
        path = (root / raw_path).resolve()
        if not path.exists():
            continue
        if path.is_file():
            files.append(path)
            continue
        for dirpath, dirnames, filenames in os.walk(path):
            dirnames[:] = [dirname for dirname in dirnames if dirname not in SKIP_DIRS]
            current_dir = Path(dirpath)
            for filename in filenames:
                files.append(current_dir / filename)
    return files


def iter_all_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [dirname for dirname in dirnames if dirname not in SKIP_DIRS]
        current_dir = Path(dirpath)
        for filename in filenames:
            files.append(current_dir / filename)
    return files


def print_report(root: Path, findings: list[FileSizeFinding], max_results: int) -> None:
    if not findings:
        print("OK: no files exceed the configured line-count limits.")
        return

    print("File size report:")
    for finding in findings[:max_results]:
        rel_path = finding.path.relative_to(root)
        print(f"{finding.level:4} {finding.lines:5} {rel_path}")

    hidden_count = len(findings) - max_results
    if hidden_count > 0:
        print(f"... {hidden_count} more finding(s) hidden by --max-results")


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    if not root.exists() or not root.is_dir():
        print(f"ERROR: root does not exist or is not a directory: {root}", file=sys.stderr)
        return 2
    if args.warn >= args.limit:
        print("ERROR: --warn must be lower than --limit", file=sys.stderr)
        return 2

    if args.all:
        files = iter_all_files(root)
    else:
        configured_paths = args.paths if args.paths else list(DEFAULT_SCAN_PATHS)
        files = iter_source_files(root, configured_paths)

    findings = collect_findings(
        files=files,
        root=root,
        warn_limit=args.warn,
        hard_limit=args.limit,
    )
    print_report(root=root, findings=findings, max_results=args.max_results)
    has_hard_failure = any(finding.level == "HARD" for finding in findings)
    if args.enforce and has_hard_failure:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
