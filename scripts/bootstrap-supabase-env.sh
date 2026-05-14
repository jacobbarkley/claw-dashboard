#!/usr/bin/env bash
#
# bootstrap-supabase-env.sh
#
# Writes Supabase credentials for the Step 2 RLS spike to:
#   - Vercel Preview env on the claw-dashboard project
#       SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET, GUIDED_READ_STORE=supabase
#   - GitHub Secrets on the vires-numeris repo
#       SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
#
# Reads secret VALUES from a temp file the user passes in. Never echoes
# secret values. Deletes the temp file on success.
#
# Usage:
#   scripts/bootstrap-supabase-env.sh <SUPABASE_URL> <PATH_TO_TEMP_FILE>
#
# Temp file format (three lines, KEY=VALUE):
#   SUPABASE_ANON_KEY=<paste>
#   SUPABASE_JWT_SECRET=<paste>
#   SUPABASE_SERVICE_ROLE_KEY=<paste>
#
# Prereqs: Jacob is logged into `vercel` CLI and `gh` CLI locally.

set -euo pipefail

SUPABASE_URL="${1:-}"
TEMP_FILE="${2:-}"

if [[ -z "$SUPABASE_URL" || -z "$TEMP_FILE" ]]; then
  cat <<EOF
Usage: $0 <SUPABASE_URL> <PATH_TO_TEMP_FILE>

Temp file must contain three lines:
  SUPABASE_ANON_KEY=...
  SUPABASE_JWT_SECRET=...
  SUPABASE_SERVICE_ROLE_KEY=...
EOF
  exit 1
fi

