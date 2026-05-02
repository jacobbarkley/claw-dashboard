import { anthropic } from "@ai-sdk/anthropic"
import { generateText, Output } from "ai"

import type {
  AuthoringMode,
  BuilderClarification,
  BuilderFieldMeta,
  BuilderInputState,
  BuilderMode,
  BuilderStateV1,
  BuilderValidationIssue,
  ExperimentPlanValidityIssue,
  IdeaArtifact,
  ScopeTriple,
  StrategySpecV1,
  TalonDraftJobAssessment,
  TalonDraftJobErrorCode,
  TalonDraftJobModelCall,
  TalonDraftJobState,
  TalonDraftJobStep,
  TalonDraftJobV1,
} from "@/lib/research-lab-contracts"
import {
  normalizeExperimentPlan,
  validateExperimentPlan,
  withComputedExperimentPlanValidity,
} from "@/lib/research-lab-experiment-plan"
import { commitDashboardFiles } from "@/lib/github-multi-file-commit.server"
import {
  assessDataReadiness,
  dataReadinessForResponse,
  loadDataCapabilityCatalog,
} from "@/lib/research-lab-data-capabilities.server"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import { getResearchLabLiveStore, type LiveStore } from "@/lib/research-lab-live-store.server"
import { strategySpecRepoRelpath } from "@/lib/research-lab-specs.server"
import { formatReferenceStrategiesForPrompt } from "@/lib/research-lab-strategy-references.server"
import { formatTalonLessonsForPrompt } from "@/lib/research-lab-talon-lessons.server"
import {
  applyModelVerdictFloor,
  buildStrategySpec,
  DATA_READINESS_PROMPT_RULES,
  draftGenerationSchema,
  formatCatalogForPrompt,
  includeProposalRequirements,
  parseDraftGeneratedOutput,
  specProvenanceRelpath,
  type ParsedDraftGeneratedOutput,
} from "@/lib/research-lab-talon.server"

import {
  ideaArtifactToYaml,
  ideaRepoRelpath,
  linkIdeaToSpec,
  strategySpecToYaml,
  ulid,
  validateStrategySpec,
} from "@/app/api/research/specs/_shared"

const PROMPT_VERSION = "talon_spec_drafting.v2"
const DEFAULT_MODEL = "claude-sonnet-4-6"
const TERMINAL_TTL_SECONDS = 24 * 60 * 60
const ACTIVE_LOCK_TTL_SECONDS = 10 * 60
const STUCK_ACTIVE_MS = 5 * 60 * 1000
const MAX_REPAIR_ATTEMPTS = 2
const TERMINAL_STATES = new Set<TalonDraftJobState>([
  "READY",
  "WARN",
  "BLOCKED",
  "FAILED",
  "CANCELLED",
])

interface CreateDraftJobArgs {
  scope: ScopeTriple
  ideaId: string
  intentMessage?: string | null
  builderStateInput?: unknown
}

export interface CreateDraftJobResult {
  job: TalonDraftJobV1
  reused: boolean
}

export function talonJobKey(scope: ScopeTriple, jobId: string): string {
  return `research_lab:${scope.user_id}:${scope.account_id}:${scope.strategy_group_id}:talon_job:${jobId}`
}

export function talonActiveJobKey(scope: ScopeTriple, ideaId: string): string {
  return `research_lab:${scope.user_id}:${scope.account_id}:${scope.strategy_group_id}:talon_job_active:${ideaId}`
}

export function talonJobIndexKey(scope: ScopeTriple, ideaId: string): string {
  return `research_lab:${scope.user_id}:${scope.account_id}:${scope.strategy_group_id}:talon_job_idx:${ideaId}`
}

export function isTalonDraftJobTerminal(state: TalonDraftJobState): boolean {
  return TERMINAL_STATES.has(state)
}

function normalizeBuilderStateForIdea({
  input,
  idea,
  now,
  actor,
}: {
  input: unknown
  idea: IdeaArtifact
  now: string
  actor: string
}): BuilderStateV1 {
  const raw = recordFromUnknown(input)
  const rawFields = recordFromUnknown(raw.fields)
  const mode = normalizeBuilderMode(raw.mode)
  const title = stringFromUnknown(rawFields.title) || idea.title
  const thesis = stringFromUnknown(rawFields.thesis) || idea.thesis
  const requestedSleeve = stringFromUnknown(rawFields.sleeve)
  const sleeve = idea.sleeve
  const fieldMetaInput = recordFromUnknown(raw.field_meta)
  const issues: BuilderValidationIssue[] = []

  if (!title.trim()) {
    issues.push(builderIssue("title", "error", "TITLE_REQUIRED", "Title is required before Talon can draft."))
  }
  if (!thesis.trim()) {
    issues.push(builderIssue("thesis", "error", "THESIS_REQUIRED", "Thesis is required before Talon can draft."))
  }
  if (requestedSleeve && requestedSleeve !== idea.sleeve) {
    issues.push(builderIssue(
      "sleeve",
      "error",
      "SLEEVE_MISMATCH",
      `Builder sleeve ${requestedSleeve} does not match idea sleeve ${idea.sleeve}.`,
    ))
  }

  const fields: BuilderStateV1["fields"] = {
    title,
    thesis,
    sleeve,
    reference_strategies: normalizeReferenceStrategies(rawFields.reference_strategies) ?? idea.reference_strategies ?? null,
    tags: stringArrayFromUnknown(rawFields.tags).length
      ? stringArrayFromUnknown(rawFields.tags)
      : idea.tags ?? null,
    universe: recordOrNull(rawFields.universe),
    stop_pct: numberOrNull(rawFields.stop_pct),
    target_pct: numberOrNull(rawFields.target_pct),
    benchmark: nullableStringFromUnknown(rawFields.benchmark),
    benchmark_comparison_mode: normalizeEnum(
      rawFields.benchmark_comparison_mode,
      ["absolute", "deployment_matched", "both"] as const,
    ),
    era_mode: normalizeEnum(rawFields.era_mode, ["single", "multi"] as const),
    era_ids: stringArrayFromUnknown(rawFields.era_ids),
    signal_logic: nullableStringFromUnknown(rawFields.signal_logic),
    entry_rules: nullableStringFromUnknown(rawFields.entry_rules),
    exit_rules: nullableStringFromUnknown(rawFields.exit_rules),
    risk_model: recordOrNull(rawFields.risk_model),
    sweep_params: recordOrNull(rawFields.sweep_params),
    required_data: stringArrayFromUnknown(rawFields.required_data),
    evidence_thresholds: recordOrNull(rawFields.evidence_thresholds) as BuilderStateV1["fields"]["evidence_thresholds"],
    decisive_verdict_rules: recordOrNull(rawFields.decisive_verdict_rules) as BuilderStateV1["fields"]["decisive_verdict_rules"],
    implementation_notes: nullableStringFromUnknown(rawFields.implementation_notes),
    promotion_target: recordOrNull(rawFields.promotion_target) as BuilderStateV1["fields"]["promotion_target"],
  }

  const field_meta: Record<string, BuilderFieldMeta> = {}
  for (const key of Object.keys(fields)) {
    field_meta[key] = normalizeFieldMeta(fieldMetaInput[key], {
      source: key === "reference_strategies" ? "reference" : "operator",
      locked: key === "title" || key === "thesis" || key === "sleeve" || key === "reference_strategies",
      visible_in_modes: visibleModesForField(key),
      updated_at: now,
      updated_by: actor,
      operator_confirmed: key === "title" || key === "thesis" || key === "sleeve",
    })
  }

  const openQuestions = normalizeClarifications(raw.open_questions)
  const inputState = recomputeBuilderInputState({
    requested: raw.input_state,
    issues,
    openQuestions,
    currentDraft: raw.current_draft,
  })

  return {
    schema_version: "research_lab.builder_state.v1",
    mode,
    input_state: inputState,
    created_at: stringFromUnknown(raw.created_at) || now,
    updated_at: now,
    fields,
    field_meta,
    validation_issues: issues,
    open_questions: openQuestions,
    current_draft: null,
    current_assessment: null,
    current_authoring_mode: null,
  }
}

