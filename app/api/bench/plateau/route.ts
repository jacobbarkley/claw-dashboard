import { NextResponse } from "next/server"
import { loadPlateauPrimerData } from "@/lib/vires-bench"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const payload = await loadPlateauPrimerData()
  if (!payload) {
    return NextResponse.json(
      { error: "No plateau primer data has been published yet" },
      { status: 404 },
    )
  }

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  })
}
