import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell, LabPhaseZeroSlot } from "@/components/vires/lab/phase-zero-shell"

export const metadata = {
  title: "Vires Capital — Lab · Reports",
}

export default function ViresLabReportsPage() {
  return (
    <>
      <LabSubNav />
      <LabPhaseZeroShell
        eyebrow="Reports"
        title="Morning summaries"
        pitch="What ran overnight, what was promoted, what wasn't, what turned up interesting, what failed."
      >
        <LabPhaseZeroSlot
          label="Today's report"
          note="The latest morning summary lands here — headline candidate, counts by sleeve, links into referenced runs."
        />
        <LabPhaseZeroSlot
          label="Archive"
          note="Prior reports by date. Each one is a captured record you can revisit."
        />
      </LabPhaseZeroShell>
    </>
  )
}