function recomputeBuilderInputState({
  requested,
  issues,
  openQuestions,
  currentDraft,
}: {
  requested: unknown
  issues: BuilderValidationIssue[]
  openQuestions: BuilderClarification[]
  currentDraft?: unknown
}): BuilderInputState {
  if (currentDraft && typeof currentDraft === "object") return "PROPOSAL_READY"
  if (openQuestions.some(question => question.state === "OPEN")) return "AWAITING_CLARIFICATION"
  if (issues.some(issue => issue.severity === "error")) return "DRAFT_INCOMPLETE"
  if (requested === "PROPOSAL_APPLIED") return "PROPOSAL_APPLIED"
  return "DRAFT_READY_TO_SUBMIT"
}

function builderIssue(
  field_id: string,
  severity: BuilderValidationIssue["severity"],
  code: string,
  message: string,
  suggested_action?: string,
): BuilderValidationIssue {
  return {
    field_id,
    severity,
    code,
    message,
    suggested_action: suggested_action ?? null,
  }
}

function normalizeBuilderMode(input: unknown): BuilderMode {
  return normalizeEnum(input, ["beginner", "intermediate", "advanced"] as const) ?? "intermediate"
}

function normalizeFieldMeta(input: unknown, fallback: BuilderFieldMeta): BuilderFieldMeta {
  const raw = recordFromUnknown(input)
  return {
    source: normalizeEnum(
      raw.source,
      ["operator", "talon", "default", "validator", "reference", "imported"] as const,
    ) ?? fallback.source,
    locked: typeof raw.locked === "boolean" ? raw.locked : fallback.locked,
    visible_in_modes: normalizeVisibleModes(raw.visible_in_modes) ?? fallback.visible_in_modes,
    updated_at: stringFromUnknown(raw.updated_at) || fallback.updated_at,
    updated_by: nullableStringFromUnknown(raw.updated_by) ?? fallback.updated_by ?? null,
    talon_event_id: nullableStringFromUnknown(raw.talon_event_id),
    operator_confirmed: typeof raw.operator_confirmed === "boolean"
      ? raw.operator_confirmed
      : fallback.operator_confirmed,
  }
}

function visibleModesForField(key: string): BuilderMode[] {
  if (["signal_logic", "entry_rules", "exit_rules", "risk_model", "sweep_params"].includes(key)) {
    return ["intermediate", "advanced"]
  }
  if (["required_data", "evidence_thresholds", "decisive_verdict_rules"].includes(key)) {
    return ["advanced"]
  }
  return ["beginner", "intermediate", "advanced"]
}

function normalizeVisibleModes(input: unknown): BuilderMode[] | null {
  if (!Array.isArray(input)) return null
  const modes = input
    .map(item => normalizeEnum(item, ["beginner", "intermediate", "advanced"] as const))
    .filter((item): item is BuilderMode => item != null)
  return modes.length ? [...new Set(modes)] : null
}

function normalizeClarifications(input: unknown): BuilderClarification[] {
  if (!Array.isArray(input)) return []
  return input.flatMap(item => {
    const raw = recordFromUnknown(item)
    const question_id = stringFromUnknown(raw.question_id)
    const question_text = stringFromUnknown(raw.question_text)
    const field_hint = stringFromUnknown(raw.field_hint)
    if (!question_id || !question_text || !field_hint) return []
    return [{
      question_id,
      question_text,
      field_hint,
      state: normalizeEnum(raw.state, ["OPEN", "ANSWERED", "SUPERSEDED"] as const) ?? "OPEN",
      asked_at: stringFromUnknown(raw.asked_at) || new Date().toISOString(),
      answered_at: nullableStringFromUnknown(raw.answered_at),
      answer_text: nullableStringFromUnknown(raw.answer_text),
    }]
  })
}

function normalizeReferenceStrategies(input: unknown): IdeaArtifact["reference_strategies"] | null {
  if (!Array.isArray(input)) return null
  const refs = input.flatMap(item => {
    const raw = recordFromUnknown(item)
    const strategyId = stringFromUnknown(raw.strategy_id)
    if (!strategyId) return []
    return [{
      strategy_id: strategyId,
      delta_note: nullableStringFromUnknown(raw.delta_note),
    }]
  })
  return refs.length ? refs.slice(0, 2) : null
}

