#!/usr/bin/env bash
# close-queue-item.sh — Move a queue item from queued to completed.
#
# Usage:
#   bash scripts/close-queue-item.sh Q-083 "Multi-era framework shipped and validated"
#   bash scripts/close-queue-item.sh Q-085  # no close note, just closes it
#
# What it does:
#   1. Reads data/queue.json
#   2. Finds the item by ID in the queued array
#   3. Moves it to completed with closed_at = today and optional close_note
#   4. Writes back queue.json
#   5. Runs push-dashboard-data.sh to push to Vercel
#
# Safe to run multiple times — if the item is already in completed, it skips.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
QUEUE_JSON="$REPO_DIR/data/queue.json"

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <Q-ID> [close_note]" >&2
    exit 2
fi

Q_ID="$1"
CLOSE_NOTE="${2:-}"

if [[ ! -f "$QUEUE_JSON" ]]; then
    echo "queue.json not found at $QUEUE_JSON" >&2
    exit 1
fi

python3 - "$QUEUE_JSON" "$Q_ID" "$CLOSE_NOTE" << 'PYEOF'
import json, sys, datetime

queue_path = sys.argv[1]
q_id = sys.argv[2]
close_note = sys.argv[3] if len(sys.argv) > 3 else ""

d = json.load(open(queue_path))
queued = d.get("queued", [])
completed = d.get("completed", [])

# Check if already completed
if any(it.get("id") == q_id for it in completed):
    print(f"{q_id} is already in completed. Nothing to do.")
    sys.exit(0)

# Find in queued
item = next((it for it in queued if it.get("id") == q_id), None)
if not item:
    print(f"{q_id} not found in queued. Available IDs:")
    for it in queued:
        print(f"  {it['id']:10s} {it.get('title', '?')[:60]}")
    sys.exit(1)

# Move to completed
queued.remove(item)
item["closed_at"] = datetime.date.today().isoformat()
if close_note:
    item["close_note"] = close_note

completed.insert(0, item)
d["generated_at"] = datetime.datetime.now().astimezone().isoformat()
json.dump(d, open(queue_path, "w"), indent=2)
print(f"Closed {q_id}: moved to completed (closed_at={item['closed_at']})")
PYEOF

# Push to dashboard
echo "Pushing dashboard data..."
bash "$REPO_DIR/scripts/push-dashboard-data.sh" 2>&1 | tail -3
