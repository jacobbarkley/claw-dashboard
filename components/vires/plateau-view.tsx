"use client"

// Plateau Primer — editorial explainer for "parameter plateau vs lucky peak."
// When real parameter grid data is published (via Codex's
// /api/bench/plateau endpoint backed by loadPlateauPrimerData), this view
// renders the actual heatmap, winner cell, and lucky-peak cell pulled from
// the BTC 4H TSMOM neighborhood probe. Without data, falls back to the
// side-by-side synthetic "peak vs plateau" illustration.

import { useMemo } from "react"
import { SectionHeader } from "./shared"

// ─── Types ─────────────────────────────────────────────────────────────────

interface PlateauCell {
  i: number
  j: number
  sharpe: number | null
  calmar: number | null
  rejected: boolean
  winner: boolean
  plateau: boolean
  luckyPeak: boolean
  trades: number | null
  nbMean: number | null
  nbSpread: number | null
  eraRobustness: number | null
}

interface PlateauAxes {
  x: { parameter: string; label: string; values: number[] }
  y: { parameter: string; label: string; values: number[] }
}

export interface PlateauPayload {
  source?: { bench_id?: string | null; generated_at?: string | null }
  axes: PlateauAxes
  cells: PlateauCell[]
  winner: PlateauCell | null
  lucky: PlateauCell | null
  stats?: {
    plateauCount?: number
    totalEval?: number
    totalCells?: number
    plateauCut?: number | null
    winnerSharpe?: number | null
  }
}

// ─── Mini parameter grid (synthetic fallback) ──────────────────────────────