export async function createOrReuseTalonDraftJob({
  scope,
  ideaId,
  intentMessage,
  builderStateInput,
}: CreateDraftJobArgs): Promise<CreateDraftJobResult> {
  const store = requireStore()
  const idea = await loadIdeaById(ideaId, scope)
  if (!idea) throw httpError(404, `Idea not found: ${ideaId}`)
  if (idea.strategy_ref.kind === "REGISTERED") {
    throw httpError(409, "Talon draft jobs cannot create re-specs for registered ideas yet. Start an explicit re-spec flow first.")
  }

  const activeKey = talonActiveJobKey(scope, ideaId)
  const activeJobId = await store.get(activeKey)
  if (activeJobId) {
    const activeJob = await readTalonDraftJobRaw(activeJobId, scope)
    if (activeJob && !isTalonDraftJobTerminal(activeJob.state)) {
      const ageMs = Date.now() - Date.parse(activeJob.updated_at)
      if (Number.isFinite(ageMs) && ageMs > STUCK_ACTIVE_MS) {
        const failed = touchJob(activeJob, {
          state: "FAILED",
          current_step: null,
          error_code: "WORKER_TIMEOUT",
          error: "Talon draft job stopped updating before it reached a terminal state.",
        })
        await persistFailedJob(failed, store)
      } else {
        return { job: activeJob, reused: true }
      }
    }
    const stillActiveJobId = await store.get(activeKey)
    if (stillActiveJobId === activeJobId) await store.del(activeKey)
  }

  const now = new Date().toISOString()
  const builderState = normalizeBuilderStateForIdea({
    input: builderStateInput,
    idea,
    now,
    actor: idea.created_by ?? "jacob",
  })
  if (builderState.input_state !== "DRAFT_READY_TO_SUBMIT") {
    throw httpError(422, "Builder input is incomplete; answer the required fields before starting Talon.", {
      builder_state: builderState,
      validation_issues: builderState.validation_issues,
    })
  }

  const job: TalonDraftJobV1 = {
    schema_version: "research_lab.talon_draft_job.v1",
    job_id: `talon_${ulid()}`,
    idea_id: ideaId,
    user_id: scope.user_id,
    account_id: scope.account_id,
    strategy_group_id: scope.strategy_group_id,
    created_at: now,
    updated_at: now,
    state: "QUEUED",
    current_step: null,
    steps_completed: [],
    repair_attempts: 0,
    intent_message: intentMessage ?? null,
    proposal: null,
    assessment: null,
    validity_issues: null,
    error: null,
    error_code: null,
    model_calls: [],
    builder_state: builderState,
  }

  const claimed = await store.setNx(activeKey, job.job_id, ACTIVE_LOCK_TTL_SECONDS)
  if (!claimed) {
    const competingJobId = await store.get(activeKey)
    if (competingJobId) {
      const competingJob = await readTalonDraftJob(competingJobId, scope)
      if (competingJob && !isTalonDraftJobTerminal(competingJob.state)) {
        return { job: competingJob, reused: true }
      }
    }
    throw httpError(409, "Another Talon draft job is already starting for this idea.")
  }

  try {
    await Promise.all([
      writeTalonDraftJob(job, store),
      store.sadd(talonJobIndexKey(scope, ideaId), job.job_id),
    ])
  } catch (error) {
    await store.del(activeKey)
    throw error
  }
  return { job, reused: false }
}

export async function readTalonDraftJob(
  jobId: string,
  scope: ScopeTriple,
): Promise<TalonDraftJobV1 | null> {
  const parsed = await readTalonDraftJobRaw(jobId, scope)
  if (!parsed) return null
  if (!isTalonDraftJobTerminal(parsed.state)) {
    const ageMs = Date.now() - Date.parse(parsed.updated_at)
    if (Number.isFinite(ageMs) && ageMs > STUCK_ACTIVE_MS) {
      const store = requireStore()
      const failed = touchJob(parsed, {
        state: "FAILED",
        current_step: null,
        error_code: "WORKER_TIMEOUT",
        error: "Talon draft job stopped updating before it reached a terminal state.",
      })
      await persistFailedJob(failed, store)
      return failed
    }
  }
  return parsed
}

async function readTalonDraftJobRaw(
  jobId: string,
  scope: ScopeTriple,
): Promise<TalonDraftJobV1 | null> {
  const store = requireStore()
  const raw = await store.get(talonJobKey(scope, jobId))
  if (!raw) return null
  const parsed = JSON.parse(raw) as TalonDraftJobV1
  if (
    parsed.user_id !== scope.user_id ||
    parsed.account_id !== scope.account_id ||
    parsed.strategy_group_id !== scope.strategy_group_id
  ) {
    return null
  }
  return parsed
}

export async function cancelTalonDraftJob(
  jobId: string,
  scope: ScopeTriple,
  cancelledBy = "jacob",
): Promise<TalonDraftJobV1> {
  const store = requireStore()
  const job = await readTalonDraftJob(jobId, scope)
  if (!job) throw httpError(404, `Talon draft job not found: ${jobId}`)
  if (isTalonDraftJobTerminal(job.state)) {
    throw httpError(409, `Cannot cancel terminal Talon draft job (${job.state}).`, job)
  }
  const next = touchJob(job, {
    state: "CANCELLED",
    current_step: null,
    cancelled_at: new Date().toISOString(),
    cancelled_by: cancelledBy,
  })
  await writeTerminalJob(next, store)
  await store.del(talonActiveJobKey(scope, job.idea_id))
  return next
}

export async function answerTalonDraftJobClarifications({
  jobId,
  scope,
  answers,
  actor = "jacob",
}: {
  jobId: string
  scope: ScopeTriple
  answers: Array<{ question_id: string; answer_text: string }>
  actor?: string
}): Promise<TalonDraftJobV1> {
  const store = requireStore()
  const job = await readTalonDraftJob(jobId, scope)
  if (!job) throw httpError(404, `Talon draft job not found: ${jobId}`)
  if (isTalonDraftJobTerminal(job.state)) {
    throw httpError(409, `Cannot answer clarifications on terminal Talon draft job (${job.state}).`, job)
  }
  const builderState = job.builder_state
  if (!builderState) throw httpError(409, "Talon draft job has no builder_state to update.")

  const byId = new Map(answers.map(answer => [answer.question_id, answer.answer_text.trim()]))
  const now = new Date().toISOString()
  const open_questions = builderState.open_questions.map(question => {
    const answerText = byId.get(question.question_id)
    if (!answerText || question.state !== "OPEN") return question
    return {
      ...question,
      state: "ANSWERED" as const,
      answered_at: now,
      answer_text: answerText,
    }
  })
  const fields = { ...builderState.fields }
  const field_meta = { ...builderState.field_meta }
  for (const question of open_questions) {
    if (question.state !== "ANSWERED" || !question.answer_text) continue
    const key = question.field_hint as keyof BuilderStateV1["fields"]
    if (!(key in fields)) continue
    ;(fields as Record<string, unknown>)[key] = question.answer_text
    field_meta[question.field_hint] = normalizeFieldMeta(field_meta[question.field_hint], {
      source: "operator",
      locked: true,
      visible_in_modes: visibleModesForField(question.field_hint),
      updated_at: now,
      updated_by: actor,
      operator_confirmed: true,
    })
  }
  const validation_issues = validateBuilderFields(fields)
  const nextBuilderState = touchBuilderState(builderState, {
    fields,
    field_meta,
    open_questions,
    validation_issues,
    input_state: recomputeBuilderInputState({
      requested: builderState.input_state,
      issues: validation_issues,
      openQuestions: open_questions,
      currentDraft: builderState.current_draft,
    }),
  })
  const next = touchJob(job, { builder_state: nextBuilderState })
  await writeTalonDraftJob(next, store)
  return next
}

