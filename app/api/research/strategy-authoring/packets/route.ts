// GET/POST /api/research/strategy-authoring/packets
//
// Talon Strategy Authoring Packet v1 entrypoint. POST synthesizes a governed
// packet from an existing idea + questionnaire, persists it, validates it, and
// returns a compiler preview. It does not launch bench jobs.

import { NextRequest, NextResponse } from "next/server"

import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import {
  loadStrategyAuthoringPackets,
} from "@/lib/research-lab-strategy-authoring.server"
import {
  createStrategyAuthoringPacketWithTalon,
  parseStrategyAuthoringQuestionnaire,
} from "@/lib/research-lab-strategy-authoring-orchestration.server"

import {
  normalizeScope,
  optionalString,
  requiredString,
  safePathSegment,
} from "../../specs/_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

interface PacketPostBody {
  idea_id?: unknown
  scope?: unknown
  questionnaire?: unknown
  operator_id?: unknown
  revised_from?: unknown
  revision_index?: unknown
  dry_run?: unknown
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const scope = normalizeScope({
      user_id: url.searchParams.get("user_id"),
      account_id: url.searchParams.get("account_id"),
      strategy_group_id: url.searchParams.get("strategy_group_id"),
    })
    const packets = await loadStrategyAuthoringPackets(scope)
    return NextResponse.json(
      { ok: true, packets, count: packets.length },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load strategy authoring packets" },
      { status: 400 },
    )
  }
}

export async function POST(req: NextRequest) {
  let body: PacketPostBody
  try {
    body = (await req.json()) as PacketPostBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  try {
    const scope = normalizeScope(body.scope)
    const ideaId = safePathSegment(requiredString(body.idea_id, "idea_id"), "idea_id")
    const idea = await loadIdeaById(ideaId, scope)
    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 })
    }

    const questionnaire = parseStrategyAuthoringQuestionnaire(body.questionnaire)
    const result = await createStrategyAuthoringPacketWithTalon({
      scope,
      idea,
      questionnaire,
      operatorId: optionalString(body.operator_id) ?? idea.created_by ?? "jacob",
      revisedFrom: optionalString(body.revised_from),
      revisionIndex: normalizeRevisionIndex(body.revision_index),
      persist: body.dry_run !== true,
    })

    return NextResponse.json(
      {
        ok: true,
        packet: result.packet,
        compile_result: result.compile_result,
        validation_issues: result.validation_issues,
        persisted: result.persisted ?? null,
      },
      { status: result.persisted ? 201 : 200 },
    )
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 400
    const payload = (error as { payload?: unknown }).payload
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid strategy authoring packet request",
        ...(payload ? { payload } : {}),
      },
      { status },
    )
  }
}

function normalizeRevisionIndex(input: unknown): number | null {
  if (input == null) return null
  if (typeof input !== "number" || !Number.isInteger(input)) {
    throw new Error("revision_index must be an integer")
  }
  return input
}
