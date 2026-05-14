#!/usr/bin/env bash
#
# bootstrap-workos-env.sh
#
# Writes WorkOS credentials for the Step 3 auth spike to:
#   - Vercel Preview env on the claw-dashboard project
#       WORKOS_API_KEY, WORKOS_CLIENT_ID, WORKOS_COOKIE_PASSWORD,
#       AUTH_PROVIDER=workos
#   - GitHub Secrets on the vires-numeris repo (for any worker that
#     needs to talk to WorkOS later — empty surface today)
#       WORKOS_API_KEY
#
# Reads secret values from a temp file. Never echoes them. Deletes the
# temp file on success.
#
# Usage:
#   scripts/bootstrap-workos-env.sh <PATH_TO_TEMP_FILE>
#
# Temp file format (three lines, KEY=VALUE):
#   WORKOS_API_KEY=sk_test_...
#   WORKOS_CLIENT_ID=client_...
#   WORKOS_COOKIE_PASSWORD=<32+ char random>
#
# Prereqs: Jacob is logged into `vercel` CLI and `gh` CLI locally.

set -euo pipefail

TEMP_FILE="${1:-}"

if [[ -z "$TEMP_FILE" ]]; then
  cat <<EOF
Usage: $0 <PATH_TO_TEMP_FILE>

Temp file must contain three lines:
  WORKOS_API_KEY=sk_test_...
  WORKOS_CLIENT_ID=client_...
  WORKOS_COOKIE_PASSWORD=<32+ char random>
EOF
  exit 1
fi

if [[ ! -f "$TEMP_FILE" ]]; then
  echo "ERROR: temp file not found: $TEMP_FILE"
  exit 1
fi

# Parse temp file
WORKOS_API_KEY=$(grep -E '^WORKOS_API_KEY=' "$TEMP_FILE" | head -1 | cut -d'=' -f2-)
WORKOS_CLIENT_ID=$(grep -E '^WORKOS_CLIENT_ID=' "$TEMP_FILE" | head -1 | cut -d'=' -f2-)
WORKOS_COOKIE_PASSWORD=$(grep -E '^WORKOS_COOKIE_PASSWORD=' "$TEMP_FILE" | head -1 | cut -d'=' -f2-)

# Validate shapes
[[ -z "$WORKOS_API_KEY" ]] && { echo "ERROR: WORKOS_API_KEY missing"; exit 1; }
[[ -z "$WORKOS_CLIENT_ID" ]] && { echo "ERROR: WORKOS_CLIENT_ID missing"; exit 1; }
[[ -z "$WORKOS_COOKIE_PASSWORD" ]] && { echo "ERROR: WORKOS_COOKIE_PASSWORD missing"; exit 1; }
[[ ! "$WORKOS_API_KEY" =~ ^sk_(test|live)_ ]] && { echo "ERROR: WORKOS_API_KEY should start with sk_test_ or sk_live_ (got: ${WORKOS_API_KEY:0:10}...)"; exit 1; }
[[ ! "$WORKOS_CLIENT_ID" =~ ^client_ ]] && { echo "ERROR: WORKOS_CLIENT_ID should start with client_ (got: ${WORKOS_CLIENT_ID:0:10}...)"; exit 1; }
[[ ${#WORKOS_COOKIE_PASSWORD} -lt 32 ]] && { echo "ERROR: WORKOS_COOKIE_PASSWORD must be >=32 chars (got ${#WORKOS_COOKIE_PASSWORD})"; exit 1; }

# Vercel token (same approach as bootstrap-supabase-env.sh)
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

CLAW_PROJECT_ID="prj_nQk5SBKkxvMniAdjFsM7xqwxavCr"

if ! gh auth status > /dev/null 2>&1; then
  echo "ERROR: gh CLI not authenticated. Run 'gh auth login' first."
  exit 1
fi

# Check for existing WORKOS_* / AUTH_PROVIDER entries on Vercel
EXISTING=$(curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v10/projects/$CLAW_PROJECT_ID/env" \
  | jq -r '.envs[] | select(.key | test("^(WORKOS_|AUTH_PROVIDER)")) | "\(.key) (\(.target | join(",")))"')

if [[ -n "$EXISTING" ]]; then
  echo "WARNING: existing WORKOS_* / AUTH_PROVIDER entries on Vercel:"
  echo "$EXISTING" | sed 's/^/  /'
  echo ""
  read -r -p "Delete these and proceed? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted. Clean up manually with 'vercel env rm <NAME>' if needed."
    exit 1
  fi
  curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v10/projects/$CLAW_PROJECT_ID/env" \
    | jq -r '.envs[] | select(.key | test("^(WORKOS_|AUTH_PROVIDER)")) | .id' \
    | while read -r env_id; do
        curl -s -X DELETE -H "Authorization: Bearer $VERCEL_TOKEN" \
          "https://api.vercel.com/v10/projects/$CLAW_PROJECT_ID/env/$env_id" > /dev/null
        echo "  deleted env entry $env_id"
      done
fi

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
vercel_preview_env WORKOS_API_KEY "$WORKOS_API_KEY"
vercel_preview_env WORKOS_CLIENT_ID "$WORKOS_CLIENT_ID"
vercel_preview_env WORKOS_COOKIE_PASSWORD "$WORKOS_COOKIE_PASSWORD"
vercel_preview_env AUTH_PROVIDER "workos"

echo ""
echo "Writing GitHub Secrets on vires-numeris..."
echo -n "$WORKOS_API_KEY" | gh secret set WORKOS_API_KEY --repo jacobbarkley/vires-numeris > /dev/null
echo "  gh secret: WORKOS_API_KEY"

unset WORKOS_API_KEY WORKOS_CLIENT_ID WORKOS_COOKIE_PASSWORD VERCEL_TOKEN

rm -f "$TEMP_FILE"
echo ""
echo "Deleted temp file: $TEMP_FILE"
echo ""
echo "Done. Verify with:"
echo "  vercel env ls | grep -E 'WORKOS_|AUTH_PROVIDER'"
echo "  gh secret list --repo jacobbarkley/vires-numeris | grep WORKOS_"
