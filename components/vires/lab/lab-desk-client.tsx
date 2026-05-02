"use client"

// Lab Desk — three-rail surface that opens by default in the redesigned
// Lab. Polls /api/research/lab-desk every 15s; renders honest empty states
// per rail when the backend has nothing to surface.

import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import type { JobState, ResearchSleeve } from "@/lib/research-lab-contracts"
import type { IdeaStage } from "@/lib/research-lab-stage"

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

interface NeedsYouItem {
  idea_id: string
  title: string
  sleeve: ResearchSleeve
  stage: IdeaStage
  eyebrow: string
}

interface JobRail {
  job_id: string
  idea_id: string | null
  title: string
  sleeve: ResearchSleeve | null
  state: JobState
  created_at: string | null
  finished_at: string | null
}

interface DeskPayload {
  needs_you: NeedsYouItem[]
  in_flight: JobRail[]
  recently_landed: JobRail[]
  idea_count: number
  job_count: number
}

function relTime(iso: string | null): string {
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

export function LabDeskClient() {
  const [data, setData] = useState<DeskPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    let timeout: ReturnType<typeof setTimeout> | null = null

    const fetchOnce = async () => {
      try {
        const res = await fetch("/api/research/lab-desk", { cache: "no-store" })
        const payload = (await res.json()) as DeskPayload & { ok?: boolean; error?: string }
        if (cancelledRef.current) return
        if (!res.ok) throw new Error(payload.error ?? `Lab desk fetch failed (${res.status})`)
        setData({
          needs_you: payload.needs_you ?? [],
          in_flight: payload.in_flight ?? [],
          recently_landed: payload.recently_landed ?? [],
          idea_count: payload.idea_count ?? 0,
          job_count: payload.job_count ?? 0,
        })
        setError(null)
      } catch (err) {
        if (!cancelledRef.current) {
          setError(err instanceof Error ? err.message : "Lab desk fetch failed")
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

  return (
    <div style={{ padding: "16px 20px 120px", maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <DeskHeader ideaCount={data?.idea_count} jobCount={data?.job_count} />
      {error && <ErrorRow message={error} />}

      <Rail label="Needs you" accent="gold">
        {!data ? (
          <Skeleton rows={2} />
        ) : data.needs_you.length === 0 ? (
          <EmptyRow text="No ideas waiting on you." />
        ) : (
          data.needs_you.map(item => <NeedsYouCard key={item.idea_id} item={item} />)
        )}
      </Rail>

      <Rail label="In flight">
        {!data ? (
          <Skeleton rows={2} />
        ) : data.in_flight.length === 0 ? (
          <EmptyRow text="Nothing running." />
        ) : (
          data.in_flight.map(job => <JobCard key={job.job_id} job={job} when="created" />)
        )}
      </Rail>

      <Rail
        label="Recently landed"
        trailing={
          <Link
            href="/vires/bench/lab/jobs"
            className="t-eyebrow"
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              color: "var(--vr-cream-mute)",
              textDecoration: "none",
            }}
          >
            All jobs ›
          </Link>
        }
      >
        {!data ? (
          <Skeleton rows={2} />
        ) : data.recently_landed.length === 0 ? (
          <EmptyRow text="Nothing recent." />
        ) : (
          data.recently_landed.map(job => <JobCard key={job.job_id} job={job} when="finished" />)
        )}
      </Rail>
    </div>
  )
}

// ─── Header ────────────────────────────────────────────────────────────

function DeskHeader({ ideaCount, jobCount }: { ideaCount?: number; jobCount?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <h1
        className="t-display"
        style={{ margin: 0, fontSize: 28, lineHeight: 1.15, color: "var(--vr-cream)", fontWeight: 400 }}
      >
        Desk
      </h1>
      <div className="t-mono" style={{ fontSize: 11, color: "var(--vr-cream-mute)", letterSpacing: "0.08em" }}>
        {ideaCount != null ? `${ideaCount} idea${ideaCount === 1 ? "" : "s"}` : "—"}
        {" · "}
        {jobCount != null ? `${jobCount} run${jobCount === 1 ? "" : "s"}` : "—"}
      </div>
    </div>
  )
}

// ─── Rail wrapper ──────────────────────────────────────────────────────

function Rail({
  label,
  accent,
  trailing,
  children,
}: {
  label: string
  accent?: "gold"
  trailing?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div
          className="t-eyebrow"
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            color: accent === "gold" ? "var(--vr-gold)" : "var(--vr-cream-mute)",
          }}
        >
          {label}
        </div>
        {trailing}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </section>
  )
}

// ─── Cards ─────────────────────────────────────────────────────────────

function NeedsYouCard({ item }: { item: NeedsYouItem }) {
  return (
    <Link
      href={`/vires/bench/lab/ideas/${encodeURIComponent(item.idea_id)}`}
      className="vr-card"
      style={{
        padding: "12px 14px",
        textDecoration: "none",
        color: "inherit",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 10,
        borderLeft: "2px solid var(--vr-gold)",
        background: "var(--vr-gold-soft)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          className="t-eyebrow"
          style={{ fontSize: 9, letterSpacing: "0.14em", color: "var(--vr-gold)", marginBottom: 4 }}
        >
          {item.eyebrow.toUpperCase()}
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
          {item.title}
        </div>
      </div>
      <span style={{ color: "var(--vr-cream-mute)", fontSize: 14 }}>›</span>
    </Link>
  )
}

function JobCard({ job, when }: { job: JobRail; when: "created" | "finished" }) {
  const stateColor = JOB_STATE_COLOR[job.state]
  const sleeveColor = job.sleeve ? SLEEVE_COLOR[job.sleeve] : "var(--vr-cream-mute)"
  const href = job.idea_id
    ? `/vires/bench/lab/ideas/${encodeURIComponent(job.idea_id)}`
    : `/vires/bench/lab/jobs/${encodeURIComponent(job.job_id)}`
  const ts = when === "created" ? job.created_at : job.finished_at ?? job.created_at
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
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: sleeveColor,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 13,
              color: "var(--vr-cream)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {job.title}
          </span>
        </div>
        <span
          className="t-eyebrow"
          style={{
            fontSize: 8.5,
            letterSpacing: "0.14em",
            color: stateColor,
            border: `1px solid ${stateColor}`,
            padding: "2px 6px",
            borderRadius: 2,
            flexShrink: 0,
          }}
        >
          {job.state.replace(/_/g, " ")}
        </span>
      </div>
      <div className="t-mono" style={{ fontSize: 10, color: "var(--vr-cream-faint)", letterSpacing: "0.06em" }}>
        {job.job_id}
        {ts && <> · {relTime(ts)}</>}
      </div>
    </Link>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div
      className="vr-card"
      style={{
        padding: "10px 14px",
        fontSize: 11.5,
        color: "var(--vr-cream-faint)",
        fontStyle: "italic",
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
        <div
          key={i}
          className="vr-card"
          style={{ padding: "12px 14px", height: 46, opacity: 0.45 }}
        />
      ))}
    </div>
  )
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div
      className="vr-card"
      style={{
        padding: "10px 14px",
        borderLeft: "2px solid var(--vr-down)",
        background: "rgba(218,86,86,0.04)",
        fontSize: 11.5,
        color: "var(--vr-cream)",
      }}
    >
      {message}
    </div>
  )
}
