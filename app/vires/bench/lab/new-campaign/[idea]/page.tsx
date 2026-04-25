import Link from "next/link"

import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabSubmitForm } from "@/components/vires/lab/submit-form"
import { SleeveChip, type Sleeve } from "@/components/vires/shared"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import { loadPresetsForStrategy } from "@/lib/research-lab-presets.server"

export const metadata = {
  title: "Vires Capital — Lab · New campaign",
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "var(--vr-cream-mute)",
  READY: "var(--vr-gold)",
  QUEUED: "var(--vr-gold)",
  ACTIVE: "var(--vr-up)",
  SHELVED: "var(--vr-cream-faint)",
  RETIRED: "var(--vr-cream-faint)",
}

export default async function ViresLabNewCampaignPage({
  params,
}: {
  params: Promise<{ idea: string }>
}) {
  const { idea } = await params
  const ideaId = decodeURIComponent(idea)
  const ideaArtifact = await loadIdeaById(ideaId)

  // Idea not found — render an honest shell with a back link, no form.
  if (!ideaArtifact) {
    return (
      <>
        <LabSubNav />
        <div style={{ padding: "24px 20px 12px", maxWidth: 640, margin: "0 auto" }}>
          <div
            className="t-eyebrow"
            style={{ fontSize: 10, color: "var(--vr-gold)", marginBottom: 10, letterSpacing: "0.14em" }}
          >
            New campaign
          </div>
          <h1
            className="t-display"
            style={{ margin: 0, fontSize: 26, lineHeight: 1.15, color: "var(--vr-cream)", fontWeight: 400 }}
          >
            Idea not found
          </h1>
          <p style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.55, color: "var(--vr-cream-mute)" }}>
            No idea file under <code style={{ fontFamily: "var(--ff-mono)" }}>{ideaId}</code> in this scope.
            It may have been renamed, retired, or never committed.
          </p>
          <Link
            href="/vires/bench/lab/ideas"
            className="t-eyebrow"
            style={{
              display: "inline-block",
              marginTop: 14,
              padding: "7px 12px",
              fontSize: 10,
              letterSpacing: "0.14em",
              borderRadius: 3,
              border: "1px solid var(--vr-line)",
              color: "var(--vr-cream-mute)",
              textDecoration: "none",
            }}
          >
            Back to ideas
          </Link>
        </div>
      </>
    )
  }

  const presets = await loadPresetsForStrategy(ideaArtifact.strategy_id, ideaArtifact.sleeve)
  const sleeveKey = ideaArtifact.sleeve.toLowerCase() as Sleeve
  const sleeveValid = sleeveKey === "stocks" || sleeveKey === "options" || sleeveKey === "crypto"
  const statusColor = STATUS_COLOR[ideaArtifact.status] ?? "var(--vr-cream-mute)"

  return (
    <>
      <LabSubNav />
      <div style={{ padding: "24px 20px 8px", maxWidth: 640, margin: "0 auto" }}>
        {/* Eyebrow row — action context + sleeve at a glance */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            className="t-eyebrow"
            style={{ fontSize: 10, color: "var(--vr-gold)", letterSpacing: "0.14em" }}
          >
            New campaign
          </div>
          {sleeveValid && (
            <>
              <span style={{ color: "var(--vr-cream-faint)" }}>·</span>
              <SleeveChip sleeve={sleeveKey} />
            </>
          )}
        </div>
        <h1
          className="t-display"
          style={{ margin: 0, fontSize: 26, lineHeight: 1.15, color: "var(--vr-cream)", fontWeight: 400 }}
        >
          Set up a run
        </h1>
        <p
          style={{
            marginTop: 10,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--vr-cream-mute)",
          }}
        >
          Pick a preset, dial the parameter sweep, add a quick note, submit.
        </p>
      </div>

      {/* Idea-context card — the strategy + idea this submit will run against,
          linkable back to the idea detail. Replaces the duplicated "Idea"
          block that used to live inside the form. */}
      <div style={{ padding: "0 20px 12px", maxWidth: 640, margin: "0 auto" }}>
        <Link
          href={`/vires/bench/lab/ideas/${encodeURIComponent(ideaArtifact.idea_id)}`}
          className="vr-card"
          style={{
            display: "block",
            padding: "12px 14px",
            textDecoration: "none",
            color: "inherit",
            background: "rgba(241,236,224,0.015)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
              flexWrap: "wrap",
            }}
          >
            <div
              className="t-eyebrow"
              style={{ fontSize: 9, color: "var(--vr-cream-mute)", letterSpacing: "0.14em" }}
            >
              Configuring
            </div>
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
              {ideaArtifact.status}
            </span>
          </div>
          <div
            className="t-h4"
            style={{
              fontSize: 14,
              color: "var(--vr-cream)",
              fontFamily: "var(--ff-serif)",
              fontWeight: 500,
              lineHeight: 1.3,
            }}
          >
            {ideaArtifact.title}
          </div>
          <div
            className="t-mono"
            style={{
              marginTop: 4,
              fontSize: 10.5,
              color: "var(--vr-cream-faint)",
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span>{ideaArtifact.idea_id}</span>
            <span>·</span>
            <span>{ideaArtifact.strategy_id}</span>
            {ideaArtifact.strategy_family ? (
              <>
                <span>·</span>
                <span>{ideaArtifact.strategy_family}</span>
              </>
            ) : null}
          </div>
        </Link>
      </div>

      <LabSubmitForm ideaId={ideaId} presets={presets} />
    </>
  )
}
