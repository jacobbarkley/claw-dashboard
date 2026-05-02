import { anthropic } from "@ai-sdk/anthropic"
import { generateText, Output } from "ai"

import type {
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
import { validateExperimentPlan } from "@/lib/research-lab-experiment-plan"
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

export async function createOrReuseTalonDraftJob({
  scope,
  ideaId,
  intentMessage,
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
        if (!planValidity.is_valid) {
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
        idea,
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
  idea,
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
  idea: IdeaArtifact
  spec: StrategySpecV1
  readiness: TalonDraftJobAssessment
  rawCompletion: string | null
  talonOutput: ParsedDraftGeneratedOutput
  model: string
  catalogVersion: string
  prompt: string
}) {
  const latestIdea = await loadIdeaById(idea.idea_id, scope)
  if (!latestIdea) throw new DraftJobFailure("INTERNAL_ERROR", `Idea not found before persistence: ${idea.idea_id}`)
  const linkedIdea = linkIdeaToSpec(latestIdea, spec.spec_id)

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

  await commitDashboardFiles({
    message: `research lab: Talon durable draft ${spec.spec_id}`,
    files: [
      {
        relpath: strategySpecRepoRelpath(spec.spec_id, scope),
        content: strategySpecToYaml(spec),
      },
      {
        relpath: ideaRepoRelpath(scope, linkedIdea.idea_id),
        content: ideaArtifactToYaml(linkedIdea),
      },
      {
        relpath: specProvenanceRelpath(spec.spec_id, scope),
        content: `${JSON.stringify(provenance, null, 2)}\n`,
      },
      {
        relpath: talonJobRecordRelpath(scope, linkedIdea.idea_id, job.job_id),
        content: `${JSON.stringify(jobRecord, null, 2)}\n`,
      },
    ],
  })

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
  intentMessage,
  catalog,
  lessons,
  referenceContext,
  repairContext,
}: {
  idea: IdeaArtifact
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
