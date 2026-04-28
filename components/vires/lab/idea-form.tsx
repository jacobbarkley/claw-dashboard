"use client"

// V0 manual idea authoring form. Guardrails per spec §12 + Codex's
// idea-factory notes:
//   - strategy_id is a dropdown sourced from the preset index — no
//     freeform "make up a strategy" authoring.
//   - promotion_target is optional; honest about that.
//   - Talon-driven drafting is V1 and intentionally stubbed here as a
//     disabled button with a tooltip.

import { useState } from "react"
import { useRouter } from "next/navigation"

import type {
  IdeaPromotionTarget,
  IdeaStatus,
  ResearchSleeve,
} from "@/lib/research-lab-contracts"

export interface StrategyOption {
  strategy_id: string
  strategy_family: string
  display_name: string
  sleeve: ResearchSleeve
  preset_id: string
}

export function IdeaForm({ strategyOptions }: { strategyOptions: StrategyOption[] }) {
  const router = useRouter()

  const [title, setTitle] = useState("")
  const [thesis, setThesis] = useState("")
  const [sleeve, setSleeve] = useState<ResearchSleeve>("STOCKS")
  const [strategyId, setStrategyId] = useState<string>(
    strategyOptions.find(s => s.sleeve === "STOCKS")?.strategy_id ?? "",
  )
  // codePending == true means "I have a thesis but no executable strategy
  // exists yet" — Codex (or eventually Talon V1) implements the strategy
  // and updates strategy_id later. Submit-to-lab is blocked on the detail
  // page until that happens.
  const [codePending, setCodePending] = useState(false)
  const [tags, setTags] = useState("")
  const [status, setStatus] = useState<IdeaStatus>("DRAFT")
  // Optional structured spec fields. Persisted into params.spec on submit
  // so the backend contract stays open-ended (params is a free-form record)
  // while we capture enough structure for downstream Talon / Codex pickup.
  const [specOpen, setSpecOpen] = useState(false)
  const [dataSources, setDataSources] = useState("")
  const [signalFilters, setSignalFilters] = useState("")
  const [exitRules, setExitRules] = useState("")
  const [promoteToCampaign, setPromoteToCampaign] = useState(false)
  const [promotionTarget, setPromotionTarget] = useState<IdeaPromotionTarget | null>(null)
  const [assignSlotOpen, setAssignSlotOpen] = useState(false)
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "error">("idle")
  const [submitError, setSubmitError] = useState<string | null>(null)

  const strategiesForSleeve = strategyOptions.filter(s => s.sleeve === sleeve)
  const selectedStrategy = strategyOptions.find(s => s.strategy_id === strategyId) ?? null

  const onSleeveChange = (next: ResearchSleeve) => {
    setSleeve(next)
    // Reset strategy to the first one available for the new sleeve.
    const firstForSleeve = strategyOptions.find(s => s.sleeve === next)
    setStrategyId(firstForSleeve?.strategy_id ?? "")
  }

  const canSubmit =
    title.trim().length > 0 &&
    thesis.trim().length > 0 &&
    (codePending || strategyId.length > 0) &&
    submitState !== "submitting"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitState("submitting")
    setSubmitError(null)
    try {
      const parsedTags = tags
        .split(",")
        .map(t => t.trim())
        .filter(t => t.length > 0)
      const spec: Record<string, string> = {}
      if (dataSources.trim())   spec.data_sources   = dataSources.trim()
      if (signalFilters.trim()) spec.signal_filters = signalFilters.trim()
      if (exitRules.trim())     spec.exit_rules     = exitRules.trim()
      const payload: Record<string, unknown> = {
        title: title.trim(),
        thesis: thesis.trim(),
        sleeve,
        // Route honors code_pending and ignores strategy_id when set;
        // we still include it so the audit shape is unambiguous.
        strategy_id: codePending ? "" : strategyId,
        status: codePending ? "DRAFT" : status,
        source: "MANUAL",
        ...(codePending && { code_pending: true }),
        ...(!codePending &&
          selectedStrategy?.strategy_family && { strategy_family: selectedStrategy.strategy_family }),
        ...(parsedTags.length > 0 && { tags: parsedTags }),
        ...(Object.keys(spec).length > 0 && { params: { spec } }),
        ...(!codePending && promoteToCampaign && { promote_to_campaign: true }),
        ...(!codePending && promotionTarget && { promotion_target: promotionTarget }),
      }
      const res = await fetch("/api/research/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as { ok?: boolean; idea?: { idea_id: string }; error?: string }
      if (!res.ok || !data.ok || !data.idea) {
        setSubmitState("error")
        setSubmitError(data.error ?? `HTTP ${res.status}`)
        return
      }
      router.push(`/vires/bench/lab/ideas/${encodeURIComponent(data.idea.idea_id)}`)
    } catch (err) {
      setSubmitState("error")
      setSubmitError(err instanceof Error ? err.message : "Network error")
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Draft-with-Talon placeholder — V1 */}
      <div
        className="vr-card"
        style={{
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: "rgba(241,236,224,0.02)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              fontSize: 14,
              color: "var(--vr-cream)",
              lineHeight: 1.2,
            }}
          >
            Draft with Talon
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}>
            A conversation that turns a half-formed thesis into a real spec. Coming in V1.
          </div>
        </div>
        <button
          type="button"
          disabled
          title="Coming in V1"
          className="t-eyebrow"
          style={{
            padding: "7px 12px",
            fontSize: 10,
            letterSpacing: "0.14em",
            borderRadius: 3,
            border: "1px solid var(--vr-line)",
            background: "transparent",
            color: "var(--vr-cream-faint)",
            cursor: "not-allowed",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          Draft with Talon
        </button>
      </div>

      <div className="vr-card" style={{ padding: "16px 16px 18px" }}>
        <FormRow label="Title">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Short name — what you'd call this when talking to yourself"
            style={inputStyle}
            maxLength={140}
          />
        </FormRow>

        <FormRow label="Thesis">
          <textarea
            value={thesis}
            onChange={e => setThesis(e.target.value)}
            placeholder="Why might this work? What's the edge you're testing?"
            rows={4}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            maxLength={2000}
          />
        </FormRow>

        <FormRow label="Sleeve">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["STOCKS", "CRYPTO", "OPTIONS"] as ResearchSleeve[]).map(s => (
              <ChipToggle
                key={s}
                label={s.charAt(0) + s.slice(1).toLowerCase()}
                active={sleeve === s}
                onClick={() => onSleeveChange(s)}
                disabled={!strategyOptions.some(o => o.sleeve === s)}
              />
            ))}
          </div>
          {!strategyOptions.some(o => o.sleeve === sleeve) && (
            <div
              style={{
                marginTop: 6,
                fontSize: 10.5,
                color: "var(--vr-cream-faint)",
                fontStyle: "italic",
                fontFamily: "var(--ff-serif)",
              }}
            >
              No registered strategies for this sleeve yet — landing once the presets register one.
            </div>
          )}
        </FormRow>

        <FormRow label="Strategy mode">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <ChipToggle
              label="Use registered strategy"
              active={!codePending}
              onClick={() => setCodePending(false)}
            />
            <ChipToggle
              label="+ New strategy (code pending)"
              active={codePending}
              onClick={() => setCodePending(true)}
            />
          </div>
        </FormRow>

        {codePending ? (
          <FormRow label="Code-pending capture">
            <div
              style={{
                padding: "10px 12px",
                border: "1px solid var(--vr-gold-line)",
                borderLeft: "2px solid var(--vr-gold)",
                background: "rgba(200,169,104,0.06)",
                borderRadius: 3,
                fontSize: 11.5,
                lineHeight: 1.55,
                color: "var(--vr-cream-dim)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--ff-serif)",
                  fontStyle: "italic",
                  fontSize: 13,
                  color: "var(--vr-gold)",
                  marginBottom: 6,
                }}
              >
                Held until the strategy is written
              </div>
              This idea will be saved as a code-pending capture: thesis only, no executable
              strategy yet. It can&apos;t be submitted to the lab until Codex (or Talon V1)
              implements the strategy and registers it. Status stays DRAFT and promotion
              fields are hidden.
            </div>
          </FormRow>
        ) : (
          <FormRow label="Strategy">
            <select
              value={strategyId}
              onChange={e => setStrategyId(e.target.value)}
              style={inputStyle}
              disabled={strategiesForSleeve.length === 0}
            >
              {strategiesForSleeve.length === 0 && <option value="">None available</option>}
              {strategiesForSleeve.map(s => (
                <option key={s.strategy_id} value={s.strategy_id}>
                  {s.display_name} · {s.strategy_id}
                </option>
              ))}
            </select>
            <div
              style={{
                marginTop: 5,
                fontSize: 10.5,
                color: "var(--vr-cream-faint)",
                fontStyle: "italic",
                fontFamily: "var(--ff-serif)",
                lineHeight: 1.5,
              }}
            >
              Registered families only. If none of these fit the thesis you wrote above,
              switch to{" "}
              <button
                type="button"
                onClick={() => setCodePending(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  color: "var(--vr-gold)",
                  fontStyle: "italic",
                  fontFamily: "var(--ff-serif)",
                  fontSize: "inherit",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                + New strategy (code pending)
              </button>
              {" "}rather than forcing a fit — the lab will hold the idea until the
              strategy is implemented.
            </div>
          </FormRow>
        )}

        <FormRow label="Tags (comma-separated, optional)">
          <input
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="momentum, regime, large-cap"
            style={inputStyle}
          />
        </FormRow>

        {/* Strategy spec — optional structured capture. Lite version on
            purpose: three open-ended textareas. Talon V1 will turn this
            into a guided conversation. */}
        <div style={{ marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setSpecOpen(o => !o)}
            aria-expanded={specOpen}
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "transparent",
              border: "1px solid var(--vr-line)",
              borderRadius: 3,
              color: "var(--vr-cream)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontFamily: "inherit",
              textAlign: "left",
            }}
          >
            <span
              style={{
                fontFamily: "var(--ff-serif)",
                fontStyle: "italic",
                fontSize: 14,
                color: "var(--vr-cream)",
              }}
            >
              Strategy spec
            </span>
            <span style={{ fontSize: 11, color: "var(--vr-cream-mute)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontStyle: "italic", fontFamily: "var(--ff-serif)" }}>optional</span>
              <span style={{ fontFamily: "var(--ff-mono)", fontSize: 13, color: "var(--vr-cream-dim)" }}>
                {specOpen ? "−" : "+"}
              </span>
            </span>
          </button>
          {specOpen && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--vr-cream-mute)",
                  fontStyle: "italic",
                  fontFamily: "var(--ff-serif)",
                  marginBottom: 10,
                  lineHeight: 1.5,
                }}
              >
                Sketch what's in your head. None of these are required.
                The more you fill in, the easier it is for Talon or Codex
                to turn the thesis into real strategy code later.
              </div>
              <FormRow label="Data sources">
                <textarea
                  value={dataSources}
                  onChange={e => setDataSources(e.target.value)}
                  placeholder="Where do the inputs come from? e.g. apewisdom top-100 sweep, Reddit r/wallstreetbets velocity, X trending tickers, OHLCV bars."
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                  maxLength={1500}
                />
              </FormRow>
              <FormRow label="Signal & filters">
                <textarea
                  value={signalFilters}
                  onChange={e => setSignalFilters(e.target.value)}
                  placeholder="How do you pick the trade? e.g. likes/mentions ratio above X, current volume within 1σ of 30d mean, RSI < 70, above 50d MA."
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                  maxLength={1500}
                />
              </FormRow>
              <FormRow label="Exit rules">
                <textarea
                  value={exitRules}
                  onChange={e => setExitRules(e.target.value)}
                  placeholder="When do you sell? e.g. take-profit at +15%, stop-loss at −5%, trailing stop after first 5% gain, max-hold 10 days."
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                  maxLength={1500}
                />
              </FormRow>
            </div>
          )}
        </div>

        {!codePending && (
        <FormRow label="Status">
          <div style={{ display: "flex", gap: 6 }}>
            {(["DRAFT", "READY"] as IdeaStatus[]).map(s => (
              <ChipToggle
                key={s}
                label={s.charAt(0) + s.slice(1).toLowerCase()}
                active={status === s}
                onClick={() => setStatus(s)}
              />
            ))}
          </div>
          <div
            style={{
              marginTop: 5,
              fontSize: 10.5,
              color: "var(--vr-cream-faint)",
              fontStyle: "italic",
              fontFamily: "var(--ff-serif)",
            }}
          >
            DRAFT stays quiet. READY makes the idea eligible for autopilot pickup.
          </div>
        </FormRow>
        )}

        {!codePending && (
        <FormRow label="Campaign on first run">
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--vr-cream)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={promoteToCampaign}
              onChange={e => setPromoteToCampaign(e.target.checked)}
              style={{ margin: 0 }}
            />
            <span>Force campaign rollup on the first DONE job (bypasses thresholds)</span>
          </label>
        </FormRow>
        )}

        {!codePending && (
        <FormRow label="Promotion slot (optional)">
          {promotionTarget ? (
            <PromotionTargetDisplay
              target={promotionTarget}
              onClear={() => setPromotionTarget(null)}
            />
          ) : assignSlotOpen ? (
            <PromotionTargetEditor
              onCancel={() => setAssignSlotOpen(false)}
              onCommit={target => {
                setPromotionTarget(target)
                setAssignSlotOpen(false)
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAssignSlotOpen(true)}
              className="t-eyebrow"
              style={{
                padding: "7px 12px",
                fontSize: 10,
                letterSpacing: "0.14em",
                borderRadius: 3,
                border: "1px solid var(--vr-line)",
                background: "transparent",
                color: "var(--vr-cream-mute)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Assign promotion slot
            </button>
          )}
          <div
            style={{
              marginTop: 5,
              fontSize: 10.5,
              color: "var(--vr-cream-faint)",
              fontStyle: "italic",
              fontFamily: "var(--ff-serif)",
            }}
          >
            Optional at authoring time. Without it, Nominate stays disabled on any spawned campaign until you assign a slot there.
          </div>
        </FormRow>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="t-eyebrow"
          style={{
            marginTop: 10,
            padding: "11px 14px",
            fontSize: 11,
            letterSpacing: "0.14em",
            borderRadius: 3,
            border: `1px solid ${canSubmit ? "var(--vr-gold)" : "var(--vr-line)"}`,
            background: canSubmit ? "rgba(200,169,104,0.12)" : "transparent",
            color: canSubmit ? "var(--vr-gold)" : "var(--vr-cream-faint)",
            cursor: canSubmit ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          {submitState === "submitting" ? "Saving…" : "Save idea"}
        </button>

        {submitError && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              border: "1px solid var(--vr-down)",
              borderRadius: 3,
              fontSize: 11,
              color: "var(--vr-down)",
              lineHeight: 1.55,
            }}
          >
            {submitError}
          </div>
        )}
      </div>
    </form>
  )
}

// ─── Tiny form primitives ───────────────────────────────────────────────

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 6, letterSpacing: "0.14em" }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--vr-line)",
  borderRadius: 3,
  background: "var(--vr-ink)",
  color: "var(--vr-cream)",
  fontFamily: "inherit",
  fontSize: 12.5,
}

