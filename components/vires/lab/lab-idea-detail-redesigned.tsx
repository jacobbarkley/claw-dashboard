// Redesigned Idea Detail per cloud-design 2026-04-22. Vertical timeline
// (Thesis → Spec → Build → Bench Job → Campaign → Promotion) with a
// neighborhood card at the bottom. Spec step opens the Unified Builder
// at /vires/bench/lab/ideas/[id]/builder. Bench Job step embeds a live
// jobs rail + Trade Atlas placeholder.

import Link from "next/link"

import type {
  IdeaArtifact,
  StrategySpecV1,
} from "@/lib/research-lab-contracts"
import {
  STAGES,
  STAGE_META,
  stageColor,
  stageIndex,
  type IdeaStage,
} from "@/lib/research-lab-stage"

import { IdeaJobsRail } from "./idea-jobs-rail"
import { IdeaStatusControl } from "./idea-status-control"

const SLEEVE_COLOR: Record<string, string> = {
  STOCKS: "var(--vr-sleeve-stocks)",
  OPTIONS: "var(--vr-sleeve-options)",
  CRYPTO: "var(--vr-sleeve-crypto)",
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "var(--vr-cream-mute)",
  READY: "var(--vr-gold)",
  QUEUED: "var(--vr-gold)",
  ACTIVE: "var(--vr-up)",
  SHELVED: "var(--vr-cream-faint)",
  RETIRED: "var(--vr-cream-faint)",
}

interface LabIdeaDetailRedesignedProps {
  idea: IdeaArtifact
  stage: IdeaStage
  activeSpec: StrategySpecV1 | null
  strategySpecs: StrategySpecV1[]
  hasCampaign: boolean
  neighborhood: Array<{ idea_id: string; title: string; sleeve: string; stage: IdeaStage; status: string }>
}

