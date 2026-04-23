import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell, LabPhaseZeroSlot } from "@/components/vires/lab/phase-zero-shell"

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
        <LabPhaseZeroSlot
          label="Live queue"
          note="Jobs currently queued, running, or recently finished will surface here once the worker + managed state store are wired (Phase 1a)."
        />
        <LabPhaseZeroSlot
          label="Promotion candidates"
          note="Winning variants with READY_TO_NOMINATE readiness will appear here with a one-click promote path through the governed nomination channel."
        />
        <LabPhaseZeroSlot
          label="Latest morning report"
          note="Overnight autopilot summary lands here starting Phase 3 — promotions proposed, strong-not-promoted, interesting findings, postmortems."
        />
      </LabPhaseZeroShell>
    </>
  )
}
