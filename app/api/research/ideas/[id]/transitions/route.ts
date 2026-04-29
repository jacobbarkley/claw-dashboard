// POST /api/research/ideas/[id]/transitions
//
// Phase A split for Lab Pipeline v2: lifecycle status changes live here
// instead of the overloaded idea PATCH route. Operators may move ideas
// between human-managed states only; QUEUED/ACTIVE remain system-written.

import { NextRequest, NextResponse } from "next/server"

import type { IdeaStatus, ScopeTriple } from "@/lib/research-lab-contracts"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"

import {
  OPERATOR_ALLOWED_TRANSITIONS,
  normalizeScope,
  persistIdeaArtifact,
  safePathSegment,
} from "../_shared"

interface TransitionBody {
  status?: unknown
  scope?: unknown
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  let ideaId: string
  try {
    ideaId = safePathSegment(decodeURIComponent(id), "idea_id")
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid idea_id" },
      { status: 400 },
    )
  }

  let body: TransitionBody
  try {
    body = (await req.json()) as TransitionBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  const raw = typeof body.status === "string" ? body.status.trim().toUpperCase() : ""
  if (!(raw in OPERATOR_ALLOWED_TRANSITIONS)) {
    return NextResponse.json(
      { error: "status must be one of DRAFT | READY | QUEUED | ACTIVE | SHELVED | RETIRED" },
      { status: 400 },
    )
  }
  const next = raw as IdeaStatus
  if (next === "QUEUED" || next === "ACTIVE") {
    return NextResponse.json(
      { error: `${next} is system-written by the Lab worker, not operator-writable.` },
      { status: 400 },
    )
  }

  let scope: ScopeTriple
  try {
    scope = normalizeScope(body.scope)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid scope" },
      { status: 400 },
    )
  }
  const existing = await loadIdeaById(ideaId, scope)
  if (!existing) {
    return NextResponse.json({ error: `Idea not found: ${ideaId}` }, { status: 404 })
  }

  if (next === existing.status) {
    return NextResponse.json({ ok: true, mode: "noop", file: null, commit_sha: null, idea: existing })
  }

  const allowed = OPERATOR_ALLOWED_TRANSITIONS[existing.status] ?? []
  if (!allowed.includes(next)) {
    return NextResponse.json(
      {
        error:
          `Operators cannot transition ${existing.status} -> ${next}. ` +
          `Allowed from ${existing.status}: ${allowed.length > 0 ? allowed.join(", ") : "none"}.`,
      },
      { status: 400 },
    )
  }

  if (next === "READY" && existing.strategy_ref.kind !== "REGISTERED") {
    return NextResponse.json(
      {
        error:
          "Ideas can't be marked READY until a registered strategy exists. " +
          "Draft and register a StrategySpec first.",
      },
      { status: 400 },
    )
  }

  const updated = { ...existing, status: next }
  try {
    const persisted = await persistIdeaArtifact(
      updated,
      scope,
      `research lab: transition idea ${ideaId} to ${next}`,
    )
    return NextResponse.json({ ok: true, ...persisted, idea: updated })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown persistence failure"
    return NextResponse.json({ error: `Failed to persist idea: ${detail}` }, { status: 500 })
  }
}
