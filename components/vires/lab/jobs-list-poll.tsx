"use client"

// Polls /api/research/jobs every ~15s. Renders four honest states:
//
//   1. populated   — one or more live jobs in the store
//   2. empty       — store reachable, zero jobs (either no submissions
//                    yet, or worker hasn't materialized the most recent
//                    submission yet)
//   3. unconfigured — UPSTASH env vars not set
//   4. outage      — store reachable but errored
//
// Cold-tree historical count is rendered as a small footer when > 0
// (ready for when Codex's (5) slice lands terminal artifacts).

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

import type { JobState, JobV1 } from "@/lib/research-lab-contracts"

type ListResponse =
  | {
      ok: true
      scope: { user_id: string; account_id: string; strategy_group_id: string }
      source: "store"
      jobs: JobV1[]
      state: "populated" | "empty"
      cold_terminal_count: number
      polled_at: string
    }
  | {
      ok: true
      scope: { user_id: string; account_id: string; strategy_group_id: string }
      source: "unconfigured"
      jobs: []
      cold_terminal_count: number
      polled_at: string
    }
  | {
      ok: true
      scope: { user_id: string; account_id: string; strategy_group_id: string }
      source: "outage"
      jobs: []
      error: string
      cold_terminal_count: number
      polled_at: string
    }

const POLL_INTERVAL_MS = 15_000

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
        padding: "3px 8px",
        fontSize: 9,
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

function relTime(iso: string | null | undefined): string {
  if (!iso) return ""
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ""
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (diffSec < 60) return `${diffSec}s ago`
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

function JobRow({ job }: { job: JobV1 }) {
  const progress = job.progress
  const progressStr =
    progress && progress.variants_total > 0
      ? `${progress.variants_complete}/${progress.variants_total}`
      : null

  return (
    <Link
      href={`/vires/lab/jobs/${encodeURIComponent(job.job_id)}`}
      className="vr-card"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "12px 14px",
        background: "rgba(241,236,224,0.015)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          className="t-mono"
          style={{
            fontSize: 11,
            color: "var(--vr-cream)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {job.job_id}
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: 10,
            color: "var(--vr-cream-mute)",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span>{relTime(job.created_at)}</span>
          {progressStr ? <span>· {progressStr}</span> : null}
          {progress?.phase ? <span>· {progress.phase}</span> : null}
          {job.retry_count && job.retry_count > 0 ? (
            <span style={{ color: "var(--vr-gold)" }}>· retry {job.retry_count}</span>
          ) : null}
        </div>
      </div>
      <StateChip state={job.state} />
    </Link>
  )
}

function EmptyStoreCard({ scope, polledAt }: { scope: string; polledAt: string }) {
  return (
    <div
      className="vr-card"
      style={{
        padding: "16px 18px",
        background: "rgba(241,236,224,0.02)",
        borderLeft: "2px solid var(--vr-gold)",
      }}
    >
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-gold)", marginBottom: 6, letterSpacing: "0.14em" }}
      >
        Live queue · empty
      </div>
      <div style={{ fontSize: 12.5, color: "var(--vr-cream)", lineHeight: 1.55 }}>
        No jobs in the store right now. Submit a campaign from the Lab, or
        wait for a job the worker is about to materialize. Live data starts
        flowing as soon as Codex's worker picks up a governed request file
        and publishes its first <span className="t-mono">job.v1</span> snapshot.
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 10.5,
          color: "var(--vr-cream-mute)",
          fontFamily: "var(--vr-font-mono), monospace",
        }}
      >
        scope: {scope} · last_poll: {polledAt}
      </div>
    </div>
  )
}

function UnconfiguredCard() {
  return (
    <div
      className="vr-card"
      style={{
        padding: "16px 18px",
        background: "rgba(241,236,224,0.02)",
        borderLeft: "2px solid var(--vr-cream-mute)",
      }}
    >
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 6, letterSpacing: "0.14em" }}
      >
        Live store · not configured
      </div>
      <div style={{ fontSize: 12.5, color: "var(--vr-cream)", lineHeight: 1.55 }}>
        <span className="t-mono">UPSTASH_REDIS_REST_URL</span> /{" "}
        <span className="t-mono">UPSTASH_REDIS_REST_TOKEN</span> aren't set on
        this deployment. Live job listing is disabled until they land. Jobs
        continue running on the worker regardless; cold artifacts will appear
        here once committed.
      </div>
    </div>
  )
}

function OutageCard({ error }: { error: string }) {
  return (
    <div
      className="vr-card"
      style={{
        padding: "16px 18px",
        background: "rgba(241,236,224,0.02)",
        borderLeft: "2px solid var(--vr-down)",
      }}
    >
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-down)", marginBottom: 6, letterSpacing: "0.14em" }}
      >
        Live store · unavailable
      </div>
      <div style={{ fontSize: 12.5, color: "var(--vr-cream)", lineHeight: 1.55 }}>
        Live queue can't be read right now. Jobs continue running; terminal
        results will land in the cold tree.
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 10.5,
          color: "var(--vr-cream-mute)",
          fontFamily: "var(--vr-font-mono), monospace",
        }}
      >
        error: {error}
      </div>
    </div>
  )
}

export function JobsListPoll() {
  const [data, setData] = useState<ListResponse | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch("/api/research/jobs", { cache: "no-store" })
        const payload = (await res.json()) as ListResponse
        if (!cancelled) setData(payload)
      } catch {
        // Transient network — next tick retries; don't flip to outage on
        // fetch-thrown errors that the store itself didn't see.
      } finally {
        if (!cancelled) timerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (!data) {
    return (
      <div
        className="vr-card"
        style={{ padding: "16px 18px", color: "var(--vr-cream-mute)", fontSize: 12 }}
      >
        Connecting to the managed state store…
      </div>
    )
  }

  const scopeStr = `${data.scope.user_id} / ${data.scope.account_id} / ${data.scope.strategy_group_id}`

  let body: React.ReactNode
  if (data.source === "unconfigured") body = <UnconfiguredCard />
  else if (data.source === "outage") body = <OutageCard error={data.error} />
  else if (data.jobs.length === 0) body = <EmptyStoreCard scope={scopeStr} polledAt={data.polled_at} />
  else {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.jobs.map(job => (
          <JobRow key={job.job_id} job={job} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {body}
      {data.cold_terminal_count > 0 ? (
        <div
          style={{
            padding: "10px 14px",
            fontSize: 10.5,
            color: "var(--vr-cream-mute)",
            textAlign: "center",
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
          }}
        >
          {data.cold_terminal_count} terminal job{data.cold_terminal_count === 1 ? "" : "s"}{" "}
          in the cold tree · historical list coming once the reader lands
        </div>
      ) : null}
    </div>
  )
}
