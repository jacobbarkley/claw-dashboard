#!/bin/bash
# push-dashboard-data.sh
# Regenerates tickets.json and pushes to GitHub.
# Add to cron after any ticket-generating job, or run manually.
#
# Usage: bash scripts/push-dashboard-data.sh

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRAIN_DIR="$HOME/claude/OpenClaw-s-Brain"

cd "$REPO_DIR"

# Regenerate ticket data
python3 scripts/parse-tickets.py --tickets-dir "$BRAIN_DIR/System/Design-Backlog/rebuild-tickets"

# Commit and push if anything changed
if git diff --quiet data/tickets.json; then
  echo "No changes to tickets.json — nothing to push"
  exit 0
fi

git add data/tickets.json
git commit -m "data: dashboard update $(date +%Y-%m-%d)"
GIT_SSH_COMMAND="ssh -i $HOME/.ssh/id_ed25519_claude" git push origin main
echo "Pushed dashboard data"
