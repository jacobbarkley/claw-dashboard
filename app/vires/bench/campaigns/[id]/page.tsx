import Link from "next/link"
import { loadCampaignById } from "@/lib/vires-campaigns.server"
import { loadBenchIndexWithViresContracts } from "@/lib/vires-bench"
import { ViresCampaignsDetail } from "@/components/vires/campaigns-detail"

export const metadata = {
  title: "Vires Capital — Campaign",
}

// Build a candidate_id → passport.id map by matching against the bench index.
// We match on either passport.id or passport.bench_id because Codex's producer
// emits the canonical strategy/bench id as both possible keys. Candidates
// without a passport aren't in the map; the UI renders them without a link.
async function buildCandidatePassportMap(
  candidateIds: string[],
): Promise<Record<string, string>> {
  if (!candidateIds.length) return {}
  const index = await loadBenchIndexWithViresContracts()
  const passports = Array.isArray(index?.passports)
    ? (index.passports as Array<{ id?: string | null; bench_id?: string | null }>)
    : []
  const map: Record<string, string> = {}
  for (const p of passports) {
    const pid = p.id
    if (!pid) continue
    for (const cid of candidateIds) {
      if (cid === pid || cid === p.bench_id) map[cid] = pid
    }
  }
  return map
}

export default async function ViresCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const campaign = await loadCampaignById(id)
  if (!campaign) {
    // Render a soft 404 — "this campaign id isn't in the manifest set right
    // now." Operators may deep-link a stale URL; honest copy beats a hard
    // 404 page for a research surface.
    return (
      <div style={{ padding: 16 }}>
        <Link
          href="/vires/bench/campaigns"
          className="t-eyebrow"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--vr-cream-mute)",
            textDecoration: "none",
            marginBottom: 14,
          }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M6 1L2 4L6 7" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          Campaigns
        </Link>
        <div
          className="vr-card"
          style={{ padding: 22, textAlign: "center", color: "var(--vr-cream-dim)" }}
        >
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>Campaign not found</div>
          <div className="t-read" style={{ fontSize: 12, lineHeight: 1.55 }}>
            No manifest matches{" "}
            <span className="t-ticker" style={{ textTransform: "none" }}>{id}</span>{" "}
            in{" "}
            <span className="t-ticker" style={{ textTransform: "none" }}>
              data/bench/campaigns/
            </span>
            . It may have been retired, renamed, or never shipped.
          </div>
        </div>
      </div>
    )
  }
  const passportByCandidateId = await buildCandidatePassportMap(
    campaign.candidates.map(c => c.candidate_id),
  )
  return (
    <ViresCampaignsDetail campaign={campaign} passportByCandidateId={passportByCandidateId} />
  )
}