export function LabIdeaDetailRedesigned({
  idea,
  stage,
  activeSpec,
  strategySpecs,
  hasCampaign,
  neighborhood,
}: LabIdeaDetailRedesignedProps) {
  const idx = stageIndex(stage)
  const sleeveColor = SLEEVE_COLOR[idea.sleeve] ?? "var(--vr-cream-mute)"
  const statusColor = STATUS_COLOR[idea.status] ?? "var(--vr-cream-mute)"

  return (
    <div
      style={{
        padding: "16px 20px 120px",
        maxWidth: 720,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      {/* Header — back, sleeve+stage chips, title, status pill */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Link
            href="/vires/bench/lab/ideas"
            className="t-eyebrow"
            style={{
              fontSize: 9.5,
              letterSpacing: "0.14em",
              color: "var(--vr-cream-mute)",
              textDecoration: "none",
            }}
          >
            ‹ Ideas
          </Link>
          <StageBadge stage={stage} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            className="t-eyebrow"
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              color: "var(--vr-cream-mute)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{ width: 6, height: 6, borderRadius: "50%", background: sleeveColor }}
            />
            {idea.sleeve}
          </span>
        </div>
        <h1
          className="t-display"
          style={{ margin: 0, fontSize: 24, lineHeight: 1.2, color: "var(--vr-cream)", fontWeight: 400 }}
        >
          {idea.title}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            className="t-eyebrow"
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              color: statusColor,
              border: `1px solid ${statusColor}`,
              padding: "2px 7px",
              borderRadius: 2,
            }}
          >
            {idea.status}
          </span>
          <IdeaStatusControl
            ideaId={idea.idea_id}
            currentStatus={idea.status}
            codePending={idea.code_pending === true}
            convertToCodePendingAvailable={idea.status === "DRAFT" && !hasCampaign}
          />
          {idea.code_pending && (
            <span
              className="t-eyebrow"
              style={{
                fontSize: 9,
                letterSpacing: "0.14em",
                color: "var(--vr-gold)",
                border: "1px solid var(--vr-gold-line)",
                background: "var(--vr-gold-soft)",
                padding: "2px 7px",
                borderRadius: 2,
              }}
            >
              Code pending
            </span>
          )}
          <span className="t-mono" style={{ fontSize: 10, color: "var(--vr-cream-faint)" }}>
            {idea.idea_id}
          </span>
          {idea.status === "DRAFT" && !hasCampaign && (
            <Link
              href={`/vires/bench/lab/ideas/${encodeURIComponent(idea.idea_id)}/edit`}
              className="t-eyebrow"
              style={{
                marginLeft: "auto",
                fontSize: 10,
                letterSpacing: "0.14em",
                color: "var(--vr-gold)",
                border: "1px solid var(--vr-gold-line)",
                background: "var(--vr-gold-soft)",
                padding: "3px 9px",
                borderRadius: 2,
                textDecoration: "none",
              }}
            >
              EDIT ›
            </Link>
          )}
        </div>
      </div>

      {/* Timeline thread */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <ThreadStep
          idx={0}
          activeIdx={idx}
          label="Thesis"
          meta={`written ${fmtDate(idea.created_at)} · ${idea.created_by}`}
        >
          <div
            style={{
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              fontSize: 14,
              color: "var(--vr-cream)",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}
          >
            {idea.thesis}
          </div>
        </ThreadStep>

        <ThreadStep idx={1} activeIdx={idx} label="Spec" meta={specMeta(activeSpec)}>
          <SpecStepBody idea={idea} activeSpec={activeSpec} stage={stage} />
        </ThreadStep>

        <ThreadStep idx={2} activeIdx={idx} label="Build" meta={buildMeta(stage)}>
          <div
            className="t-read"
            style={{ fontSize: 12, color: "var(--vr-cream-dim)", lineHeight: 1.55 }}
          >
            Codex picks up the approved spec, scaffolds the strategy module, registers it under
            a real <span className="t-mono">strategy_id</span>, and adds tests.
          </div>
        </ThreadStep>

        <ThreadStep idx={3} activeIdx={idx} label="Bench Job" meta={null}>
          <BenchJobStepBody idea={idea} hasCampaign={hasCampaign} />
        </ThreadStep>

        <ThreadStep idx={4} activeIdx={idx} label="Campaign" meta={hasCampaign ? "rolled up across regimes" : null}>
          {hasCampaign ? (
            <Link
              href={`/vires/bench/campaigns/${encodeURIComponent(`lab_${idea.idea_id}`)}`}
              className="t-eyebrow"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 10,
                letterSpacing: "0.16em",
                padding: "6px 12px",
                borderRadius: 3,
                border: "1px solid var(--vr-gold-line)",
                background: "var(--vr-gold-soft)",
                color: "var(--vr-gold)",
                textDecoration: "none",
                alignSelf: "flex-start",
              }}
            >
              VIEW CAMPAIGN ›
            </Link>
          ) : (
            <div className="t-read" style={{ fontSize: 12, color: "var(--vr-cream-faint)", fontStyle: "italic" }}>
              No campaign yet. Once a Bench Job earns it, this idea graduates here.
            </div>
          )}
        </ThreadStep>

        <ThreadStep
          idx={5}
          activeIdx={idx}
          label="Promotion"
          meta={idea.promotion_target ? `slot · ${idea.promotion_target.passport_role_id}` : null}
          isLast
        >
          {idea.promotion_target ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span
                className="t-eyebrow"
                style={{
                  alignSelf: "flex-start",
                  fontSize: 9,
                  letterSpacing: "0.16em",
                  color: "var(--vr-gold)",
                  border: "1px solid var(--vr-gold-line)",
                  background: "var(--vr-gold-soft)",
                  padding: "2px 7px",
                  borderRadius: 2,
                }}
              >
                {idea.promotion_target.target_action.replace(/_/g, " ")}
              </span>
              <div className="t-read" style={{ fontSize: 12, color: "var(--vr-cream-dim)", lineHeight: 1.55 }}>
                When acceptance criteria clear, this idea becomes a passport role at{" "}
                <span className="t-mono">{idea.promotion_target.passport_role_id}</span>
                {idea.promotion_target.supersedes_record_id && (
                  <>
                    {", replacing "}
                    <span className="t-mono">{idea.promotion_target.supersedes_record_id}</span>
                  </>
                )}
                .
              </div>
            </div>
          ) : (
            <div className="t-read" style={{ fontSize: 12, color: "var(--vr-cream-faint)", fontStyle: "italic" }}>
              No promotion slot assigned. Nomination stays disabled until one is set.
            </div>
          )}
        </ThreadStep>
      </div>

      {/* Neighborhood */}
      {neighborhood.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, letterSpacing: "0.16em", color: "var(--vr-cream-mute)" }}
          >
            Neighborhood
          </div>
          <div style={{ fontSize: 11.5, color: "var(--vr-cream-dim)", fontStyle: "italic" }}>
            Other ideas in the same sleeve — check before duplicating prior work.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {neighborhood.map(n => (
              <Link
                key={n.idea_id}
                href={`/vires/bench/lab/ideas/${encodeURIComponent(n.idea_id)}`}
                className="vr-card"
                style={{
                  padding: "10px 14px",
                  textDecoration: "none",
                  color: "inherit",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--vr-cream)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {n.title}
                  </div>
                  <NeighborStage stage={n.stage} />
                </div>
                <span
                  className="t-eyebrow"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    color: STATUS_COLOR[n.status] ?? "var(--vr-cream-mute)",
                    border: `1px solid ${STATUS_COLOR[n.status] ?? "var(--vr-cream-mute)"}`,
                    padding: "2px 7px",
                    borderRadius: 2,
                  }}
                >
                  {n.status}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <DetailsDisclosure idea={idea} strategySpecs={strategySpecs} />
    </div>
  )
}

// ─── Thread step ──────────────────────────────────────────────────────

function ThreadStep({
  idx,
  activeIdx,
  label,
  meta,
  children,
  isLast,
}: {
  idx: number
  activeIdx: number
  label: string
  meta: string | null
  children: React.ReactNode
  isLast?: boolean
}) {
  const status: "done" | "current" | "upcoming" =
    idx < activeIdx ? "done" : idx === activeIdx ? "current" : "upcoming"
  const dotColor =
    status === "done" ? "var(--vr-up)" : status === "current" ? "var(--vr-gold)" : "var(--vr-line-hi)"
  const labelColor =
    status === "upcoming" ? "var(--vr-cream-faint)" : "var(--vr-cream-mute)"

  return (
    <div style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 12 }}>
      {/* Rail column */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            border: `1px solid ${dotColor}`,
            background: status === "done" ? dotColor : "transparent",
            flexShrink: 0,
          }}
        />
        {!isLast && (
          <span
            style={{
              flex: 1,
              width: 1,
              minHeight: 24,
              background: "var(--vr-line-hi)",
              marginTop: 4,
            }}
          />
        )}
      </div>
      {/* Body column */}
      <div style={{ paddingBottom: isLast ? 0 : 18, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span
            className="t-eyebrow"
            style={{ fontSize: 9.5, letterSpacing: "0.16em", color: labelColor }}
          >
            {label.toUpperCase()}
          </span>
          {meta && (
            <span
              className="t-mono"
              style={{ fontSize: 10, color: "var(--vr-cream-faint)", letterSpacing: "0.04em" }}
            >
              {meta}
            </span>
          )}
        </div>
        <div
          className="vr-card"
          style={{
            padding: "12px 14px",
            opacity: status === "upcoming" ? 0.55 : 1,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Step body helpers ────────────────────────────────────────────────

function SpecStepBody({
  idea,
  activeSpec,
  stage,
}: {
  idea: IdeaArtifact
  activeSpec: StrategySpecV1 | null
  stage: IdeaStage
}) {
  const builderHref = `/vires/bench/lab/ideas/${encodeURIComponent(idea.idea_id)}/builder`
  if (!activeSpec) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="t-read" style={{ fontSize: 12, color: "var(--vr-cream-dim)", lineHeight: 1.55 }}>
          Translate the thesis into rules Codex can implement. Talon can draft a first pass.
        </div>
        <Link href={builderHref} style={specCtaStyle}>
          OPEN SPEC BUILDER ›
        </Link>
      </div>
    )
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          fontSize: 13,
          color: "var(--vr-cream)",
          lineHeight: 1.5,
        }}
      >
        {activeSpec.signal_logic}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <MiniBlock label="Entry" value={activeSpec.entry_rules} />
        <MiniBlock label="Exit"  value={activeSpec.exit_rules} />
      </div>
      <Link href={builderHref} style={specCtaStyle}>
        {stage === "spec" ? "EDIT SPEC ›" : "OPEN SPEC EDITOR ›"}
      </Link>
    </div>
  )
}