export async function patchTalonDraftJobDraft({
  jobId,
  scope,
  patch,
  actor = "jacob",
}: {
  jobId: string
  scope: ScopeTriple
  patch: unknown
  actor?: string
}): Promise<TalonDraftJobV1> {
  const store = requireStore()
  const job = await readTalonDraftJob(jobId, scope)
  if (!job) throw httpError(404, `Talon draft job not found: ${jobId}`)
  if (job.builder_state?.input_state === "PROPOSAL_APPLIED") {
    throw httpError(409, "This Talon proposal has already been applied.")
  }
  const draft = job.builder_state?.current_draft ?? job.proposal
  if (!draft) throw httpError(409, "Talon draft job has no proposal draft to edit.")

  const patchRecord = recordFromUnknown(patch)
  const nextDraft = normalizeDraftPatch(draft, patchRecord, scope)
  const assessment = assessmentFromDraft(nextDraft, job.builder_state?.current_assessment ?? job.assessment ?? null)
  const now = new Date().toISOString()
  const validityIssues = nextDraft.experiment_plan?.validity_reasons ?? []
  const nextBuilderState = completeBuilderStateWithProposal({
    builderState: job.builder_state ?? null,
    spec: nextDraft,
    readiness: assessment,
    authoringMode: "AI_ASSISTED",
    now,
  })
  const editedFieldIds = Object.keys(patchRecord)
  const field_meta = { ...nextBuilderState.field_meta }
  for (const fieldId of editedFieldIds) {
    field_meta[fieldId] = normalizeFieldMeta(field_meta[fieldId], {
      source: "operator",
      locked: true,
      visible_in_modes: visibleModesForField(fieldId),
      updated_at: now,
      updated_by: actor,
      operator_confirmed: true,
    })
  }
  const updatedBuilderState = touchBuilderState(nextBuilderState, {
    field_meta,
    validation_issues: validityIssues.map(issue => ({
      field_id: issue.field_id,
      severity: issue.severity,
      code: issue.severity === "error" ? "EXPERIMENT_PLAN_ERROR" : "EXPERIMENT_PLAN_WARN",
      message: issue.message,
      suggested_action: null,
    })),
  })
  const next = touchJob(job, {
    state: stateFromAssessment(assessment),
    proposal: nextDraft,
    assessment,
    validity_issues: validityIssues,
    builder_state: updatedBuilderState,
  })
  await writeTerminalJob(next, store)
  return next
}

export async function applyTalonDraftJob({
  jobId,
  scope,
  appliedBy = "jacob",
}: {
  jobId: string
  scope: ScopeTriple
  appliedBy?: string
}): Promise<{
  job: TalonDraftJobV1
  spec: StrategySpecV1
  idea: IdeaArtifact
  mode?: "github" | "local"
  commit_sha?: string | null
  file?: string
}> {
  const store = requireStore()
  const job = await readTalonDraftJob(jobId, scope)
  if (!job) throw httpError(404, `Talon draft job not found: ${jobId}`)
  if (job.state !== "READY" && job.state !== "WARN") {
    throw httpError(409, `Only READY or WARN Talon drafts can be applied. Current state: ${job.state}.`, job)
  }
  if (job.builder_state?.input_state === "PROPOSAL_APPLIED") {
    throw httpError(409, "This Talon proposal has already been applied.", job)
  }
  const spec = job.builder_state?.current_draft ?? job.proposal
  if (!spec) throw httpError(409, "Talon draft job has no proposal to apply.")
  const specToApply: StrategySpecV1 = {
    ...spec,
    authoring_mode: job.builder_state?.current_authoring_mode ?? spec.authoring_mode,
  }
  validateStrategySpec(specToApply)
  const planValidity = validateExperimentPlan(specToApply.experiment_plan)
  if (!planValidity.is_valid) {
    throw httpError(422, "Experiment plan must be valid before applying a Talon draft.", {
      validity_issues: planValidity.validity_reasons,
    })
  }

  const latestIdea = await loadIdeaById(job.idea_id, scope)
  if (!latestIdea) throw httpError(404, `Idea not found before apply: ${job.idea_id}`)
  const linkedIdea = linkIdeaToSpec(latestIdea, specToApply.spec_id)
  const now = new Date().toISOString()
  const appliedJob = touchJob(job, {
    builder_state: job.builder_state
      ? touchBuilderState(job.builder_state, {
          input_state: "PROPOSAL_APPLIED",
          current_draft: specToApply,
          current_authoring_mode: specToApply.authoring_mode === "AI_ASSISTED"
            ? "AI_ASSISTED"
            : specToApply.authoring_mode === "MANUAL" || specToApply.authoring_mode === "OPERATOR_DRAFTED"
              ? "MANUAL"
              : "AI_DRAFTED",
        })
      : null,
    proposal: specToApply,
    assessment: job.builder_state?.current_assessment ?? job.assessment ?? null,
    validity_issues: specToApply.experiment_plan?.validity_reasons ?? null,
  })
  const provenance = {
    schema_version: "research_lab.spec_provenance.v1",
    spec_id: specToApply.spec_id,
    generated_at: now,
    applied_at: now,
    applied_by: appliedBy,
    talon_job_id: job.job_id,
    data_readiness: appliedJob.assessment,
    builder_state: appliedJob.builder_state,
    model_calls: appliedJob.model_calls ?? [],
  }
  const jobRecord = {
    schema_version: "research_lab.talon_draft_job_record.v1",
    recorded_at: now,
    job: appliedJob,
    provenance,
  }
  const persisted = await commitDashboardFiles({
    message: `research lab: apply Talon draft ${specToApply.spec_id}`,
    files: [
      {
        relpath: strategySpecRepoRelpath(specToApply.spec_id, scope),
        content: strategySpecToYaml(specToApply),
      },
      {
        relpath: ideaRepoRelpath(scope, linkedIdea.idea_id),
        content: ideaArtifactToYaml(linkedIdea),
      },
      {
        relpath: specProvenanceRelpath(specToApply.spec_id, scope),
        content: `${JSON.stringify(provenance, null, 2)}\n`,
      },
      {
        relpath: talonJobRecordRelpath(scope, linkedIdea.idea_id, job.job_id),
        content: `${JSON.stringify(jobRecord, null, 2)}\n`,
      },
    ],
  })
  await writeTerminalJob(appliedJob, store)
  await store.del(talonActiveJobKey(scope, job.idea_id))
  return { ...persisted, job: appliedJob, spec: specToApply, idea: linkedIdea }
}

