"use client"

// Bench-home portal banner for the Lab. Vault variant — instrument-panel
// chrome with a 5-tick dial driven by the "needs you" count, mono strip
// summarizing total ideas + in-flight jobs, and an OPEN chevron.
//
// Loads counts once from /api/research/lab-portal-summary on mount. No
// polling — bench is already polling /api/bench/index every 90s; the portal
// refreshes on next bench-page mount, which is honest enough for v1.

import Link from "next/link"
import { useEffect, useState } from "react"

interface PortalSummary {
  needs_you: number
  in_flight: number
  idea_count: number
}

const TICK_COUNT = 5

export function LabPortalVault() {
  const [summary, setSummary] = useState<PortalSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/research/lab-portal-summary", { cache: "no-store" })
      .then(res => (res.ok ? res.json() : null))
      .then((payload: PortalSummary | null) => {
        if (cancelled || !payload) return
        setSummary({
          needs_you: payload.needs_you ?? 0,
          in_flight: payload.in_flight ?? 0,
          idea_count: payload.idea_count ?? 0,
        })
      })
      .catch(() => {
        // Outage: leave summary null so the portal renders quietly.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const needsYou = summary?.needs_you ?? 0
  const inFlight = summary?.in_flight ?? 0
  const ideaCount = summary?.idea_count ?? 0
  const filledTicks = Math.min(TICK_COUNT, needsYou)
  const dialAccent = needsYou > 0 ? "var(--vr-gold)" : "var(--vr-cream-mute)"

  return (
    <Link
      href="/vires/bench/lab"
      aria-label="Open the Lab"
      className="vr-card-hero"
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 18,
        padding: "18px 20px",
        textDecoration: "none",
        color: "inherit",
        border: "1px solid var(--vr-line-hi)",
      }}
    >
      <Dial filled={filledTicks} count={needsYou} accent={dialAccent} />

      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div
          className="t-eyebrow"
          style={{ fontSize: 9, letterSpacing: "0.22em", color: "var(--vr-cream-mute)" }}
        >
          VAULT · LAB
        </div>
        <div
          style={{
            fontFamily: "var(--ff-serif)",
            fontSize: 22,
            lineHeight: 1.1,
            color: "var(--vr-cream)",
            fontWeight: 400,
          }}
        >
          The <em style={{ color: "var(--vr-gold)" }}>Lab</em>
        </div>
        <div
          className="t-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.12em",
            color: "var(--vr-cream-faint)",
            textTransform: "uppercase",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {String(ideaCount).padStart(2, "0")} IDEAS · {String(inFlight).padStart(2, "0")} INFLIGHT
        </div>
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 38,
          height: 38,
          borderRadius: 3,
          border: "1px solid var(--vr-gold-line)",
          background: "var(--vr-gold-soft)",
          color: "var(--vr-gold)",
          flexShrink: 0,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
          <path d="M3 1.5L7.5 5.5L3 9.5" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </div>
    </Link>
  )
}

function Dial({ filled, count, accent }: { filled: number; count: number; accent: string }) {
  // 36px-radius dial. Five tick marks at 0°/72°/144°/216°/288° measured
  // from the top, pointing outward. SVG viewBox is 0..72 so the center is
  // at (36, 36) and ticks span from r=24 to r=32.
  const cx = 36
  const cy = 36
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const angle = (i / TICK_COUNT) * 2 * Math.PI - Math.PI / 2
    const inner = { x: cx + Math.cos(angle) * 24, y: cy + Math.sin(angle) * 24 }
    const outer = { x: cx + Math.cos(angle) * 32, y: cy + Math.sin(angle) * 32 }
    return { inner, outer, lit: i < filled }
  })
  return (
    <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
      <svg width={72} height={72} viewBox="0 0 72 72" aria-hidden="true">
        <circle cx={cx} cy={cy} r={22} fill="none" stroke="var(--vr-line-hi)" strokeWidth={1} />
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.inner.x}
            y1={t.inner.y}
            x2={t.outer.x}
            y2={t.outer.y}
            stroke={t.lit ? accent : "var(--vr-line-hi)"}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div
        className="t-mono"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          color: "var(--vr-cream)",
          letterSpacing: "0",
        }}
      >
        {count}
      </div>
    </div>
  )
}
