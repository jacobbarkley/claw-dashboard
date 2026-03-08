#!/usr/bin/env python3
"""
parse-tickets.py
Reads TICKET-*.md files from OpenClaw-s-Brain, extracts YAML frontmatter,
outputs data/tickets.json for the dashboard.

Usage:
  python3 scripts/parse-tickets.py
  python3 scripts/parse-tickets.py --tickets-dir /path/to/rebuild-tickets
"""

import json
import re
import sys
import argparse
from pathlib import Path
from datetime import datetime, timezone

DEFAULT_TICKETS_DIR = Path.home() / "claude/OpenClaw-s-Brain/System/Design-Backlog/rebuild-tickets"
OUTPUT_FILE = Path(__file__).parent.parent / "data/tickets.json"

STATUS_ORDER = ["BLOCKED", "UNDER_INVESTIGATION", "IN_WORK", "EXECUTING", "VERIFYING",
                "COMMITTING", "READY", "RE_TEST", "RESOLVED", "DONE"]

PHASE_LABELS = {
    1: "Foundation",
    2: "Trading Core",
    3: "Intelligence Layer",
    4: "Live Trading Gate",
    5: "Optimization",
}


def parse_frontmatter(text: str) -> dict:
    match = re.match(r'^---\s*\n(.*?)\n---', text, re.DOTALL)
    if not match:
        return {}
    fm = {}
    for line in match.group(1).splitlines():
        if ':' not in line:
            continue
        key, _, val = line.partition(':')
        key = key.strip()
        val = val.strip()
        # parse lists like [TICKET-014] or [bandaid-removal, pipeline-sequencing]
        if val.startswith('[') and val.endswith(']'):
            inner = val[1:-1]
            val = [v.strip() for v in inner.split(',')] if inner.strip() else []
        # parse integers
        elif re.fullmatch(r'\d+', val):
            val = int(val)
        fm[key] = val
    return fm


def parse_title(text: str) -> str:
    for line in text.splitlines():
        if line.startswith('# '):
            return line[2:].strip()
    return ""


def load_tickets(tickets_dir: Path) -> list:
    tickets = []
    for f in sorted(tickets_dir.glob("TICKET-*.md")):
        try:
            text = f.read_text()
            fm = parse_frontmatter(text)
            if not fm.get("ticket_id"):
                fm["ticket_id"] = f.stem
            fm["title"] = parse_title(text)
            fm["file"] = f.name
            tickets.append(fm)
        except Exception as e:
            print(f"Warning: could not parse {f.name}: {e}", file=sys.stderr)
    return tickets


def group_by_status(tickets: list) -> dict:
    groups = {}
    for t in tickets:
        status = t.get("status", "UNKNOWN")
        groups.setdefault(status, []).append(t)
    return groups


def phase_summary(tickets: list) -> list:
    phases = {}
    for t in tickets:
        p = t.get("phase")
        if p is None:
            continue
        if p not in phases:
            phases[p] = {"phase": p, "label": PHASE_LABELS.get(p, f"Phase {p}"),
                         "total": 0, "done": 0}
        phases[p]["total"] += 1
        if t.get("status") in ("RESOLVED", "DONE"):
            phases[p]["done"] += 1
    result = sorted(phases.values(), key=lambda x: x["phase"])
    for r in result:
        r["pct"] = round(r["done"] / r["total"] * 100) if r["total"] else 0
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tickets-dir", type=Path, default=DEFAULT_TICKETS_DIR)
    args = parser.parse_args()

    if not args.tickets_dir.exists():
        print(f"Error: tickets dir not found: {args.tickets_dir}", file=sys.stderr)
        sys.exit(1)

    tickets = load_tickets(args.tickets_dir)
    groups = group_by_status(tickets)
    phases = phase_summary(tickets)

    blockers = [t for t in tickets if t.get("status") == "BLOCKED"]
    active = [t for t in tickets if t.get("status") not in ("RESOLVED", "DONE", "BLOCKED")]
    done = [t for t in tickets if t.get("status") in ("RESOLVED", "DONE")]

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total": len(tickets),
            "blockers": len(blockers),
            "active": len(active),
            "done": len(done),
        },
        "phases": phases,
        "by_status": groups,
        "tickets": tickets,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(output, indent=2, default=str))
    print(f"Wrote {len(tickets)} tickets → {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
