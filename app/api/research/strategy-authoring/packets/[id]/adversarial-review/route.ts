// POST /api/research/strategy-authoring/packets/[id]/adversarial-review
//
// Runs the blind adversarial reviewer for Strategy Authoring Packet v1.
// The route records review output only; approval remains a separate lifecycle
// transition so the reviewer cannot implicitly promote a packet.

import { NextRequest, NextResponse } from "next/server"

import {
  runBlindAdversarialReview,
} from "@/lib/research-lab-strategy-authoring-adversarial.server"

import {
  normalizeScope,
  optionalString,
} from "../../../../specs/_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const PACKET_ID_RE = /^packet_[0-9A-HJKMNP-TV-Z]{26}$/

interface AdversarialReviewPostBody {
  scope?: unknown
  requested_by?: unknown
  dry_run?: unknown
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  let body: AdversarialReviewPostBody
  try {
    body = (await req.json()) as AdversarialReviewPostBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  try {
    const { id } = await ctx.params
    const packetId = normalizePacketId(decodeURIComponent(id))
    const result = await runBlindAdversarialReview({
      scope: normalizeScope(body.scope),
      packetId,
      actor: optionalString(body.requested_by) ?? "jacob",
      persist: body.dry_run === true ? false : true,
    })
    return NextResponse.json({
      ok: true,
      dry_run: body.dry_run === true,
      ...result,
    })
  } catch (error) {
    return errorResponse(error, "Invalid blind adversarial review request")
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
