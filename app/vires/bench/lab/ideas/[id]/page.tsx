import Link from "next/link"

import { IdeaStatusControl } from "@/components/vires/lab/idea-status-control"
import { IdeaThreadLive } from "@/components/vires/lab/idea-thread-live"
import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell, LabPhaseZeroSlot } from "@/components/vires/lab/phase-zero-shell"
import { specAuthoringEnabled, unifiedBuilderEnabled } from "@/lib/feature-flags.server"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import type {
  IdeaArtifact,
  SpecImplementationQueueV1,
  StrategySpecV1,
} from "@/lib/research-lab-contracts"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import { loadSpecImplementationQueueEntry } from "@/lib/research-lab-queue.server"
import { loadStrategySpecsForIdea } from "@/lib/research-lab-specs.server"
import { hasLabCampaignForIdea } from "@/lib/vires-campaigns.server"

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
  const labCampaignExists = idea ? await hasLabCampaignForIdea(idea.idea_id) : false
  const strategySpecs = idea ? await loadStrategySpecsForIdea(idea.idea_id) : []
  const threadEnabled = specAuthoringEnabled()
  const builderEnabled = unifiedBuilderEnabled()
  const { activeSpec, pendingSpec, activeQueueEntry } = threadEnabled && idea
    ? await loadThreadDataForIdea(idea, strategySpecs)
    : { activeSpec: null, pendingSpec: null, activeQueueEntry: null }

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
          <IdeaStatusControl
            ideaId={idea.idea_id}
            currentStatus={idea.status}
            codePending={idea.code_pending === true}
            convertToCodePendingAvailable={idea.status === "DRAFT" && !labCampaignExists}
          />
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
          <span className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)" }}>
            {idea.sleeve}
          </span>
          {idea.status === "DRAFT" && !labCampaignExists && (
            <Link
              href={`/vires/bench/lab/ideas/${encodeURIComponent(idea.idea_id)}/edit`}
              style={{
                marginLeft: "auto",
                fontFamily: "var(--ff-mono)",
                fontSize: 10.5,
                color: "var(--vr-gold)",
                padding: "3px 9px",
                border: "1px solid var(--vr-gold-line)",
                borderRadius: 2,
                background: "var(--vr-gold-soft)",
                textDecoration: "none",
              }}
            >
              Edit →
            </Link>
          )}
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
        {threadEnabled && (
          <IdeaThreadLive
            idea={idea}
            scope={PHASE_1_DEFAULT_SCOPE}
            activeSpec={activeSpec}
            pendingSpec={pendingSpec}
            activeQueueEntry={activeQueueEntry}
            labCampaignExists={labCampaignExists}
            unifiedBuilderEnabled={builderEnabled}
          />
        )}

        {!threadEnabled && labCampaignExists && (
          <Link
            href={`/vires/bench/campaigns/${encodeURIComponent(`lab_${idea.idea_id}`)}`}
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
                style={{
                  fontFamily: "var(--ff-serif)",
                  fontStyle: "italic",
                  fontSize: 15,
                  color: "var(--vr-cream)",
                  lineHeight: 1.2,
                }}
              >
                View campaign for this idea
              </div>
              <div style={{ marginTop: 3, fontSize: 11, color: "var(--vr-cream-mute)" }}>
                Already rolled up from a completed run.
              </div>
            </div>
            <span
              style={{
                fontFamily: "var(--ff-mono)",
                fontSize: 11,
                color: "var(--vr-gold)",
                padding: "7px 14px",
                border: "1px solid var(--vr-gold-line)",
                borderRadius: 3,
                background: "var(--vr-gold-soft)",
                whiteSpace: "nowrap",
              }}
            >
              Open →
            </span>
          </Link>
        )}

        {/* Code-pending honest state — replaces the submit CTA when no
            executable strategy exists yet. Operator captured the thesis;
            Codex / Talon V1 picks it up from this surface to implement.
            Suppressed when the spec-authoring thread is active — the thread
            renders the action surface for steps 5/6/7. */}
        {!threadEnabled && (idea.code_pending ? (
          <div
            className="vr-card"
            style={{
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              borderLeft: "2px solid var(--vr-gold)",
              background: "rgba(200,169,104,0.04)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--ff-serif)",
                fontStyle: "italic",
                fontSize: 15,
                color: "var(--vr-cream)",
                lineHeight: 1.2,
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
              &quot;Test this idea&quot; action will re-enable here.
            </div>
          </div>
        ) : (
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
            borderLeft: labCampaignExists ? "2px solid var(--vr-line)" : "2px solid var(--vr-gold)",
            background: labCampaignExists ? "transparent" : "rgba(200,169,104,0.04)",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--ff-serif)",
                fontStyle: "italic",
                fontSize: 15,
                color: "var(--vr-cream)",
                lineHeight: 1.2,
              }}
            >
              {labCampaignExists ? "Submit another campaign run" : "Submit a campaign from this idea"}
            </div>
            <div style={{ marginTop: 3, fontSize: 11, color: "var(--vr-cream-mute)" }}>
              {labCampaignExists
                ? "Re-run with adjusted parameters or a fresh tape."
                : "Spin up the first lab run against this thesis."}
            </div>
          </div>
          <span
            style={{
              fontFamily: "var(--ff-mono)",
              fontSize: 11,
              color: labCampaignExists ? "var(--vr-cream-mute)" : "var(--vr-gold)",
              padding: "7px 14px",
              border: labCampaignExists ? "1px solid var(--vr-line)" : "1px solid var(--vr-gold-line)",
              borderRadius: 3,
              background: labCampaignExists ? "transparent" : "var(--vr-gold-soft)",
              whiteSpace: "nowrap",
            }}
          >
            {labCampaignExists ? "Run again →" : "New campaign →"}
          </span>
        </Link>
        ))}

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

        <IdeaStrategySpecsPanel specs={strategySpecs} />

        {/* Legacy spec seed — only when the operator captured at least one
            field at create time. Renders as a card with three labeled
            blocks; missing fields are skipped. */}
        <IdeaStrategySpec params={idea.params} />

        {/* Spec fields */}
        <div className="vr-card" style={{ padding: 0 }}>
          <SpecRow
            label="Strategy"
            value={idea.code_pending ? "—" : idea.strategy_id}
          />
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

