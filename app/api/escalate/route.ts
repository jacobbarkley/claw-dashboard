import { NextRequest, NextResponse } from "next/server"

const GITHUB_REPO = "jacobbarkley/claw-dashboard"
const GITHUB_API = "https://api.github.com"

export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return NextResponse.json({ error: "GITHUB_TOKEN not configured" }, { status: 500 })
  }

  try {
    const body = await req.json()
    const { ticket_id, title, status, priority, severity, last_updated, tags } = body

    if (!ticket_id) {
      return NextResponse.json({ error: "ticket_id required" }, { status: 400 })
    }

    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19)
    const sentAt = now.toISOString().slice(0, 19) + "-05:00"
    const filename = `data/escalations/${ticket_id}-${timestamp}.json`

    const escalation = {
      ticket_id,
      title: title ?? "",
      status: status ?? "",
      priority: priority ?? "",
      severity: severity ?? "",
      last_updated: last_updated ?? "",
      tags: tags ?? [],
      escalated_at: sentAt,
      processed: false,
    }

    const content = Buffer.from(JSON.stringify(escalation, null, 2)).toString("base64")

    const res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${filename}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        message: `escalation: ${ticket_id} from dashboard`,
        content,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error("GitHub API error:", res.status, err)
      return NextResponse.json({ error: "GitHub API error", status: res.status, detail: err }, { status: 500 })
    }

    return NextResponse.json({ ok: true, file: filename })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
