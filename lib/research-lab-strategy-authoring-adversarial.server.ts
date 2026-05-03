import { anthropic } from "@ai-sdk/anthropic"
import { generateText, Output } from "ai"
import { z } from "zod"

import type {
  AdversarialCheck,
  AdversarialCheckCategory,
  AdversarialReview,
  AdversarialReviewStatus,
  ModelExecution,
  PacketCompileResultV1,
  ScopeTriple,
  StrategyAuthoringPacketV1,
} from "./research-lab-contracts"
import { compileStrategyAuthoringPacket } from "./research-lab-strategy-authoring-compiler"
import {
  loadStrategyAuthoringPacket,
  persistStrategyAuthoringPacket,
} from "./research-lab-strategy-authoring.server"
import {
  assertValidStrategyAuthoringPacket,
  REQUIRED_ADVERSARIAL_CATEGORIES,
  validateStrategyAuthoringPacket,
  type StrategyAuthoringValidationIssue,
} from "./research-lab-strategy-authoring"

const PROMPT_VERSION = "talon_blind_adversarial_review.v1"
const REVIEWER_VERSION = "research_lab.blind_adversarial_reviewer.v1"
const DEFAULT_MODEL = "claude-sonnet-4-6"
const DEFAULT_TEMPERATURE = 0.1

const ALL_ADVERSARIAL_CATEGORIES: AdversarialCheckCategory[] = [
  ...REQUIRED_ADVERSARIAL_CATEGORIES,
  "OTHER",
]

const adversarialCheckSchema = z.object({
  category: z.enum(ALL_ADVERSARIAL_CATEGORIES as [AdversarialCheckCategory, ...AdversarialCheckCategory[]]),
  passed: z.boolean(),
  finding: z.string().min(1),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
  remediation: z.string().nullable().optional(),
})

const adversarialReviewPayloadSchema = z.object({
  status: z.enum(["PASS", "FAIL", "CONDITIONAL"]),
  checks: z.array(adversarialCheckSchema).min(REQUIRED_ADVERSARIAL_CATEGORIES.length),
  overall_notes: z.string().nullable().optional(),
  conditions_for_pass: z.array(z.string()).nullable().optional(),
})

const adversarialReviewEnvelopeSchema = z.object({
  review_json: z.string().min(1),
})

export type BlindAdversarialReviewPayload = z.infer<typeof adversarialReviewPayloadSchema>

export interface RunBlindAdversarialReviewArgs {
  scope: ScopeTriple
  packetId: string
  actor?: string | null
  persist?: boolean
}

export interface ApplyBlindAdversarialReviewPayloadArgs {
  packet: StrategyAuthoringPacketV1
  payload: BlindAdversarialReviewPayload
  modelExecution: ModelExecution
  now?: string
}

export interface BlindAdversarialReviewResult {
  packet: StrategyAuthoringPacketV1
  compile_result: PacketCompileResultV1
  validation_issues: StrategyAuthoringValidationIssue[]
  raw_review_json: string
  prompt: string
  persisted?: Awaited<ReturnType<typeof persistStrategyAuthoringPacket>> | null
}

export function parseBlindAdversarialReviewPayload(rawReviewJson: string): BlindAdversarialReviewPayload {
  return adversarialReviewPayloadSchema.parse(JSON.parse(rawReviewJson))
}

