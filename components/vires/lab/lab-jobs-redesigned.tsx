"use client"

// Redesigned Jobs list for the 2026-04-22 Lab. Card layout — status pill,
// sleeve label, idea title, mono job_id, time-ago. Polls /api/research/jobs
// every 15s and filters client-side via the shared lab-sleeve-filter hook.

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

import type { JobState, JobV1, ResearchSleeve } from "@/lib/research-lab-contracts"

import { useLabSleeveFilter } from "./use-lab-sleeve-filter"

const POLL_INTERVAL_MS = 15_000

const SLEEVE_COLOR: Record<ResearchSleeve, string> = {
  STOCKS: "var(--vr-sleeve-stocks)",
  OPTIONS: "var(--vr-sleeve-options)",
  CRYPTO: "var(--vr-sleeve-crypto)",
}

const JOB_STATE_COLOR: Record<JobState, string> = {
  QUEUED:          "var(--vr-cream-mute)",
  COMPILING:       "var(--vr-gold)",
  RUNNING:         "var(--vr-gold)",
  POST_PROCESSING: "var(--vr-gold)",
  DONE:            "var(--vr-up)",
  FAILED:          "var(--vr-down)",
  RETRY_QUEUED:    "var(--vr-gold)",
  CANCELLED:       "var(--vr-cream-mute)",
}

interface JobDisplayMap {
  [ideaId: string]: { title: string; sleeve: ResearchSleeve | null }
}

interface ListResponse {
  ok?: boolean
  source?: "store" | "unconfigured" | "outage"
  jobs?: JobV1[]
  idea_display?: JobDisplayMap
  error?: string
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

export function LabJobsRedesigned() {
  const [jobs, setJobs] = useState<JobV1[] | null>(null)
  const [display, setDisplay] = useState<JobDisplayMap>({})
  const [source, setSource] = useState<ListResponse["source"]>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [sleeve] = useLabSleeveFilter()
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    const fetchOnce = async () => {
      try {
        const res = await fetch("/api/research/jobs", { cache: "no-store" })
        const payload = (await res.json()) as ListResponse
        if (cancelledRef.current) return
        if (!res.ok) throw new Error(payload.error ?? `Jobs fetch failed (${res.status})`)
        setJobs(payload.jobs ?? [])
        setDisplay(payload.idea_display ?? {})
        setSource(payload.source)
        setError(null)
      } catch (err) {
        if (!cancelledRef.current) {
          setError(err instanceof Error ? err.message : "Jobs fetch failed")
        }
      } finally {
        if (!cancelledRef.current) {
          timeout = setTimeout(fetchOnce, POLL_INTERVAL_MS)
        }
      }
    }
    void fetchOnce()
    return () => {
      cancelledRef.current = true
      if (timeout) clearTimeout(timeout)
    }
  }, [])

  const filtered = useMemo(() => {
    if (!jobs) return null
    if (sleeve === "ALL") return jobs
    return jobs.filter(job => {
      const ideaSleeve = job.idea_id ? display[job.idea_id]?.sleeve : null
      return ideaSleeve === sleeve
    })
  }, [jobs, display, sleeve])

  return (
    <div style={{ padding: "16px 20px 120px", maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <h1
          className="t-display"
          style={{ margin: 0, fontSize: 28, lineHeight: 1.15, color: "var(--vr-cream)", fontWeight: 400 }}
        >
          Jobs
        </h1>
        <span className="t-mono" style={{ fontSize: 11, color: "var(--vr-cream-mute)" }}>
          {jobs ? `${jobs.length} run${jobs.length === 1 ? "" : "s"}` : "—"}
        </span>
      </div>

      {source === "unconfigured" && (
        <Notice tone="muted" text="Jobs store not configured on this deployment." />
      )}
      {error && <Notice tone="error" text={error} />}

      {filtered === null ? (
        <Skeleton rows={3} />
      ) : filtered.length === 0 ? (
        <Notice
          tone="muted"
          text={sleeve === "ALL" ? "No jobs yet." : `No ${sleeve.toLowerCase()} jobs yet.`}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(job => (
            <JobCardRow
              key={job.job_id}
              job={job}
              display={job.idea_id ? display[job.idea_id] : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function JobCardRow({
  job,
  display,
}: {
  job: JobV1
  display?: { title: string; sleeve: ResearchSleeve | null }
}) {
  const stateColor = JOB_STATE_COLOR[job.state]
  const sleeveColor = display?.sleeve ? SLEEVE_COLOR[display.sleeve] : "var(--vr-cream-mute)"
  const href = job.idea_id
    ? `/vires/bench/lab/ideas/${encodeURIComponent(job.idea_id)}`
    : `/vires/bench/lab/jobs/${encodeURIComponent(job.job_id)}`
  const title = display?.title ?? job.idea_id ?? job.job_id
  const ts = job.finished_at ?? job.created_at ?? null
  return (
    <Link
      href={href}
      className="vr-card"
      style={{
        padding: "12px 14px",
        textDecoration: "none",
        color: "inherit",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        borderLeft: `2px solid ${stateColor}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span
          className="t-eyebrow"
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            color: stateColor,
            border: `1px solid ${stateColor}`,
            padding: "2px 7px",
            borderRadius: 2,
          }}
        >
          {job.state.replace(/_/g, " ")}
        </span>
        <span className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)", letterSpacing: "0.14em" }}>
          <span
            style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: sleeveColor, marginRight: 6, verticalAlign: "middle" }}
          />
          {(display?.sleeve ?? "—").toString().toLowerCase()}
        </span>
        <span className="t-mono" style={{ fontSize: 10, color: "var(--vr-cream-faint)", marginLeft: "auto" }}>
          {relTime(ts)}
        </span>
      </div>
      <div
        style={{
          fontSize: 14,
          color: "var(--vr-cream)",
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </div>
      <div
        className="t-mono"
        style={{
          fontSize: 10,
          color: "var(--vr-cream-faint)",
          letterSpacing: "0.06em",
        }}
      >
        {job.job_id}
      </div>
    </Link>
  )
}

function Notice({ tone, text }: { tone: "muted" | "error"; text: string }) {
  const isError = tone === "error"
  return (
    <div
      className="vr-card"
      style={{
        padding: "10px 14px",
        fontSize: 11.5,
        color: isError ? "var(--vr-cream)" : "var(--vr-cream-faint)",
        fontStyle: isError ? "normal" : "italic",
        borderLeft: isError ? "2px solid var(--vr-down)" : undefined,
        background: isError ? "rgba(218,86,86,0.04)" : undefined,
      }}
    >
      {text}
    </div>
  )
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="vr-card" style={{ padding: "12px 14px", height: 64, opacity: 0.45 }} />
      ))}
    </div>
  )
}
