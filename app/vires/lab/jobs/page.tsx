import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell, LabPhaseZeroSlot } from "@/components/vires/lab/phase-zero-shell"

export const metadata = {
  title: "Vires Capital — Research Lab · Jobs",
}

export default function ViresLabJobsPage() {
  return (
    <>
      <LabSubNav />
      <LabPhaseZeroShell
        eyebrow="Research Lab · Jobs"
        title="Every campaign, live and historical"
        subsection="Phase 1a · read-through against managed state store + cold mirror"
        pitch="The live feed is queued, running, and terminal jobs scoped to this workspace, polled from the managed state store. Historical jobs read from the cold git-tracked mirror. Submitter chip distinguishes user-triggered on-demand runs from autopilot nightly jobs."
      >
        <LabPhaseZeroSlot
          label="Live queue"
          note="QUEUED · COMPILING · RUNNING · POST_PROCESSING rows first, sorted by created_at. Each row links to the job detail view."
        />
        <LabPhaseZeroSlot
          label="Terminal history"
          note="DONE · FAILED · RETRY_QUEUED (with backoff) · CANCELLED (Phase 1c). Filter by sleeve, submitter (you vs autopilot), or preset."
        />
      </LabPhaseZeroShell>
    </>
  )
}
