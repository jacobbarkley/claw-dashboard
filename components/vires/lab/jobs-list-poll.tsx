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

import type { JobState, JobV1, ResearchSleeve } from "@/lib/research-lab-contracts"
import { useLabSleeveFilter } from "./use-lab-sleeve-filter"

interface IdeaDisplayMap {
  [ideaId: string]: { title: string; sleeve: ResearchSleeve | null }
}

type ListResponse =
  | {
      ok: true
      scope: { user_id: string; account_id: string; strategy_group_id: string }
      source: "store"
      jobs: JobV1[]
      idea_display?: IdeaDisplayMap
      state: "populated" | "empty"
      cold_terminal_count: number
      polled_at: string
    }
  | {
      ok: true
      scope: { user_id: string; account_id: string; strategy_group_id: string }
      source: "unconfigured"
      jobs: []
      idea_display?: IdeaDisplayMap
      cold_terminal_count: number
      polled_at: string
    }
  | {
      ok: true
      scope: { user_id: string; account_id: string; strategy_group_id: string }
      source: "outage"
      jobs: []
      idea_display?: IdeaDisplayMap
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

function JobRow({
  job,
  display,
}: {
  job: JobV1
  display?: { title: string; sleeve: ResearchSleeve | null }
}) {
  const progress = job.progress
  const progressStr =
    progress && progress.variants_total > 0
      ? `${progress.variants_complete}/${progress.variants_total}`
      : null
  const friendlyTitle = display?.title ?? deriveFallbackTitle(job)

  return (
    <Link
      href={`/vires/bench/lab/jobs/${encodeURIComponent(job.job_id)}`}
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
          style={{
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            fontSize: 14,
            color: "var(--vr-cream)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.25,
          }}
        >
          {friendlyTitle}
        </div>
        <div
          className="t-mono"
          style={{
            marginTop: 3,
            fontSize: 9.5,
            color: "var(--vr-cream-faint)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            letterSpacing: "0.04em",
          }}
        >
          {job.job_id}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 10,
            color: "var(--vr-cream-mute)",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {display?.sleeve ? <span>{display.sleeve.toLowerCase()}</span> : null}
          {display?.sleeve ? <span>·</span> : null}
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

// Fallback when the joined idea title isn't available — derive something
// readable from preset_id, otherwise show a short suffix of the job id.
function deriveFallbackTitle(job: JobV1): string {
  if (typeof job.preset_id === "string" && job.preset_id) {
    const cleaned = job.preset_id.replace(/^stocks\.|^crypto\.|^options\./, "")
    return cleaned.replace(/\./g, " ").replace(/_/g, " ")
  }
  if (typeof job.idea_id === "string" && job.idea_id) return job.idea_id
  return `Run ${job.job_id.slice(-6)}`
}

function EmptyStoreCard() {
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
        No runs yet
      </div>
      <div style={{ fontSize: 12.5, color: "var(--vr-cream)", lineHeight: 1.55 }}>
        Start a campaign from an idea and it will show up here.
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
        Live view unavailable
      </div>
      <div style={{ fontSize: 12.5, color: "var(--vr-cream)", lineHeight: 1.55 }}>
        The live view needs configuration. Runs still happen in the background.
      </div>
    </div>
  )
}

function OutageCard() {
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
        Live view paused
      </div>
      <div style={{ fontSize: 12.5, color: "var(--vr-cream)", lineHeight: 1.55 }}>
        Can&apos;t read the queue right now. Runs continue; results appear on completion.
      </div>
    </div>
  )
}

// Map a SleeveFilter value to the lowercase sleeve prefix used in
// research-lab preset ids (e.g. "stocks.momentum.stop_target.v1"). ALL
// returns null — skip filtering.
function sleevePrefix(filter: string): string | null {
  if (filter === "STOCKS") return "stocks."
  if (filter === "OPTIONS") return "options."
  if (filter === "CRYPTO") return "crypto."
  return null
}

export function JobsListPoll() {
  const [data, setData] = useState<ListResponse | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sleeveFilter] = useLabSleeveFilter()

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
        Loading…
      </div>
    )
  }

  // Apply the Lab sleeve filter to the populated-state jobs list. Match
  // is preset_id prefix (e.g. "stocks." / "crypto." / "options."). Jobs
  // without a preset_id fall through to ALL only. When Codex's job.v1
  // grows an explicit sleeve field, switch to that.
  const prefix = sleevePrefix(sleeveFilter)
  const filteredJobs =
    data.source === "store" && prefix
      ? data.jobs.filter(j => typeof j.preset_id === "string" && j.preset_id.toLowerCase().startsWith(prefix))
      : data.source === "store"
        ? data.jobs
        : []

  let body: React.ReactNode
  if (data.source === "unconfigured") body = <UnconfiguredCard />
  else if (data.source === "outage") body = <OutageCard />
  else if (filteredJobs.length === 0) body = <EmptyStoreCard />
  else {
    const ideaDisplay = data.source === "store" ? data.idea_display ?? {} : {}
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filteredJobs.map(job => (
          <JobRow
            key={job.job_id}
            job={job}
            display={job.idea_id ? ideaDisplay[job.idea_id] : undefined}
          />
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {body}
    </div>
  )
}
