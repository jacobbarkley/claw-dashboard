import Link from "next/link"

import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell } from "@/components/vires/lab/phase-zero-shell"
import { JobsLiveSummary } from "@/components/vires/lab/jobs-live-summary"

export const metadata = {
  title: "Vires Capital — Lab",
}

const ENTRY_POINT_LINK_STYLE: React.CSSProperties = {
  display: "block",
  padding: "14px 16px",
  textDecoration: "none",
  color: "inherit",
  background: "rgba(241,236,224,0.02)",
}

export default function ViresLabHomePage() {
  return (
    <>
      <LabSubNav />
      <LabPhaseZeroShell
        eyebrow="Lab"
        title="Strategy research"
        pitch="Capture a thesis, dial a parameter sweep, watch it run, see what wins."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 10,
            marginTop: 16,
          }}
        >
          <Link href="/vires/bench/lab/ideas/new" className="vr-card" style={ENTRY_POINT_LINK_STYLE}>
            <div
              className="t-eyebrow"
              style={{ fontSize: 9, color: "var(--vr-gold)", marginBottom: 4, letterSpacing: "0.14em" }}
            >
              Author a new idea
            </div>
            <div
              style={{
                fontSize: 14,
                color: "var(--vr-cream)",
                fontFamily: "var(--ff-serif)",
                lineHeight: 1.3,
              }}
            >
              Sketch a thesis. Draft a spec. Submit for approval.
            </div>
          </Link>
          <Link href="/vires/bench/lab/run-strategy" className="vr-card" style={ENTRY_POINT_LINK_STYLE}>
            <div
              className="t-eyebrow"
              style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 4, letterSpacing: "0.14em" }}
            >
              Run a registered strategy
            </div>
            <div
              style={{
                fontSize: 14,
                color: "var(--vr-cream)",
                fontFamily: "var(--ff-serif)",
                lineHeight: 1.3,
              }}
            >
              Pick an existing strategy, dial a sweep, run it as-is.
            </div>
          </Link>
        </div>
        <JobsLiveSummary />
      </LabPhaseZeroShell>
    </>
  )
}
