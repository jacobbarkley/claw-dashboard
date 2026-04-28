import { TradeAtlas } from "@/components/vires/lab/equity-curve-swarm"
import { MOCK_EQUITY_SWARM } from "@/components/vires/lab/equity-curve-swarm.mock"

// Preview-only route. Mounts <TradeAtlas /> with mock data so we can
// iterate on the visualization while Codex wires the producer-side
// research_lab.equity_swarm.v1 artifact. Delete this route once a real
// artifact is being read by the per-result Lab view.

export default function EquitySwarmPreviewPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--vr-bg, #0c0a17)",
        padding: "32px 16px 80px",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-gold)", letterSpacing: "0.14em" }}
          >
            Preview · 2026-04-28
          </div>
          <h1
            style={{
              marginTop: 6,
              fontSize: 28,
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              color: "var(--vr-cream)",
            }}
          >
            Trade Atlas
          </h1>
          <p
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "var(--vr-cream-mute)",
              maxWidth: 620,
              lineHeight: 1.55,
            }}
          >
            Mock data, mock contract. Strategy + benchmark on top, every
            individual trade rendered as a thin line underneath. Drag the
            handles below the chart to zoom into any sub-range. Toggle USD
            vs % to switch how each contribution reads against the headline.
          </p>
        </div>
        <TradeAtlas data={MOCK_EQUITY_SWARM} />
      </div>
    </main>
  )
}
