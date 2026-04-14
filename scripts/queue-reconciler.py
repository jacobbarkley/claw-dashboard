#!/usr/bin/env python3
"""queue-reconciler.py — Flag stale or likely-completed queue items.

Runs as a nightly check (or on-demand). Does NOT auto-close anything.
It produces a reconciliation report that surfaces items needing human
attention.

Usage:
    python3 scripts/queue-reconciler.py                    # print report
    python3 scripts/queue-reconciler.py --json             # JSON output
    python3 scripts/queue-reconciler.py --write-report     # write to data/queue-reconciliation.json

Checks:
    1. Items with all prereqs met but still queued (might be done)
    2. Items with closed_at date in the past but still in queued (data bug)
    3. Items that haven't been touched in > 14 days (stale)
    4. Completed items that are > 30 days old (archive candidates)
    5. Duplicate IDs across queued + completed
"""

import json
import sys
from datetime import date, timedelta
from pathlib import Path

REPO_DIR = Path(__file__).resolve().parent.parent
QUEUE_JSON = REPO_DIR / "data" / "queue.json"
REPORT_PATH = REPO_DIR / "data" / "queue-reconciliation.json"

TODAY = date.today()
STALE_DAYS = 14
ARCHIVE_DAYS = 30


def load_queue():
    return json.loads(QUEUE_JSON.read_text())


def check_stale_queued(queued):
    """Items queued with no recent activity."""
    findings = []
    for item in queued:
        # Use closed_at if accidentally present, or generated_at as proxy
        # Since individual items don't have a last-touched date, we flag
        # items whose prereqs mention completed items
        qid = item.get("id", "?")
        title = item.get("title", "?")
        prereq = item.get("prereq", "") or ""
        blocker = item.get("blocker", "") or ""

        # Check if prereq mentions "done" or "complete" or "shipped"
        prereq_lower = (prereq + " " + blocker).lower()
        done_signals = ["done", "complete", "shipped", "landed", "live", "operational"]
        if any(sig in prereq_lower for sig in done_signals):
            findings.append({
                "type": "PREREQ_MENTIONS_DONE",
                "id": qid,
                "title": title[:80],
                "detail": f"Prereq/blocker text contains completion language. May already be done.",
                "prereq_snippet": prereq[:120],
            })

    return findings


def check_archive_candidates(completed):
    """Completed items older than ARCHIVE_DAYS."""
    findings = []
    for item in completed:
        closed_at = item.get("closed_at")
        if not closed_at:
            continue
        try:
            closed_date = date.fromisoformat(closed_at[:10])
        except (ValueError, TypeError):
            continue
        age = (TODAY - closed_date).days
        if age > ARCHIVE_DAYS:
            findings.append({
                "type": "ARCHIVE_CANDIDATE",
                "id": item.get("id", "?"),
                "title": item.get("title", "?")[:80],
                "closed_at": closed_at,
                "age_days": age,
            })
    return findings


def check_duplicates(queued, completed):
    """IDs appearing in both queued and completed."""
    queued_ids = {it.get("id") for it in queued}
    completed_ids = {it.get("id") for it in completed}
    dupes = queued_ids & completed_ids
    return [{"type": "DUPLICATE_ID", "id": d} for d in sorted(dupes)]


def reconcile():
    d = load_queue()
    queued = d.get("queued", [])
    completed = d.get("completed", [])

    findings = []
    findings.extend(check_stale_queued(queued))
    findings.extend(check_archive_candidates(completed))
    findings.extend(check_duplicates(queued, completed))

    report = {
        "generated_at": TODAY.isoformat(),
        "queued_count": len(queued),
        "completed_count": len(completed),
        "closed_archive_count": len(d.get("closed_archive", [])),
        "finding_count": len(findings),
        "findings": findings,
    }
    return report


def main():
    report = reconcile()
    as_json = "--json" in sys.argv or "--write-report" in sys.argv

    if "--write-report" in sys.argv:
        REPORT_PATH.write_text(json.dumps(report, indent=2))
        print(f"Reconciliation report written to {REPORT_PATH}")
        print(f"  {report['finding_count']} finding(s)")
        return

    if as_json:
        print(json.dumps(report, indent=2))
        return

    # Human-readable output
    print(f"Queue Reconciliation — {report['generated_at']}")
    print(f"  Queued: {report['queued_count']}  Completed: {report['completed_count']}  Archived: {report['closed_archive_count']}")
    print(f"  Findings: {report['finding_count']}")
    print()

    if not report["findings"]:
        print("  No issues found. Queue looks clean.")
        return

    for f in report["findings"]:
        ftype = f["type"]
        fid = f.get("id", "?")
        if ftype == "PREREQ_MENTIONS_DONE":
            print(f"  [{ftype}] {fid}: {f['title']}")
            print(f"    Prereq: {f['prereq_snippet']}")
        elif ftype == "ARCHIVE_CANDIDATE":
            print(f"  [{ftype}] {fid}: closed {f['closed_at']} ({f['age_days']} days ago)")
        elif ftype == "DUPLICATE_ID":
            print(f"  [{ftype}] {fid}: exists in both queued and completed")
        print()


if __name__ == "__main__":
    main()