function completeBuilderStateWithProposal({
  builderState,
  spec,
  readiness,
  authoringMode,
  now = new Date().toISOString(),
}: {
  builderState: BuilderStateV1 | null
  spec: StrategySpecV1
  readiness: TalonDraftJobAssessment
  authoringMode: AuthoringMode
  now?: string
}): BuilderStateV1 {
  const base = builderState ?? {
    schema_version: "research_lab.builder_state.v1" as const,
    mode: "intermediate" as const,
    input_state: "DRAFT_READY_TO_SUBMIT" as const,
    created_at: now,
    updated_at: now,
    fields: {
      title: "",
      thesis: "",
      sleeve: "STOCKS" as const,
    },
    field_meta: {},
    validation_issues: [],
    open_questions: [],
    current_draft: null,
    current_assessment: null,
    current_authoring_mode: null,
  }
  const fields = {
    ...base.fields,
    signal_logic: spec.signal_logic,
    entry_rules: spec.entry_rules,
    exit_rules: spec.exit_rules,
    risk_model: spec.risk_model,
    sweep_params: spec.sweep_params,
    required_data: spec.required_data,
    benchmark: spec.benchmark ?? base.fields.benchmark ?? null,
    benchmark_comparison_mode:
      spec.experiment_plan?.benchmark.comparison_mode ?? base.fields.benchmark_comparison_mode ?? null,
    era_mode: spec.experiment_plan?.eras.mode ?? base.fields.era_mode ?? null,
    era_ids: spec.experiment_plan?.eras.required_era_ids ?? base.fields.era_ids ?? null,
    evidence_thresholds:
      spec.experiment_plan?.evidence_thresholds ?? base.fields.evidence_thresholds ?? null,
    decisive_verdict_rules:
      spec.experiment_plan?.decisive_verdict_rules ?? base.fields.decisive_verdict_rules ?? null,
    implementation_notes: spec.implementation_notes ?? base.fields.implementation_notes ?? null,
  }
  const field_meta = { ...base.field_meta }
  for (const key of Object.keys(fields)) {
    if (field_meta[key]) continue
    field_meta[key] = {
      source: ["signal_logic", "entry_rules", "exit_rules", "risk_model", "sweep_params", "required_data"].includes(key)
        ? "talon"
        : "default",
      locked: false,
      visible_in_modes: visibleModesForField(key),
      updated_at: now,
      updated_by: "talon",
      talon_event_id: null,
      operator_confirmed: false,
    }
  }
  const validation_issues = (spec.experiment_plan?.validity_reasons ?? []).map(issue => ({
    field_id: issue.field_id,
    severity: issue.severity,
    code: issue.severity === "error" ? "EXPERIMENT_PLAN_ERROR" : "EXPERIMENT_PLAN_WARN",
    message: issue.message,
    suggested_action: null,
  }))
  return touchBuilderState(base, {
    input_state: "PROPOSAL_READY",
    fields,
    field_meta,
    validation_issues,
    current_draft: spec,
    current_assessment: readiness,
    current_authoring_mode: authoringMode,
  })
}

function deriveAuthoringMode(job: TalonDraftJobV1): AuthoringMode {
  const hasOperatorInputs = Object.values(job.builder_state?.field_meta ?? {})
    .some(meta => meta.source === "operator" && meta.operator_confirmed)
  if ((job.model_calls?.length ?? 0) === 0) return "MANUAL"
  return hasOperatorInputs ? "AI_ASSISTED" : "AI_DRAFTED"
}

function normalizeDraftPatch(
  current: StrategySpecV1,
  patch: Record<string, unknown>,
  scope: ScopeTriple,
): StrategySpecV1 {
  const next: StrategySpecV1 = {
    ...current,
    ...(patch as Partial<StrategySpecV1>),
    schema_version: "research_lab.strategy_spec.v1",
    spec_id: current.spec_id,
    idea_id: current.idea_id,
    user_id: scope.user_id,
    account_id: scope.account_id,
    strategy_group_id: scope.strategy_group_id,
    created_at: current.created_at,
    state: current.state,
    authoring_mode: current.authoring_mode,
  }
  if (Object.prototype.hasOwnProperty.call(patch, "experiment_plan")) {
    const normalized = normalizeExperimentPlan(patch.experiment_plan)
    next.experiment_plan = normalized
      ? withComputedExperimentPlanValidity({
          ...normalized,
          spec_id: current.spec_id,
          idea_id: current.idea_id,
        })
      : null
  } else if (next.experiment_plan) {
    next.experiment_plan = withComputedExperimentPlanValidity(next.experiment_plan)
  }
  validateStrategySpec(next)
  return next
}

