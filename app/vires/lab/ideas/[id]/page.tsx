import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell, LabPhaseZeroSlot } from "@/components/vires/lab/phase-zero-shell"

export const metadata = {
  title: "Vires Capital — Research Lab · Idea detail",
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
        eyebrow="Research Lab · Idea"
        title="Single idea view"
        subsection={`id · ${id}`}
        pitch="Thesis, sleeve, registered strategy family, param schema bounds, tags, lifecycle history, and the list of every campaign run this idea has produced. Links straight into 'New campaign' with the idea pre-selected."
      >
        <LabPhaseZeroSlot
          label="Idea spec"
          note="YAML spec rendered read-only. Fields match research_lab.idea.v1 (SPEC_REVIEW_2026-04-23.md §2.1) — shared header + per-sleeve params body."
        />
        <LabPhaseZeroSlot
          label="Run history"
          note="Every campaign this idea has produced, with winner, plateau verdict, and readiness status at time of run. One row per job."
        />
      </LabPhaseZeroShell>
    </>
  )
}
