"use client"

// Compact live-queue card for the Lab home page. Polls /api/research/jobs
// every ~15s and renders a short summary. Four honest states mirroring
// JobsListPoll: populated / empty / unconfigured / outage.
//
// Intentionally small — this is the home surface, not the full list.
// Deep-links to /vires/bench/lab/jobs for the real view.

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

import type { JobState, JobV1 } from "@/lib/research-lab-contracts"

type ListResponse =
  | { ok: true; source: "store"; jobs: JobV1[]; state: "populated" | "empty"; polled_at: string }
  | { ok: true; source: "unconfigured"; jobs: []; polled_at: string }
  | { ok: true; source: "outage"; jobs: []; error: string; polled_at: string }

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

const NON_TERMINAL: JobState[] = ["QUEUED", "COMPILING", "RUNNING", "POST_PROCESSING", "RETRY_QUEUED"]

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

function SlotWrap({
  eyebrow,
  eyebrowColor = "var(--vr-gold)",
  accent,
  children,
  href,
}: {
  eyebrow: string
  eyebrowColor?: string
  accent?: string
  children: React.ReactNode
  href?: string
}) {
  const inner = (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 3,
        background: "rgba(10,11,20,0.35)",
        border: "1px dashed rgba(241,236,224,0.14)",
        borderLeft: accent ? `2px solid ${accent}` : undefined,
        display: "block",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 6,
        }}
      >
        <div
          className="t-eyebrow"
          style={{ fontSize: 9, color: eyebrowColor, letterSpacing: "0.14em" }}
        >
          {eyebrow}
        </div>
        {href ? (
          <span
            className="t-eyebrow"
            style={{
              fontSize: 9,
              color: "var(--vr-gold)",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              letterSpacing: "0.14em",
            }}
          >
            Open jobs
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </span>
        ) : null}
      </div>
      {children}
    </div>
  )
  return href ? (
    <Link href={href} style={{ textDecoration: "none", color: "inherit", marginTop: 14, display: "block" }}>
      {inner}
    </Link>
  ) : (
    <div style={{ marginTop: 14 }}>{inner}</div>
  )
}

export function JobsLiveSummary() {
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
        // transient; next tick retries
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
      <SlotWrap eyebrow="Running now" eyebrowColor="var(--vr-cream-mute)">
        <div style={{ fontSize: 12.5, color: "var(--vr-cream-mute)", lineHeight: 1.55 }}>
          Loading…
        </div>
      </SlotWrap>
    )
  }

  if (data.source === "unconfigured") {
    return (
      <SlotWrap
        eyebrow="Running now"
        eyebrowColor="var(--vr-cream-mute)"
        accent="var(--vr-cream-mute)"
      >
        <div style={{ fontSize: 12.5, color: "var(--vr-cream)", lineHeight: 1.55 }}>
          Live view needs configuration. Runs still happen in the background.
        </div>
      </SlotWrap>
    )
  }

  if (data.source === "outage") {
    return (
      <SlotWrap
        eyebrow="Running now"
        eyebrowColor="var(--vr-down)"
        accent="var(--vr-down)"
      >
        <div style={{ fontSize: 12.5, color: "var(--vr-cream)", lineHeight: 1.55 }}>
          Live view paused. Runs continue; results land on completion.
        </div>
      </SlotWrap>
    )
  }

  if (data.jobs.length === 0) {
    return (
      <SlotWrap
        eyebrow="Running now"
        eyebrowColor="var(--vr-gold)"
        accent="var(--vr-gold)"
        href="/vires/bench/lab/jobs"
      >
        <div style={{ fontSize: 12.5, color: "var(--vr-cream)", lineHeight: 1.55 }}>
          Nothing running right now. Start a campaign from an idea.
        </div>
      </SlotWrap>
    )
  }

  // Populated — compute the summary
  const jobs = data.jobs
  const inFlight = jobs.filter(j => NON_TERMINAL.includes(j.state)).length
  const done = jobs.filter(j => j.state === "DONE").length
  const failed = jobs.filter(j => j.state === "FAILED").length
  const most = jobs[0] // already sorted desc by created_at in the API

  return (
    <SlotWrap
      eyebrow={inFlight > 0 ? "Running now" : "Recent runs"}
      eyebrowColor={STATE_COLOR[most.state] ?? "var(--vr-gold)"}
      accent={STATE_COLOR[most.state] ?? "var(--vr-gold)"}
      href="/vires/bench/lab/jobs"
    >
      <div
        style={{
          fontSize: 13,
          color: "var(--vr-cream)",
          lineHeight: 1.55,
          marginBottom: 8,
        }}
      >
        {jobs.length} run{jobs.length === 1 ? "" : "s"}
        {inFlight > 0 ? ` · ${inFlight} in flight` : ""}
        {done > 0 ? ` · ${done} completed` : ""}
        {failed > 0 ? ` · ${failed} failed` : ""}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 10.5,
          color: "var(--vr-cream-mute)",
          fontFamily: "var(--vr-font-mono), monospace",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          most recent · {most.job_id}
        </span>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <span
            className="t-eyebrow"
            style={{
              padding: "2px 6px",
              fontSize: 9,
              letterSpacing: "0.14em",
              border: `1px solid ${STATE_COLOR[most.state] ?? "var(--vr-cream-mute)"}`,
              color: STATE_COLOR[most.state] ?? "var(--vr-cream-mute)",
              borderRadius: 2,
            }}
          >
            {most.state.replace(/_/g, " ")}
          </span>
          <span>{relTime(most.created_at)}</span>
        </span>
      </div>
    </SlotWrap>
  )
}