function assessmentFromDraft(
  spec: StrategySpecV1,
  fallback: TalonDraftJobAssessment | null,
): TalonDraftJobAssessment {
  const dataRequirements = spec.experiment_plan?.data_requirements ?? []
  const validityIssues = spec.experiment_plan?.validity_reasons ?? []
  const hasMissing = dataRequirements.some(req => req.required && req.status === "MISSING")
  const hasPartial = dataRequirements.some(req => req.required && req.status === "PARTIAL")
  const hasWarnings = validityIssues.some(issue => issue.severity === "warn")
  const hasErrors = validityIssues.some(issue => issue.severity === "error")
  const verdict: TalonDraftJobAssessment["verdict"] = hasMissing
    ? "BLOCKED"
    : hasPartial || hasWarnings || hasErrors
      ? "WARN"
      : fallback?.verdict ?? "PASS"
  return {
    verdict,
    catalog_version: fallback?.catalog_version ?? "unknown",
    requirements: dataRequirements.map(req => ({
      requested: req.purpose || req.capability_id,
      status: req.status,
      source: req.capability_id,
      notes: req.required ? null : "Optional data requirement",
    })),
    warnings: [
      ...(fallback?.warnings ?? []),
      ...validityIssues.filter(issue => issue.severity === "warn").map(issue => issue.message),
    ],
    blocking_summary: hasMissing
      ? "Required data is missing for this draft."
      : fallback?.blocking_summary,
    suggested_action: hasMissing
      ? "Choose an available proxy, add the missing connector, or revise the thesis before applying."
      : fallback?.suggested_action,
  }
}

function stateFromAssessment(assessment: TalonDraftJobAssessment): TalonDraftJobState {
  if (assessment.verdict === "PASS") return "READY"
  if (assessment.verdict === "WARN") return "WARN"
  return "BLOCKED"
}

function validateBuilderFields(fields: BuilderStateV1["fields"]): BuilderValidationIssue[] {
  const issues: BuilderValidationIssue[] = []
  if (!fields.title.trim()) {
    issues.push(builderIssue("title", "error", "TITLE_REQUIRED", "Title is required."))
  }
  if (!fields.thesis.trim()) {
    issues.push(builderIssue("thesis", "error", "THESIS_REQUIRED", "Thesis is required."))
  }
  if (!fields.sleeve) {
    issues.push(builderIssue("sleeve", "error", "SLEEVE_REQUIRED", "Sleeve is required."))
  }
  return issues
}

function isDataBlockedOnly(issues: ExperimentPlanValidityIssue[]): boolean {
  const errors = issues.filter(issue => issue.severity === "error")
  return errors.length > 0 && errors.every(issue => issue.field_id.includes("data_requirements"))
}

function touchBuilderState(
  builderState: BuilderStateV1,
  patch: Partial<BuilderStateV1>,
): BuilderStateV1 {
  return {
    ...builderState,
    ...patch,
    updated_at: new Date().toISOString(),
  }
}

export async function runTalonDraftJob(jobId: string, scope: ScopeTriple): Promise<void> {
  const store = requireStore()
  let job = await readTalonDraftJob(jobId, scope)
  if (!job || isTalonDraftJobTerminal(job.state)) return

  try {
    job = await transition(job, store, { state: "RUNNING", current_step: "load_context" })
    if (job.state === "CANCELLED") return

    const idea = await loadIdeaById(job.idea_id, scope)
    if (!idea) throw new DraftJobFailure("INTERNAL_ERROR", `Idea not found: ${job.idea_id}`)
    if (idea.strategy_ref.kind === "REGISTERED") {
      throw new DraftJobFailure("INTERNAL_ERROR", "Idea became registered before Talon draft job ran.")
    }

    let catalog: Awaited<ReturnType<typeof loadDataCapabilityCatalog>>
    try {
      catalog = await loadDataCapabilityCatalog()
    } catch (error) {
      throw new DraftJobFailure(
        "DATA_CATALOG_MISSING",
        error instanceof Error ? error.message : "Data capability catalog is unavailable",
      )
    }

    const lessons = await formatTalonLessonsForPrompt()
    const referenceContext = await formatReferenceStrategiesForPrompt(idea.reference_strategies)
    let lastError: string | null = null
    let lastIssues: ExperimentPlanValidityIssue[] = []

    for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt += 1) {
      const isRepair = attempt > 0
      job = await transition(job, store, {
        state: isRepair ? "REPAIRING" : "RUNNING",
        current_step: isRepair ? "repair" : "draft_strategy_core",
        repair_attempts: attempt,
      })
      if (job.state === "CANCELLED") return

      const model = process.env.TALON_SPEC_DRAFTING_MODEL ?? DEFAULT_MODEL
      const prompt = buildDraftJobPrompt({
        idea,
        builderState: job.builder_state ?? null,
        intentMessage: job.intent_message ?? null,
        catalog,
        lessons,
        referenceContext,
        repairContext: lastError
          ? { error: lastError, validityIssues: lastIssues }
          : null,
      })
      const started = Date.now()
      let talonOutput: ParsedDraftGeneratedOutput
      let rawCompletion: string | null = null
      try {
        const result = await generateText({
          model: anthropic(model),
          output: Output.object({ schema: draftGenerationSchema }),
          temperature: isRepair ? 0.2 : 0.4,
          prompt,
        })
        rawCompletion = typeof result.text === "string" ? result.text : null
        talonOutput = parseDraftGeneratedOutput(result.output)
        const fresh = await readTalonDraftJob(job.job_id, scope)
        if (!fresh || fresh.state === "CANCELLED") return
        job = fresh
        job = await appendModelCall(job, store, {
          step: isRepair ? "repair" : "draft_strategy_core",
          attempt,
          model,
          latency_ms: Date.now() - started,
          tokens_in: tokenCountFromResult(result, "inputTokens"),
          tokens_out: tokenCountFromResult(result, "outputTokens"),
          finish_reason: finishReasonFromResult(result),
        })
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        if (attempt < MAX_REPAIR_ATTEMPTS) continue
        throw new DraftJobFailure("VALIDATION_EXHAUSTED", lastError)
      }

      job = await transition(job, store, { state: "RUNNING", current_step: "data_readiness" })
      if (job.state === "CANCELLED") return

      const readiness = applyModelVerdictFloor(
        assessDataReadiness({
          catalog,
          sleeve: idea.sleeve,
          requirements: includeProposalRequirements({
            requiredData: talonOutput.proposal.required_data,
            assessedRequirements: talonOutput.assessment.requirements,
            catalog,
          }),
        }),
        talonOutput.assessment,
      )

      job = await transition(job, store, { state: "RUNNING", current_step: "validate_schema" })
      if (job.state === "CANCELLED") return

      const specId = `spec_${ulid()}`
      let spec: StrategySpecV1
      try {
        spec = buildStrategySpec({
          specId,
          scope,
          ideaId: idea.idea_id,
          authoredBy: idea.created_by ?? "jacob",
          proposal: talonOutput.proposal,
          readiness,
        })
        validateStrategySpec(spec)
        const planValidity = validateExperimentPlan(spec.experiment_plan)
        lastIssues = planValidity.validity_reasons
        if (!planValidity.is_valid && !isDataBlockedOnly(planValidity.validity_reasons)) {
          throw new Error(
            `Experiment plan is not valid: ${planValidity.validity_reasons
              .filter(issue => issue.severity === "error")
              .map(issue => `${issue.field_id}: ${issue.message}`)
              .join("; ")}`,
          )
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Talon returned an invalid strategy spec"
        if (attempt < MAX_REPAIR_ATTEMPTS) continue
        throw new DraftJobFailure("VALIDATION_EXHAUSTED", lastError, lastIssues)
      }

      await persistSuccessfulJob({
        job,
        store,
        scope,
        spec,
        readiness: dataReadinessForResponse(readiness) as TalonDraftJobAssessment,
        rawCompletion,
        talonOutput,
        model,
        catalogVersion: catalog.catalog_version,
        prompt,
      })
      return
    }
  } catch (error) {
    const failure = error instanceof DraftJobFailure
      ? error
      : new DraftJobFailure("INTERNAL_ERROR", error instanceof Error ? error.message : String(error))
    const current = await readTalonDraftJob(jobId, scope)
    if (!current || current.state === "CANCELLED") return
    const failed = touchJob(current, {
      state: "FAILED",
      current_step: null,
      error: failure.message,
      error_code: failure.code,
      validity_issues: failure.validityIssues.length ? failure.validityIssues : current.validity_issues ?? null,
    })
    await persistFailedJob(failed, store)
  }
}

