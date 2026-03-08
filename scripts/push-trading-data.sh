#!/bin/bash
# push-trading-data.sh
# Regenerates data/trading.json and pushes to GitHub → triggers Vercel redeploy.
# Cron: 16:40 ET weekdays (same run as push-dashboard-data.sh, 5 min after aggregator)
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

python3 scripts/push-trading-data.py

if git diff --quiet data/trading.json 2>/dev/null && [ -f data/trading.json ]; then
  echo "No changes to trading.json — nothing to push"
  exit 0
fi

git add data/trading.json
git commit -m "data: trading update $(date +%Y-%m-%d)"
GIT_SSH_COMMAND="ssh -i $HOME/.ssh/id_ed25519_claude" git push origin main
echo "Pushed trading data"
