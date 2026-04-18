"use client"

// Plateau Primer — Vires's editorial explainer for "parameter plateau vs
// lucky peak", the core idea behind the bench's plateau gate. This is the v1
// narrative shape; the full topographic + interactive heatmap (per the
// design handoff) will land as a follow-up here on /vires/plateau.

import { useMemo } from "react"

// ─── Mini parameter grid ─────────────────────────────────────────────────────
// Two side-by-side 7×7 heatmaps: left shows a single "lucky peak" (one
// bright cell, neighbors cold), right shows a "broad plateau" (a cluster of
// bright cells). Pure SVG, deterministic, no data dependency — keeps the
// preview honest while we wait on real param-grid data.

function ParameterGrid({ variant, accent }: { variant: "peak" | "plateau"; accent: string }) {
  const N = 7
  const cells = useMemo(() => {
    const out: Array<{ x: number; y: number; value: number }> = []
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = x - 3
        const dy = y - 3
        const r2 = dx * dx + dy * dy
        // Peak: very narrow gaussian. Plateau: wide gaussian + a soft cap.
        const sigma2 = variant === "peak" ? 0.6 : 4.0
        let v = Math.exp(-r2 / (2 * sigma2))
        if (variant === "plateau") v = Math.min(1, v * 1.15)
        out.push({ x, y, value: v })
      }
    }
    return out
  }, [variant])

  const cellSize = 22
  const gap = 2
  const W = N * cellSize + (N - 1) * gap
  return (
    <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`} style={{ display: "block" }}>
      {cells.map(c => {
        const px = c.x * (cellSize + gap)
        const py = c.y * (cellSize + gap)
        // Hue from cream (cold) to gold (warm) by alpha.
        const opacity = 0.05 + c.value * 0.85
        return (
          <rect
            key={`${c.x}-${c.y}`}
            x={px}
            y={py}
            width={cellSize}
            height={cellSize}
            fill={accent}
            opacity={opacity}
            rx={1}
          />
        )
      })}
      {/* Crosshair on the actual winner cell */}
      <rect
        x={3 * (cellSize + gap)}
        y={3 * (cellSize + gap)}
        width={cellSize}
        height={cellSize}
        fill="none"
        stroke="var(--vr-cream)"
        strokeWidth={1.2}
        strokeDasharray="2 2"
        rx={1}
      />
    </svg>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function ViresPlateauView() {
  return (
    <div
      className="vr-screen"
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "32px 18px 64px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
      }}
    >
      {/* Header */}
      <header>
        <div className="t-eyebrow" style={{ marginBottom: 8 }}>Primer · 04 / Parameter Stability</div>
        <h1 className="t-h1" style={{ fontSize: 40, lineHeight: 1.1, marginBottom: 12 }}>
          A <span className="t-accent">plateau</span> beats a peak.
        </h1>
        <p className="t-read" style={{ fontSize: 15, color: "var(--vr-cream-dim)", lineHeight: 1.55, maxWidth: 600 }}>
          Backtests rank candidates by score. The highest score is rarely the right answer. What
          you actually want is a region where many nearby configurations all do well — a plateau.
          The bench's plateau gate is what separates real edge from a lucky peak.
        </p>
      </header>

      {/* Hero comparison */}
      <section className="vr-card" style={{ padding: 24 }}>
        <div className="t-eyebrow" style={{ marginBottom: 16 }}>Two parameter grids · same winner</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <ParameterGrid variant="peak" accent="var(--vr-down)" />
            </div>
            <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-down)", marginBottom: 4 }}>
              Lucky Peak
            </div>
            <div className="t-h4" style={{ fontSize: 14, marginBottom: 6 }}>
              One bright cell, neighbors cold
            </div>
            <p className="t-label" style={{ fontSize: 11, lineHeight: 1.5 }}>
              Top score is real, but every nearby configuration loses. Tiny shifts in market
              behavior — a different volatility regime, a slightly different cost — and the score
              collapses. This is overfit dressed up as a winner.
            </p>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <ParameterGrid variant="plateau" accent="var(--vr-gold)" />
            </div>
            <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-gold)", marginBottom: 4 }}>
              Broad Plateau
            </div>
            <div className="t-h4" style={{ fontSize: 14, marginBottom: 6 }}>
              The winner is part of a cluster
            </div>
            <p className="t-label" style={{ fontSize: 11, lineHeight: 1.5 }}>
              Top score is surrounded by other strong scores. A different stop or a different
              hold window still works. Tomorrow's market doesn't have to look exactly like the
              backtest for the strategy to keep producing.
            </p>
          </div>
        </div>
      </section>

      {/* Gate definition */}
      <section>
        <div className="t-eyebrow" style={{ marginBottom: 8 }}>How the gate is enforced</div>
        <div className="vr-card" style={{ padding: 22 }}>
          <p className="t-read" style={{ fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>
            The bench's plateau rule requires that a candidate's neighbors in the parameter grid
            also clear the hard-reject thresholds. The exact requirement is configurable per
            spec, but the spirit is consistent:
          </p>
          <ul style={{ marginTop: 12, paddingLeft: 20, lineHeight: 1.7, color: "var(--vr-cream-dim)" }}>
            <li>
              The winning configuration must clear every hard-reject rule
              (<span className="t-ticker" style={{ fontSize: 11 }}>min_trades</span>,
              <span className="t-ticker" style={{ fontSize: 11, marginLeft: 4 }}>worst_era_sharpe</span>,
              <span className="t-ticker" style={{ fontSize: 11, marginLeft: 4 }}>era_pnl_concentration</span>, etc.)
            </li>
            <li>
              At least <span className="t-ticker" style={{ fontSize: 11 }}>N</span> neighboring
              configurations in the grid must also clear those gates
            </li>
            <li>
              If the spike is isolated, the candidate is rejected as a lucky peak — even if its
              raw score is the best in the run
            </li>
          </ul>
        </div>
      </section>

      {/* Why it matters */}
      <section>
        <div className="t-eyebrow" style={{ marginBottom: 8 }}>Why the gate exists</div>
        <div className="vr-card" style={{ padding: 22 }}>
          <p className="t-read" style={{ fontSize: 14, lineHeight: 1.65, marginTop: 0 }}>
            A backtest is not a forecast. It is one path through one history. The plateau gate
            asks a sharper question: <span className="t-accent" style={{ fontStyle: "italic" }}>does this strategy survive small reasonable
            changes?</span> If yes, you have edge. If no, you have a lucky alignment between
            parameters and a particular sample.
          </p>
          <p className="t-read" style={{ fontSize: 14, lineHeight: 1.65, marginTop: 12 }}>
            Strategies promoted from the Vires bench have all cleared this test. That's the
            single biggest reason promoted strategies tend to keep working when they meet live
            data, instead of collapsing on first contact with a new regime.
          </p>
        </div>
      </section>

      {/* Footer note */}
      <footer style={{ paddingTop: 16, borderTop: "1px solid var(--vr-line)" }}>
        <div className="t-eyebrow" style={{ marginBottom: 6 }}>What's next on this primer</div>
        <p className="t-label" style={{ fontSize: 12, lineHeight: 1.6 }}>
          The full edition adds an interactive parameter heatmap with topographic contours and a
          1-D slice panel — pick a column or row to see the score profile across one parameter
          while holding the other fixed. That ships in a follow-up to this page once the bench
          publishes per-spec parameter grids.
        </p>
      </footer>
    </div>
  )
}
