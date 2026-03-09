#!/bin/bash
# close-ticket.sh
# Marks a ticket as RESOLVED and regenerates the dashboard.
#
# Usage: bash scripts/close-ticket.sh TICKET-017
#        bash scripts/close-ticket.sh TICKET-017 TICKET-018 TICKET-019

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TICKETS_DIR="$HOME/claude/OpenClaw-s-Brain/System/Design-Backlog/rebuild-tickets"
NOW="$(date -u +%Y-%m-%dT%H:%M:%S-05:00)"

if [ $# -eq 0 ]; then
  echo "Usage: bash scripts/close-ticket.sh TICKET-017 [TICKET-018 ...]"
  exit 1
fi

CHANGED=0

for TICKET_ID in "$@"; do
  FILE="$TICKETS_DIR/${TICKET_ID}.md"

  if [ ! -f "$FILE" ]; then
    echo "ERROR: $FILE not found"
    exit 1
  fi

  STATUS=$(grep "^status:" "$FILE" | awk '{print $2}')
  if [ "$STATUS" = "RESOLVED" ]; then
    echo "$TICKET_ID already RESOLVED — skipping"
    continue
  fi

  sed -i "s/^status: .*/status: RESOLVED/" "$FILE"
  sed -i "s/^last_updated: .*/last_updated: $NOW/" "$FILE"

  # Add resolved_at if not already present
  if ! grep -q "^resolved_at:" "$FILE"; then
    sed -i "/^last_updated:/a resolved_at: $NOW" "$FILE"
  else
    sed -i "s/^resolved_at: .*/resolved_at: $NOW/" "$FILE"
  fi

  echo "Closed $TICKET_ID"
  CHANGED=1
done

if [ "$CHANGED" -eq 0 ]; then
  echo "No tickets updated."
  exit 0
fi

# Commit ticket changes to OpenClaw-s-Brain
cd "$HOME/claude/OpenClaw-s-Brain"
git add System/Design-Backlog/rebuild-tickets/
if ! git diff --cached --quiet; then
  git commit -m "Close tickets: $*"
  GIT_SSH_COMMAND="ssh -i $HOME/.ssh/id_ed25519_claude" git push origin main
  echo "Pushed ticket changes"
fi

# Regenerate dashboard and push
bash "$SCRIPT_DIR/push-dashboard-data.sh"
