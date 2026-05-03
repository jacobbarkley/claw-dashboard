"use client"

// Unified Spec Builder v2 — first UI slice (beginner mode only).
//
// Lets the operator choose optional reference strategies, then boots a Talon
// Draft v2 job for the idea, polls for live state, and exposes the Apply
// boundary on READY/WARN. Job state is authoritative — every render reads from
// the most recent poll, no optimistic local copies.
//
// Deferred: advanced/intermediate field surfacing, draft editing, chat polish.

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import type {
  IdeaArtifact,
  ReferenceStrategy,
  TalonDraftJobV1,
} from "@/lib/research-lab-contracts"

import { ReferenceStrategyPicker, type StrategyOption } from "./idea-form"

const TERMINAL_STATES = new Set<TalonDraftJobV1["state"]>([
  "READY",
  "WARN",
  "BLOCKED",
  "FAILED",
  "CANCELLED",
])

const POLL_INTERVAL_MS = 2000

interface UnifiedBuilderClientProps {
  idea: IdeaArtifact
  strategyOptions: StrategyOption[]
}

export function UnifiedBuilderClient({ idea, strategyOptions }: UnifiedBuilderClientProps) {
  const router = useRouter()
  const [job, setJob] = useState<TalonDraftJobV1 | null>(null)
  const [referenceStrategies, setReferenceStrategies] = useState<ReferenceStrategy[]>(
    idea.reference_strategies ?? [],
  )
  const [starting, setStarting] = useState(false)
  const [applying, setApplying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pollRetryNonce, setPollRetryNonce] = useState(0)
  const startedRef = useRef(false)

  const startJob = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true
    setStarting(true)
    setError(null)
    try {
      const res = await fetch("/api/research/specs/draft-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea_id: idea.idea_id,
          builder_state: {
            mode: "beginner",
            fields: {
              title: idea.title,
              thesis: idea.thesis,
              sleeve: idea.sleeve,
              tags: idea.tags ?? [],
              reference_strategies: referenceStrategies,
            },
          },
        }),
      })
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        job?: TalonDraftJobV1
        error?: string
      }
      if (!res.ok || !payload.job) {
        throw new Error(payload.error ?? `Builder start failed (${res.status})`)
      }
      setJob(payload.job)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Builder start failed")
      startedRef.current = false
    } finally {
      setStarting(false)
    }
  }, [idea.idea_id, idea.sleeve, idea.tags, idea.thesis, idea.title, referenceStrategies])

  // Poll while the job is in an active state. State flips to terminal on the
  // next poll if the worker stalls; the server-side stuck-job sweep promotes
  // it to FAILED so the client always converges without a hard cap here.
  useEffect(() => {
    if (!job || TERMINAL_STATES.has(job.state)) return
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/research/specs/draft-jobs/${encodeURIComponent(job.job_id)}`,
          { cache: "no-store" },
        )
        const payload = (await res.json().catch(() => ({}))) as {
          job?: TalonDraftJobV1
          error?: string
        }
        if (!res.ok || !payload.job) {
          throw new Error(payload.error ?? `Builder poll failed (${res.status})`)
        }
        setJob(payload.job)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Builder polling failed")
        setPollRetryNonce(n => n + 1)
      }
    }, POLL_INTERVAL_MS)
    return () => window.clearTimeout(handle)
  }, [job, pollRetryNonce])

  const onCancel = async () => {
    if (!job || TERMINAL_STATES.has(job.state) || cancelling) return
    setCancelling(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/research/specs/draft-jobs/${encodeURIComponent(job.job_id)}`,
        { method: "DELETE" },
      )
      const payload = (await res.json().catch(() => ({}))) as {
        job?: TalonDraftJobV1
        error?: string
      }
      if (!res.ok || !payload.job) {
        throw new Error(payload.error ?? `Cancel failed (${res.status})`)
      }
      setJob(payload.job)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed")
    } finally {
      setCancelling(false)
    }
  }

  const onApply = async () => {
    if (!job || (job.state !== "READY" && job.state !== "WARN") || applying) return
    setApplying(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/research/specs/draft-jobs/${encodeURIComponent(job.job_id)}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actor: idea.created_by ?? "jacob" }),
        },
      )
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        job?: TalonDraftJobV1
        error?: string
      }
      if (!res.ok || payload.ok === false) {
        throw new Error(payload.error ?? `Apply failed (${res.status})`)
      }
      router.push(`/vires/bench/lab/ideas/${encodeURIComponent(idea.idea_id)}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed")
      setApplying(false)
    }
  }

  const onRetry = () => {
    setJob(null)
    setError(null)
    startedRef.current = false
    startJob()
  }

  const headerScope = (
    <BuilderHeader
      ideaId={idea.idea_id}
      title={idea.title}
      sleeve={idea.sleeve}
      job={job}
    />
  )

  return (
    <div
      style={{
        padding: "24px 20px 120px",
        maxWidth: 720,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {headerScope}

      {error && <BuilderErrorCard message={error} onDismiss={() => setError(null)} />}

      {!job && !starting && (
        <BuilderStartCard
          strategyOptions={strategyOptions}
          referenceStrategies={referenceStrategies}
          onReferenceStrategiesChange={setReferenceStrategies}
          onStart={startJob}
        />
      )}

      {starting && !job && <BuilderStatusCard label="Starting" body="Spinning up Talon for this idea." />}

      {job && (
        <BuilderJobBody
          job={job}
          applying={applying}
          cancelling={cancelling}
          onApply={onApply}
          onCancel={onCancel}
          onRetry={onRetry}
        />
      )}
    </div>
  )
}

function BuilderStartCard({
  strategyOptions,
  referenceStrategies,
  onReferenceStrategiesChange,
  onStart,
}: {
  strategyOptions: StrategyOption[]
  referenceStrategies: ReferenceStrategy[]
  onReferenceStrategiesChange: (next: ReferenceStrategy[]) => void
  onStart: () => void
}) {
  return (
    <div className="vr-card" style={cardStyle}>
      <div className="t-eyebrow" style={{ ...eyebrowStyle, color: "var(--vr-gold)" }}>
        Build with Talon
      </div>
      <div style={bodyStyle}>
        Pick any parent strategies Talon should study, then start the draft. References
        are context only; this remains new strategy work.
      </div>
      <ReferenceStrategyPicker
        options={strategyOptions}
        value={referenceStrategies}
        onChange={onReferenceStrategiesChange}
      />
      <button type="button" onClick={onStart} style={primaryButton}>
        Build with Talon
      </button>
    </div>
  )
}

// ─── Header ────────────────────────────────────────────────────────────────

function BuilderHeader({
  ideaId,
  title,
  sleeve,
  job,
}: {
  ideaId: string
  title: string
  sleeve: string
  job: TalonDraftJobV1 | null
}) {
  const stateLabel = job ? humanizeState(job.state) : "starting"
  const stateColor = job ? stateColorFor(job.state) : "var(--vr-cream-mute)"
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          className="t-eyebrow"
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            color: stateColor,
            border: `1px solid ${stateColor}`,
            padding: "2px 7px",
            borderRadius: 2,
            textTransform: "uppercase",
          }}
        >
          {stateLabel}
        </span>
        <span className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)" }}>
          {sleeve}
        </span>
        <Link
          href={`/vires/bench/lab/ideas/${encodeURIComponent(ideaId)}`}
          style={{
            marginLeft: "auto",
            fontFamily: "var(--ff-mono)",
            fontSize: 10.5,
            color: "var(--vr-cream-mute)",
            padding: "3px 9px",
            border: "1px solid var(--vr-line)",
            borderRadius: 2,
            textDecoration: "none",
          }}
        >
          ← Idea
        </Link>
      </div>
      <h1
        className="t-display"
        style={{ margin: 0, fontSize: 24, lineHeight: 1.2, color: "var(--vr-cream)", fontWeight: 400 }}
      >
        {title}
      </h1>
      <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)", letterSpacing: "0.14em" }}>
        Spec builder · beginner
      </div>
    </div>
  )
}

// ─── State-specific bodies ────────────────────────────────────────────────

function BuilderJobBody({
  job,
  applying,
  cancelling,
  onApply,
  onCancel,
  onRetry,
}: {
  job: TalonDraftJobV1
  applying: boolean
  cancelling: boolean
  onApply: () => void
  onCancel: () => void
  onRetry: () => void
}) {
  if (job.builder_state?.input_state === "AWAITING_CLARIFICATION") {
    return <BuilderClarificationCard job={job} />
  }

  switch (job.state) {
    case "QUEUED":
      return (
        <BuilderRunningCard
          label="Queued"
          body="Talon is picking this up next. Step shows up here as soon as it starts."
          onCancel={onCancel}
          cancelling={cancelling}
        />
      )
    case "RUNNING":
      return (
        <BuilderRunningCard
          label={job.current_step ? humanizeStep(job.current_step) : "Drafting"}
          body="Talon is drafting the spec from your thesis. This usually finishes in under a minute."
          onCancel={onCancel}
          cancelling={cancelling}
        />
      )
    case "REPAIRING":
      return (
        <BuilderRunningCard
          label="Repairing"
          body={`Validation failed once; Talon is trying again (attempt ${job.repair_attempts + 1}).`}
          onCancel={onCancel}
          cancelling={cancelling}
        />
      )
    case "READY":
      return (
        <BuilderProposalCard
          job={job}
          tone="ready"
          onApply={onApply}
          applying={applying}
        />
      )
    case "WARN":
      return (
        <BuilderProposalCard
          job={job}
          tone="warn"
          onApply={onApply}
          applying={applying}
        />
      )
    case "BLOCKED":
      return <BuilderBlockedCard job={job} onRetry={onRetry} />
    case "FAILED":
      return <BuilderFailedCard job={job} onRetry={onRetry} />
    case "CANCELLED":
      return <BuilderCancelledCard onRetry={onRetry} />
  }
  return null
}

function BuilderStatusCard({ label, body }: { label: string; body: string }) {
  return (
    <div className="vr-card" style={cardStyle}>
      <div className="t-eyebrow" style={eyebrowStyle}>{label}</div>
      <div style={bodyStyle}>{body}</div>
    </div>
  )
}

function BuilderRunningCard({
  label,
  body,
  onCancel,
  cancelling,
}: {
  label: string
  body: string
  onCancel: () => void
  cancelling: boolean
}) {
  return (
    <div className="vr-card" style={cardStyle}>
      <div className="t-eyebrow" style={eyebrowStyle}>{label}</div>
      <div style={bodyStyle}>{body}</div>
      <button
        type="button"
        onClick={onCancel}
        disabled={cancelling}
        style={ghostButton}
      >
        {cancelling ? "Cancelling…" : "Cancel"}
      </button>
    </div>
  )
}

function BuilderProposalCard({
  job,
  tone,
  onApply,
  applying,
}: {
  job: TalonDraftJobV1
  tone: "ready" | "warn"
  onApply: () => void
  applying: boolean
}) {
  const proposal = job.builder_state?.current_draft ?? job.proposal
  const assessment = job.builder_state?.current_assessment ?? job.assessment
  const accent = tone === "ready" ? "var(--vr-up)" : "var(--vr-gold)"
  const accentLine = tone === "ready" ? "rgba(104,200,142,0.42)" : "var(--vr-gold-line)"
  const accentSoft = tone === "ready" ? "rgba(104,200,142,0.06)" : "var(--vr-gold-soft)"

  return (
    <div
      className="vr-card"
      style={{
        ...cardStyle,
        borderLeft: `2px solid ${accent}`,
        background: accentSoft,
      }}
    >
      <div className="t-eyebrow" style={{ ...eyebrowStyle, color: accent }}>
        {tone === "ready" ? "Proposal ready" : "Proposal ready · with warnings"}
      </div>

      {proposal && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              fontSize: 14,
              color: "var(--vr-cream)",
              lineHeight: 1.4,
            }}
          >
            {proposal.signal_logic}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <MiniBlock label="Entry" value={proposal.entry_rules} />
            <MiniBlock label="Exit" value={proposal.exit_rules} />
          </div>
        </div>
      )}

      {tone === "warn" && assessment?.warnings && assessment.warnings.length > 0 && (
        <ul
          style={{
            margin: 0,
            paddingLeft: 16,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            color: "var(--vr-gold)",
            fontSize: 11.5,
            lineHeight: 1.5,
          }}
        >
          {assessment.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onApply}
        disabled={applying}
        style={{
          ...primaryButton,
          color: accent,
          borderColor: accentLine,
          background: accentSoft,
        }}
      >
        {applying ? "Applying…" : "Apply proposal"}
      </button>
    </div>
  )
}

function BuilderBlockedCard({ job, onRetry }: { job: TalonDraftJobV1; onRetry: () => void }) {
  const assessment = job.builder_state?.current_assessment ?? job.assessment
  return (
    <div
      className="vr-card"
      style={{
        ...cardStyle,
        borderLeft: "2px solid var(--vr-down)",
        background: "rgba(218,86,86,0.04)",
      }}
    >
      <div className="t-eyebrow" style={{ ...eyebrowStyle, color: "var(--vr-down)" }}>Blocked</div>
      <div style={bodyStyle}>
        {assessment?.blocking_summary ?? "Talon couldn't draft a spec for this idea yet."}
      </div>
      {assessment?.suggested_action && (
        <div style={{ ...bodyStyle, color: "var(--vr-cream-mute)" }}>{assessment.suggested_action}</div>
      )}
      <button type="button" onClick={onRetry} style={ghostButton}>
        Try again
      </button>
    </div>
  )
}

function BuilderFailedCard({ job, onRetry }: { job: TalonDraftJobV1; onRetry: () => void }) {
  return (
    <div
      className="vr-card"
      style={{
        ...cardStyle,
        borderLeft: "2px solid var(--vr-down)",
        background: "rgba(218,86,86,0.04)",
      }}
    >
      <div className="t-eyebrow" style={{ ...eyebrowStyle, color: "var(--vr-down)" }}>Failed</div>
      <div style={bodyStyle}>
        {job.error_code ? `${job.error_code}: ` : ""}
        {job.error ?? "Talon hit an error before reaching a proposal."}
      </div>
      <button type="button" onClick={onRetry} style={ghostButton}>
        Try again
      </button>
    </div>
  )
}

function BuilderCancelledCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="vr-card" style={cardStyle}>
      <div className="t-eyebrow" style={eyebrowStyle}>Cancelled</div>
      <div style={bodyStyle}>This draft was cancelled. Start a new one when you&apos;re ready.</div>
      <button type="button" onClick={onRetry} style={ghostButton}>
        Start over
      </button>
    </div>
  )
}

function BuilderClarificationCard({ job }: { job: TalonDraftJobV1 }) {
  const open = (job.builder_state?.open_questions ?? []).filter(q => q.state === "OPEN")
  return (
    <div
      className="vr-card"
      style={{
        ...cardStyle,
        borderLeft: "2px solid var(--vr-gold)",
        background: "var(--vr-gold-soft)",
      }}
    >
      <div className="t-eyebrow" style={{ ...eyebrowStyle, color: "var(--vr-gold)" }}>Clarification needed</div>
      <div style={bodyStyle}>
        Talon needs more from you before it can draft. Answer these on the legacy thread for now.
      </div>
      <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4, fontSize: 12, lineHeight: 1.5, color: "var(--vr-cream)" }}>
        {open.map(q => (
          <li key={q.question_id}>{q.question_text}</li>
        ))}
      </ul>
    </div>
  )
}

function BuilderErrorCard({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      className="vr-card"
      style={{
        ...cardStyle,
        borderLeft: "2px solid var(--vr-down)",
        background: "rgba(218,86,86,0.04)",
      }}
    >
      <div className="t-eyebrow" style={{ ...eyebrowStyle, color: "var(--vr-down)" }}>Error</div>
      <div style={bodyStyle}>{message}</div>
      <button type="button" onClick={onDismiss} style={ghostButton}>Dismiss</button>
    </div>
  )
}

function MiniBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="t-eyebrow" style={{ fontSize: 8.5, color: "var(--vr-cream-mute)", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--vr-cream-dim)", lineHeight: 1.45 }}>
        {value}
      </div>
    </div>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────

function humanizeState(state: TalonDraftJobV1["state"]): string {
  switch (state) {
    case "QUEUED": return "queued"
    case "RUNNING": return "drafting"
    case "REPAIRING": return "repairing"
    case "READY": return "ready"
    case "WARN": return "warn"
    case "BLOCKED": return "blocked"
    case "FAILED": return "failed"
    case "CANCELLED": return "cancelled"
  }
}

function humanizeStep(step: NonNullable<TalonDraftJobV1["current_step"]>): string {
  switch (step) {
    case "load_context": return "Reading idea"
    case "draft_strategy_core": return "Drafting strategy"
    case "draft_experiment_plan": return "Drafting experiment plan"
    case "data_readiness": return "Checking data readiness"
    case "validate_schema": return "Validating"
    case "repair": return "Repairing"
    case "persist": return "Persisting"
  }
}

function stateColorFor(state: TalonDraftJobV1["state"]): string {
  switch (state) {
    case "READY": return "var(--vr-up)"
    case "WARN": return "var(--vr-gold)"
    case "BLOCKED":
    case "FAILED":
      return "var(--vr-down)"
    case "CANCELLED": return "var(--vr-cream-mute)"
    default: return "var(--vr-cream-mute)"
  }
}

const cardStyle: React.CSSProperties = {
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.14em",
  color: "var(--vr-cream-mute)",
}

const bodyStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--vr-cream)",
  lineHeight: 1.55,
}

const ghostButton: React.CSSProperties = {
  alignSelf: "flex-start",
  fontFamily: "var(--ff-mono)",
  fontSize: 11,
  color: "var(--vr-cream-mute)",
  padding: "6px 12px",
  border: "1px solid var(--vr-line)",
  borderRadius: 2,
  background: "transparent",
  cursor: "pointer",
}

const primaryButton: React.CSSProperties = {
  alignSelf: "flex-start",
  fontFamily: "var(--ff-mono)",
  fontSize: 11,
  padding: "7px 14px",
  border: "1px solid var(--vr-gold-line)",
  borderRadius: 3,
  background: "var(--vr-gold-soft)",
  color: "var(--vr-gold)",
  cursor: "pointer",
}
