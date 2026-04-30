// POST /api/research/specs/[id]/revise-with-talon
//
// Propose-only conversational endpoint for an existing AI_DRAFTED spec.
// The operator chats with Talon; on each turn Talon either:
//   - asks a clarifying question (kind=clarification), or
//   - returns a proposed revision (kind=revision + proposal + assessment).
//
// This endpoint NEVER persists. The proposal is returned to the client
// and remains a proposal until the operator deliberately taps "Apply" —
// which hits the sibling apply-talon-revision endpoint with the same
// proposal+assessment payload.
//
// BLOCKED revisions are still returned (with verdict=BLOCKED in
// data_readiness) so the UI can render a "blocked, can't apply" affordance.

import { anthropic } from "@ai-sdk/anthropic"
import { generateText, Output } from "ai"
import { NextRequest, NextResponse } from "next/server"

import type { ScopeTriple, StrategySpecV1 } from "@/lib/research-lab-contracts"
import {
  assessDataReadiness,
  dataReadinessForResponse,
  loadDataCapabilityCatalog,
} from "@/lib/research-lab-data-capabilities.server"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import { loadStrategySpecById } from "@/lib/research-lab-specs.server"
import {
  applyModelVerdictFloor,
  DATA_READINESS_PROMPT_RULES,
  formatCatalogForPrompt,
  includeProposalRequirements,
  reviseGenerationSchema,
  reviseOutputSchema,
} from "@/lib/research-lab-talon.server"

import {
  normalizeScope,
  requiredString,
  safePathSegment,
} from "../../_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const PROMPT_VERSION = "talon_spec_revision.v1"
const DEFAULT_MODEL = "claude-sonnet-4-6"
const MAX_CONVERSATION_TURNS_IN_PROMPT = 20

interface ReviseBody {
  scope?: unknown
  conversation?: unknown
  message?: unknown
}

interface ConversationMessage {
  role: "operator" | "talon"
  content: string
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: specIdParam } = await ctx.params

  let body: ReviseBody
  try {
    body = (await req.json()) as ReviseBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  let scope: ScopeTriple
  let specId: string
  let message: string
  let conversation: ConversationMessage[]
  try {
    scope = normalizeScope(body.scope)
    specId = safePathSegment(requiredString(specIdParam, "spec_id"), "spec_id")
    message = requiredString(body.message, "message").trim()
    conversation = parseConversation(body.conversation)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid revise request" },
      { status: 400 },
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY missing from environment" },
      { status: 503 },
    )
  }

  const spec = await loadStrategySpecById(specId, scope)
  if (!spec) {
    return NextResponse.json({ error: `Strategy spec not found: ${specId}` }, { status: 404 })
  }
  if (spec.authoring_mode !== "AI_DRAFTED") {
    return NextResponse.json(
      { error: "Talon revise is only available on AI_DRAFTED specs." },
      { status: 409 },
    )
  }
  if (spec.state !== "DRAFTING" && spec.state !== "AWAITING_APPROVAL") {
    return NextResponse.json(
      { error: `Spec state is ${spec.state}; revisions require DRAFTING or AWAITING_APPROVAL.` },
      { status: 409 },
    )
  }

  const idea = await loadIdeaById(spec.idea_id, scope)
  if (!idea) {
    return NextResponse.json({ error: `Parent idea not found: ${spec.idea_id}` }, { status: 404 })
  }

  let catalog: Awaited<ReturnType<typeof loadDataCapabilityCatalog>>
  try {
    catalog = await loadDataCapabilityCatalog()
  } catch (error) {
    return NextResponse.json(
      {
        error: "data_capability_catalog_unavailable",
        detail: error instanceof Error ? error.message : "Data capability catalog is unavailable",
      },
      { status: 503 },
    )
  }

  const model = process.env.TALON_SPEC_DRAFTING_MODEL ?? DEFAULT_MODEL
  const prompt = buildPrompt({ idea, spec, catalog, conversation, message })

  let parsed: ReturnType<typeof reviseOutputSchema.parse>
  let rawCompletion: string | null = null
  try {
    const result = await generateText({
      model: anthropic(model),
      output: Output.object({ schema: reviseGenerationSchema }),
      temperature: 0.4,
      prompt,
    })
    parsed = reviseOutputSchema.parse(result.output)
    rawCompletion = typeof result.text === "string" ? result.text : null
  } catch (error) {
    return NextResponse.json(
      {
        error: "talon_failed",
        talon_error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    )
  }

  if (parsed.kind === "revision" && (!parsed.proposal || !parsed.assessment)) {
    return NextResponse.json(
      {
        error: "talon_returned_incomplete_revision",
        detail: "Talon returned kind=revision but did not include proposal+assessment.",
      },
      { status: 502 },
    )
  }

  if (parsed.kind === "clarification") {
    return NextResponse.json({ kind: "clarification", reply: parsed.reply })
  }

  // kind === "revision" with non-null proposal/assessment guaranteed by check above.
  const proposal = parsed.proposal!
  const assessment = parsed.assessment!

  const readiness = applyModelVerdictFloor(
    assessDataReadiness({
      catalog,
      sleeve: idea.sleeve,
      requirements: includeProposalRequirements({
        requiredData: proposal.required_data,
        assessedRequirements: assessment.requirements,
        catalog,
      }),
    }),
    assessment,
  )

  // Always return the proposal — applying it is a separate operator action
  // via the apply-talon-revision endpoint. BLOCKED proposals come back too
  // so the UI can render the verdict + reasons but disable Apply.
  return NextResponse.json({
    kind: "revision",
    reply: parsed.reply,
    proposal,
    assessment,
    data_readiness: dataReadinessForResponse(readiness),
    base_spec_version: spec.spec_version,
    model,
    catalog_version: catalog.catalog_version,
    prompt_version: PROMPT_VERSION,
    raw_completion: rawCompletion,
  })
}

