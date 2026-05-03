"use client"

// Live job rail for the redesigned Idea Detail. Polls /api/research/jobs
// every 15s and filters to the current idea. Renders a compact list of
// status pill + mono job_id + time-ago, plus the Trade Atlas placeholder
// slot that lights up once Codex ships result_trades.v1.

import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import type { JobState, JobV1 } from "@/lib/research-lab-contracts"

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

interface ListResponse {
  ok?: boolean
  source?: "store" | "unconfigured" | "outage"
  jobs?: JobV1[]
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

export function IdeaJobsRail({ ideaId }: { ideaId: string }) {
  const [jobs, setJobs] = useState<JobV1[] | null>(null)
  const [source, setSource] = useState<ListResponse["source"]>(undefined)
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    const fetchOnce = async () => {
      try {
        const res = await fetch("/api/research/jobs", { cache: "no-store" })
        const payload = (await res.json()) as ListResponse
        if (cancelledRef.current) return
        if (res.ok) {
          const all = payload.jobs ?? []
          setJobs(all.filter(j => j.idea_id === ideaId))
          setSource(payload.source)
        }
      } catch {
        // Silent — rail empties out, no error banner per the design.
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
  }, [ideaId])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {jobs === null ? (
        <Skeleton />
      ) : jobs.length === 0 ? (
        <div className="t-mono" style={{ fontSize: 11, color: "var(--vr-cream-faint)", fontStyle: "italic" }}>
          {source === "unconfigured" ? "Jobs store not configured." : "No jobs yet."}
        </div>
      ) : (
        jobs.map(job => {
          const stateColor = STATE_COLOR[job.state]
          const ts = job.finished_at ?? job.created_at ?? null
          return (
            <Link
              key={job.job_id}
              href={`/vires/bench/lab/jobs/${encodeURIComponent(job.job_id)}`}
              className="vr-inset"
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                textDecoration: "none",
                color: "inherit",
              }}
            >
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
              <span
                className="t-mono"
                style={{
                  fontSize: 10.5,
                  color: "var(--vr-cream)",
                  letterSpacing: "0.04em",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {job.job_id}
              </span>
              <span className="t-mono" style={{ fontSize: 10, color: "var(--vr-cream-faint)" }}>
                {relTime(ts)}
              </span>
            </Link>
          )
        })
      )}

      {/* Trade Atlas — slot in for Codex's result_trades.v1 surface. */}
      <div
        className="vr-inset"
        style={{
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          opacity: 0.55,
        }}
      >
        <div
          className="t-eyebrow"
          style={{ fontSize: 9, letterSpacing: "0.16em", color: "var(--vr-cream-faint)" }}
        >
          TRADE ATLAS · COMING SOON
        </div>
        <div style={{ fontSize: 11, color: "var(--vr-cream-faint)", lineHeight: 1.5 }}>
          Per-trade entry/exit, side, P&amp;L, holding period, regime tag. Lights up once
          result_trades.v1 lands.
        </div>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="vr-inset" style={{ height: 32, opacity: 0.4 }} />
      ))}
    </div>
  )
}
