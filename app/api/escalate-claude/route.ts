import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

const INBOX_PATH = process.env.CLAUDE_INBOX_PATH ?? "/home/jacobbarkley/.openclaw/workspace/claude-inbox.md"

function nextMsgId(content: string): string {
  const ids = [...content.matchAll(/^id: MSG-(\d+)/gm)].map(m => parseInt(m[1]))
  const max = ids.length > 0 ? Math.max(...ids) : 0
  return `MSG-${String(max + 1).padStart(3, "0")}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { ticket_id, title, status, notes } = body

    if (!ticket_id) {
      return NextResponse.json({ error: "ticket_id required" }, { status: 400 })
    }

    const inbox = await fs.readFile(INBOX_PATH, "utf-8")
    const msgId = nextMsgId(inbox)
    const now = new Date().toISOString().replace("T", "T").slice(0, 19) + "-05:00"

    const block = `
---
id: ${msgId}
from: Dashboard
sent_at: ${now}
priority: high
status: unread
subject: Escalation — ${ticket_id}
body: |
  Ticket escalated to Claude from the dashboard.

  ticket_id: ${ticket_id}
  title: ${title ?? "(unknown)"}
  status: ${status ?? "(unknown)"}
  notes: ${notes ?? "(none provided)"}

  Please investigate and update the ticket status.
---
`

    // Insert after "## Messages" line
    const updated = inbox.replace(/## Messages\n/, `## Messages\n${block}`)
    await fs.writeFile(INBOX_PATH, updated, "utf-8")

    return NextResponse.json({ ok: true, msg_id: msgId })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to write inbox" }, { status: 500 })
  }
}
