#!/bin/bash
# process-escalations.sh
# Pulls new escalation files from the claw-dashboard repo and appends them
# to claude-inbox.md as properly formatted inbox messages.
#
# Usage: bash scripts/process-escalations.sh
# Cron:  */5 * * * *  (every 5 min, or call manually)

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INBOX="$HOME/.openclaw/workspace/claude-inbox.md"
ESCALATIONS_DIR="$REPO_DIR/data/escalations"

cd "$REPO_DIR"

# Pull latest from GitHub
GIT_SSH_COMMAND="ssh -i $HOME/.ssh/id_ed25519_claude" git pull --quiet origin main

# Get next MSG id from inbox
last_id=$(grep -oP '(?<=id: MSG-)\d+' "$INBOX" | sort -n | tail -1)
next_id=$(( ${last_id:-0} + 1 ))

processed=0

for f in "$ESCALATIONS_DIR"/*.json; do
  [ -f "$f" ] || continue
  [ "$(basename "$f")" = ".gitkeep" ] && continue

  # Skip already-processed
  already=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('processed','false'))" 2>/dev/null)
  [ "$already" = "True" ] && continue

  # Parse fields
  ticket_id=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('ticket_id','unknown'))")
  title=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('title',''))")
  status=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('status',''))")
  priority=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('priority',''))")
  severity=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('severity',''))")
  escalated_at=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('escalated_at',''))")
  tags=$(python3 -c "import json; d=json.load(open('$f')); print(', '.join(d.get('tags',[])))")

  msg_id="MSG-$(printf '%03d' $next_id)"

  # Build the inbox block
  block="
---
id: $msg_id
from: Dashboard
sent_at: $escalated_at
priority: high
status: unread
subject: Escalation — $ticket_id
body: |
  Ticket escalated to Claude from Jacob's dashboard (mobile or web).

  ticket_id: $ticket_id
  title:     $title
  status:    $status
  priority:  $priority
  severity:  $severity
  tags:      $tags

  Please investigate and update the ticket status in:
  ~/claude/OpenClaw-s-Brain/System/Design-Backlog/rebuild-tickets/$ticket_id.md
  Then run: bash /home/jacobbarkley/claude/claw-dashboard/scripts/push-dashboard-data.sh
---
"

  # Insert after "## Messages" line
  python3 - << PYEOF
content = open("$INBOX").read()
block = """$block"""
content = content.replace("## Messages\n", "## Messages\n" + block)
open("$INBOX", "w").write(content)
PYEOF

  # Mark as processed
  python3 -c "
import json
d = json.load(open('$f'))
d['processed'] = True
json.dump(d, open('$f', 'w'), indent=2)
"

  echo "Processed $ticket_id -> $msg_id"
  next_id=$(( next_id + 1 ))
  processed=$(( processed + 1 ))
done

if [ "$processed" -gt 0 ]; then
  # Commit the processed flags back to repo
  git add data/escalations/
  git commit -m "ops: mark $processed escalation(s) processed"
  GIT_SSH_COMMAND="ssh -i $HOME/.ssh/id_ed25519_claude" git push origin main
  echo "Committed processed flags"
else
  echo "No new escalations"
fi
