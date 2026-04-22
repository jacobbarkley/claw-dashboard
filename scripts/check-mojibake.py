#!/usr/bin/env python3
"""Scan staged files (or explicit args) for common UTF-8 mojibake byte
sequences and reject the commit if any turn up.

Mojibake shows up when a file edited on the Windows/WSL boundary gets
round-tripped through cp1252 → utf-8 (or worse, twice). The tell is a
run of non-ASCII bytes where a single intended character (em-dash,
middle-dot, arrow) now occupies 3-7 bytes of `c3 ...` sequences.

This check scans the staged blob directly (what's about to be committed,
not the working tree) so fixing the working tree without staging the fix
still fails the check until the staged version is clean.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

# Byte sequences that occur when original UTF-8 non-ASCII bytes were
# decoded as Windows-1252 and then re-encoded as UTF-8 (the canonical
# round-trip corruption pattern). If any of these appear in a non-binary
# staged file, the commit is blocked.
MOJIBAKE_SEQUENCES: tuple[bytes, ...] = (
    b"\xc3\xa2\xe2\x82\xac\xe2\x80\x9d",   # em-dash through one round-trip
    b"\xc3\xa2\xe2\x82\xac\xe2\x80\x9c",   # en-dash through one round-trip
    b"\xc3\x82\xc2\xb7",                   # middle-dot doubled
    b"\xc3\x83\xc6\x92",                   # deeper round-trip (A-tilde + f-hook)
    b"\xc3\x83\xc2\x82",                   # deeper round-trip (A-tilde + comma)
    b"\xc3\xa2\xe2\x82\xac\xc2\xa6",       # ellipsis
    b"\xc3\xa2\xe2\x82\xac\xc5\x93",       # left double quote
    b"\xc3\xa2\xe2\x82\xac\xc2\x9d",       # right double quote
)

# Extensions worth scanning. Binary formats and obvious non-text are
# skipped even if they happen to contain these byte sequences.
TEXT_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".json", ".md", ".mdx", ".css", ".scss", ".html",
    ".py", ".sh", ".yaml", ".yml", ".toml",
}


def staged_files() -> list[Path]:
    """Return the list of text-ish files currently staged for commit."""
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"],
        capture_output=True,
        text=True,
        check=True,
    )
    paths: list[Path] = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        path = Path(line)
        if path.suffix.lower() in TEXT_EXTENSIONS:
            paths.append(path)
    return paths


def staged_content(path: Path) -> bytes | None:
    """Read the staged (index) bytes for a path. Returns None if the
    file is no longer tracked or the blob read fails."""
    result = subprocess.run(
        ["git", "show", f":{path}"],
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        return None
    return result.stdout


def scan(paths: list[Path], *, from_index: bool) -> list[tuple[Path, dict[bytes, int]]]:
    offenders: list[tuple[Path, dict[bytes, int]]] = []
    for path in paths:
        if from_index:
            content = staged_content(path)
        else:
            try:
                content = path.read_bytes()
            except OSError:
                content = None
        if content is None:
            continue
        hits: dict[bytes, int] = {}
        for seq in MOJIBAKE_SEQUENCES:
            count = content.count(seq)
            if count > 0:
                hits[seq] = count
        if hits:
            offenders.append((path, hits))
    return offenders


def main() -> int:
    if len(sys.argv) > 1:
        paths = [Path(a) for a in sys.argv[1:]]
        from_index = False
    else:
        paths = staged_files()
        from_index = True
    if not paths:
        return 0
    offenders = scan(paths, from_index=from_index)
    if not offenders:
        return 0
    print(
        "Mojibake detected in staged files. Run ftfy or fix manually "
        "before committing.\n",
        file=sys.stderr,
    )
    for path, hits in offenders:
        total = sum(hits.values())
        print(f"  {path}  ({total} sequence{'s' if total != 1 else ''})", file=sys.stderr)
        for seq, count in hits.items():
            preview = seq.decode("latin-1", errors="replace")
            print(f"    {count:>5}x  {preview!r}  ({seq.hex(' ')})", file=sys.stderr)
    print(
        "\nQuick fix:\n"
        "  python3 -c \"import ftfy, pathlib; "
        "p=pathlib.Path('<file>'); "
        "p.write_text(ftfy.fix_text(p.read_text()))\"\n",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
