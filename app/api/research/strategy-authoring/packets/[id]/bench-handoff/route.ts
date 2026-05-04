// POST /api/research/strategy-authoring/packets/[id]/bench-handoff
//
// Seeds trial-ledger rows for an APPROVED Strategy Authoring Packet. This is a
// handoff boundary only: it does not launch a campaign or call a broker.

import { NextRequest, NextResponse } from "next/server"

import {
  preparePacketBenchHandoff,
} from "@/lib/research-lab-strategy-authoring-bench-handoff.server"

import {
  normalizeScope,
  optionalString,
} from "../../../../specs/_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PACKET_ID_RE = /^packet_[0-9A-HJKMNP-TV-Z]{26}$/

interface BenchHandoffPostBody {
  scope?: unknown
  requested_by?: unknown
  dry_run?: unknown
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  let body: BenchHandoffPostBody
  try {
    body = (await req.json()) as BenchHandoffPostBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  try {
    const { id } = await ctx.params
    const packetId = normalizePacketId(decodeURIComponent(id))
    const result = await preparePacketBenchHandoff({
      scope: normalizeScope(body.scope),
      packetId,
      persist: body.dry_run === true ? false : true,
    })
    return NextResponse.json({
      ok: true,
      dry_run: body.dry_run === true,
      requested_by: optionalString(body.requested_by) ?? "jacob",
      ...result,
    })
  } catch (error) {
    return errorResponse(error, "Invalid strategy authoring bench handoff request")
  }
}

function normalizePacketId(input: string): string {
  const value = input.trim()
  if (!PACKET_ID_RE.test(value)) throw new Error("packet_id must use packet_${ULID}.")
  return value
}

function errorResponse(error: unknown, fallback: string): NextResponse {
  const status = typeof (error as { status?: unknown }).status === "number"
    ? (error as { status: number }).status
    : 400
  const payload = (error as { payload?: unknown }).payload
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : fallback,
      ...(payload ? { payload } : {}),
    },
    { status },
  )
}
