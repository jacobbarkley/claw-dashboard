#!/bin/bash
# push-trading-data.sh
# Regenerates data/trading.json and pushes to GitHub → triggers Vercel redeploy.
# Cron: 16:40 ET weekdays (same run as push-dashboard-data.sh, 5 min after aggregator)
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# Refresh options via regime router (routes to BPS or protective puts based on VIX/CB).
# Non-fatal if it fails — push-trading-data.py will use last known data.
ROUTER="$HOME/.openclaw/workspace/trading-bot/options/bin/options_regime_router.py"
PY_TRADING="$HOME/.openclaw/workspace/.venv-trading/bin/python"
if [ -f "$ROUTER" ] && [ -x "$PY_TRADING" ]; then
    echo "Running options regime router..."
    "$PY_TRADING" "$ROUTER" && echo "Options regime router OK" || echo "Options regime router failed (non-fatal — using last known data)"
fi

python3 scripts/push-trading-data.py

if git diff --quiet data/trading.json 2>/dev/null && [ -f data/trading.json ]; then
  echo "No changes to trading.json — nothing to push"
  exit 0
fi

git add data/trading.json
git commit -m "data: trading update $(date +%Y-%m-%d)"
GIT_SSH_COMMAND="ssh -i $HOME/.ssh/id_ed25519_claude" git push origin main
echo "Pushed trading data"
