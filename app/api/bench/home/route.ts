import { NextResponse } from "next/server"
import { loadBenchHomeIndex } from "@/lib/vires-bench"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const index = await loadBenchHomeIndex()
  if (!index) {
    return NextResponse.json(
      { error: "No bench index - run scripts/pull-bench-data.py or wait for Codex publication" },
      { status: 404 },
    )
  }

  return NextResponse.json(index, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  })
}
