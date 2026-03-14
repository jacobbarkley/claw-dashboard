import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const token = process.env.GITHUB_TOKEN
  const url =
    "https://raw.githubusercontent.com/jacobbarkley/claw-dashboard/main/data/trading.json"

  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `token ${token}` } : {},
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `GitHub returned ${res.status}` },
        { status: 502 }
      )
    }

    const data = await res.json()
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
