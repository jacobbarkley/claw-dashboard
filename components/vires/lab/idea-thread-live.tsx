"use client"

// Live seven-step thread on the idea detail page.
//
// Computes currentStep from idea.strategy_ref + active-spec state + queue
// state + campaign existence, renders IdeaThreadStepper, and dispatches the
// per-step body. Action handlers hit the live Phase E endpoints:
//
//   - "Author spec yourself" → POST /api/research/specs
//   - "Draft with Talon"     → POST /api/research/specs/draft-with-talon
//   - "Approve"              → POST /api/research/specs/[id]/approve
//   - "Send back"            → PATCH /api/research/specs/[id] (state DRAFTING)
//
// Phase D-implementation guard: only mounted when the
// `vires.lab.spec_authoring` flag is enabled in the page's server component.

import { useRouter } from "next/navigation"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import type {
  IdeaArtifact,
  ScopeTriple,
  SpecImplementationQueueV1,
  StrategySpecV1,
  TalonDraftJobV1,
} from "@/lib/research-lab-contracts"

import { DataUnavailableCard } from "./data-unavailable-card"
import { IdeaThreadStepper, type ThreadStep } from "./idea-thread-stepper"

// localStorage key namespace for WARN-verdict warnings handed to the spec
// edit page on first load. Keyed by spec_id so dismissed warnings on one
// spec never bleed into another draft.
export const TALON_WARN_KEY_PREFIX = "talon-warn:"

interface TalonReadinessRequirement {
  requested: string
  status: "AVAILABLE" | "PARTIAL" | "MISSING"
  source?: string | null
  notes?: string | null
}

interface TalonBlockedState {
  catalogVersion: string
  blockingSummary: string
  suggestedAction: string
  requirements: TalonReadinessRequirement[]
}

const STEP_INFO: Record<ThreadStep, string> = {
  describe:
    "Capture the thesis. The system will help turn it into a testable strategy.",
  "awaiting-spec":
    "A spec turns your thesis into something Codex can build. You can draft it yourself or hand the start to Talon.",
  "spec-drafted":
    "Refine the rules until they read like a real strategy. Once submitted, the system asks you to approve before Codex starts implementing.",
  "awaiting-impl":
    "Codex builds the strategy module from the approved spec, registers it, and adds tests. This usually takes a single Codex session.",
  "ready-to-run":
    "The strategy is registered and runnable. A Lab job runs it against the configured universe and produces an equity swarm.",
  campaign:
    "When a Lab job finishes successfully, the system rolls it up into a campaign. Run more jobs across regimes before nominating.",
  "ready-to-nominate":
    "Acceptance criteria met. Nominating moves this onto the passport — the system handles identity, audit, and the strategy bank update.",
}

export interface IdeaThreadProps {
  idea: IdeaArtifact
  scope: ScopeTriple
  activeSpec: StrategySpecV1 | null
  pendingSpec: StrategySpecV1 | null
  activeQueueEntry: SpecImplementationQueueV1 | null
  labCampaignExists: boolean
}

// sessionStorage key for cross-page optimistic spec hand-off (e.g. after
// the spec edit page submits-for-approval and navigates back here, it
// stashes the persisted spec under this key so we can render the
// AwaitingApprovalPanel immediately instead of waiting for the deploy
// roundtrip to make data/ readable.
const SPEC_UPDATE_KEY_PREFIX = "spec-update:"

function readSpecOverride(specId: string | undefined | null): StrategySpecV1 | null {
  if (!specId || typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(`${SPEC_UPDATE_KEY_PREFIX}${specId}`)
    if (!raw) return null
    return JSON.parse(raw) as StrategySpecV1
  } catch {
    return null
  }
}

function clearSpecOverride(specId: string | undefined | null): void {
  if (!specId || typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(`${SPEC_UPDATE_KEY_PREFIX}${specId}`)
  } catch {
    // ignore
  }
}

