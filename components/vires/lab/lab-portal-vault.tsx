"use client"

// Bench-home portal banner for the Lab. Vault variant — instrument-panel
// chrome with a partial-arc dial (-135°..135°) reading the "needs you"
// count, mono strip summarizing total ideas + jobs in flight, and a
// gold-line OPEN lever. Double-shell card (gold gradient outer + dark
// inner) so the gold reads at small sizes.
//
// Loads counts once from /api/research/lab-portal-summary on mount; no
// polling — bench is already polling /api/bench/index every 90s.

import Link from "next/link"
import { useEffect, useState } from "react"

interface PortalSummary {
  needs_you: number
  in_flight: number
  idea_count: number
}

const DIAL_MAX = 5
const ARC_START = -135
const ARC_END = 135

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

  return (
    <Link
      href="/vires/bench/lab"
      aria-label="Open the Lab"
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        padding: 4,
        borderRadius: 4,
        border: "1px solid var(--vr-gold-line)",
        background:
          "linear-gradient(180deg, rgba(200,169,104,0.10), rgba(200,169,104,0.02))",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 18px",
          borderRadius: 2,
          border: "1px solid rgba(200,169,104,0.18)",
          background: "rgba(8,9,16,0.7)",
        }}
      >
        <Dial needsYou={needsYou} />

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, letterSpacing: "0.22em", color: "var(--vr-cream-faint)" }}
          >
            VAULT · LAB
          </div>
          <div
            style={{
              fontFamily: "var(--ff-serif)",
              fontSize: 21,
              fontWeight: 400,
              color: "var(--vr-cream)",
              lineHeight: 1.1,
              marginTop: 4,
            }}
          >
            The Lab
          </div>
          <div
            className="t-mono"
            style={{
              fontSize: 9.5,
              color: "var(--vr-cream-faint)",
              marginTop: 6,
              letterSpacing: "0.04em",
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
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 2,
              border: "1px solid var(--vr-gold-line)",
              background: "var(--vr-gold-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--vr-gold)",
            }}
          >
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M3 2L10 7L3 12"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span
            className="t-eyebrow"
            style={{ fontSize: 8, letterSpacing: "0.18em", color: "var(--vr-gold)" }}
          >
            OPEN
          </span>
        </div>
      </div>
    </Link>
  )
}

// ─── Dial ──────────────────────────────────────────────────────────────

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function arcPath(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const [x1, y1] = polar(cx, cy, r, a1)
  const [x2, y2] = polar(cx, cy, r, a2)
  const large = Math.abs(a2 - a1) > 180 ? 1 : 0
  const sweep = a2 > a1 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`
}

function Dial({ needsYou }: { needsYou: number }) {
  const dialFill = Math.min(needsYou, DIAL_MAX) / DIAL_MAX
  const fillEnd = ARC_START + (ARC_END - ARC_START) * dialFill
  const cx = 31
  const cy = 31

  return (
    <div style={{ flexShrink: 0, position: "relative" }}>
      <svg width={62} height={62} viewBox="0 0 62 62" aria-hidden="true">
        {/* engraved rings */}
        <circle cx={cx} cy={cy} r={29} fill="none" stroke="rgba(200,169,104,0.18)" strokeWidth={0.6} />
        <circle cx={cx} cy={cy} r={26} fill="none" stroke="rgba(200,169,104,0.10)" strokeWidth={0.4} />
        {/* tick marks (11 around the arc) */}
        {Array.from({ length: 11 }).map((_, i) => {
          const a = ARC_START + (ARC_END - ARC_START) * (i / 10)
          const [x1, y1] = polar(cx, cy, 24, a)
          const [x2, y2] = polar(cx, cy, 21, a)
          const lit = i / 10 <= dialFill
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={lit ? "var(--vr-gold)" : "rgba(241,236,224,0.18)"}
              strokeWidth={0.8}
            />
          )
        })}
        {/* arc track */}
        <path
          d={arcPath(cx, cy, 18, ARC_START, ARC_END)}
          fill="none"
          stroke="rgba(241,236,224,0.10)"
          strokeWidth={1}
        />
        {/* arc fill */}
        {dialFill > 0 && (
          <path
            d={arcPath(cx, cy, 18, ARC_START, fillEnd)}
            fill="none"
            stroke="var(--vr-gold)"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        )}
        {/* value */}
        <text
          x={cx}
          y={33}
          textAnchor="middle"
          fontSize={14}
          fill="var(--vr-cream)"
          style={{ fontFamily: "var(--ff-serif)" }}
        >
          {needsYou}
        </text>
        <text
          x={cx}
          y={44}
          textAnchor="middle"
          fontSize={5}
          fill="var(--vr-cream-faint)"
          letterSpacing={1.4}
          style={{ fontFamily: "var(--ff-sans)", textTransform: "uppercase" }}
        >
          WAITING
        </text>
      </svg>
    </div>
  )
}
