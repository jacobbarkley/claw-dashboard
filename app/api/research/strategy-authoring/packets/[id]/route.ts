// GET/PATCH /api/research/strategy-authoring/packets/[id]
//
// Lifecycle surface for Strategy Authoring Packet v1. Mutations are deliberately
// narrow: confirm/edit the strategy slug, or perform guarded status transitions.

import { NextRequest, NextResponse } from "next/server"

import type { ImplementationPriority, StrategyAuthoringPacketStatus } from "@/lib/research-lab-contracts"
import {
  confirmPacketAssumption,
  confirmPacketStrategyId,
  loadPacketLifecycleView,
  transitionPacketStatus,
} from "@/lib/research-lab-strategy-authoring-lifecycle.server"

import {
  normalizeScope,
  optionalString,
  requiredString,
} from "../../../specs/_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PACKET_ID_RE = /^packet_[0-9A-HJKMNP-TV-Z]{26}$/
const STATUSES: StrategyAuthoringPacketStatus[] = [
  "DRAFT",
  "REVIEW",
  "ADVERSARIAL",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
]
const PRIORITIES: ImplementationPriority[] = ["LOW", "MEDIUM", "HIGH"]

interface PacketPatchBody {
  action?: unknown
  scope?: unknown
  strategy_id?: unknown
  next_status?: unknown
  requested_by?: unknown
  field_path?: unknown
  implementation_notes?: unknown
  priority?: unknown
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params
    const packetId = normalizePacketId(decodeURIComponent(id))
    const url = new URL(req.url)
    const scope = normalizeScope({
      user_id: url.searchParams.get("user_id"),
      account_id: url.searchParams.get("account_id"),
      strategy_group_id: url.searchParams.get("strategy_group_id"),
    })
    const view = await loadPacketLifecycleView({ packetId, scope })
    if (!view) {
      return NextResponse.json({ error: "Strategy authoring packet not found" }, { status: 404 })
    }
    return NextResponse.json(
      { ok: true, ...view },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return errorResponse(error, "Invalid strategy authoring packet request")
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  let body: PacketPatchBody
  try {
    body = (await req.json()) as PacketPatchBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  try {
    const { id } = await ctx.params
    const packetId = normalizePacketId(decodeURIComponent(id))
    const scope = normalizeScope(body.scope)
    const action = requiredString(body.action, "action")
    const actor = optionalString(body.requested_by) ?? "jacob"

    if (action === "confirm_strategy_id") {
      const result = await confirmPacketStrategyId({
        scope,
        packetId,
        strategyId: optionalString(body.strategy_id),
        actor,
      })
      return NextResponse.json({ ok: true, ...result })
    }

    if (action === "confirm_assumption") {
      const result = await confirmPacketAssumption({
        scope,
        packetId,
        fieldPath: requiredString(body.field_path, "field_path"),
        actor,
      })
      return NextResponse.json({ ok: true, ...result })
    }

    if (action === "transition_status") {
      const result = await transitionPacketStatus({
        scope,
        packetId,
        nextStatus: normalizeStatus(body.next_status),
        actor,
        implementationNotes: optionalString(body.implementation_notes),
        priority: normalizePriority(body.priority),
      })
      return NextResponse.json({ ok: true, ...result })
    }

    return NextResponse.json(
      { error: "action must be confirm_strategy_id, confirm_assumption, or transition_status" },
      { status: 400 },
    )
  } catch (error) {
    return errorResponse(error, "Invalid strategy authoring packet lifecycle request")
  }
}

function normalizePacketId(input: string): string {
  const value = input.trim()
  if (!PACKET_ID_RE.test(value)) throw new Error("packet_id must use packet_${ULID}.")
  return value
}

function normalizeStatus(input: unknown): StrategyAuthoringPacketStatus {
  const raw = typeof input === "string" ? input.trim().toUpperCase() : ""
  if (STATUSES.includes(raw as StrategyAuthoringPacketStatus)) {
    return raw as StrategyAuthoringPacketStatus
  }
  throw new Error(`next_status must be one of ${STATUSES.join(" | ")}`)
}

function normalizePriority(input: unknown): ImplementationPriority | null {
  if (input == null) return null
  const raw = typeof input === "string" ? input.trim().toUpperCase() : ""
  if (PRIORITIES.includes(raw as ImplementationPriority)) return raw as ImplementationPriority
  throw new Error(`priority must be one of ${PRIORITIES.join(" | ")}`)
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
