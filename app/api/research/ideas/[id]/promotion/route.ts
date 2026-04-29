// POST /api/research/ideas/[id]/promotion
//
// Phase A split for Lab Pipeline v2: promotion intent and the explicit
// promote_to_campaign override live here instead of the overloaded idea
// PATCH route.

import { NextRequest, NextResponse } from "next/server"

import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import type { ScopeTriple } from "@/lib/research-lab-contracts"

import {
  normalizeScope,
  parsePromotionTarget,
  persistIdeaArtifact,
  safePathSegment,
} from "../_shared"

interface PromotionBody {
  promotion_target?: unknown
  promote_to_campaign?: unknown
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

  let body: PromotionBody
  try {
    body = (await req.json()) as PromotionBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  const hasPromotionTarget = "promotion_target" in body
  const hasPromoteToCampaign = "promote_to_campaign" in body
  if (!hasPromotionTarget && !hasPromoteToCampaign) {
    return NextResponse.json(
      { error: "promotion_target or promote_to_campaign required" },
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
  if (existing.strategy_ref.kind !== "REGISTERED") {
    return NextResponse.json(
      {
        error:
          "Promotion intent requires a registered strategy. " +
          "Draft and register a StrategySpec before assigning a promotion slot.",
      },
      { status: 400 },
    )
  }

  let promotionTarget = existing.promotion_target ?? null
  if (hasPromotionTarget) {
    const parsed = parsePromotionTarget(body.promotion_target)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    promotionTarget = parsed.value
  }

  let promoteToCampaign = existing.promote_to_campaign === true
  if (hasPromoteToCampaign) {
    if (typeof body.promote_to_campaign !== "boolean") {
      return NextResponse.json(
        { error: "promote_to_campaign must be a boolean" },
        { status: 400 },
      )
    }
    promoteToCampaign = body.promote_to_campaign
  }

  const updated = {
    ...existing,
    ...(promotionTarget ? { promotion_target: promotionTarget } : { promotion_target: null }),
    ...(promoteToCampaign ? { promote_to_campaign: true } : { promote_to_campaign: false }),
  }

  try {
    const persisted = await persistIdeaArtifact(
      updated,
      scope,
      `research lab: update promotion intent on ${ideaId}`,
    )
    return NextResponse.json({ ok: true, ...persisted, idea: updated })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown persistence failure"
    return NextResponse.json({ error: `Failed to persist idea: ${detail}` }, { status: 500 })
  }
}
