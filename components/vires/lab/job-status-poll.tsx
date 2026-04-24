"use client"

// Polls /api/research/jobs/[id] every ~15s and renders the current state
// honestly across four cases:
//
//   1. not_materialized  — submitter received a job_pending.v1 receipt;
//      worker hasn't picked up the request file yet. Renders the pending
//      receipt shape if we have one in sessionStorage, or a generic
//      "waiting to materialize" state otherwise.
//   2. materialized      — real job.v1 from SQLite via store. Renders
//      state chip + progress + heartbeat.
//   3. unconfigured      — store env vars not set on Vercel. Honest
//      "live-read store not configured" state.
//   4. outage            — store reachable but error. Honest "live
//      progress unavailable" state; job continues running.

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

import type { JobState, JobV1 } from "@/lib/research-lab-contracts"

type PollResponse =
  | { ok: true; job_id: string; source: "store"; job: JobV1; state: "materialized"; polled_at: string }
  | { ok: true; job_id: string; source: "store"; job: null; state: "not_materialized"; polled_at: string }
  | { ok: true; job_id: string; source: "unconfigured"; job: null; polled_at: string }
  | { ok: true; job_id: string; source: "outage"; job: null; error: string; polled_at: string }

const POLL_INTERVAL_MS = 15_000

// ─── Small visual helpers ───────────────────────────────────────────────

const STATE_COLOR: Record<JobState, string> = {
  QUEUED:          "var(--vr-cream-mute)",
  COMPILING:       "var(--vr-gold)",
  RUNNING:         "var(--vr-gold)",
  POST_PROCESSING: "var(--vr-gold)",
  DONE:            "var(--vr-up)",
  FAILED:          "var(--vr-down)",
  RETRY_QUEUED:    "var(--vr-gold)",
  CANCELLED:       "var(--vr-cream-mute)",
}

// Human-readable timestamp formatter. Produces "Apr 23, 10:36 PM · 2h ago".
// Returns null if the input isn't a parseable ISO string.
function fmtTs(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const human = d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
  const diffSec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000))
  let rel: string
  if (diffSec < 60) rel = `${diffSec}s ago`
  else if (diffSec < 3600) rel = `${Math.floor(diffSec / 60)}m ago`
  else if (diffSec < 86400) rel = `${Math.floor(diffSec / 3600)}h ago`
  else rel = `${Math.floor(diffSec / 86400)}d ago`
  return `${human} · ${rel}`
}