export async function runBlindAdversarialReview({
  scope,
  packetId,
  persist = true,
}: RunBlindAdversarialReviewArgs): Promise<BlindAdversarialReviewResult> {
  const packet = await loadStrategyAuthoringPacket(packetId, scope)
  if (!packet) throw httpError(404, "Strategy authoring packet not found.")
  if (packet.status !== "ADVERSARIAL") {
    throw httpError(409, "Blind adversarial review can only run while the packet is ADVERSARIAL.")
  }

  const model = process.env.TALON_ADVERSARIAL_REVIEW_MODEL ?? DEFAULT_MODEL
  const prompt = buildBlindAdversarialReviewPrompt(packet)
  const started = Date.now()
  const result = await generateText({
    model: anthropic(model),
    output: Output.object({ schema: adversarialReviewEnvelopeSchema }),
    temperature: DEFAULT_TEMPERATURE,
    prompt,
  })
  const rawReviewJson = result.output.review_json
  const payload = parseBlindAdversarialReviewPayload(rawReviewJson)
  const modelExecution: ModelExecution = {
    required_capabilities: reviewerCapabilities(),
    actual_provider: "anthropic",
    actual_model_id: model,
    actual_response_id: responseIdFromResult(result),
    temperature: DEFAULT_TEMPERATURE,
    seed: null,
    max_tokens: null,
    timestamp: new Date(started).toISOString(),
  }

  const nextPacket = applyBlindAdversarialReviewPayload({
    packet,
    payload,
    modelExecution,
    now: new Date().toISOString(),
  })
  const validationIssues = validateStrategyAuthoringPacket(nextPacket)
  const errors = validationIssues.filter(issue => issue.severity === "error")
  if (errors.length > 0) {
    throw httpError(422, "Blind adversarial review produced an invalid StrategyAuthoringPacketV1.", {
      validation_issues: validationIssues,
    })
  }
  assertValidStrategyAuthoringPacket(nextPacket)

  const persisted = persist
    ? await persistStrategyAuthoringPacket({
        packet: nextPacket,
        scope,
        message: `research lab: record blind adversarial review ${nextPacket.packet_id}`,
      })
    : null

  return {
    packet: nextPacket,
    compile_result: compileStrategyAuthoringPacket(nextPacket),
    validation_issues: validationIssues,
    raw_review_json: rawReviewJson,
    prompt,
    persisted,
  }
}

export function applyBlindAdversarialReviewPayload({
  packet,
  payload,
  modelExecution,
  now = new Date().toISOString(),
}: ApplyBlindAdversarialReviewPayloadArgs): StrategyAuthoringPacketV1 {
  if (packet.status !== "ADVERSARIAL") {
    throw httpError(409, "Blind adversarial review can only be applied while the packet is ADVERSARIAL.")
  }

  const review = buildAdversarialReview(payload, modelExecution, now)
  const nextPacket: StrategyAuthoringPacketV1 = {
    ...packet,
    updated_at: now,
    adversarial_review: review,
    reproducibility_manifest: {
      ...packet.reproducibility_manifest,
      adversarial_model: modelExecution,
    },
  }
  assertValidStrategyAuthoringPacket(nextPacket)
  return nextPacket
}

function buildAdversarialReview(
  payload: BlindAdversarialReviewPayload,
  modelExecution: ModelExecution,
  now: string,
): AdversarialReview {
  const checks = normalizedChecks(payload.checks)
  const status = conservativeStatus(payload.status, checks, payload.conditions_for_pass ?? [])
  const conditionsForPass = normalizedConditionsForPass(payload.conditions_for_pass ?? [], checks)
  return {
    status,
    reviewer_model_capabilities: reviewerCapabilities(),
    reviewer_model_actual: modelExecution.actual_model_id,
    review_timestamp: now,
    required_categories: REQUIRED_ADVERSARIAL_CATEGORIES,
    checks,
    overall_notes: payload.overall_notes?.trim() || "Blind adversarial review completed.",
    conditions_for_pass: status === "CONDITIONAL" ? conditionsForPass : conditionsForPass.length ? conditionsForPass : null,
  }
}

function normalizedChecks(checks: BlindAdversarialReviewPayload["checks"]): AdversarialCheck[] {
  const byCategory = new Map<AdversarialCheckCategory, AdversarialCheck>()
  for (const check of checks) {
    const normalized: AdversarialCheck = {
      category: check.category,
      passed: check.passed,
      finding: check.finding.trim(),
      severity: check.severity,
      remediation: check.remediation?.trim() || null,
    }
    if (!byCategory.has(normalized.category)) {
      byCategory.set(normalized.category, normalized)
    }
  }

  const missing = REQUIRED_ADVERSARIAL_CATEGORIES.filter(category => !byCategory.has(category))
  if (missing.length > 0) {
    throw httpError(422, "Blind adversarial review skipped required categories.", {
      missing_categories: missing,
    })
  }

  return [
    ...REQUIRED_ADVERSARIAL_CATEGORIES.map(category => byCategory.get(category) as AdversarialCheck),
    ...checks
      .filter(check => check.category === "OTHER")
      .map(check => ({
        category: "OTHER" as const,
        passed: check.passed,
        finding: check.finding.trim(),
        severity: check.severity,
        remediation: check.remediation?.trim() || null,
      })),
  ]
}

