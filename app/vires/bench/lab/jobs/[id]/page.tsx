import Link from "next/link"

import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { JobStatusPoll } from "@/components/vires/lab/job-status-poll"
import { ResultLeaderboard } from "@/components/vires/lab/result-leaderboard"
import { CandidateScorecard } from "@/components/vires/lab/candidate-scorecard"
import {
  loadCandidateByJobId,
  loadResultById,
} from "@/lib/research-lab-cold.server"
import { hasLabCampaignForIdea } from "@/lib/vires-campaigns.server"

export const metadata = {
  title: "Vires Capital — Lab · Run",
}

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
  const campaignIdeaId = candidate?.idea_id ?? null
  const labCampaignExists = campaignIdeaId
    ? await hasLabCampaignForIdea(campaignIdeaId)
    : false

  return (
    <>
      <LabSubNav />
      <div style={{ padding: "24px 20px 12px", maxWidth: 720, margin: "0 auto" }}>
        <div
          className="t-eyebrow"
          style={{ fontSize: 10, color: "var(--vr-gold)", marginBottom: 10, letterSpacing: "0.14em" }}
        >
          Run
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
          Campaign status
        </h1>
        <div
          className="t-mono"
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--vr-cream-mute)",
            letterSpacing: "0.05em",
          }}
        >
          {jobId}
        </div>
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

        {labCampaignExists && campaignIdeaId && (
          <Link
            href={`/vires/bench/campaigns/${encodeURIComponent(`lab_${campaignIdeaId}`)}`}
            className="vr-card"
            style={{
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              textDecoration: "none",
              color: "inherit",
              borderLeft: "2px solid var(--vr-gold)",
              background: "rgba(200,169,104,0.04)",
            }}
          >
            <div>
              <div
                className="t-eyebrow"
                style={{
                  fontSize: 9,
                  color: "var(--vr-gold)",
                  marginBottom: 3,
                  letterSpacing: "0.14em",
                }}
              >
                Rolled up into campaign
              </div>
              <div className="t-h4" style={{ fontSize: 13, color: "var(--vr-cream)" }}>
                {campaignIdeaId}
              </div>
            </div>
            <span
              className="t-eyebrow"
              style={{
                fontSize: 10,
                color: "var(--vr-gold)",
                padding: "5px 10px",
                border: "1px solid var(--vr-gold-line)",
                borderRadius: 3,
                background: "var(--vr-gold-soft)",
                letterSpacing: "0.14em",
              }}
            >
              View Campaign
            </span>
          </Link>
        )}

        {result ? (
          <div id="result">
            <ResultLeaderboard result={result} />
          </div>
        ) : null}

        {candidate ? (
          <CandidateScorecard candidate={candidate} />
        ) : null}
      </div>
    </>
  )
}
