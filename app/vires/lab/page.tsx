import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell, LabPhaseZeroSlot } from "@/components/vires/lab/phase-zero-shell"
import { JobsLiveSummary } from "@/components/vires/lab/jobs-live-summary"

export const metadata = {
  title: "Vires Capital — Research Lab",
}

export default function ViresLabHomePage() {
  return (
    <>
      <LabSubNav />
      <LabPhaseZeroShell
        eyebrow="Research Lab"
        title="Run campaigns from the app"
        pitch="Capture a strategy idea, pick a preset, submit a bounded parameter sweep, and watch the bench run it — all without leaving the dashboard. Promotion readiness renders against real gates; autopilot and AI triage layer on once the happy path is proven."
      >
        {/* Live queue — real data from Upstash via /api/research/jobs */}
        <JobsLiveSummary />

        {/* Promotion candidates — not yet projected (waits on Codex's
            candidate.v1 projection slice) */}
        <LabPhaseZeroSlot
          label="Promotion candidates"
          note="Winning variants with READY_TO_NOMINATE readiness will surface here once the executor lands terminal results and the candidate adapter projects them to the cold tree."
        />

        {/* Morning report — Phase 3 */}
        <LabPhaseZeroSlot
          label="Latest morning report"
          note="Overnight autopilot summary lands here starting Phase 3 — promotions proposed, strong-not-promoted, interesting findings, postmortems."
        />
      </LabPhaseZeroShell>
    </>
  )
}
