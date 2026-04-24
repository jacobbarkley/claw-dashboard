import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell } from "@/components/vires/lab/phase-zero-shell"
import { JobsLiveSummary } from "@/components/vires/lab/jobs-live-summary"

export const metadata = {
  title: "Vires Capital — Lab",
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
        <JobsLiveSummary />
      </LabPhaseZeroShell>
    </>
  )
}
