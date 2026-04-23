import Link from "next/link"
import { loadCampaignById } from "@/lib/vires-campaigns.server"
import { loadBenchIndexWithViresContracts } from "@/lib/vires-bench"
import { ViresCampaignsDetail } from "@/components/vires/campaigns-detail"

export const metadata = {
  title: "Vires Capital — Campaign",
}

type CampaignPassportLinks = {
  candidateMap: Record<string, string>
  target: { id: string; name: string; recordId: string | null } | null
}

// One pass over the bench-index passports: build the per-candidate map AND
// find the campaign-level "target" passport. The target is the passport a
// campaign is pointing at — matched first by passport_role_id (robust for
// both REPLACE_EXISTING and CREATE_NEW-into-an-already-held-role), then by
// supersedes_record_id ↔ passport.record_id as a fallback for REPLACE_EXISTING
// campaigns whose role match lags behind. No match → no link; the UI renders
// candidates/campaigns without a linked passport in their usual shape.
async function buildCampaignPassportLinks(
  candidateIds: string[],
  targetRoleId: string | null,
  targetSupersedesRecordId: string | null,
): Promise<CampaignPassportLinks> {
  const index = await loadBenchIndexWithViresContracts()
  const passports = Array.isArray(index?.passports)
    ? (index.passports as Array<{
        id?: string | null
        bench_id?: string | null
        name?: string | null
        record_id?: string | null
        passport_role_id?: string | null
      }>)
    : []

  const candidateMap: Record<string, string> = {}
  let target: CampaignPassportLinks["target"] = null

  for (const p of passports) {
    const pid = p.id
    if (!pid) continue
    for (const cid of candidateIds) {
      if (cid === pid || cid === p.bench_id) candidateMap[cid] = pid
    }
    if (!target) {
      const roleMatch = !!targetRoleId && p.passport_role_id === targetRoleId
      const recordMatch =
        !!targetSupersedesRecordId && p.record_id === targetSupersedesRecordId
      if (roleMatch || recordMatch) {
        target = {
          id: pid,
          name: p.name ?? pid,
          recordId: p.record_id ?? null,
        }
      }
    }
  }

  return { candidateMap, target }
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
  const { candidateMap, target } = await buildCampaignPassportLinks(
    campaign.candidates.map(c => c.candidate_id),
    campaign.promotion_readiness?.passport_role_id ?? null,
    campaign.promotion_readiness?.supersedes_record_id ?? null,
  )
  return (
    <ViresCampaignsDetail
      campaign={campaign}
      passportByCandidateId={candidateMap}
      targetPassport={target}
    />
  )
}