function MiniGrid({ variant, accent }: { variant: "peak" | "plateau"; accent: string }) {
  const N = 7
  const cells = useMemo(() => {
    const out: Array<{ x: number; y: number; value: number }> = []
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = x - 3
        const dy = y - 3
        const r2 = dx * dx + dy * dy
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

// ─── Real parameter heatmap ────────────────────────────────────────────────

function ParameterHeatmap({ data }: { data: PlateauPayload }) {
  const xValues = data.axes.x.values
  const yValues = data.axes.y.values
  const cells = data.cells

  // Resolve a consistent scaling across live cells so colors are comparable.
  const liveSharpes = cells
    .filter(c => !c.rejected && c.sharpe != null)
    .map(c => c.sharpe as number)
  const minS = liveSharpes.length ? Math.min(...liveSharpes) : 0
  const maxS = liveSharpes.length ? Math.max(...liveSharpes) : 1
  const range = Math.max(maxS - minS, 0.0001)

  // Grid sizing: clamp so mobile stays readable even for wide sweeps.
  const cellSize = Math.max(18, Math.min(34, Math.floor(560 / Math.max(xValues.length, 1))))
  const gap = 2
  const gridW = xValues.length * cellSize + (xValues.length - 1) * gap
  const gridH = yValues.length * cellSize + (yValues.length - 1) * gap

  // Build a lookup so we can render cells by (i,j) regardless of order.
  const byCoord = new Map<string, PlateauCell>()
  for (const c of cells) byCoord.set(`${c.i}::${c.j}`, c)

  return (
    <div className="vr-card" style={{ padding: 18 }}>
      <div className="t-eyebrow" style={{ marginBottom: 8 }}>Parameter heatmap</div>
      <div className="t-label" style={{ fontSize: 11, marginBottom: 14, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}>
        Each cell is one parameter combination. Color = median-era Sharpe.
        Gold-outline cell is the winner; down-toned outline is an isolated
        lucky peak — a single bright point whose neighbors collapse.
      </div>

      {/* Axes labels */}
      <div style={{ display: "grid", gridTemplateColumns: "40px 1fr", gap: 6, alignItems: "start" }}>
        <div
          className="t-eyebrow"
          style={{
            fontSize: 9,
            color: "var(--vr-cream-mute)",
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            alignSelf: "center",
            justifySelf: "center",
            letterSpacing: "0.18em",
          }}
        >
          {data.axes.y.label}
        </div>
        <div>
          {/* Heatmap grid — row-major from the top so visual y grows downward */}
          <svg width={gridW} height={gridH} viewBox={`0 0 ${gridW} ${gridH}`} style={{ display: "block" }}>
            {yValues.map((_, jIdx) =>
              xValues.map((_, iIdx) => {
                const cell = byCoord.get(`${iIdx}::${jIdx}`)
                const px = iIdx * (cellSize + gap)
                // Flip so higher-y params render at the top of the SVG.
                const py = (yValues.length - 1 - jIdx) * (cellSize + gap)
                if (!cell) {
                  return (
                    <rect
                      key={`${iIdx}-${jIdx}`}
                      x={px}
                      y={py}
                      width={cellSize}
                      height={cellSize}
                      fill="var(--vr-cream-faint)"
                      opacity={0.05}
                      rx={1}
                    />
                  )
                }
                const normalized = cell.sharpe != null ? (cell.sharpe - minS) / range : 0
                const fill = cell.rejected
                  ? "var(--vr-down)"
                  : "var(--vr-gold)"
                const opacity = cell.rejected ? 0.15 : 0.15 + normalized * 0.85
                return (
                  <g key={`${iIdx}-${jIdx}`}>
                    <rect
                      x={px}
                      y={py}
                      width={cellSize}
                      height={cellSize}
                      fill={fill}
                      opacity={opacity}
                      rx={1}
                    >
                      <title>
                        {`${data.axes.x.label}=${cell[data.axes.x.parameter as keyof PlateauCell] ?? "?"} · ${data.axes.y.label}=${cell[data.axes.y.parameter as keyof PlateauCell] ?? "?"} · Sharpe ${cell.sharpe?.toFixed(3) ?? "—"}${cell.rejected ? " · rejected" : ""}`}
                      </title>
                    </rect>
                    {cell.winner && (
                      <rect
                        x={px + 0.5}
                        y={py + 0.5}
                        width={cellSize - 1}
                        height={cellSize - 1}
                        fill="none"
                        stroke="var(--vr-gold)"
                        strokeWidth={1.6}
                        rx={1}
                      />
                    )}
                    {cell.luckyPeak && !cell.winner && (
                      <rect
                        x={px + 0.5}
                        y={py + 0.5}
                        width={cellSize - 1}
                        height={cellSize - 1}
                        fill="none"
                        stroke="var(--vr-down)"
                        strokeWidth={1.4}
                        strokeDasharray="2 2"
                        rx={1}
                      />
                    )}
                  </g>
                )
              }),
            )}
          </svg>

          {/* X-axis values */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${xValues.length}, ${cellSize}px)`,
              gap,
              marginTop: 6,
            }}
          >
            {xValues.map(v => (
              <div
                key={v}
                className="t-num"
                style={{ fontSize: 9, color: "var(--vr-cream-mute)", textAlign: "center" }}
              >
                {v}
              </div>
            ))}
          </div>
          <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginTop: 6, textAlign: "center" }}>
            {data.axes.x.label}
          </div>
        </div>
      </div>

      {/* Stats strip */}
      {data.stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 0,
            marginTop: 18,
            paddingTop: 14,
            borderTop: "1px solid var(--vr-line)",
          }}
        >
          {[
            { label: "Evaluated",    value: `${data.stats.totalEval ?? "—"} / ${data.stats.totalCells ?? "—"}` },
            { label: "Plateau cells", value: (data.stats.plateauCount ?? 0).toString() },
            { label: "Winner Sharpe", value: data.stats.winnerSharpe != null ? data.stats.winnerSharpe.toFixed(3) : "—" },
            { label: "Plateau cut",   value: data.stats.plateauCut != null ? data.stats.plateauCut.toFixed(3) : "—" },
          ].map((s, i) => (
            <div
              key={s.label}
              style={{ padding: "0 12px", borderLeft: i > 0 ? "1px solid var(--vr-line)" : "none" }}
            >
              <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>{s.label}</div>
              <div className="t-num" style={{ fontSize: 13, color: "var(--vr-cream)", fontWeight: 500 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function ViresPlateauView({ plateau }: { plateau: PlateauPayload | null }) {
  return (
    <div
      className="vr-screen vires-screen-pad"
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
          The bench&rsquo;s plateau gate is what separates real edge from a lucky peak.
        </p>
      </header>

      {/* Real heatmap when data is published; otherwise the side-by-side
          synthetic illustration so the concept is still explained. */}
      {plateau ? (
        <section>
          <SectionHeader
            eyebrow={plateau.source?.bench_id ? `from ${plateau.source.bench_id}` : "live data"}
            title="This sweep's parameter grid"
            right={
              plateau.source?.generated_at ? (
                <span className="t-label" style={{ fontSize: 10 }}>
                  {plateau.source.generated_at.slice(0, 10)}
                </span>
              ) : null
            }
          />
          <ParameterHeatmap data={plateau} />
        </section>
      ) : (
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
                <MiniGrid variant="peak" accent="var(--vr-down)" />
              </div>
              <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-down)", marginBottom: 4 }}>
                Lucky Peak
              </div>
              <div className="t-h4" style={{ fontSize: 14, marginBottom: 6 }}>
                One bright cell, neighbors cold
              </div>
              <p className="t-label" style={{ fontSize: 11, lineHeight: 1.5 }}>
                Top score is real, but every nearby configuration loses. Tiny shifts in market
                behavior collapse the score. Overfit dressed up as a winner.
              </p>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                <MiniGrid variant="plateau" accent="var(--vr-gold)" />
              </div>
              <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-gold)", marginBottom: 4 }}>
                Broad Plateau
              </div>
              <div className="t-h4" style={{ fontSize: 14, marginBottom: 6 }}>
                The winner is part of a cluster
              </div>
              <p className="t-label" style={{ fontSize: 11, lineHeight: 1.5 }}>
                Top score is surrounded by other strong scores. A different stop or a different
                hold window still works. Tomorrow&rsquo;s market doesn&rsquo;t have to look exactly
                like the backtest.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Gate definition */}
      <section>
        <div className="t-eyebrow" style={{ marginBottom: 8 }}>How the gate is enforced</div>
        <div className="vr-card" style={{ padding: 22 }}>
          <p className="t-read" style={{ fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>
            The bench&rsquo;s plateau rule requires that a candidate&rsquo;s neighbors in the
            parameter grid also clear the hard-reject thresholds. The exact requirement is
            configurable per spec, but the spirit is consistent:
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
            asks a sharper question: <span className="t-accent" style={{ fontStyle: "italic" }}>does
            this strategy survive small reasonable changes?</span> If yes, you have edge. If no,
            you have a lucky alignment between parameters and a particular sample.
          </p>
          <p className="t-read" style={{ fontSize: 14, lineHeight: 1.65, marginTop: 12 }}>
            Strategies promoted from the Vires bench have all cleared this test. That&rsquo;s the
            single biggest reason promoted strategies tend to keep working when they meet live
            data, instead of collapsing on first contact with a new regime.
          </p>
        </div>
      </section>
    </div>
  )
}