function MiniBlock({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="vr-inset" style={{ padding: "10px 12px" }}>
      <div className="t-eyebrow" style={{ fontSize: 8.5, color: "var(--vr-cream-mute)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}>
        {value ?? "—"}
      </div>
    </div>
  )
}

function NeighborStage({ stage }: { stage: IdeaStage }) {
  const idx = stageIndex(stage)
  const color = stageColor(stage)
  return (
    <span className="t-eyebrow" style={{ fontSize: 8.5, letterSpacing: "0.14em", color, display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ display: "inline-flex", gap: 2 }}>
        {STAGES.map((_, i) => (
          <span
            key={i}
            style={{
              width: 3,
              height: 3,
              borderRadius: "50%",
              background: i <= idx ? color : "rgba(241,236,224,0.12)",
            }}
          />
        ))}
      </span>
      {STAGE_META[stage].label.toUpperCase()}
    </span>
  )
}

function StageBadge({ stage }: { stage: IdeaStage }) {
  const idx = stageIndex(stage)
  const color = stageColor(stage)
  return (
    <span
      className="t-eyebrow"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 9,
        letterSpacing: "0.14em",
        color,
      }}
    >
      <span style={{ display: "inline-flex", gap: 2 }}>
        {STAGES.map((_, i) => (
          <span
            key={i}
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: i <= idx ? color : "rgba(241,236,224,0.12)",
            }}
          />
        ))}
      </span>
      {STAGE_META[stage].label.toUpperCase()}
    </span>
  )
}

const specCtaStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  fontSize: 10,
  letterSpacing: "0.16em",
  fontFamily: "var(--ff-mono)",
  textTransform: "uppercase",
  padding: "7px 14px",
  borderRadius: 3,
  border: "1px solid var(--vr-gold-line)",
  background: "var(--vr-gold-soft)",
  color: "var(--vr-gold)",
  textDecoration: "none",
}

function specMeta(spec: StrategySpecV1 | null): string | null {
  if (!spec) return null
  const state = spec.state
  if (state === "REGISTERED") return `registered · ${shortDate(spec.created_at)}`
  if (state === "APPROVED")   return `approved · ${shortDate(spec.created_at)}`
  if (state === "DRAFTING")   return `drafting · ${shortDate(spec.created_at)}`
  return state.toLowerCase()
}

function buildMeta(stage: IdeaStage): string | null {
  if (stage === "build") return "codex implementing strategy"
  if (stage === "thesis" || stage === "spec") return null
  return null
}

function shortDate(iso?: string | null): string {
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

function fmtDate(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ─── Bench Job step body — submit-campaign affordance + jobs rail ─────

function BenchJobStepBody({ idea, hasCampaign }: { idea: IdeaArtifact; hasCampaign: boolean }) {
  if (idea.code_pending) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            fontSize: 13,
            color: "var(--vr-cream)",
            lineHeight: 1.45,
          }}
        >
          No executable strategy for this idea yet
        </div>
        <div
          className="t-read"
          style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--vr-cream-dim)" }}
        >
          This idea was captured before any code was written. It can&apos;t be submitted to
          the lab until the strategy is implemented and registered under a real{" "}
          <span className="t-mono">strategy_id</span>. Once that lands, the
          submit action will re-enable here.
        </div>
        <IdeaJobsRail ideaId={idea.idea_id} />
      </div>
    )
  }
  const newCampaignHref = `/vires/bench/lab/new-campaign/${encodeURIComponent(idea.idea_id)}`
  const subdued = hasCampaign
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Link
        href={newCampaignHref}
        className="t-eyebrow"
        style={{
          alignSelf: "flex-start",
          fontSize: 10,
          letterSpacing: "0.16em",
          fontFamily: "var(--ff-mono)",
          textTransform: "uppercase",
          padding: "7px 14px",
          borderRadius: 3,
          border: subdued ? "1px solid var(--vr-line)" : "1px solid var(--vr-gold-line)",
          background: subdued ? "transparent" : "var(--vr-gold-soft)",
          color: subdued ? "var(--vr-cream-mute)" : "var(--vr-gold)",
          textDecoration: "none",
        }}
      >
        {subdued ? "RUN AGAIN ›" : "SUBMIT A CAMPAIGN ›"}
      </Link>
      <IdeaJobsRail ideaId={idea.idea_id} />
    </div>
  )
}

