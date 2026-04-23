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
      <SectionCard eyebrow="Live state · polling" eyebrowColor="var(--vr-cream-mute)">
        <div style={{ fontSize: 12, color: "var(--vr-cream-mute)", lineHeight: 1.55 }}>
          Connecting to the managed state store…
        </div>
      </SectionCard>
    )
  }

  // Live store unavailable
  if (data.source === "unconfigured") {
    return (
      <SectionCard
        eyebrow="Live state · store not configured"
        eyebrowColor="var(--vr-cream-mute)"
        accent="var(--vr-cream-mute)"
      >
        <div style={{ fontSize: 12, color: "var(--vr-cream)", lineHeight: 1.55 }}>
          The managed state store env vars (
          <span className="t-mono">UPSTASH_REDIS_REST_URL</span> /{" "}
          <span className="t-mono">UPSTASH_REDIS_REST_TOKEN</span>) aren't set on
          this deployment. Live progress polling is disabled until they land.
          Jobs continue running on the worker side regardless.
        </div>
      </SectionCard>
    )
  }

  if (data.source === "outage") {
    return (
      <SectionCard
        eyebrow="Live state · unavailable"
        eyebrowColor="var(--vr-down)"
        accent="var(--vr-down)"
      >
        <div style={{ fontSize: 12.5, color: "var(--vr-cream)", lineHeight: 1.55 }}>
          Live progress unavailable — the job is still running; results will
          appear on completion.
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 10.5,
            color: "var(--vr-cream-mute)",
            fontFamily: "var(--vr-font-mono), monospace",
          }}
        >
          error: {data.error}
        </div>
      </SectionCard>
    )
  }

  // Job hasn't been materialized yet — receipt phase
  if (data.job === null) {
    return (
      <SectionCard
        eyebrow="Job pending · awaiting enqueue"
        eyebrowColor="var(--vr-gold)"
        accent="var(--vr-gold)"
      >
        <div style={{ fontSize: 12.5, color: "var(--vr-cream)", lineHeight: 1.55 }}>
          The governed request file committed to the dashboard repo. The worker
          on the trading-bot host picks it up on its next git-fetch poll
          (~15-30s) and materializes a real <span className="t-mono">job.v1</span>{" "}
          row in SQLite. Live progress will start flowing as soon as it does.
        </div>
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            rowGap: 3,
            columnGap: 10,
            fontSize: 11,
            fontFamily: "var(--vr-font-mono), monospace",
            color: "var(--vr-cream-dim)",
          }}
        >
          <span>job_id</span>
          <span style={{ color: "var(--vr-cream)" }}>{data.job_id}</span>
          <span>state</span>
          <span style={{ color: "var(--vr-gold)" }}>PENDING_ENQUEUE</span>
          <span>last_poll</span>
          <span style={{ color: "var(--vr-cream-mute)" }}>{data.polled_at}</span>
        </div>
      </SectionCard>
    )
  }

  // Materialized — real job.v1
  const job = data.job
  const progress = job.progress
  const progressPct =
    progress && progress.variants_total > 0
      ? Math.round((progress.variants_complete / progress.variants_total) * 100)
      : null

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

      {progress && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              fontSize: 11,
              color: "var(--vr-cream-mute)",
              marginBottom: 4,
              fontFamily: "var(--vr-font-mono), monospace",
            }}
          >
            <span>{progress.phase}</span>
            <span>
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
          rowGap: 3,
          columnGap: 10,
          fontSize: 11,
          fontFamily: "var(--vr-font-mono), monospace",
          color: "var(--vr-cream-dim)",
        }}
      >
        <span>created</span>
        <span style={{ color: "var(--vr-cream)" }}>{job.created_at}</span>
        {job.started_at ? (
          <>
            <span>started</span>
            <span style={{ color: "var(--vr-cream)" }}>{job.started_at}</span>
          </>
        ) : null}
        {job.finished_at ? (
          <>
            <span>finished</span>
            <span style={{ color: "var(--vr-cream)" }}>{job.finished_at}</span>
          </>
        ) : null}
        {job.heartbeat_at ? (
          <>
            <span>heartbeat</span>
            <span style={{ color: "var(--vr-cream)" }}>{job.heartbeat_at}</span>
          </>
        ) : null}
        {job.executor_id ? (
          <>
            <span>executor</span>
            <span style={{ color: "var(--vr-cream)" }}>{job.executor_id}</span>
          </>
        ) : null}
        {job.retry_count != null && job.retry_count > 0 ? (
          <>
            <span>retry_count</span>
            <span style={{ color: "var(--vr-gold)" }}>{job.retry_count}</span>
          </>
        ) : null}
        {job.error_code ? (
          <>
            <span>error_code</span>
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