function requireStore(): LiveStore {
  const store = getResearchLabLiveStore()
  if (!store) throw httpError(503, "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not configured")
  return store
}

async function persistSuccessfulJob({
  job,
  store,
  scope,
  spec,
  readiness,
  rawCompletion,
  talonOutput,
  model,
  catalogVersion,
  prompt,
}: {
  job: TalonDraftJobV1
  store: LiveStore
  scope: ScopeTriple
  spec: StrategySpecV1
  readiness: TalonDraftJobAssessment
  rawCompletion: string | null
  talonOutput: ParsedDraftGeneratedOutput
  model: string
  catalogVersion: string
  prompt: string
}) {
  const terminalState: TalonDraftJobState =
    readiness.verdict === "PASS"
      ? "READY"
      : readiness.verdict === "WARN"
        ? "WARN"
        : "BLOCKED"
  const terminalJob = touchJob(job, {
    state: terminalState,
    current_step: "persist",
    proposal: spec,
    assessment: readiness,
    validity_issues: spec.experiment_plan?.validity_reasons ?? null,
    error: null,
    error_code: null,
    builder_state: completeBuilderStateWithProposal({
      builderState: job.builder_state ?? null,
      spec,
      readiness,
      authoringMode: deriveAuthoringMode(job),
    }),
  })

  const provenance = {
    schema_version: "research_lab.spec_provenance.v1",
    spec_id: spec.spec_id,
    generated_at: new Date().toISOString(),
    model,
    catalog_version: catalogVersion,
    prompt_version: PROMPT_VERSION,
    talon_job_id: job.job_id,
    data_readiness: readiness,
    prompt,
    raw_completion: rawCompletion,
    raw_proposal_json: talonOutput.raw_proposal_json,
    raw_assessment_json: talonOutput.raw_assessment_json,
    raw_proposal: talonOutput.proposal,
    raw_assessment: talonOutput.assessment,
  }
  const jobRecord = {
    schema_version: "research_lab.talon_draft_job_record.v1",
    recorded_at: new Date().toISOString(),
    job: terminalJob,
    provenance,
  }

  try {
    await commitDashboardFiles({
      message: `research lab: Talon draft job ready ${job.job_id}`,
      files: [
        {
          relpath: talonJobRecordRelpath(scope, job.idea_id, job.job_id),
          content: `${JSON.stringify(jobRecord, null, 2)}\n`,
        },
      ],
    })
  } catch (error) {
    console.error("[talon-draft-job] failed to persist ready job record:", error)
  }

  const current = await readTalonDraftJob(job.job_id, scope)
  if (!current || current.state === "CANCELLED") return

  const completed = touchJob(terminalJob, {
    current_step: null,
    steps_completed: [...new Set<TalonDraftJobStep>([...terminalJob.steps_completed, "persist"])],
  })
  await writeTerminalJob(completed, store)
  await store.del(talonActiveJobKey(scope, job.idea_id))
}

async function persistFailedJob(job: TalonDraftJobV1, store: LiveStore) {
  const jobRecord = {
    schema_version: "research_lab.talon_draft_job_record.v1",
    recorded_at: new Date().toISOString(),
    job,
  }
  try {
    await commitDashboardFiles({
      message: `research lab: Talon draft job failed ${job.job_id}`,
      files: [
        {
          relpath: talonJobRecordRelpath(job, job.idea_id, job.job_id),
          content: `${JSON.stringify(jobRecord, null, 2)}\n`,
        },
      ],
    })
  } catch (error) {
    console.error("[talon-draft-job] failed to persist failed job record:", error)
  }
  await writeTerminalJob(job, store)
  await store.del(talonActiveJobKey(job, job.idea_id))
}

async function transition(
  job: TalonDraftJobV1,
  store: LiveStore,
  patch: Partial<TalonDraftJobV1>,
): Promise<TalonDraftJobV1> {
  const current = await readTalonDraftJob(job.job_id, job)
  if (!current || current.state === "CANCELLED") return current ?? job
  const next = touchJob(current, patch)
  await writeTalonDraftJob(next, store)
  return next
}

async function appendModelCall(
  job: TalonDraftJobV1,
  store: LiveStore,
  call: TalonDraftJobModelCall,
): Promise<TalonDraftJobV1> {
  const current = await readTalonDraftJob(job.job_id, job)
  if (!current || current.state === "CANCELLED" || isTalonDraftJobTerminal(current.state)) {
    return current ?? job
  }
  const next = touchJob(current, {
    model_calls: [...(current.model_calls ?? []), call],
  })
  await writeTalonDraftJob(next, store)
  return next
}