// ─── Details disclosure — spec history, metadata, params ──────────────

function DetailsDisclosure({
  idea,
  strategySpecs,
}: {
  idea: IdeaArtifact
  strategySpecs: StrategySpecV1[]
}) {
  const hasParams = idea.params && Object.keys(idea.params).length > 0
  const hasSpecs = strategySpecs.length > 0
  // Always offer the disclosure — operator should be able to drop into the
  // metadata table even when there's no spec history yet.
  return (
    <details
      style={{
        borderTop: "1px solid var(--vr-line)",
        paddingTop: 14,
      }}
    >
      <summary
        className="t-eyebrow"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.16em",
          color: "var(--vr-cream-mute)",
          cursor: "pointer",
          listStyle: "none",
          userSelect: "none",
        }}
      >
        Details · spec history · metadata{hasParams ? " · params" : ""}
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
        {hasSpecs && (
          <DetailsSection label="Spec history">
            <div className="vr-card" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
              {strategySpecs.map((spec, i) => (
                <div
                  key={spec.spec_id}
                  style={{
                    padding: "12px 14px",
                    borderBottom: i < strategySpecs.length - 1 ? "1px solid var(--vr-line)" : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      marginBottom: 6,
                    }}
                  >
                    <span
                      className="t-eyebrow"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.14em",
                        color: spec.state === "REGISTERED" ? "var(--vr-up)" : "var(--vr-gold)",
                        border:
                          spec.state === "REGISTERED"
                            ? "1px solid rgba(104, 200, 142, 0.42)"
                            : "1px solid var(--vr-gold-line)",
                        padding: "2px 7px",
                        borderRadius: 2,
                      }}
                    >
                      {spec.state}
                    </span>
                    <span className="t-mono" style={{ fontSize: 10, color: "var(--vr-cream-mute)" }}>
                      {spec.spec_id} · v{spec.spec_version}
                    </span>
                    <span className="t-mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--vr-cream-faint)" }}>
                      {fmtDate(spec.created_at)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--ff-serif)",
                      fontStyle: "italic",
                      fontSize: 13,
                      color: "var(--vr-cream)",
                      lineHeight: 1.4,
                    }}
                  >
                    {spec.signal_logic}
                  </div>
                </div>
              ))}
            </div>
          </DetailsSection>
        )}

        <DetailsSection label="Metadata">
          <div className="vr-card" style={{ padding: 0 }}>
            <DetailRow label="Strategy" value={idea.code_pending ? "—" : idea.strategy_id} />
            {idea.strategy_family && <DetailRow label="Family" value={idea.strategy_family} />}
            <DetailRow label="Sleeve" value={idea.sleeve} />
            <DetailRow label="Source" value={idea.source} />
            {idea.tags && idea.tags.length > 0 && (
              <DetailRow label="Tags" value={idea.tags.join(", ")} />
            )}
            <DetailRow label="Created by" value={idea.created_by} />
            <DetailRow label="Created" value={fmtDate(idea.created_at)} last />
          </div>
        </DetailsSection>

        {hasParams && (
          <DetailsSection label="Params">
            <div className="vr-card" style={{ padding: "12px 14px" }}>
              <pre
                className="t-mono"
                style={{
                  fontSize: 11,
                  color: "var(--vr-cream)",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {JSON.stringify(idea.params, null, 2)}
              </pre>
            </div>
          </DetailsSection>
        )}
      </div>
    </details>
  )
}

function DetailsSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, letterSpacing: "0.16em", color: "var(--vr-cream-mute)" }}
      >
        {label}
      </div>
      {children}
    </section>
  )
}

function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 10,
        padding: "10px 14px",
        borderBottom: last ? "none" : "1px solid var(--vr-line)",
      }}
    >
      <div className="t-eyebrow" style={{ fontSize: 9, letterSpacing: "0.14em", color: "var(--vr-cream-mute)" }}>
        {label}
      </div>
      <div className="t-mono" style={{ fontSize: 11, color: "var(--vr-cream)" }}>
        {value}
      </div>
    </div>
  )
}