function ChipToggle({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string
  active: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="t-eyebrow"
      style={{
        padding: "6px 12px",
        fontSize: 10.5,
        letterSpacing: "0.1em",
        borderRadius: 3,
        border: `1px solid ${active ? "var(--vr-gold)" : "var(--vr-line)"}`,
        background: active ? "rgba(200,169,104,0.12)" : "transparent",
        color: active ? "var(--vr-gold)" : disabled ? "var(--vr-cream-faint)" : "var(--vr-cream-mute)",
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  )
}

function PromotionTargetDisplay({
  target,
  onClear,
}: {
  target: IdeaPromotionTarget
  onClear: () => void
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        border: "1px solid var(--vr-gold-line, rgba(200,169,104,0.4))",
        borderRadius: 3,
        background: "rgba(200,169,104,0.04)",
        fontSize: 12,
        lineHeight: 1.55,
        color: "var(--vr-cream)",
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-gold)", marginBottom: 3 }}>
          {target.target_action.replace("_", " ")}
        </div>
        <div className="t-mono" style={{ fontSize: 11.5 }}>
          role · {target.passport_role_id}
        </div>
        {target.supersedes_record_id && (
          <div
            className="t-mono"
            style={{ fontSize: 10, color: "var(--vr-cream-mute)", marginTop: 2 }}
          >
            supersedes · {target.supersedes_record_id}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="t-eyebrow"
        style={{
          fontSize: 10,
          letterSpacing: "0.14em",
          background: "transparent",
          border: "none",
          color: "var(--vr-cream-mute)",
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: 0,
        }}
      >
        Clear
      </button>
    </div>
  )
}

function PromotionTargetEditor({
  onCancel,
  onCommit,
}: {
  onCancel: () => void
  onCommit: (target: IdeaPromotionTarget) => void
}) {
  const [roleId, setRoleId] = useState("")
  const [targetAction, setTargetAction] = useState<IdeaPromotionTarget["target_action"]>("NEW_RECORD")
  const [supersedesId, setSupersedesId] = useState("")

  const canCommit =
    roleId.trim().length > 0 && (targetAction === "NEW_RECORD" || supersedesId.trim().length > 0)

  return (
    <div
      style={{
        padding: "12px 12px 10px",
        border: "1px solid var(--vr-line)",
        borderRadius: 3,
        background: "rgba(241,236,224,0.02)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <FormRow label="Passport role ID">
        <input
          value={roleId}
          onChange={e => setRoleId(e.target.value)}
          placeholder="e.g. STOCKS_BROAD_MOMENTUM"
          style={inputStyle}
        />
      </FormRow>
      <FormRow label="Target action">
        <div style={{ display: "flex", gap: 6 }}>
          {(["NEW_RECORD", "REPLACE_EXISTING"] as const).map(a => (
            <ChipToggle
              key={a}
              label={a.replace("_", " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
              active={targetAction === a}
              onClick={() => setTargetAction(a)}
            />
          ))}
        </div>
      </FormRow>
      {targetAction === "REPLACE_EXISTING" && (
        <FormRow label="Supersedes record ID">
          <input
            value={supersedesId}
            onChange={e => setSupersedesId(e.target.value)}
            placeholder="e.g. regime_aware_momentum::stop_5_target_15"
            style={inputStyle}
          />
        </FormRow>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() =>
            onCommit({
              passport_role_id: roleId.trim(),
              target_action: targetAction,
              supersedes_record_id:
                targetAction === "REPLACE_EXISTING" && supersedesId.trim() ? supersedesId.trim() : null,
            })
          }
          disabled={!canCommit}
          className="t-eyebrow"
          style={{
            padding: "7px 12px",
            fontSize: 10,
            letterSpacing: "0.14em",
            borderRadius: 3,
            border: `1px solid ${canCommit ? "var(--vr-gold)" : "var(--vr-line)"}`,
            background: canCommit ? "rgba(200,169,104,0.12)" : "transparent",
            color: canCommit ? "var(--vr-gold)" : "var(--vr-cream-faint)",
            cursor: canCommit ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          Use this slot
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="t-eyebrow"
          style={{
            padding: "7px 12px",
            fontSize: 10,
            letterSpacing: "0.14em",
            borderRadius: 3,
            border: "1px solid var(--vr-line)",
            background: "transparent",
            color: "var(--vr-cream-mute)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