function touchJob(
  job: TalonDraftJobV1,
  patch: Partial<TalonDraftJobV1>,
): TalonDraftJobV1 {
  const completed = new Set(job.steps_completed)
  if (job.current_step && patch.current_step !== job.current_step) completed.add(job.current_step)
  return {
    ...job,
    ...patch,
    steps_completed: patch.steps_completed ?? [...completed],
    updated_at: new Date().toISOString(),
  }
}

async function writeTalonDraftJob(job: TalonDraftJobV1, store: LiveStore) {
  await store.set(talonJobKey(job, job.job_id), JSON.stringify(job))
}

async function writeTerminalJob(job: TalonDraftJobV1, store: LiveStore) {
  await writeTalonDraftJob(job, store)
  await store.expire(talonJobKey(job, job.job_id), TERMINAL_TTL_SECONDS)
}

function talonJobRecordRelpath(
  scope: ScopeTriple,
  ideaId: string,
  jobId: string,
): string {
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/talon_jobs/${ideaId}/${jobId}.json`
}

function buildDraftJobPrompt({
  idea,
  builderState,
  intentMessage,
  catalog,
  lessons,
  referenceContext,
  repairContext,
}: {
  idea: IdeaArtifact
  builderState: BuilderStateV1 | null
  intentMessage: string | null
  catalog: Awaited<ReturnType<typeof loadDataCapabilityCatalog>>
  lessons: string
  referenceContext: string
  repairContext: { error: string; validityIssues: ExperimentPlanValidityIssue[] } | null
}): string {
  return [
    "You are Talon's durable spec-drafting worker inside the Vires Research Lab.",
    "Return only the structured object requested by the schema. Do not invent backtest results.",
    "The structured object has two string fields: proposal_json and assessment_json.",
    "Each field must be valid JSON text, not markdown, not fenced code, and not comments.",
    "proposal_json must JSON.stringify the complete StrategySpec proposal, including experiment_plan.",
    "assessment_json must JSON.stringify the complete data-readiness assessment.",
    repairContext
      ? "This is a repair pass. Fix the exact validation issues below, change nothing else unless required, and return the full corrected proposal."
      : null,
    repairContext ? `Validation error: ${repairContext.error}` : null,
    repairContext?.validityIssues.length
      ? `Experiment-plan issues: ${JSON.stringify(repairContext.validityIssues)}`
      : null,
    "",
    "Your task has two parts:",
    "1. Draft a StrategySpecV1 starting point for the operator to review.",
    "2. Draft its experiment_plan: how the strategy will be judged before implementation.",
    "3. Assess whether every data dependency is actually available in the catalog.",
    "4. If reference strategies are supplied, use them as parent/context for NEW code and honor the operator's delta notes. Do not simply route the idea to a parent strategy.",
    "",
    "Experiment-plan rules:",
    "- The plan is part of the spec. Do not omit it.",
    "- Use ISO dates for windows. If the idea does not specify dates, choose a recent executable window and state limitations.",
    "- evidence_thresholds must be numeric. minimum_trade_count defaults to at least 5 for exploratory stock ideas unless the thesis justifies a higher floor.",
    "- data_requirements are resolved by the server from your assessment; in experiment_plan focus on benchmark, windows, eras, thresholds, verdict rules, and limitations.",
    "- If a strategy depends on seeded/current-only data, put that in known_limitations and make the plan clear that the first run validates plumbing, not historical edge.",
    lessons ? ["", lessons].join("\n") : null,
    "",
    builderState
      ? [
          "Unified builder state:",
          JSON.stringify({
            mode: builderState.mode,
            fields: builderState.fields,
            field_meta: builderState.field_meta,
            validation_issues: builderState.validation_issues,
            answered_questions: builderState.open_questions.filter(question => question.state === "ANSWERED"),
          }, null, 2),
          "Locked-field rules:",
          "- Any field with field_meta.locked=true is an operator decision. Do not contradict it.",
          "- Fill missing fields only. If a locked field makes the strategy impossible, surface that honestly in limitations or data readiness.",
          "- If the mode is advanced, avoid interrupting with inline clarifications unless the draft cannot proceed.",
        ].join("\n")
      : null,
    "",
    DATA_READINESS_PROMPT_RULES,
    "",
    `Idea sleeve: ${idea.sleeve}`,
    `Idea title: ${idea.title}`,
    `Idea thesis: ${idea.thesis}`,
    intentMessage ? `Operator intent message: ${intentMessage}` : null,
    "",
    "Reference-strategy context:",
    referenceContext,
    "",
    `Data capability catalog (${catalog.catalog_version}):`,
    formatCatalogForPrompt(catalog),
  ].filter((line): line is string => line != null).join("\n")
}

function tokenCountFromResult(result: unknown, key: "inputTokens" | "outputTokens"): number {
  const usage = (result as { usage?: Record<string, unknown> }).usage
  const value = usage?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function finishReasonFromResult(result: unknown): string | null {
  const value = (result as { finishReason?: unknown }).finishReason
  return typeof value === "string" ? value : null
}

function recordFromUnknown(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  return input as Record<string, unknown>
}

function recordOrNull(input: unknown): Record<string, unknown> | null {
  const record = recordFromUnknown(input)
  return Object.keys(record).length ? record : null
}

function stringFromUnknown(input: unknown): string {
  return typeof input === "string" ? input.trim() : ""
}

function nullableStringFromUnknown(input: unknown): string | null {
  const value = stringFromUnknown(input)
  return value || null
}

function stringArrayFromUnknown(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(Boolean)
}

function numberOrNull(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input
  if (typeof input === "string" && input.trim()) {
    const parsed = Number(input)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeEnum<const T extends readonly string[]>(
  input: unknown,
  allowed: T,
): T[number] | null {
  if (typeof input !== "string") return null
  const value = input.trim()
  return (allowed as readonly string[]).includes(value) ? value as T[number] : null
}

class DraftJobFailure extends Error {
  code: TalonDraftJobErrorCode
  validityIssues: ExperimentPlanValidityIssue[]

  constructor(
    code: TalonDraftJobErrorCode,
    message: string,
    validityIssues: ExperimentPlanValidityIssue[] = [],
  ) {
    super(message)
    this.code = code
    this.validityIssues = validityIssues
  }
}

export function httpError(status: number, message: string, payload?: unknown) {
  return Object.assign(new Error(message), { status, payload })
}
