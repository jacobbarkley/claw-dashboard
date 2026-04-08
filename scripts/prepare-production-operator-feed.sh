#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

unset OPENCLAW_WORKSPACE
unset OPENCLAW_REBUILD_LATEST
unset OPENCLAW_REBUILD_HISTORY
unset OPENCLAW_CHECKPOINT05_PATH
unset OPENCLAW_PERF_DIR
unset OPENCLAW_POLICY_PATH
unset OPENCLAW_MODE_STATE_PATH
unset OPENCLAW_MODE_HISTORY_PATH
unset OPENCLAW_APPROVAL_QUEUE_PATH
unset OPENCLAW_FEED_SOURCE_LABEL

cd "${REPO_ROOT}"
python3 scripts/push-operator-feed.py

python3 - <<'PY'
import json
from pathlib import Path

path = Path("data/operator-feed.json")
data = json.loads(path.read_text())
source = data.get("source_context", {})

if source.get("mode") != "canonical":
    raise SystemExit(f"Refusing to continue: {path} is not canonical ({source!r})")

print(f"Canonical operator feed ready: {path}")
PY
