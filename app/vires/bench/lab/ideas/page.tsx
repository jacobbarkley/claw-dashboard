import Link from "next/link"

import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell, LabPhaseZeroSlot } from "@/components/vires/lab/phase-zero-shell"
import { LabSleeveFilter } from "@/components/vires/lab/lab-sleeve-filter"
import { LabIdeasRedesigned, type IdeaCard } from "@/components/vires/lab/lab-ideas-redesigned"
import { labRedesignEnabled } from "@/lib/feature-flags.server"
import { loadIdeas } from "@/lib/research-lab-ideas.server"
import { deriveIdeaStage } from "@/lib/research-lab-stage"
import { loadCampaignsIndex } from "@/lib/vires-campaigns.server"

export const metadata = {
  title: "Vires Capital — Lab · Ideas",
}

function fmtDate(iso?: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "var(--vr-cream-mute)",
  READY: "var(--vr-gold)",
  QUEUED: "var(--vr-gold)",
  ACTIVE: "var(--vr-up)",
  SHELVED: "var(--vr-cream-faint)",
  RETIRED: "var(--vr-cream-faint)",
}

export default async function ViresLabIdeasPage() {
  const ideas = await loadIdeas()
  ideas.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))

  if (labRedesignEnabled()) {
    const campaignsIndex = await loadCampaignsIndex()
    const labCampaignIds = new Set(
      (campaignsIndex?.registry?.campaigns ?? [])
        .map(c => c.campaign_id)
        .filter((id): id is string => typeof id === "string" && id.startsWith("lab_")),
    )
    const cards: IdeaCard[] = ideas
      .filter(i => i.status !== "RETIRED")
      .map(idea => ({
        idea_id: idea.idea_id,
        title: idea.title,
        thesis: idea.thesis,
        sleeve: idea.sleeve,
        status: idea.status,
        strategy_id: idea.strategy_id,
        code_pending: idea.code_pending === true,
        created_at: idea.created_at ?? null,
        stage: deriveIdeaStage(idea, {
          hasCampaign: labCampaignIds.has(`lab_${idea.idea_id}`),
        }),
      }))
    return (
      <>
        <LabSubNav redesign />
        <LabSleeveFilter />
        <LabIdeasRedesigned ideas={cards} />
      </>
    )
  }

  return (
    <>
      <LabSubNav />
      <LabPhaseZeroShell
        eyebrow="Ideas"
        title="Your strategy bank"
        pitch="Saved theses, variations, and things worth testing. Each idea is a spec you can send to the lab on demand."
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 14,
            flexWrap: "wrap",
          }}
        >
          <LabSleeveFilter />
          <Link
            href="/vires/bench/lab/ideas/new"
            className="t-eyebrow"
            style={{
              padding: "7px 12px",
              fontSize: 10.5,
              letterSpacing: "0.14em",
              borderRadius: 3,
              border: "1px solid var(--vr-gold-line)",
              background: "var(--vr-gold-soft)",
              color: "var(--vr-gold)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            New Idea
          </Link>
        </div>

        {ideas.length === 0 ? (
          <LabPhaseZeroSlot
            label="No ideas yet"
            note='Click "New Idea" to shape your first thesis. Ideas become jobs, jobs accumulate into campaigns, campaigns earn their way into passports.'
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            {ideas.map(idea => {
              const statusColor = STATUS_COLOR[idea.status] ?? "var(--vr-cream-mute)"
              return (
                <Link
                  key={idea.idea_id}
                  href={`/vires/bench/lab/ideas/${encodeURIComponent(idea.idea_id)}`}
                  className="vr-card"
                  style={{
                    padding: "14px 16px",
                    background: "rgba(241,236,224,0.015)",
                    textDecoration: "none",
                    color: "inherit",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div
                      className="t-h4"
                      style={{
                        fontSize: 14,
                        color: "var(--vr-cream)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {idea.title}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {idea.code_pending && (
                        <span
                          className="t-eyebrow"
                          style={{
                            fontSize: 9,
                            color: "var(--vr-gold)",
                            border: "1px solid var(--vr-gold-line)",
                            background: "var(--vr-gold-soft)",
                            padding: "2px 7px",
                            borderRadius: 2,
                            letterSpacing: "0.14em",
                          }}
                        >
                          Code pending
                        </span>
                      )}
                      <span
                        className="t-eyebrow"
                        style={{
                          fontSize: 9,
                          color: statusColor,
                          border: `1px solid ${statusColor}`,
                          padding: "2px 7px",
                          borderRadius: 2,
                          letterSpacing: "0.14em",
                        }}
                      >
                        {idea.status}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--vr-cream-mute)",
                      lineHeight: 1.5,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {idea.thesis}
                  </div>
                  <div
                    className="t-mono"
                    style={{
                      fontSize: 10,
                      color: "var(--vr-cream-faint)",
                      marginTop: 2,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{idea.sleeve}</span>
                    <span>·</span>
                    <span>{idea.code_pending ? "—" : idea.strategy_id}</span>
                    {idea.created_at && (
                      <>
                        <span>·</span>
                        <span>{fmtDate(idea.created_at)}</span>
                      </>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </LabPhaseZeroShell>
    </>
  )
}
