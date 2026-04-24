import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell, LabPhaseZeroSlot } from "@/components/vires/lab/phase-zero-shell"

export const metadata = {
  title: "Vires Capital — Lab · Idea",
}

export default async function ViresLabIdeaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <>
      <LabSubNav />
      <LabPhaseZeroShell
        eyebrow="Idea"
        title="Thesis and variations"
        subsection={id}
        pitch="Thesis, tags, strategy family, and the running list of campaigns this idea has produced."
      >
        <LabPhaseZeroSlot
          label="Spec"
          note="The idea's stored fields render here — thesis, sleeve, registered strategy family, tags, lifecycle."
        />
        <LabPhaseZeroSlot
          label="Run history"
          note="Every campaign this idea has produced, with winner, plateau verdict, and readiness at time of run."
        />
      </LabPhaseZeroShell>
    </>
  )
}