if [[ ! "$SUPABASE_URL" =~ ^https://[a-z0-9]+\.supabase\.co/?$ ]]; then
  echo "ERROR: SUPABASE_URL does not match the Supabase URL pattern: $SUPABASE_URL"
  exit 1
fi
SUPABASE_URL="${SUPABASE_URL%/}"

if [[ ! -f "$TEMP_FILE" ]]; then
  echo "ERROR: temp file not found: $TEMP_FILE"
  exit 1
fi

# Parse temp file
SUPABASE_ANON_KEY=$(grep -E '^SUPABASE_ANON_KEY=' "$TEMP_FILE" | head -1 | cut -d'=' -f2-)
SUPABASE_JWT_SECRET=$(grep -E '^SUPABASE_JWT_SECRET=' "$TEMP_FILE" | head -1 | cut -d'=' -f2-)
SUPABASE_SERVICE_ROLE_KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$TEMP_FILE" | head -1 | cut -d'=' -f2-)

# Validate shapes (length sanity, no whitespace)
[[ -z "$SUPABASE_ANON_KEY" ]] && { echo "ERROR: SUPABASE_ANON_KEY missing from temp file"; exit 1; }
[[ -z "$SUPABASE_JWT_SECRET" ]] && { echo "ERROR: SUPABASE_JWT_SECRET missing from temp file"; exit 1; }
[[ -z "$SUPABASE_SERVICE_ROLE_KEY" ]] && { echo "ERROR: SUPABASE_SERVICE_ROLE_KEY missing from temp file"; exit 1; }
[[ ${#SUPABASE_ANON_KEY} -lt 50 ]] && { echo "ERROR: SUPABASE_ANON_KEY looks too short (${#SUPABASE_ANON_KEY} chars)"; exit 1; }
[[ ${#SUPABASE_JWT_SECRET} -lt 30 ]] && { echo "ERROR: SUPABASE_JWT_SECRET looks too short (${#SUPABASE_JWT_SECRET} chars)"; exit 1; }
[[ ${#SUPABASE_SERVICE_ROLE_KEY} -lt 50 ]] && { echo "ERROR: SUPABASE_SERVICE_ROLE_KEY looks too short (${#SUPABASE_SERVICE_ROLE_KEY} chars)"; exit 1; }

# Find Vercel CLI auth token (used directly against the REST API because the
# CLI plugin doesn't reliably accept non-interactive "all preview branches"
# scope adds — same workaround as the Step 1 maiden voyage).
VERCEL_AUTH_FILE="$HOME/.local/share/com.vercel.cli/auth.json"
if [[ ! -f "$VERCEL_AUTH_FILE" ]]; then
  echo "ERROR: Vercel CLI auth not found. Run 'vercel login' first."
  exit 1
fi
VERCEL_TOKEN=$(jq -r '.token' "$VERCEL_AUTH_FILE")
if [[ -z "$VERCEL_TOKEN" || "$VERCEL_TOKEN" == "null" ]]; then
  echo "ERROR: could not extract Vercel token from $VERCEL_AUTH_FILE"
  exit 1
fi

# claw-dashboard project ID (stable, captured during Step 1)
CLAW_PROJECT_ID="prj_nQk5SBKkxvMniAdjFsM7xqwxavCr"

# Check gh CLI auth
if ! gh auth status > /dev/null 2>&1; then
  echo "ERROR: gh CLI not authenticated. Run 'gh auth login' first."
  exit 1
fi

# Show what's already on the project (catch leftover entries from the prior
# Supabase project Jacob mentioned)
EXISTING=$(curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v10/projects/$CLAW_PROJECT_ID/env" \
  | jq -r '.envs[] | select(.key | test("^(SUPABASE_|GUIDED_READ_STORE)")) | "\(.key) (\(.target | join(",")))"')

if [[ -n "$EXISTING" ]]; then
  echo "WARNING: existing SUPABASE_* / GUIDED_READ_STORE entries found on Vercel:"
  echo "$EXISTING" | sed 's/^/  /'
  echo ""
  read -r -p "Delete these and proceed? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted. Clean up manually with 'vercel env rm <NAME>' if needed."
    exit 1
  fi
  # Delete matching entries
  curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v10/projects/$CLAW_PROJECT_ID/env" \
    | jq -r '.envs[] | select(.key | test("^(SUPABASE_|GUIDED_READ_STORE)")) | .id' \
    | while read -r env_id; do
        curl -s -X DELETE -H "Authorization: Bearer $VERCEL_TOKEN" \
          "https://api.vercel.com/v10/projects/$CLAW_PROJECT_ID/env/$env_id" > /dev/null
        echo "  deleted env entry $env_id"
      done
fi

# Helper: write one env var to Vercel Preview scope
vercel_preview_env() {
  local key=$1
  local value=$2
  local body
  body=$(jq -n --arg k "$key" --arg v "$value" \
    '{key: $k, value: $v, type: "encrypted", target: ["preview"]}')
  local response
  response=$(curl -s -w '\n%{http_code}' -X POST \
    "https://api.vercel.com/v10/projects/$CLAW_PROJECT_ID/env" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body")
  local http_code
  http_code=$(echo "$response" | tail -1)
  if [[ "$http_code" != "200" && "$http_code" != "201" ]]; then
    echo "ERROR: Vercel POST for $key returned HTTP $http_code"
    echo "$response" | head -1 | jq -r '.error // .' 2>/dev/null || echo "$response" | head -1
    exit 1
  fi
  echo "  vercel preview: $key"
}

echo ""
echo "Writing Vercel Preview env on claw-dashboard..."
vercel_preview_env SUPABASE_URL "$SUPABASE_URL"
vercel_preview_env SUPABASE_ANON_KEY "$SUPABASE_ANON_KEY"
vercel_preview_env SUPABASE_JWT_SECRET "$SUPABASE_JWT_SECRET"
vercel_preview_env GUIDED_READ_STORE "supabase"

echo ""
echo "Writing GitHub Secrets on vires-numeris..."
echo -n "$SUPABASE_URL" | gh secret set SUPABASE_URL --repo jacobbarkley/vires-numeris > /dev/null
echo "  gh secret: SUPABASE_URL"
echo -n "$SUPABASE_SERVICE_ROLE_KEY" | gh secret set SUPABASE_SERVICE_ROLE_KEY --repo jacobbarkley/vires-numeris > /dev/null
echo "  gh secret: SUPABASE_SERVICE_ROLE_KEY"
echo -n "$SUPABASE_JWT_SECRET" | gh secret set SUPABASE_JWT_SECRET --repo jacobbarkley/vires-numeris > /dev/null
echo "  gh secret: SUPABASE_JWT_SECRET"

# Clear from this shell's environment
unset SUPABASE_ANON_KEY SUPABASE_JWT_SECRET SUPABASE_SERVICE_ROLE_KEY VERCEL_TOKEN

# Delete the temp file
rm -f "$TEMP_FILE"
echo ""
echo "Deleted temp file: $TEMP_FILE"
echo ""
echo "Done. Verify with:"
echo "  curl -s -H \"Authorization: Bearer \$(jq -r '.token' $VERCEL_AUTH_FILE)\" \\"
echo "    https://api.vercel.com/v10/projects/$CLAW_PROJECT_ID/env \\"
echo "    | jq '.envs[] | select(.key | test(\"^(SUPABASE_|GUIDED_READ_STORE)\")) | {key, target}'"
echo "  gh secret list --repo jacobbarkley/vires-numeris | grep -E 'SUPABASE_'"