function fmtDuration(startedAt: string | null | undefined, finishedAt: string | null | undefined): string | null {
  if (!startedAt || !finishedAt) return null
  const start = Date.parse(startedAt)
  const end = Date.parse(finishedAt)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  const ms = Math.max(0, end - start)
  if (ms < 1000) return `${ms}ms`
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)}s`
  const min = sec / 60
  if (min < 60) return `${min.toFixed(1)}m`
  const hr = min / 60
  return `${hr.toFixed(1)}h`
}

function StateChip({ state }: { state: JobState }) {
  const color = STATE_COLOR[state] ?? "var(--vr-cream-mute)"
  return (
    <span
      className="t-eyebrow"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        fontSize: 10,
        letterSpacing: "0.14em",
        borderRadius: 2,
        border: `1px solid ${color}`,
        color,
      }}
    >
      {state.replace(/_/g, " ")}
    </span>
  )
}

function SectionCard({
  eyebrow,
  eyebrowColor = "var(--vr-gold)",
  children,
  accent,
}: {
  eyebrow: string
  eyebrowColor?: string
  children: React.ReactNode
  accent?: string
}) {
  return (
    <div
      className="vr-card"
      style={{
        padding: "16px 18px",
        background: "rgba(241,236,224,0.02)",
        borderLeft: accent ? `2px solid ${accent}` : undefined,
      }}
    >
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, color: eyebrowColor, marginBottom: 8, letterSpacing: "0.14em" }}
      >
        {eyebrow}
      </div>
      {children}
    </div>
  )
}

// ─── Component ──────────────────────────────────────────────────────────

export function JobStatusPoll({ jobId }: { jobId: string }) {
  const [data, setData] = useState<PollResponse | null>(null)
  const [firstPollDone, setFirstPollDone] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(`/api/research/jobs/${encodeURIComponent(jobId)}`, {
          cache: "no-store",
        })
        if (!res.ok) {
          if (!cancelled) {
            setData({
              ok: true,
              job_id: jobId,
              source: "outage",
              job: null,
              error: `HTTP ${res.status}`,
              polled_at: new Date().toISOString(),
            })
            setFirstPollDone(true)
          }
          return
        }
        const payload = (await res.json()) as PollResponse
        if (!cancelled) {
          setData(payload)
          setFirstPollDone(true)
        }
      } catch (err) {
        if (!cancelled) {
          setData({
            ok: true,
            job_id: jobId,
            source: "outage",
            job: null,
            error: err instanceof Error ? err.message : "Network error",
            polled_at: new Date().toISOString(),
          })
          setFirstPollDone(true)
        }
      } finally {
        if (!cancelled) {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
        }
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [jobId])

  // Pre-first-poll placeholder
  if (!firstPollDone || !data) {
    return (
      <SectionCard eyebrow="Live state" eyebrowColor="var(--vr-cream-mute)">
        <div style={{ fontSize: 12, color: "var(--vr-cream-mute)", lineHeight: 1.55 }}>
          Loading…
        </div>
      </SectionCard>
    )
  }

  if (data.source === "unconfigured") {
    return (
      <SectionCard
        eyebrow="Live updates unavailable"
        eyebrowColor="var(--vr-cream-mute)"
        accent="var(--vr-cream-mute)"
      >
        <div style={{ fontSize: 12.5, color: "var(--vr-cream)", lineHeight: 1.55 }}>
          The live view needs configuration. Runs continue on the backend;
          results appear once complete.
        </div>
      </SectionCard>
    )
  }

  if (data.source === "outage") {
    return (
      <SectionCard
        eyebrow="Live updates paused"
        eyebrowColor="var(--vr-down)"
        accent="var(--vr-down)"
      >
        <div style={{ fontSize: 12.5, color: "var(--vr-cream)", lineHeight: 1.55 }}>
          Can't read the live view right now. The run continues — results will
          appear on completion.
        </div>
      </SectionCard>
    )
  }

  // Job hasn't been materialized yet — receipt phase
  if (data.job === null) {
    return (
      <SectionCard
        eyebrow="Just submitted"
        eyebrowColor="var(--vr-gold)"
        accent="var(--vr-gold)"
      >
        <div style={{ fontSize: 12.5, color: "var(--vr-cream)", lineHeight: 1.55 }}>
          Picked up by the queue. The run starts in the next few seconds —
          live progress will light up here once it does.
        </div>
      </SectionCard>
    )
  }

  // Materialized — real job.v1
  const job = data.job
  const progress = job.progress
  // Only show progress if real work happened. A 0/0 payload on a FAILED
  // job is just a stale default from the state machine's terminal phase
  // and reads as misleading ("it was summarizing when it failed").
  const showProgress = progress != null && progress.variants_total > 0
  const progressPct = showProgress
    ? Math.round((progress.variants_complete / progress.variants_total) * 100)
    : null

  const duration = fmtDuration(job.started_at, job.finished_at)

  return (
    <SectionCard
      eyebrow="Live state"
      eyebrowColor={STATE_COLOR[job.state] ?? "var(--vr-gold)"}
      accent={STATE_COLOR[job.state] ?? "var(--vr-gold)"}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div className="t-mono" style={{ fontSize: 11, color: "var(--vr-cream-mute)" }}>
          {job.job_id}
        </div>
        <StateChip state={job.state} />
      </div>

      {showProgress && progress && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              fontSize: 11,
              color: "var(--vr-cream-mute)",
              marginBottom: 4,
            }}
          >
            <span style={{ textTransform: "capitalize" }}>{progress.phase.replace(/_/g, " ")}</span>
            <span style={{ fontFamily: "var(--vr-font-mono), monospace" }}>
              {progress.variants_complete} / {progress.variants_total}
              {progressPct != null ? ` · ${progressPct}%` : ""}
            </span>
          </div>
          <div
            style={{
              height: 3,
              background: "var(--vr-line)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: progressPct != null ? `${progressPct}%` : "0%",
                height: "100%",
                background: STATE_COLOR[job.state] ?? "var(--vr-gold)",
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          rowGap: 5,
          columnGap: 12,
          fontSize: 12,
          color: "var(--vr-cream-dim)",
        }}
      >
        <span>Created</span>
        <span style={{ color: "var(--vr-cream)" }} title={job.created_at}>
          {fmtTs(job.created_at) ?? job.created_at}
        </span>
        {job.started_at ? (
          <>
            <span>Started</span>
            <span style={{ color: "var(--vr-cream)" }} title={job.started_at}>
              {fmtTs(job.started_at)}
            </span>
          </>
        ) : null}
        {job.finished_at ? (
          <>
            <span>Finished</span>
            <span style={{ color: "var(--vr-cream)" }} title={job.finished_at}>
              {fmtTs(job.finished_at)}
              {duration ? <span style={{ color: "var(--vr-cream-mute)" }}> · ran {duration}</span> : null}
            </span>
          </>
        ) : null}
        {job.retry_count != null && job.retry_count > 0 ? (
          <>
            <span>Retries</span>
            <span style={{ color: "var(--vr-gold)" }}>{job.retry_count}</span>
          </>
        ) : null}
        {job.error_code ? (
          <>
            <span>Error</span>
            <span style={{ color: "var(--vr-down)" }}>{job.error_code}</span>
          </>
        ) : null}
      </div>

      {job.error && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 10px",
            border: "1px solid var(--vr-down)",
            borderRadius: 3,
            fontSize: 11,
            color: "var(--vr-down)",
            lineHeight: 1.55,
          }}
        >
          {job.error}
        </div>
      )}

      {job.result_id && (
        <div style={{ marginTop: 12 }}>
          <Link
            href={`/vires/lab/jobs/${encodeURIComponent(job.job_id)}#result`}
            className="t-eyebrow"
            style={{
              fontSize: 10,
              color: "var(--vr-gold)",
              textDecoration: "none",
              letterSpacing: "0.14em",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            View result
            <svg width="10" height="10" viewBox="0 0 8 8" fill="none">
              <path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </Link>
        </div>
      )}
    </SectionCard>
  )
}
