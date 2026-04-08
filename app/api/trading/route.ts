import { promises as fs } from "fs"
import path from "path"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const RAW_BASE = "https://raw.githubusercontent.com/jacobbarkley/claw-dashboard/main/data"

async function readLocalJson(filename: string) {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data", filename), "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function fetchJson(path: string, token: string | undefined) {
  const res = await fetch(`${RAW_BASE}/${path}`, {
    headers: token ? { Authorization: `token ${token}` } : {},
    cache: "no-store",
  })
  return res.ok ? res.json() : null
}

export async function GET() {
  const token = process.env.GITHUB_TOKEN

  try {
    const data =
      (await readLocalJson("operator-feed.json")) ??
      (await readLocalJson("trading.json")) ??
      (await fetchJson("operator-feed.json", token)) ??
      (await fetchJson("trading.json", token))

    if (!data) {
      return NextResponse.json(
        { error: "No operator-feed.json or trading.json available locally or on GitHub" },
        { status: 502 }
      )
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
