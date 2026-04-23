import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell, LabPhaseZeroSlot } from "@/components/vires/lab/phase-zero-shell"

export const metadata = {
  title: "Vires Capital — Research Lab · Job",
}

export default async function ViresLabJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <>
      <LabSubNav />
      <LabPhaseZeroShell
        eyebrow="Research Lab · Job"
        title="Live campaign status"
        subsection={`job_id · ${id}`}
        pitch="State machine from QUEUED through POST_PROCESSING to DONE, with live progress polled from the managed state store every ~15 seconds. When the store is unreachable the surface degrades honestly — the job keeps running; results land on completion."
      >
        <LabPhaseZeroSlot
          label="Pending receipt → live state"
          note="Pre-enqueue: renders the job_pending.v1 receipt returned by submit (state: PENDING_ENQUEUE). Once the worker git-fetches the request file and creates the SQLite row, the live projection in the managed store supersedes the receipt — dashboard polling switches to the real job.v1 snapshot on the next tick."
        />
        <LabPhaseZeroSlot
          label="State + progress"
          note="QUEUED · COMPILING · RUNNING · POST_PROCESSING · DONE. Progress shows variants_complete / variants_total and a phase label (compile, grid_sweep, validate, summarize). Heartbeats every 30s during RUNNING."
        />
        <LabPhaseZeroSlot
          label="Leaderboard (on DONE)"
          note="Ranked variants with the standard metrics — total return, Sharpe, Sortino, Calmar, max drawdown, era scores. Winner flagged. Plateau verdict (STABLE · LUCKY_PEAK · MIXED) rendered inline."
        />
        <LabPhaseZeroSlot
          label="Candidate scorecard"
          note="Promotion readiness gates against the 9-gate producer. PASS / PENDING / FAIL / BLOCKED / INCONCLUSIVE with InfoPops. EMPTY_STATE rendered honestly when the sleeve's adapter isn't wired yet (crypto, options in Phase 1b)."
        />
        <LabPhaseZeroSlot
          label="Promote button"
          note="Submits a nomination request through the same governed channel as campaign submits. No direct strategy-bank access from the dashboard — the nomination adapter owns the translation."
        />
      </LabPhaseZeroShell>
    </>
  )
}