export function IdeaThreadLive(props: IdeaThreadProps) {
  // Optimistic spec mirrors. Initialized from props, replaced by API
  // response payloads after each state-change action. Done so transitions
  // feel instant — without this we'd need to wait ~60s for Vercel to
  // rebuild the bundled data/ before the new state shows up.
  const [activeSpec, setActiveSpec] = useState<StrategySpecV1 | null>(props.activeSpec)
  const [pendingSpec, setPendingSpec] = useState<StrategySpecV1 | null>(props.pendingSpec)
  const [queue, setQueue] = useState<SpecImplementationQueueV1 | null>(props.activeQueueEntry)

  // After hydration, drain any sessionStorage overrides written by other
  // pages (most notably the spec-edit page's submit-for-approval handler).
  // Effect rather than lazy useState init to avoid SSR/CSR mismatch —
  // sessionStorage is unreadable during SSR, so a lazy initializer would
  // produce different initial state on server vs client.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const candidates = [props.activeSpec?.spec_id, props.pendingSpec?.spec_id]
    for (const id of candidates) {
      const override = readSpecOverride(id)
      if (!override) continue
      if (props.activeSpec && override.spec_id === props.activeSpec.spec_id) {
        setActiveSpec(override)
      }
      if (props.pendingSpec && override.spec_id === props.pendingSpec.spec_id) {
        setPendingSpec(override)
      }
      clearSpecOverride(id)
    }
  }, [props.activeSpec, props.pendingSpec])
  /* eslint-enable react-hooks/set-state-in-effect */

  const view: IdeaThreadProps = {
    ...props,
    activeSpec,
    pendingSpec,
    activeQueueEntry: queue,
  }

  const step = computeStep(view)
  const ref = view.idea.strategy_ref

  const reSpecActive =
    ref.kind === "REGISTERED" && !!ref.pending_spec_id && !!view.pendingSpec

  // Targeted setter for child handlers — write the optimistic spec into
  // whichever slot it belongs to. Both slots can hold the same spec_id
  // (re-spec branch); we update both to keep computeStep correct.
  const onSpecUpdated = (next: StrategySpecV1) => {
    if (activeSpec && next.spec_id === activeSpec.spec_id) setActiveSpec(next)
    if (pendingSpec && next.spec_id === pendingSpec.spec_id) setPendingSpec(next)
  }

  const onQueueUpdated = (next: SpecImplementationQueueV1 | null) => {
    setQueue(next)
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="vr-card" style={{ padding: "14px 14px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              fontSize: 18,
              color: "var(--vr-cream)",
            }}
          >
            Idea thread
          </div>
          {reSpecActive && (
            <span
              style={{
                padding: "2px 7px",
                fontSize: 9,
                fontFamily: "var(--ff-mono)",
                letterSpacing: "0.08em",
                borderRadius: 2,
                border: "1px solid var(--vr-gold-line)",
                background: "var(--vr-gold-soft)",
                color: "var(--vr-gold)",
              }}
            >
              SPEC V2 DRAFTING
            </span>
          )}
        </div>
        <IdeaThreadStepper currentStep={step} />
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            background: "var(--vr-ink)",
            border: "1px solid var(--vr-line)",
            borderRadius: 3,
            fontSize: 11.5,
            lineHeight: 1.55,
            color: "var(--vr-cream-dim)",
            fontStyle: "italic",
            fontFamily: "var(--ff-serif)",
          }}
        >
          {STEP_INFO[step]}
        </div>
      </div>

      <StepBody
        step={step}
        {...view}
        onSpecUpdated={onSpecUpdated}
        onQueueUpdated={onQueueUpdated}
      />
    </section>
  )
}

interface StepBodyExtras {
  onSpecUpdated: (spec: StrategySpecV1) => void
  onQueueUpdated: (queue: SpecImplementationQueueV1 | null) => void
}

function computeStep(props: IdeaThreadProps): ThreadStep {
  const { idea, activeSpec, pendingSpec, labCampaignExists } = props
  const ref = idea.strategy_ref

  if (ref.kind === "NONE") return "awaiting-spec"

  // Re-spec precedence: when a pending spec exists, the thread tracks
  // pendingSpec's lifecycle. The previously-registered strategy keeps
  // running below; the operator's action surface is whatever pendingSpec
  // needs next.
  const driverSpec = pendingSpec ?? activeSpec

  if (ref.kind === "SPEC_PENDING") {
    if (!driverSpec) return "awaiting-spec"
    if (driverSpec.state === "REJECTED") return "awaiting-spec"
    if (driverSpec.state === "APPROVED") return "awaiting-impl"
    return "spec-drafted"
  }

  // REGISTERED — re-spec branch wins when present, even though the active
  // strategy is still runnable below.
  if (pendingSpec) {
    if (pendingSpec.state === "REJECTED") return "awaiting-spec"
    if (pendingSpec.state === "APPROVED") return "awaiting-impl"
    return "spec-drafted"
  }

  if (labCampaignExists) {
    // Step 7 readiness comes from a campaign-side acceptance summary that
    // Phase D-implementation v1 doesn't have a contract for yet. Stay at
    // step 6 until that lands; the v2 work picks step 7 up explicitly.
    return "campaign"
  }
  return "ready-to-run"
}

