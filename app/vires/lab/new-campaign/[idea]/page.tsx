import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell, LabPhaseZeroSlot } from "@/components/vires/lab/phase-zero-shell"

export const metadata = {
  title: "Vires Capital — Research Lab · New campaign",
}

export default async function ViresLabNewCampaignPage({
  params,
}: {
  params: Promise<{ idea: string }>
}) {
  const { idea } = await params
  return (
    <>
      <LabSubNav />
      <LabPhaseZeroShell
        eyebrow="Research Lab · New campaign"
        title="Submit a bounded parameter sweep"
        subsection={`from idea · ${idea}`}
        pitch="Pick one of the registered presets, dial a sweep inside its bounds, add a thesis note, and submit. The dashboard commits a governed request file to the repo and returns the preallocated job_id immediately — live progress renders on the jobs page within 15-30 seconds."
      >
        <LabPhaseZeroSlot
          label="Preset picker"
          note="Phase 1a ships stocks.momentum.stop_target.v1 only. Phase 1b adds crypto.tsmom_4h.v1 and options.covered_call.v1 with honest empty-state readiness for the two sleeves whose adapters aren't wired yet."
        />
        <LabPhaseZeroSlot
          label="Param sweep form"
          note="Every field is bounded by the preset's param_schema — no freeform manifest authoring. Sweep size capped by the preset (default max 16 variants)."
        />
        <LabPhaseZeroSlot
          label="Submit button"
          note="POST /api/research/requests — writes the request file, commits via the GitHub App token, returns {commit_sha, request_id, job_id}. Dashboard redirects to the job view immediately."
        />
      </LabPhaseZeroShell>
    </>
  )
}
