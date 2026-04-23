import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell, LabPhaseZeroSlot } from "@/components/vires/lab/phase-zero-shell"

export const metadata = {
  title: "Vires Capital — Research Lab · Reports",
}

export default function ViresLabReportsPage() {
  return (
    <>
      <LabSubNav />
      <LabPhaseZeroShell
        eyebrow="Research Lab · Reports"
        title="Overnight morning reports"
        subsection="Phase 3 · deterministic nightly autopilot · Phase 4 · AI narration"
        pitch="Every morning the autopilot's nightly run emits a report — what was attempted, what was promoted, what was strong-not-promoted, what turned up interesting, and what failed and why. Phase 3 writes the templated version; Phase 4 layers AI prose on top, only after the evidence-quality gate says the numbers are solid enough to narrate."
      >
        <LabPhaseZeroSlot
          label="Latest report card"
          note="Today's report on top — counts by sleeve, headline candidate, promotions proposed, links into each referenced job/result."
        />
        <LabPhaseZeroSlot
          label="Archive"
          note="Scrollable list of prior reports by date. Each report is a terminal artifact in the cold tree — reproducible, citable, never overwritten."
        />
        <LabPhaseZeroSlot
          label="Interesting findings"
          note="Surfaces cross-run patterns the autopilot flagged: a parameter region that's consistently underperforming, a sleeve's adapter that's been stuck in CODE_COMPLETE_UNWIRED for weeks, etc."
        />
      </LabPhaseZeroShell>
    </>
  )
}
