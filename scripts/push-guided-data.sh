#!/usr/bin/env bash
# Refreshes public/static Guided data. Commit/push is opt-in.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace/trading-bot}"
PYTHON_BIN="${OPENCLAW_PYTHON:-$WORKSPACE/.venv-rebuild/bin/python3}"

if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="python3"
fi

cd "$REPO_DIR"
"$PYTHON_BIN" scripts/push-guided-data.py "$@"

if [[ "${GUIDED_COMMIT_AND_PUSH:-0}" != "1" ]]; then
  echo "Guided data refreshed locally. Set GUIDED_COMMIT_AND_PUSH=1 to commit and push."
  exit 0
fi

git add \
  data/guided/strategy_library.json \
  data/guided/questionnaire.json \
  data/guided/disclosures/

if git diff --cached --quiet; then
  echo "No changes to Guided data - nothing to push"
  exit 0
fi

git commit -m "data: guided public artifacts update $(date +%Y-%m-%d)"
GIT_SSH_COMMAND="ssh -i $HOME/.ssh/id_ed25519_claude" git push origin main
echo "Pushed Guided public artifacts"