function parseConversation(input: unknown): ConversationMessage[] {
  if (!Array.isArray(input)) return []
  const out: ConversationMessage[] = []
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue
    const e = entry as Record<string, unknown>
    const role = e.role
    const content = e.content
    if ((role !== "operator" && role !== "talon") || typeof content !== "string") continue
    const trimmed = content.trim()
    if (!trimmed) continue
    out.push({ role, content: trimmed })
  }
  return out
}

function buildPrompt({
  idea,
  spec,
  catalog,
  conversation,
  message,
}: {
  idea: { sleeve: string; title: string; thesis: string }
  spec: StrategySpecV1
  catalog: Awaited<ReturnType<typeof loadDataCapabilityCatalog>>
  conversation: ConversationMessage[]
  message: string
}): string {
  const trimmedConversation = conversation.slice(-MAX_CONVERSATION_TURNS_IN_PROMPT)
  const conversationBlock = trimmedConversation.length
    ? trimmedConversation
        .map(entry => `${entry.role === "operator" ? "Operator" : "Talon"}: ${entry.content}`)
        .join("\n")
    : "(none yet — this is the first revision message)"

  return [
    "You are Talon's spec-revision mode in the Vires Research Lab.",
    "You are iterating with the operator on an existing StrategySpecV1.",
    "Return only the structured object requested by the schema. Do not invent backtest results.",
    "",
    "Output rules:",
    '- Return kind="clarification" + a brief reply (under 3 sentences) when you need more information before revising. Do NOT include proposal/assessment.',
    '- Return kind="revision" + a brief reply summarizing what you changed, plus a complete proposal + assessment, when you have enough information to apply changes.',
    "- Keep replies short and snappy — the operator is chatting, not reading a report.",
    "- Default to revising when the operator's message is concrete; default to one clarifying question when it's vague.",
    "- When revising: reuse the existing spec's structure and only change what the operator asked for, plus anything logically required by that change.",
    "",
    DATA_READINESS_PROMPT_RULES,
    "",
    `Idea sleeve: ${idea.sleeve}`,
    `Idea title: ${idea.title}`,
    `Idea thesis: ${idea.thesis}`,
    "",
    `Current spec (v${spec.spec_version}, state=${spec.state}):`,
    formatSpecForPrompt(spec),
    "",
    `Data capability catalog (${catalog.catalog_version}):`,
    formatCatalogForPrompt(catalog),
    "",
    "Conversation so far:",
    conversationBlock,
    "",
    `Operator's latest message:`,
    message,
  ].join("\n")
}

function formatSpecForPrompt(spec: StrategySpecV1): string {
  const universe = recordDescription(spec.universe)
  const riskModel = recordDescription(spec.risk_model)
  const sweep = recordDescription(spec.sweep_params)
  return [
    `signal_logic: ${spec.signal_logic}`,
    `entry_rules: ${spec.entry_rules}`,
    `exit_rules: ${spec.exit_rules}`,
    `universe: ${universe}`,
    `risk_model: ${riskModel}`,
    `sweep_params: ${sweep}`,
    `required_data: ${spec.required_data.join(", ") || "(none)"}`,
    `benchmark: ${spec.benchmark ?? "(unset)"}`,
    `acceptance_criteria: min_sharpe=${spec.acceptance_criteria.min_sharpe}, max_drawdown=${spec.acceptance_criteria.max_drawdown}, min_hit_rate=${spec.acceptance_criteria.min_hit_rate}${spec.acceptance_criteria.other ? `, other=${spec.acceptance_criteria.other}` : ""}`,
    `candidate_strategy_family: ${spec.candidate_strategy_family ?? "(unset)"}`,
    `implementation_notes: ${spec.implementation_notes ?? "(unset)"}`,
  ].join("\n")
}

function recordDescription(record: Record<string, unknown>): string {
  const description = record["description"]
  if (typeof description === "string" && description.trim()) return description.trim()
  if (Object.keys(record).length === 0) return "(unset)"
  return JSON.stringify(record)
}
