// GET/PATCH/DELETE /api/research/specs/[id]
//
// Draft-friendly StrategySpec CRUD. Approval/implementation transitions
// intentionally wait for Phase E's dedicated approve route.

import { NextRequest, NextResponse } from "next/server"

import type { ScopeTriple, StrategySpecV1 } from "@/lib/research-lab-contracts"
import { loadStrategySpecById } from "@/lib/research-lab-specs.server"

import {
  deleteStrategySpecArtifact,
  normalizeScope,
  optionalString,
  parseAuthoringMode,
  parseCrudWritableSpecState,
  persistStrategySpecArtifact,
  recordOrEmpty,
  requiredString,
  safePathSegment,
  stringListOrEmpty,
  validateStrategySpec,
} from "../_shared"

interface PatchBody {
  scope?: unknown
  spec_version?: unknown
  authoring_mode?: unknown
  authored_by?: unknown
  state?: unknown
  signal_logic?: unknown
  universe?: unknown
  entry_rules?: unknown
  exit_rules?: unknown
  risk_model?: unknown
  sweep_params?: unknown
  required_data?: unknown
  benchmark?: unknown
  acceptance_criteria?: unknown
  candidate_strategy_family?: unknown
  implementation_notes?: unknown
  parent_spec_id?: unknown
  registered_strategy_id?: unknown
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveSpec(req, ctx)
  if ("response" in resolved) return resolved.response
  return NextResponse.json({ spec: resolved.spec })
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }
  const resolved = await resolveSpec(req, ctx, body.scope)
  if ("response" in resolved) return resolved.response

  if (resolved.spec.state !== "DRAFTING" && resolved.spec.state !== "AWAITING_APPROVAL") {
    return NextResponse.json(
      {
        error:
          `${resolved.spec.state} specs are not writable through generic StrategySpec CRUD. ` +
          "Use the dedicated approval/implementation route for lifecycle transitions.",
      },
      { status: 409 },
    )
  }

  let updated: StrategySpecV1
  try {
    const specVersionRaw =
      typeof body.spec_version === "number" ? body.spec_version : resolved.spec.spec_version
    updated = {
      ...resolved.spec,
      spec_version: Number.isFinite(specVersionRaw)
        ? Math.max(1, Math.floor(specVersionRaw))
        : resolved.spec.spec_version,
      authoring_mode: "authoring_mode" in body
        ? parseAuthoringMode(body.authoring_mode, resolved.spec.authoring_mode)
        : resolved.spec.authoring_mode,
      authored_by: "authored_by" in body
        ? requiredString(body.authored_by, "authored_by")
        : resolved.spec.authored_by,
      state: "state" in body
        ? parseCrudWritableSpecState(body.state, resolved.spec.state)
        : resolved.spec.state,
      signal_logic: "signal_logic" in body
        ? requiredString(body.signal_logic, "signal_logic")
        : resolved.spec.signal_logic,
      universe: "universe" in body ? recordOrEmpty(body.universe) : resolved.spec.universe,
      entry_rules: "entry_rules" in body
        ? requiredString(body.entry_rules, "entry_rules")
        : resolved.spec.entry_rules,
      exit_rules: "exit_rules" in body
        ? requiredString(body.exit_rules, "exit_rules")
        : resolved.spec.exit_rules,
      risk_model: "risk_model" in body ? recordOrEmpty(body.risk_model) : resolved.spec.risk_model,
      sweep_params: "sweep_params" in body ? recordOrEmpty(body.sweep_params) : resolved.spec.sweep_params,
      required_data: "required_data" in body
        ? stringListOrEmpty(body.required_data)
        : resolved.spec.required_data,
      benchmark: "benchmark" in body ? optionalString(body.benchmark) : resolved.spec.benchmark ?? null,
      acceptance_criteria: "acceptance_criteria" in body
        ? recordOrEmpty(body.acceptance_criteria)
        : resolved.spec.acceptance_criteria,
      candidate_strategy_family: "candidate_strategy_family" in body
        ? optionalString(body.candidate_strategy_family)
        : resolved.spec.candidate_strategy_family ?? null,
      implementation_notes: "implementation_notes" in body
        ? optionalString(body.implementation_notes)
        : resolved.spec.implementation_notes ?? null,
      parent_spec_id: "parent_spec_id" in body
        ? optionalString(body.parent_spec_id)
        : resolved.spec.parent_spec_id ?? null,
      registered_strategy_id: "registered_strategy_id" in body
        ? optionalString(body.registered_strategy_id)
        : resolved.spec.registered_strategy_id ?? null,
    }
    validateStrategySpec(updated)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid strategy spec" },
      { status: 400 },
    )
  }

  try {
    const persisted = await persistStrategySpecArtifact(
      updated,
      resolved.scope,
      `research lab: update strategy spec ${updated.spec_id}`,
    )
    return NextResponse.json({ ok: true, ...persisted, spec: updated })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown persistence failure"
    return NextResponse.json({ error: `Failed to persist strategy spec: ${detail}` }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveSpec(req, ctx)
  if ("response" in resolved) return resolved.response

  try {
    const persisted = await deleteStrategySpecArtifact(
      resolved.spec,
      resolved.scope,
      `research lab: delete draft strategy spec ${resolved.spec.spec_id}`,
    )
    return NextResponse.json({ ok: true, ...persisted, spec_id: resolved.spec.spec_id })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete strategy spec" },
      { status: 409 },
    )
  }
}

async function resolveSpec(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
  scopeInput?: unknown,
): Promise<{ scope: ScopeTriple; spec: StrategySpecV1 } | { response: NextResponse }> {
  const { id } = await ctx.params
  let specId: string
  let scope: ScopeTriple
  try {
    specId = safePathSegment(decodeURIComponent(id), "spec_id")
    if (scopeInput !== undefined) {
      scope = normalizeScope(scopeInput)
    } else {
      const url = new URL(req.url)
      scope = normalizeScope({
        user_id: url.searchParams.get("user_id") ?? undefined,
        account_id: url.searchParams.get("account_id") ?? undefined,
        strategy_group_id: url.searchParams.get("strategy_group_id") ?? undefined,
      })
    }
  } catch (error) {
    return {
      response: NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid strategy spec request" },
        { status: 400 },
      ),
    }
  }

  const spec = await loadStrategySpecById(specId, scope)
  if (!spec) {
    return {
      response: NextResponse.json({ error: `Strategy spec not found: ${specId}` }, { status: 404 }),
    }
  }
  return { scope, spec }
}
