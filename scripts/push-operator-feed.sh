#!/bin/bash
# push-operator-feed.sh
# Refreshes data/operator-feed.json from rebuild artifacts and pushes it to GitHub.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# Refuse preview/demo feeds in the production publisher path.
bash scripts/prepare-production-operator-feed.sh

git add data/operator-feed.json
if git diff --cached --quiet; then
  echo "No changes to operator-feed.json - nothing to push"
  exit 0
fi

git commit -m "data: operator feed update $(date +%Y-%m-%d)"
GIT_SSH_COMMAND="ssh -i $HOME/.ssh/id_ed25519_claude" git push origin main
echo "Pushed operator feed"