function StepBody(props: IdeaThreadProps & StepBodyExtras & { step: ThreadStep }) {
  switch (props.step) {
    case "describe":
      return null
    case "awaiting-spec":
      return <AwaitingSpecBody {...props} />
    case "spec-drafted":
      return <SpecDraftedBody {...props} />
    case "awaiting-impl":
      return <AwaitingImplBody {...props} />
    case "ready-to-run":
      return <ReadyToRunBody {...props} />
    case "campaign":
      return <CampaignBody {...props} />
    case "ready-to-nominate":
      return <CampaignBody {...props} />
  }
}

// ─── Step 2 — awaiting-spec ────────────────────────────────────────────────

const TALON_DRAFTING_STAGES = [
  "Reading your thesis…",
  "Proposing signal logic…",
  "Checking data availability…",
]

const TALON_TERMINAL_STATES = new Set<TalonDraftJobV1["state"]>([
  "READY",
  "WARN",
  "BLOCKED",
  "FAILED",
  "CANCELLED",
])

function AwaitingSpecBody(props: IdeaThreadProps) {
  const router = useRouter()
  const [busy, setBusy] = useState<"author" | "talon" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<TalonBlockedState | null>(null)
  const [stageIdx, setStageIdx] = useState(0)
  const [draftJob, setDraftJob] = useState<TalonDraftJobV1 | null>(null)

  useEffect(() => {
    if (busy !== "talon") {
      setStageIdx(0)
      return
    }
    const handle = setInterval(() => {
      setStageIdx(idx => (idx + 1) % TALON_DRAFTING_STAGES.length)
    }, 5000)
    return () => clearInterval(handle)
  }, [busy])

  const handleTerminalTalonJob = useCallback((job: TalonDraftJobV1) => {
    if (!TALON_TERMINAL_STATES.has(job.state)) return
    if ((job.state === "READY" || job.state === "WARN" || job.state === "BLOCKED") && job.proposal?.spec_id) {
      const warnings = [
        ...(job.assessment?.warnings ?? []),
        ...(job.state === "BLOCKED" && job.assessment?.blocking_summary
          ? [job.assessment.blocking_summary]
          : []),
      ]
      if (warnings.length > 0) {
        try {
          window.localStorage.setItem(
            `${TALON_WARN_KEY_PREFIX}${job.proposal.spec_id}`,
            JSON.stringify({
              warnings,
              catalog_version: job.assessment?.catalog_version ?? "",
              created_at: new Date().toISOString(),
            }),
          )
        } catch {
          // Missing storage only drops the first-load callout.
        }
      }
      router.push(
        `/vires/bench/lab/ideas/${encodeURIComponent(props.idea.idea_id)}/spec/edit?spec_id=${encodeURIComponent(job.proposal.spec_id)}`,
      )
      router.refresh()
      return
    }
    if (job.state === "FAILED") {
      setError(job.error ? `${job.error_code ?? "FAILED"}: ${job.error}` : "Talon draft failed.")
    } else if (job.state === "CANCELLED") {
      setError("Talon draft cancelled.")
    }
    setBusy(null)
  }, [props.idea.idea_id, router])

  useEffect(() => {
    if (!draftJob || TALON_TERMINAL_STATES.has(draftJob.state)) return
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/research/specs/draft-jobs/${encodeURIComponent(draftJob.job_id)}?${scopeQuery(props.scope)}`,
          { cache: "no-store" },
        )
        const payload = (await res.json()) as { job?: TalonDraftJobV1; error?: string }
        if (!res.ok || !payload.job) {
          throw new Error(payload.error ?? `Talon draft poll failed (${res.status})`)
        }
        setDraftJob(payload.job)
        handleTerminalTalonJob(payload.job)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Talon draft polling failed")
        setBusy(null)
      }
    }, 2000)
    return () => window.clearTimeout(handle)
  }, [draftJob, handleTerminalTalonJob, props.scope])

  const onAuthor = async () => {
    setBusy("author")
    setError(null)
    try {
      const res = await fetch("/api/research/specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea_id: props.idea.idea_id,
          scope: props.scope,
          authoring_mode: "OPERATOR_DRAFTED",
          authored_by: props.idea.created_by ?? "jacob",
          state: "DRAFTING",
          signal_logic: "Draft — describe the edge in plain language.",
          entry_rules: "Draft — when does this enter?",
          exit_rules: "Draft — when does this exit?",
          universe: {},
          risk_model: {},
          sweep_params: {},
          required_data: [],
          acceptance_criteria: { min_sharpe: 1.0, max_drawdown: 20, min_hit_rate: 45 },
        }),
      })
      const payload = (await res.json()) as { spec?: { spec_id?: string }; error?: string }
      if (!res.ok || !payload.spec?.spec_id) {
        throw new Error(payload.error ?? `POST /api/research/specs failed (${res.status})`)
      }
      router.push(
        `/vires/bench/lab/ideas/${encodeURIComponent(props.idea.idea_id)}/spec/edit?spec_id=${encodeURIComponent(payload.spec.spec_id)}`,
      )
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to author spec")
      setBusy(null)
    }
  }

  const onDraftWithTalon = async () => {
    setBusy("talon")
    setError(null)
    setBlocked(null)
    setDraftJob(null)

    let res: Response
    try {
      res = await fetch("/api/research/specs/draft-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea_id: props.idea.idea_id,
          scope: props.scope,
        }),
      })
    } catch (err) {
      console.error("[talon] fetch threw:", err)
      setError(`Network error reaching Talon: ${err instanceof Error ? err.message : String(err)}`)
      setBusy(null)
      return
    }

    const rawBody = await res.text()
    let payload: {
      ok?: boolean
      job?: TalonDraftJobV1
      error?: string
      detail?: string
      talon_error?: string
    } = {}
    try {
      payload = rawBody ? JSON.parse(rawBody) : {}
    } catch (parseErr) {
      console.error("[talon] response not JSON:", { status: res.status, rawBody, parseErr })
      setError(`Talon returned non-JSON (status ${res.status}): ${rawBody.slice(0, 200) || "<empty>"}`)
      setBusy(null)
      return
    }

    if (!res.ok || !payload.job) {
      const baseLabel =
        res.status === 503
          ? "Talon isn't configured on this deployment"
            : `Talon drafting failed (${res.status})`
      const serverDetail = payload.talon_error ?? payload.detail ?? payload.error
      console.error("[talon] non-success:", { status: res.status, payload })
      setError(serverDetail ? `${baseLabel}: ${serverDetail}` : baseLabel)
      setBusy(null)
      return
    }

    setDraftJob(payload.job)
    handleTerminalTalonJob(payload.job)
  }

  const cancelDraftJob = async () => {
    if (!draftJob || TALON_TERMINAL_STATES.has(draftJob.state)) return
    try {
      const res = await fetch(
        `/api/research/specs/draft-jobs/${encodeURIComponent(draftJob.job_id)}?${scopeQuery(props.scope)}`,
        { method: "DELETE" },
      )
      const payload = (await res.json()) as { job?: TalonDraftJobV1; error?: string }
      if (!res.ok || !payload.job) throw new Error(payload.error ?? `Cancel failed (${res.status})`)
      setDraftJob(payload.job)
      setBusy(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel Talon draft")
    }
  }

  if (blocked) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <DataUnavailableCard
          catalogVersion={blocked.catalogVersion}
          blockingSummary={blocked.blockingSummary}
          suggestedAction={blocked.suggestedAction}
          requirements={blocked.requirements}
          onDismiss={() => setBlocked(null)}
        />
        <div className="vr-card" style={panel}>
          <div style={panelTitle}>Author the spec yourself anyway</div>
          <div style={panelBody}>
            Talon refused, but you can still draft the spec by hand — the
            implementation queue will block on the missing capability when
            Codex tries to compile it.
          </div>
          <button
            type="button"
            onClick={onAuthor}
            disabled={busy === "author"}
            style={secondaryButton}
          >
            {busy === "author" ? "Opening…" : "Author spec"}
          </button>
          {error && <ErrorLine message={error} />}
        </div>
      </div>
    )
  }

  const talonLabel =
    busy === "talon"
      ? draftJob?.state === "REPAIRING"
        ? "Repairing draft…"
        : draftJob?.current_step
          ? `${draftJob.state.toLowerCase()} · ${draftJob.current_step}`
          : TALON_DRAFTING_STAGES[stageIdx]
      : "Draft with Talon"
  const talonInFlight = draftJob != null && !TALON_TERMINAL_STATES.has(draftJob.state)
  const talonSubtitle = draftJob && !TALON_TERMINAL_STATES.has(draftJob.state)
    ? `Job ${draftJob.job_id} · ${draftJob.steps_completed.length} steps complete. This can keep running while you wait.`
    : "Talon reads your thesis, checks the data catalog, and produces an editable spec. You review before Codex implements."

  return (
    <div className="vr-card" style={panel}>
      <div style={panelTitle}>Sketch the strategy</div>
      <div style={panelBody}>
        Talon can draft a starting point from your thesis, or you can write the
        spec yourself. Either way you review and approve before Codex starts
        implementing.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ActionRow
          title="Draft with Talon"
          subtitle={talonSubtitle}
          ctaLabel={talonLabel}
          ctaTone="primary"
          disabled={busy !== null || talonInFlight}
          onClick={onDraftWithTalon}
        />
        {draftJob && !TALON_TERMINAL_STATES.has(draftJob.state) && (
          <button
            type="button"
            onClick={cancelDraftJob}
            style={secondaryButton}
          >
            Cancel Talon draft
          </button>
        )}
        <ActionRow
          title="Author the spec yourself"
          subtitle="Open a blank spec. Fill in signal logic, universe, entry / exit rules, and acceptance criteria — submit when it reads like a real strategy."
          ctaLabel={busy === "author" ? "Opening…" : "Author spec"}
          ctaTone="muted"
          onClick={onAuthor}
          disabled={busy !== null}
        />
      </div>
      {error && <ErrorLine message={error} />}
    </div>
  )
}

// ─── Step 3 — spec-drafted ─────────────────────────────────────────────────

function SpecDraftedBody(props: IdeaThreadProps & StepBodyExtras) {
  // Re-spec precedence — the pending spec is what the operator is actively
  // editing/approving, even when an older spec is registered.
  const spec = props.pendingSpec ?? props.activeSpec
  if (!spec) return null

  if (spec.state === "AWAITING_APPROVAL") {
    return (
      <AwaitingApprovalPanel
        spec={spec}
        scope={props.scope}
        onSpecUpdated={props.onSpecUpdated}
        onQueueUpdated={props.onQueueUpdated}
      />
    )
  }

  // DRAFTING (and any other still-editable state)
  const editHref = `/vires/bench/lab/ideas/${encodeURIComponent(props.idea.idea_id)}/spec/edit?spec_id=${encodeURIComponent(spec.spec_id)}`
  return (
    <div className="vr-card" style={panel}>
      <div style={panelHeaderRow}>
        <div style={panelTitle}>Spec in draft</div>
        <span style={statePill(spec.state)}>{spec.state}</span>
      </div>
      <div style={panelBody}>
        Keep editing until the rules read like a real strategy. Submit when
        you&apos;re ready for the approve step.
      </div>
      <Link href={editHref} style={primaryButton}>
        Open spec to edit →
      </Link>
    </div>
  )
}

function AwaitingApprovalPanel({
  spec,
  scope,
  onSpecUpdated,
  onQueueUpdated,
}: {
  spec: StrategySpecV1
  scope: ScopeTriple
  onSpecUpdated: (spec: StrategySpecV1) => void
  onQueueUpdated: (queue: SpecImplementationQueueV1 | null) => void
}) {
  const [busy, setBusy] = useState<"approve" | "sendback" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const editHref = `/vires/bench/lab/ideas/${encodeURIComponent(spec.idea_id)}/spec/edit?spec_id=${encodeURIComponent(spec.spec_id)}`

  const approve = async () => {
    setBusy("approve")
    setError(null)
    try {
      const res = await fetch(
        `/api/research/specs/${encodeURIComponent(spec.spec_id)}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope }),
        },
      )
      const payload = (await res.json()) as {
        error?: string
        spec?: StrategySpecV1
        queue_entry?: SpecImplementationQueueV1
      }
      if (!res.ok) throw new Error(payload.error ?? `Approve failed (${res.status})`)
      if (payload.spec) onSpecUpdated(payload.spec)
      if (payload.queue_entry) onQueueUpdated(payload.queue_entry)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve spec")
    } finally {
      setBusy(null)
    }
  }

  const sendBack = async () => {
    setBusy("sendback")
    setError(null)
    try {
      const res = await fetch(
        `/api/research/specs/${encodeURIComponent(spec.spec_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, state: "DRAFTING" }),
        },
      )
      const payload = (await res.json()) as { error?: string; spec?: StrategySpecV1 }
      if (!res.ok) throw new Error(payload.error ?? `Send-back failed (${res.status})`)
      if (payload.spec) onSpecUpdated(payload.spec)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send spec back")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="vr-card" style={panel}>
      <div style={panelHeaderRow}>
        <div style={panelTitle}>Spec submitted — awaiting approval</div>
        <span style={statePill(spec.state)}>{spec.state}</span>
      </div>
      <div style={panelBody}>
        Re-read the rules end to end. Approve to send the spec to Codex for
        implementation, or send it back if anything still needs to be tightened.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={approve}
          disabled={busy !== null}
          style={primaryApproveButton}
        >
          {busy === "approve" ? "Approving…" : "Approve spec →"}
        </button>
        <button
          type="button"
          onClick={sendBack}
          disabled={busy !== null}
          style={secondaryButton}
        >
          {busy === "sendback" ? "Sending back…" : "Send back for revision"}
        </button>
        <Link href={editHref} style={ghostLink}>
          Re-open spec
        </Link>
      </div>
      {error && <ErrorLine message={error} />}
    </div>
  )
}

// ─── Step 4 — awaiting-impl ────────────────────────────────────────────────

function AwaitingImplBody(props: IdeaThreadProps) {
  const queue = props.activeQueueEntry
  if (!queue) {
    return (
      <div className="vr-card" style={panel}>
        <div style={panelTitle}>Awaiting implementation</div>
        <div style={panelBody}>
          The spec is approved. Codex will pick it up and register the strategy.
          You&apos;ll see this idea move forward once that completes.
        </div>
      </div>
    )
  }

  if (queue.state === "FAILED") {
    return (
      <div className="vr-card" style={{ ...panel, borderLeft: "2px solid var(--vr-down)" }}>
        <div style={panelHeaderRow}>
          <div style={panelTitle}>Implementation failed</div>
          <span style={statePill("REJECTED")}>FAILED</span>
        </div>
        <div style={panelBody}>
          Codex hit an error while implementing this spec. Latest attempt:{" "}
          <span className="t-mono" style={{ color: "var(--vr-cream)" }}>
            {queue.last_error ?? "no error message"}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--vr-cream-mute)" }}>
          attempts · {queue.attempts}
          {queue.last_error_at && ` · ${new Date(queue.last_error_at).toLocaleString()}`}
        </div>
      </div>
    )
  }

  const labels: Record<string, string> = {
    QUEUED: "Queued for implementation",
    CLAIMED: "Codex is on this",
    IMPLEMENTING: "Codex is building the strategy",
    COMPLETED: "Implementation complete",
    CANCELLED: "Implementation cancelled",
  }
  const title = labels[queue.state] ?? "Awaiting implementation"

  return (
    <div className="vr-card" style={panel}>
      <div style={panelHeaderRow}>
        <div style={panelTitle}>{title}</div>
        <span style={statePill(queue.state === "COMPLETED" ? "REGISTERED" : "APPROVED")}>
          {queue.state}
        </span>
      </div>
      <div style={panelBody}>
        {queue.state === "QUEUED"
          ? "The spec is queued. Codex will pick it up shortly and register the strategy module."
          : queue.state === "CANCELLED"
          ? "This implementation was cancelled. Re-spec the idea or revisit the approval."
          : "Codex is generating the strategy module from this spec. Tests run as part of the same step."}
      </div>
      {queue.implementation_commit && (
        <div className="t-mono" style={{ fontSize: 11, color: "var(--vr-cream-mute)" }}>
          implementation_commit · {queue.implementation_commit}
        </div>
      )}
    </div>
  )
}

// ─── Steps 5/6/7 ───────────────────────────────────────────────────────────

function ReadyToRunBody(props: IdeaThreadProps) {
  const href = `/vires/bench/lab/new-campaign/${encodeURIComponent(props.idea.idea_id)}`
  return (
    <div className="vr-card" style={{ ...panel, borderLeft: "2px solid var(--vr-gold)" }}>
      <div style={panelTitle}>Ready to run in Lab</div>
      <div style={panelBody}>
        The strategy is registered. Submit a Lab job to evaluate it against the
        universe and acceptance criteria.
      </div>
      <Link href={href} style={primaryButton}>
        New campaign →
      </Link>
    </div>
  )
}

function CampaignBody(props: IdeaThreadProps) {
  const href = `/vires/bench/campaigns/${encodeURIComponent(`lab_${props.idea.idea_id}`)}`
  return (
    <div className="vr-card" style={{ ...panel, borderLeft: "2px solid var(--vr-gold)" }}>
      <div style={panelTitle}>Campaign rolled up</div>
      <div style={panelBody}>
        A Lab job for this idea has rolled up into a campaign. Review the
        equity swarm + leaderboard before nominating; run more jobs across
        regimes if acceptance criteria need cross-regime evidence.
      </div>
      <Link href={href} style={primaryButton}>
        Open campaign →
      </Link>
    </div>
  )
}

// ─── Shared building blocks ─────────────────────────────────────────────────

function ActionRow({
  title,
  subtitle,
  ctaLabel,
  ctaTone,
  onClick,
  disabled,
}: {
  title: string
  subtitle: string
  ctaLabel: string
  ctaTone: "primary" | "muted"
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        border: "1px solid var(--vr-line)",
        borderRadius: 3,
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            fontSize: 14,
            color: "var(--vr-cream)",
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--vr-cream-mute)", lineHeight: 1.5 }}>
          {subtitle}
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        style={ctaTone === "primary" ? primaryButton : secondaryButton}
      >
        {ctaLabel}
      </button>
    </div>
  )
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: "8px 10px",
        border: "1px solid var(--vr-down)",
        borderRadius: 3,
        background: "rgba(220,90,90,0.08)",
        color: "var(--vr-cream)",
        fontSize: 11.5,
      }}
    >
      {message}
    </div>
  )
}

function scopeQuery(scope: ScopeTriple): string {
  return new URLSearchParams({
    user_id: scope.user_id,
    account_id: scope.account_id,
    strategy_group_id: scope.strategy_group_id,
  }).toString()
}

function statePill(stateLike: string): React.CSSProperties {
  const isUp = stateLike === "REGISTERED" || stateLike === "APPROVED"
  return {
    padding: "3px 8px",
    fontSize: 9,
    fontFamily: "var(--ff-mono)",
    letterSpacing: "0.08em",
    borderRadius: 2,
    border: `1px solid ${isUp ? "var(--vr-gold-line)" : "var(--vr-line)"}`,
    background: isUp ? "var(--vr-gold-soft)" : "transparent",
    color: isUp ? "var(--vr-gold)" : "var(--vr-cream-mute)",
  }
}

const panel: React.CSSProperties = {
  padding: "16px 16px 18px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
}

const panelHeaderRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
}

const panelTitle: React.CSSProperties = {
  fontFamily: "var(--ff-serif)",
  fontStyle: "italic",
  fontSize: 18,
  color: "var(--vr-cream)",
}

const panelBody: React.CSSProperties = {
  fontSize: 12,
  color: "var(--vr-cream-dim)",
  lineHeight: 1.55,
}

const primaryButton: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 11.5,
  fontFamily: "var(--ff-mono)",
  background: "var(--vr-gold-soft)",
  border: "1px solid var(--vr-gold-line)",
  color: "var(--vr-gold)",
  borderRadius: 3,
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
  alignSelf: "flex-start",
}

const primaryApproveButton: React.CSSProperties = {
  ...primaryButton,
  background: "var(--vr-up-soft)",
  border: "1px solid var(--vr-up)",
  color: "var(--vr-up)",
}

const secondaryButton: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 11.5,
  fontFamily: "var(--ff-mono)",
  background: "transparent",
  border: "1px solid var(--vr-line)",
  color: "var(--vr-cream-mute)",
  borderRadius: 3,
  cursor: "pointer",
  whiteSpace: "nowrap",
}

const ghostLink: React.CSSProperties = {
  ...secondaryButton,
  color: "var(--vr-cream-mute)",
  textDecoration: "none",
}
