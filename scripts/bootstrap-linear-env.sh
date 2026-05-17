#!/usr/bin/env bash
#
# bootstrap-linear-env.sh
#
# Mirrors LINEAR_API_KEY into the three places used by the Vires acceleration
# plan (Step 4):
#   - OpenClaw config (env.LINEAR_API_KEY) — read by the daily digest cron
#     and any local agent session that needs to talk to Linear.
#   - GitHub Secrets on jacobbarkley/claw-dashboard — for any GHA workflow
#     that needs to talk to Linear from the dashboard side.
#   - GitHub Secrets on jacobbarkley/vires-numeris — same on the backend side.
#
# Reads the key from a single-line temp file the user passes in. Never echoes
# the key value. Deletes the temp file on success.
#
# Usage:
#   scripts/bootstrap-linear-env.sh <PATH_TO_TEMP_FILE>
#
# Temp file format (one line, either form accepted):
#   LINEAR_API_KEY=lin_api_...
#       — or —
#   lin_api_...
#
# Prereqs: Jacob is logged into `gh` and has `openclaw` CLI available.

set -euo pipefail

TEMP_FILE="${1:-}"

if [[ -z "$TEMP_FILE" ]]; then
  cat <<EOF
Usage: $0 <PATH_TO_TEMP_FILE>

Temp file is a single line containing the Linear personal API key, either
prefixed with LINEAR_API_KEY= or just the raw key value.
EOF
  exit 1
fi

if [[ ! -f "$TEMP_FILE" ]]; then
  echo "ERROR: temp file not found: $TEMP_FILE"
  exit 1
fi

# Pull the key, accepting either KEY=VALUE or raw forms; strip trailing newlines.
raw=$(tr -d '\r\n' < "$TEMP_FILE")
if [[ "$raw" == LINEAR_API_KEY=* ]]; then
  LINEAR_API_KEY="${raw#LINEAR_API_KEY=}"
else
  LINEAR_API_KEY="$raw"
fi

# Validate shape: Linear personal keys start with "lin_api_" followed by an
# alphanumeric blob. Refuse on obvious mismatches before writing anywhere.
if [[ ! "$LINEAR_API_KEY" =~ ^lin_api_[A-Za-z0-9]+$ ]]; then
  echo "ERROR: parsed key does not match the Linear personal-API-key shape"
  echo "       (expected: lin_api_<alnum>). Re-check the temp file content."
  exit 1
fi
if [[ ${#LINEAR_API_KEY} -lt 40 ]]; then
  echo "ERROR: parsed key looks too short (${#LINEAR_API_KEY} chars; expected >=40)."
  exit 1
fi

# Check CLI auth before touching anything.
if ! gh auth status > /dev/null 2>&1; then
  echo "ERROR: gh CLI not authenticated. Run 'gh auth login' first."
  exit 1
fi
if ! command -v openclaw > /dev/null 2>&1; then
  echo "ERROR: openclaw CLI not found in PATH. Install OpenClaw before running."
  exit 1
fi

# 1. OpenClaw env (used by the daily digest cron and any agent session
# running on this machine).
echo "Writing OpenClaw config env.LINEAR_API_KEY..."
openclaw config set env.LINEAR_API_KEY "$LINEAR_API_KEY" > /dev/null
echo "  ok"

# 2. claw-dashboard GH Secrets.
echo "Writing GitHub Secret on jacobbarkley/claw-dashboard..."
printf '%s' "$LINEAR_API_KEY" | gh secret set LINEAR_API_KEY --repo jacobbarkley/claw-dashboard > /dev/null
echo "  ok"

# 3. vires-numeris GH Secrets.
echo "Writing GitHub Secret on jacobbarkley/vires-numeris..."
printf '%s' "$LINEAR_API_KEY" | gh secret set LINEAR_API_KEY --repo jacobbarkley/vires-numeris > /dev/null
echo "  ok"

# Clear from this shell's environment.
unset LINEAR_API_KEY raw

# Delete the temp file.
rm -f "$TEMP_FILE"
echo ""
echo "Deleted temp file: $TEMP_FILE"
echo ""
echo "Done. Verify with:"
echo "  python3 -c \"import json; d=json.load(open('/home/jacobbarkley/.openclaw/openclaw.json')); print('openclaw env.LINEAR_API_KEY present:', 'LINEAR_API_KEY' in d.get('env', {}))\""
echo "  gh secret list --repo jacobbarkley/claw-dashboard | grep LINEAR_API_KEY"
echo "  gh secret list --repo jacobbarkley/vires-numeris | grep LINEAR_API_KEY"
echo ""
echo "Restart OpenClaw gateway to pick up the new env value if a digest cron"
echo "or live agent session is currently running:"
echo "  openclaw gateway restart"