function IdeaStrategySpecsPanel({ specs }: { specs: StrategySpecV1[] }) {
  return (
    <section>
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 6, letterSpacing: "0.14em" }}
      >
        StrategySpec
      </div>
      {specs.length === 0 ? (
        <LabPhaseZeroSlot
          label="Awaiting strategy spec"
          note="This idea has no durable strategy_spec.v1 artifact yet. Phase D adds the operator-authored spec form and Talon draft action that create this bridge from thesis to implementation."
        />
      ) : (
        <div className="vr-card" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
          {specs.map((spec, index) => (
            <div
              key={spec.spec_id}
              style={{
                padding: "14px 16px",
                borderBottom: index < specs.length - 1 ? "1px solid var(--vr-line)" : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 8,
                }}
              >
                <span
                  className="t-eyebrow"
                  style={{
                    fontSize: 9,
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
                <span className="t-mono" style={{ fontSize: 10.5, color: "var(--vr-cream-mute)" }}>
                  {spec.spec_id} · v{spec.spec_version}
                </span>
                <span className="t-mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--vr-cream-mute)" }}>
                  {fmtDate(spec.created_at)}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--ff-serif)",
                  fontStyle: "italic",
                  fontSize: 14,
                  color: "var(--vr-cream)",
                  lineHeight: 1.35,
                }}
              >
                {spec.signal_logic}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginTop: 10,
                }}
              >
                <MiniSpecBlock label="Entry" value={spec.entry_rules} />
                <MiniSpecBlock label="Exit" value={spec.exit_rules} />
              </div>
              {spec.implementation_notes && (
                <div
                  className="t-read"
                  style={{ marginTop: 10, fontSize: 11.5, color: "var(--vr-cream-dim)", lineHeight: 1.55 }}
                >
                  {spec.implementation_notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function MiniSpecBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="t-eyebrow" style={{ fontSize: 8.5, color: "var(--vr-cream-mute)", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--vr-cream-dim)", lineHeight: 1.45 }}>
        {value}
      </div>
    </div>
  )
}

function IdeaStrategySpec({ params }: { params: Record<string, unknown> }) {
  const spec = params.spec
  if (!spec || typeof spec !== "object") return null
  const s = spec as Record<string, unknown>
  const blocks = [
    { key: "data_sources",   label: "Data sources" },
    { key: "signal_filters", label: "Signal & filters" },
    { key: "exit_rules",     label: "Exit rules" },
  ].filter(b => typeof s[b.key] === "string" && (s[b.key] as string).trim().length > 0)
  if (blocks.length === 0) return null

  return (
    <section>
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 6, letterSpacing: "0.14em" }}
      >
        Legacy spec seed
      </div>
      <div
        className="vr-card"
        style={{ padding: 0, display: "flex", flexDirection: "column" }}
      >
        {blocks.map((b, i) => (
          <div
            key={b.key}
            style={{
              padding: "12px 16px",
              borderBottom: i < blocks.length - 1 ? "1px solid var(--vr-line)" : "none",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--ff-serif)",
                fontStyle: "italic",
                color: "var(--vr-cream-dim)",
                marginBottom: 6,
              }}
            >
              {b.label}
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--vr-cream)",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {s[b.key] as string}
            </div>
          </div>
        ))}
      </div>
    </section>
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

async function loadThreadDataForIdea(
  idea: IdeaArtifact,
  specs: StrategySpecV1[],
): Promise<{
  activeSpec: StrategySpecV1 | null
  pendingSpec: StrategySpecV1 | null
  activeQueueEntry: SpecImplementationQueueV1 | null
}> {
  const ref = idea.strategy_ref
  const findSpec = (specId: string | null | undefined): StrategySpecV1 | null => {
    if (!specId) return null
    return specs.find(s => s.spec_id === specId) ?? null
  }
  const activeSpec = findSpec(ref.active_spec_id)
  const pendingSpec = findSpec(ref.pending_spec_id)
  // Re-spec precedence — when a pending spec exists, the thread (and its
  // queue surface) tracks the pending spec's lifecycle.
  const queueLookupSpec = pendingSpec ?? activeSpec
  const activeQueueEntry =
    queueLookupSpec && (queueLookupSpec.state === "APPROVED" || queueLookupSpec.state === "REGISTERED")
      ? await loadSpecImplementationQueueEntry(queueLookupSpec.spec_id)
      : null
  return { activeSpec, pendingSpec, activeQueueEntry }
}
