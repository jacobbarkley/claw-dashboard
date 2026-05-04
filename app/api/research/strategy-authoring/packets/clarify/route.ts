// POST /api/research/strategy-authoring/packets/clarify
//
// Talon's pre-draft clarification surface. This route builds the Strategy
// Authoring Context Packet, asks only for missing high-impact inputs, and does
// not persist a packet or launch a bench job.

import { NextRequest, NextResponse } from "next/server"

import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import {
  createStrategyAuthoringClarification,
  parseClarificationAnswers,
  parseStrategyAuthoringQuestionnaire,
} from "@/lib/research-lab-strategy-authoring-orchestration.server"

import {
  normalizeScope,
  requiredString,
  safePathSegment,
} from "../../../specs/_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

interface ClarifyPostBody {
  idea_id?: unknown
  scope?: unknown
  questionnaire?: unknown
  clarification_answers?: unknown
}

export async function POST(req: NextRequest) {
  let body: ClarifyPostBody
  try {
    body = (await req.json()) as ClarifyPostBody
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

    const result = await createStrategyAuthoringClarification({
      scope,
      idea,
      questionnaire: parseStrategyAuthoringQuestionnaire(body.questionnaire),
      clarificationAnswers: parseClarificationAnswers(body.clarification_answers),
    })

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 400
    const payload = (error as { payload?: unknown }).payload
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid Talon clarification request",
        ...(payload ? { payload } : {}),
      },
      { status },
    )
  }
}