function conservativeStatus(
  declared: Exclude<AdversarialReviewStatus, "PENDING">,
  checks: AdversarialCheck[],
  conditionsForPass: string[],
): Exclude<AdversarialReviewStatus, "PENDING"> {
  if (declared === "FAIL") return "FAIL"
  const requiredChecks = checks.filter(check => check.category !== "OTHER")
  if (requiredChecks.some(check => !check.passed && check.severity === "CRITICAL")) return "FAIL"
  if (requiredChecks.some(check => !check.passed)) return "CONDITIONAL"
  if (declared === "CONDITIONAL") return "CONDITIONAL"
  if (conditionsForPass.some(condition => condition.trim())) return "CONDITIONAL"
  return "PASS"
}

function normalizedConditionsForPass(
  declared: string[],
  checks: AdversarialCheck[],
): string[] {
  const explicit = declared.map(condition => condition.trim()).filter(Boolean)
  if (explicit.length > 0) return [...new Set(explicit)]
  return [
    ...new Set(
      checks
        .filter(check => !check.passed)
        .map(check => check.remediation?.trim() || check.finding.trim())
        .filter(Boolean),
    ),
  ]
}

function reviewerCapabilities(): ModelExecution["required_capabilities"] {
  return {
    min_context_window_tokens: 64000,
    structured_output_required: true,
    reasoning_depth: "EXTENDED",
    notes: "Blind adversarial review must independently evaluate bias, leakage, costs, benchmark integrity, regime fragility, kill criteria, and overfitting.",
  }
}

function buildBlindAdversarialReviewPrompt(packet: StrategyAuthoringPacketV1): string {
  return [
    "You are the blind adversarial reviewer for a Vires Capital Strategy Authoring Packet.",
    "You are not the authoring model. You must look for ways this strategy could be false, biased, overfit, or unsafe to promote.",
    "Use only the packet context below. Do not assume unavailable data exists. Do not run web search. Do not infer author identity from missing metadata.",
    "",
    "Return only an object with review_json. review_json must be a JSON string with:",
    "- status: PASS, FAIL, or CONDITIONAL.",
    "- checks: one object for every required category, plus optional OTHER checks.",
    "- each check: { category, passed, finding, severity: INFO|WARNING|CRITICAL, remediation? }.",
    "- overall_notes: concise review summary.",
    "- conditions_for_pass: concrete items required for CONDITIONAL status.",
    "",
    "Required categories:",
    JSON.stringify(REQUIRED_ADVERSARIAL_CATEGORIES),
    "",
    "Review guidance:",
    "- PASS only when every required category is explicitly safe enough for implementation review.",
    "- CONDITIONAL when the packet can proceed only if named mitigations are handled.",
    "- FAIL when there is likely lookahead, survivorship bias, data leakage, benchmark cheating, severe overfitting, unsupported data, or an unsafe evidence gap.",
    "- Treat missing or vague evidence as a finding; do not fill gaps optimistically.",
    "",
    `Prompt version: ${PROMPT_VERSION}`,
    `Reviewer version: ${REVIEWER_VERSION}`,
    "",
    `Blind packet context:\n${JSON.stringify(blindPacketContext(packet), null, 2)}`,
  ].join("\n")
}

function blindPacketContext(packet: StrategyAuthoringPacketV1) {
  return {
    packet_id: packet.packet_id,
    schema_version: packet.schema_version,
    status: packet.status,
    questionnaire: packet.questionnaire,
    assumptions: packet.assumptions,
    data_readiness: packet.data_readiness,
    era_benchmark_plan: packet.era_benchmark_plan,
    strategy_spec: packet.strategy_spec,
    sweep_bounds: packet.sweep_bounds,
    evidence_thresholds: packet.evidence_thresholds,
    trial_ledger_budget: packet.trial_ledger_budget,
    multiple_comparisons_plan: packet.multiple_comparisons_plan,
    portfolio_fit: packet.portfolio_fit,
  }
}

function responseIdFromResult(result: unknown): string | null {
  const raw = result as { response?: { id?: unknown } }
  return typeof raw.response?.id === "string" ? raw.response.id : null
}

function httpError(status: number, message: string, payload?: unknown): Error {
  return Object.assign(new Error(message), { status, payload })
}
