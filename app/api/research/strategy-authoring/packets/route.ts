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
  parseClarificationAnswers,
  parseClarificationRequest,
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
  clarification_answers?: unknown
  clarification_request?: unknown
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
    const clarificationAnswers = parseClarificationAnswers(body.clarification_answers)
    const result = await createStrategyAuthoringPacketWithTalon({
      scope,
      idea,
      questionnaire,
      clarificationAnswers,
      clarificationRequest: parseClarificationRequest(body.clarification_request),
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
    const validationIssues = typeof payload === "object" && payload && "validation_issues" in payload
      ? (payload as { validation_issues?: unknown }).validation_issues
      : null
    if (validationIssues) {
      console.error("[strategy-authoring/packets] request failed validation", {
        error: error instanceof Error ? error.message : "Invalid strategy authoring packet request",
        validation_issues: validationIssues,
      })
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid strategy authoring packet request",
        ...(validationIssues ? { validation_issues: validationIssues } : {}),
        debug: {
          route: "POST /api/research/strategy-authoring/packets",
          source_file: "app/api/research/strategy-authoring/packets/route.ts",
          source_function: "POST",
          upstream_source_file: typeof payload === "object" && payload && "source_file" in payload
            ? (payload as { source_file?: unknown }).source_file
            : null,
          upstream_source_function: typeof payload === "object" && payload && "source_function" in payload
            ? (payload as { source_function?: unknown }).source_function
            : null,
          section_key: typeof payload === "object" && payload && "section_key" in payload
            ? (payload as { section_key?: unknown }).section_key
            : null,
          error_code: typeof payload === "object" && payload && "error_code" in payload
            ? (payload as { error_code?: unknown }).error_code
            : null,
          hint: "Copy the full JSON response, not only the top-line error. The payload.validation_issues field contains exact failing paths when available.",
        },
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
