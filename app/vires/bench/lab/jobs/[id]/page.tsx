import Link from "next/link"

import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { JobStatusPoll } from "@/components/vires/lab/job-status-poll"
import { ResultLeaderboard } from "@/components/vires/lab/result-leaderboard"
import { CandidateScorecard } from "@/components/vires/lab/candidate-scorecard"
import { TradeAtlas } from "@/components/vires/lab/equity-curve-swarm"
import {
  loadCandidateByJobId,
  loadEquitySwarmFromArtifactPath,
  loadResultById,
} from "@/lib/research-lab-cold.server"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import { hasLabCampaignForIdea } from "@/lib/vires-campaigns.server"

export const metadata = {
  title: "Vires Capital — Lab · Run",
}

async function loadCold(jobId: string): Promise<{
  result: Awaited<ReturnType<typeof loadResultById>>
  candidate: Awaited<ReturnType<typeof loadCandidateByJobId>>
  swarm: Awaited<ReturnType<typeof loadEquitySwarmFromArtifactPath>>
}> {
  const candidate = await loadCandidateByJobId(jobId)
  const result = candidate ? await loadResultById(candidate.result_id) : null
  const swarmPath = result?.equity_swarm_artifact?.path ?? null
  const swarm = swarmPath ? await loadEquitySwarmFromArtifactPath(swarmPath) : null
  return { result, candidate, swarm }
}

function fmtDateRange(window: { from: string; to: string; days: number } | null | undefined): string | null {
  if (!window) return null
  return `${window.from} → ${window.to} · ${window.days} days`
}

export default async function ViresLabJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const jobId = decodeURIComponent(id)
  const { result, candidate, swarm } = await loadCold(jobId)
  const campaignIdeaId = candidate?.idea_id ?? null
  const owningIdea = campaignIdeaId ? await loadIdeaById(campaignIdeaId) : null
  const labCampaignExists = campaignIdeaId
    ? await hasLabCampaignForIdea(campaignIdeaId)
    : false
  const headlineTitle = owningIdea?.title ?? "Run"
  const sleeveLabel = owningIdea?.sleeve ?? null
  const evalWindow = fmtDateRange(result?.evaluation_window ?? null)

  return (
    <>
      <LabSubNav />
      <div style={{ padding: "24px 20px 12px", maxWidth: 720, margin: "0 auto" }}>
        <div
          className="t-eyebrow"
          style={{
            fontSize: 10,
            color: "var(--vr-gold)",
            marginBottom: 10,
            letterSpacing: "0.14em",
            display: "flex",
            gap: 8,
          }}
        >
          <span>Run</span>
          {sleeveLabel && (
            <span style={{ color: "var(--vr-cream-mute)" }}>· {sleeveLabel.toLowerCase()}</span>
          )}
        </div>
        <h1
          className="t-display"
          style={{
            margin: 0,
            fontSize: 26,
            lineHeight: 1.2,
            color: "var(--vr-cream)",
            fontWeight: 400,
          }}
        >
          {headlineTitle}
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
        {owningIdea && (
          <Link
            href={`/vires/bench/lab/ideas/${encodeURIComponent(owningIdea.idea_id)}`}
            className="t-eyebrow"
            style={{
              display: "inline-block",
              marginTop: 6,
              fontSize: 9,
              letterSpacing: "0.14em",
              color: "var(--vr-cream-mute)",
              textDecoration: "none",
            }}
          >
            ← back to idea
          </Link>
        )}
        {evalWindow && (
          <div
            className="t-mono"
            style={{
              marginTop: 10,
              fontSize: 10.5,
              color: "var(--vr-cream-mute)",
              letterSpacing: "0.06em",
            }}
          >
            evaluation window · {evalWindow}
          </div>
        )}
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

        {swarm ? <TradeAtlas data={swarm} /> : null}

        {candidate ? (
          <CandidateScorecard candidate={candidate} />
        ) : null}
      </div>
    </>
  )
}
