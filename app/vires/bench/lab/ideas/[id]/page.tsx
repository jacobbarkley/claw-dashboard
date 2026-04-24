import Link from "next/link"

import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell, LabPhaseZeroSlot } from "@/components/vires/lab/phase-zero-shell"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"

export const metadata = {
  title: "Vires Capital — Lab · Idea",
}

function fmtDate(iso?: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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

export default async function ViresLabIdeaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const decoded = decodeURIComponent(id)
  const idea = await loadIdeaById(decoded)

  if (!idea) {
    return (
      <>
        <LabSubNav />
        <LabPhaseZeroShell
          eyebrow="Idea"
          title="Not found"
          subsection={decoded}
          pitch="No idea file under that id in this scope. Might have been renamed, retired, or never committed."
        >
          <Link
            href="/vires/bench/lab/ideas"
            className="t-eyebrow"
            style={{
              marginTop: 14,
              padding: "7px 12px",
              fontSize: 10,
              letterSpacing: "0.14em",
              borderRadius: 3,
              border: "1px solid var(--vr-line)",
              color: "var(--vr-cream-mute)",
              textDecoration: "none",
              alignSelf: "flex-start",
              display: "inline-block",
            }}
          >
            Back to ideas
          </Link>
        </LabPhaseZeroShell>
      </>
    )
  }

  const statusColor = STATUS_COLOR[idea.status] ?? "var(--vr-cream-mute)"

  return (
    <>
      <LabSubNav />
      <div style={{ padding: "24px 20px 12px", maxWidth: 720, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            className="t-eyebrow"
            style={{ fontSize: 10, color: "var(--vr-gold)", letterSpacing: "0.14em" }}
          >
            Idea
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
            {idea.status}
          </span>
          <span className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)" }}>
            {idea.sleeve}
          </span>
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
          {idea.title}
        </h1>
        <div
          className="t-mono"
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--vr-cream-mute)",
          }}
        >
          {idea.idea_id}
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
        {/* Primary CTA — submit a campaign from this idea */}
        <Link
          href={`/vires/bench/lab/new-campaign/${encodeURIComponent(idea.idea_id)}`}
          className="vr-card"
          style={{
            padding: "14px 16px",
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
              Test this idea
            </div>
            <div className="t-h4" style={{ fontSize: 13.5, color: "var(--vr-cream)" }}>
              Submit a campaign from this idea
            </div>
          </div>
          <span
            className="t-eyebrow"
            style={{
              fontSize: 10,
              color: "var(--vr-gold)",
              padding: "6px 12px",
              border: "1px solid var(--vr-gold-line)",
              borderRadius: 3,
              background: "var(--vr-gold-soft)",
              letterSpacing: "0.14em",
            }}
          >
            New Campaign
          </span>
        </Link>

        {/* Thesis */}
        <section>
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 6, letterSpacing: "0.14em" }}
          >
            Thesis
          </div>
          <div
            className="vr-card"
            style={{
              padding: "14px 16px",
              fontSize: 13,
              color: "var(--vr-cream)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {idea.thesis}
          </div>
        </section>

        {/* Spec fields */}
        <div className="vr-card" style={{ padding: 0 }}>
          <SpecRow label="Strategy" value={idea.strategy_id} />
          {idea.strategy_family && <SpecRow label="Family" value={idea.strategy_family} />}
          <SpecRow label="Sleeve" value={idea.sleeve} />
          <SpecRow label="Source" value={idea.source} />
          {idea.tags && idea.tags.length > 0 && (
            <SpecRow label="Tags" value={idea.tags.join(", ")} />
          )}
          <SpecRow label="Created by" value={idea.created_by} />
          <SpecRow label="Created" value={fmtDate(idea.created_at)} last />
        </div>

        {/* Promotion slot */}
        <section>
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 6, letterSpacing: "0.14em" }}
          >
            Promotion slot
          </div>
          {idea.promotion_target ? (
            <div
              className="vr-card"
              style={{
                padding: "14px 16px",
                borderLeft: "2px solid var(--vr-gold)",
                background: "rgba(200,169,104,0.04)",
              }}
            >
              <div
                className="t-eyebrow"
                style={{ fontSize: 9, color: "var(--vr-gold)", marginBottom: 4 }}
              >
                {idea.promotion_target.target_action.replace("_", " ")}
              </div>
              <div className="t-mono" style={{ fontSize: 12, color: "var(--vr-cream)" }}>
                role · {idea.promotion_target.passport_role_id}
              </div>
              {idea.promotion_target.supersedes_record_id && (
                <div
                  className="t-mono"
                  style={{ fontSize: 10.5, color: "var(--vr-cream-mute)", marginTop: 3 }}
                >
                  supersedes · {idea.promotion_target.supersedes_record_id}
                </div>
              )}
            </div>
          ) : (
            <LabPhaseZeroSlot
              label="Not assigned"
              note="This idea has no promotion slot yet. Nomination stays disabled on any spawned campaign until you assign one — either here or via the 'Assign promotion slot' action on the campaign detail page."
            />
          )}
        </section>

        {/* Params */}
        {Object.keys(idea.params ?? {}).length > 0 && (
          <section>
            <div
              className="t-eyebrow"
              style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 6, letterSpacing: "0.14em" }}
            >
              Params
            </div>
            <div className="vr-card" style={{ padding: "14px 16px" }}>
              <pre
                className="t-mono"
                style={{
                  fontSize: 11.5,
                  color: "var(--vr-cream)",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {JSON.stringify(idea.params, null, 2)}
              </pre>
            </div>
          </section>
        )}

        {/* Run history — placeholder; will populate once rollup campaigns exist */}
        <LabPhaseZeroSlot
          label="Run history"
          note="Jobs submitted against this idea will surface here with their winner, plateau verdict, and readiness at time of run. Once the idea crosses a campaign-rollup threshold, a 'View campaign' deep-link lands here too."
        />
      </div>
    </>
  )
}

function SpecRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 12,
        padding: "10px 16px",
        borderBottom: last ? "none" : "1px solid var(--vr-line)",
      }}
    >
      <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)" }}>
        {label}
      </div>
      <div
        className="t-mono"
        style={{
          fontSize: 11.5,
          color: "var(--vr-cream)",
          textAlign: "right",
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  )
}
