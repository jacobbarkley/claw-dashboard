import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { JobStatusPoll } from "@/components/vires/lab/job-status-poll"
import { ResultLeaderboard } from "@/components/vires/lab/result-leaderboard"
import { CandidateScorecard } from "@/components/vires/lab/candidate-scorecard"
import {
  loadCandidateByJobId,
  loadResultById,
} from "@/lib/research-lab-cold.server"

export const metadata = {
  title: "Vires Capital — Research Lab · Job",
}

// The hot job.v1 from Upstash is read client-side via JobStatusPoll; the
// cold artifacts (result.v1 + candidate.v1) are read server-side on each
// page render. When a job transitions to DONE on the worker, the next
// page navigation picks up the freshly-committed artifacts. (JobStatusPoll
// could call router.refresh() on terminal transition to auto-reveal; for
// Phase 1a the manual navigate is acceptable.)
async function loadCold(jobId: string): Promise<{
  result: Awaited<ReturnType<typeof loadResultById>>
  candidate: Awaited<ReturnType<typeof loadCandidateByJobId>>
}> {
  const candidate = await loadCandidateByJobId(jobId)
  const result = candidate ? await loadResultById(candidate.result_id) : null
  return { result, candidate }
}

export default async function ViresLabJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const jobId = decodeURIComponent(id)
  const { result, candidate } = await loadCold(jobId)

  return (
    <>
      <LabSubNav />
      <div style={{ padding: "24px 20px 12px", maxWidth: 720, margin: "0 auto" }}>
        <div
          className="t-eyebrow"
          style={{ fontSize: 10, color: "var(--vr-gold)", marginBottom: 10, letterSpacing: "0.14em" }}
        >
          Research Lab · Job
        </div>
        <h1
          className="t-display"
          style={{
            margin: 0,
            fontSize: 26,
            lineHeight: 1.15,
            color: "var(--vr-cream)",
            fontWeight: 400,
          }}
        >
          Live campaign status
        </h1>
        <div
          className="t-mono"
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--vr-cream-mute)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          job_id · {jobId}
        </div>
        <p
          style={{
            marginTop: 12,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--vr-cream-mute)",
          }}
        >
          Live state polls the managed store every ~15s. Terminal artifacts
          (leaderboard, candidate readiness) render below once the job reaches
          DONE and the worker writes <span className="t-mono">result.v1</span>{" "}
          and <span className="t-mono">candidate.v1</span> to the cold tree.
        </p>
      </div>

      <div
        style={{
          padding: "0 20px 120px",
          maxWidth: 720,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <JobStatusPoll jobId={jobId} />

        {result ? (
          <div id="result">
            <ResultLeaderboard result={result} />
          </div>
        ) : null}

        {candidate ? (
          <CandidateScorecard candidate={candidate} />
        ) : null}

        {!result && !candidate ? (
          <div
            style={{
              padding: "14px 16px",
              border: "1px dashed rgba(241,236,224,0.14)",
              borderRadius: 3,
              background: "rgba(10,11,20,0.35)",
              fontSize: 12,
              color: "var(--vr-cream-mute)",
              lineHeight: 1.55,
            }}
          >
            <div
              className="t-eyebrow"
              style={{
                fontSize: 9,
                color: "var(--vr-cream-mute)",
                marginBottom: 6,
                letterSpacing: "0.14em",
              }}
            >
              Terminal artifacts · not yet in cold tree
            </div>
            Leaderboard + candidate scorecard render here once the job
            transitions to DONE and the worker writes{" "}
            <span className="t-mono">result.v1</span> and{" "}
            <span className="t-mono">candidate.v1</span> into{" "}
            <span className="t-mono">data/research_lab/…/results/</span> and{" "}
            <span className="t-mono">candidates/</span>. Refresh this page
            after the live state chip flips to DONE.
          </div>
        ) : null}
      </div>
    </>
  )
}
