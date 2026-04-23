import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell, LabPhaseZeroSlot } from "@/components/vires/lab/phase-zero-shell"

export const metadata = {
  title: "Vires Capital — Research Lab · Ideas",
}

export default function ViresLabIdeasPage() {
  return (
    <>
      <LabSubNav />
      <LabPhaseZeroShell
        eyebrow="Research Lab · Ideas"
        title="The strategy bank"
        subsection="Phase 2 · capture from conversation + manual YAML commits"
        pitch="Every strategy worth testing lives here as a lightweight YAML spec — thesis, sleeve, registered family, tags, status. DRAFT ideas stay quiet; READY ideas are eligible for autopilot pickup. Nothing runs until an idea is explicitly submitted."
      >
        <LabPhaseZeroSlot
          label="Idea bank"
          note="Filterable by sleeve · tag · status. Each idea card links to a 'New campaign' form prepopulated with the registered family's preset."
        />
        <LabPhaseZeroSlot
          label="Status pills"
          note="DRAFT · READY · QUEUED · ACTIVE · SHELVED · RETIRED. Lifecycle transitions are explicit operator actions — no heuristic auto-promotion from DRAFT."
        />
      </LabPhaseZeroShell>
    </>
  )
}
