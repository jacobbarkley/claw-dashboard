"use client"

// DraftPacketClient — questionnaire form for the new Strategy Authoring
// flow. Operator answers the contract's 22-field questionnaire (v1 keeps
// the rendering simple across modes; mode flag still goes through to
// Talon and to the contract). On submit, POST /api/.../packets creates
// a Talon-synthesized packet and we route to the detail screen.
//
// ProvenanceWrapped fields ship pre-filled with TUNABLE_DEFAULT provenance.
// Editing a field flips its provenance to USER. Source is shown inline so
// the operator can see at a glance which fields are still defaults.
//
// No bench launch, no legacy idea conversion.

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import type {
  AuthoringEdgeFamily,
  AuthoringUniverseShape,
  CapitalTier,
  HistoricalWindow,
  IdeaArtifact,
  RegimeExpectation,
  ResearchSleeve,
  ScopeTriple,
  StrategyAuthoringPacketV1,
  StrategyAuthoringQuestionnaire,
  StrategyAuthoringRenderMode,
  StrategyRelationship,
  TradeHorizon,
} from "@/lib/research-lab-contracts"

import { ModePill } from "./mode-pill"
import { ProvenanceChip } from "./provenance-chip"

interface DraftPacketClientProps {
  idea: IdeaArtifact
  scope: ScopeTriple
}

type WrappedKey =
  | "universe_size_band"
  | "allowed_data_inputs"
  | "entry_confirmation"
  | "exit_logic"
  | "risk_profile"
  | "benchmark"
  | "era_validation_strategy"
  | "era_weighting"
  | "historical_window"
  | "promotion_bar"
  | "talon_exclusions"

const WRAPPED_KEYS: WrappedKey[] = [
  "universe_size_band",
  "allowed_data_inputs",
  "entry_confirmation",
  "exit_logic",
  "risk_profile",
  "benchmark",
  "era_validation_strategy",
  "era_weighting",
  "historical_window",
  "promotion_bar",
  "talon_exclusions",
]

interface FormState {
  render_mode: StrategyAuthoringRenderMode
  pattern_description: string
  sleeve: ResearchSleeve
  trade_horizon: TradeHorizon
  capital_tier: CapitalTier
  capital_custom_usd: string
  strategy_relationship: StrategyRelationship
  kill_criteria_user: string
  edge_family: AuthoringEdgeFamily
  prior_work_refs: string
  changes_from_refs: string
  universe_shape: AuthoringUniverseShape
  universe_fixed_list: string
  regime_expectation: RegimeExpectation
  universe_size_band: string
  allowed_data_inputs: string
  entry_confirmation: string
  exit_logic: string
  risk_profile: string
  benchmark: string
  era_validation_strategy: string
  era_weighting: string
  historical_window: HistoricalWindow
  promotion_bar: string
  talon_exclusions: string
}

const SLEEVE_OPTIONS: ResearchSleeve[] = ["STOCKS", "CRYPTO", "OPTIONS"]
const HORIZON_OPTIONS: TradeHorizon[] = ["INTRADAY", "DAYS", "WEEKS", "MONTHS"]
const CAPITAL_TIER_OPTIONS: CapitalTier[] = ["TINY", "SMALL", "MEDIUM", "LARGE", "CUSTOM"]
const EDGE_FAMILY_OPTIONS: AuthoringEdgeFamily[] = [
  "MOMENTUM",
  "REVERSION",
  "BREAKOUT",
  "CATALYST",
  "SENTIMENT",
  "VOLATILITY",
  "HEDGE",
  "UNSURE",
]
const UNIVERSE_SHAPE_OPTIONS: AuthoringUniverseShape[] = [
  "FIXED_LIST",
  "DYNAMIC_SCREEN",
  "THEME_LEADERS",
  "TALON_PROPOSES",
]
const REGIME_OPTIONS: RegimeExpectation[] = [
  "MOST_CONDITIONS",
  "CALM",
  "VOLATILE",
  "BULL",
  "BEAR",
  "UNSURE",
]
const RELATIONSHIP_OPTIONS: StrategyRelationship["relationship"][] = [
  "ALONGSIDE",
  "REPLACE",
  "STANDALONE_TEST",
]
const EVIDENCE_BAR_OPTIONS: StrategyRelationship["evidence_bar_modifier"][] = [
  "STANDARD",
  "ELEVATED",
]

function defaultState(idea: IdeaArtifact): FormState {
  const today = new Date().toISOString().slice(0, 10)
  return {
    render_mode: "INTERMEDIATE",
    pattern_description: idea.thesis ?? "",
    sleeve: idea.sleeve,
    trade_horizon: "DAYS",
    capital_tier: "SMALL",
    capital_custom_usd: "",
    strategy_relationship: {
      relationship: "ALONGSIDE",
      target_strategy_id: null,
      evidence_bar_modifier: "STANDARD",
    },
    kill_criteria_user: "",
    edge_family: "UNSURE",
    prior_work_refs: "",
    changes_from_refs: "",
    universe_shape: "TALON_PROPOSES",
    universe_fixed_list: "",
    regime_expectation: "MOST_CONDITIONS",
    universe_size_band: "10-50",
    allowed_data_inputs: defaultDataInputsForSleeve(idea.sleeve).join(", "),
    entry_confirmation: "Wait for the idea's primary signal to confirm before entering.",
    exit_logic: "Stop-loss, target, or signal flip — Talon to refine bounds.",
    risk_profile: "balanced",
    benchmark: defaultBenchmarkForSleeve(idea.sleeve),
    era_validation_strategy: "multi-era",
    era_weighting: "equal",
    historical_window: {
      start_date: "2018-01-01",
      end_date: today,
      rationale: "Default authoring window — Talon will narrow if data coverage requires it.",
      talon_tradeoff_notes: "Wider windows trade specificity for regime diversity.",
    },
    promotion_bar: "STANDARD",
    talon_exclusions: "",
  }
}

function defaultDataInputsForSleeve(sleeve: ResearchSleeve): string[] {
  if (sleeve === "CRYPTO") return ["alpaca_crypto_daily_ohlcv"]
  if (sleeve === "OPTIONS") return ["alpaca_equity_daily_ohlcv", "options_chain_snapshots"]
  return ["alpaca_equity_daily_ohlcv"]
}

function defaultBenchmarkForSleeve(sleeve: ResearchSleeve): string {
  if (sleeve === "CRYPTO") return "BTC-USD"
  return "SPY"
}

export function DraftPacketClient({ idea, scope }: DraftPacketClientProps) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(() => defaultState(idea))
  const [touchedWrapped, setTouchedWrapped] = useState<Set<WrappedKey>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDefaults, setShowDefaults] = useState(true)

  const overriddenCount = touchedWrapped.size
  const stillDefaultCount = WRAPPED_KEYS.length - overriddenCount

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const updateWrapped = <K extends WrappedKey>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setTouchedWrapped(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const questionnaire = buildQuestionnaire(form, touchedWrapped)
      const res = await fetch("/api/research/strategy-authoring/packets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          idea_id: idea.idea_id,
          questionnaire,
        }),
      })
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string
        packet?: StrategyAuthoringPacketV1
      }
      if (!res.ok) throw new Error(payload.error ?? `Create failed (${res.status})`)
      if (!payload.packet) throw new Error("Server did not return a packet")
      router.push(
        `/vires/bench/lab/strategy-authoring/packets/${encodeURIComponent(payload.packet.packet_id)}`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed")
      setBusy(false)
    }
  }

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "32px 20px 120px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
      }}
    >
      <Header
        idea={idea}
        mode={form.render_mode}
        onModeChange={mode => update("render_mode", mode)}
      />

      {error && (
        <div
          className="t-read"
          style={{
            fontSize: 12,
            color: "var(--vr-down)",
            border: "1px solid rgba(220,95,95,0.45)",
            borderRadius: 3,
            padding: "8px 12px",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      <Section title="Your idea in a sentence" subtitle="Pre-filled from the idea's thesis. Trim or rewrite so it reads as the strategy's intent.">
        <Textarea
          value={form.pattern_description}
          onChange={value => update("pattern_description", value)}
          rows={3}
          placeholder="What pattern are you trying to capture?"
        />
      </Section>

      <Section title="Sleeve & shape" subtitle="The basics Talon needs to scope the search.">
        <Grid>
          <Select
            label="Sleeve"
            value={form.sleeve}
            options={SLEEVE_OPTIONS}
            onChange={v => update("sleeve", v as ResearchSleeve)}
          />
          <Select
            label="Trade horizon"
            value={form.trade_horizon}
            options={HORIZON_OPTIONS}
            onChange={v => update("trade_horizon", v as TradeHorizon)}
          />
          <Select
            label="Capital tier"
            value={form.capital_tier}
            options={CAPITAL_TIER_OPTIONS}
            onChange={v => update("capital_tier", v as CapitalTier)}
          />
          {form.capital_tier === "CUSTOM" && (
            <Field label="Capital custom (USD)">
              <input
                type="number"
                value={form.capital_custom_usd}
                onChange={e => update("capital_custom_usd", e.target.value)}
                style={inputStyle}
                placeholder="e.g. 12500"
              />
            </Field>
          )}
        </Grid>
      </Section>

      <Section title="Edge & relationship" subtitle="What kind of edge, and how does this packet relate to existing strategies?">
        <Grid>
          <Select
            label="Edge family"
            value={form.edge_family}
            options={EDGE_FAMILY_OPTIONS}
            onChange={v => update("edge_family", v as AuthoringEdgeFamily)}
          />
          <Select
            label="Relationship"
            value={form.strategy_relationship.relationship}
            options={RELATIONSHIP_OPTIONS}
            onChange={v =>
              update("strategy_relationship", {
                ...form.strategy_relationship,
                relationship: v as StrategyRelationship["relationship"],
              })
            }
          />
          <Select
            label="Evidence bar"
            value={form.strategy_relationship.evidence_bar_modifier}
            options={EVIDENCE_BAR_OPTIONS}
            onChange={v =>
              update("strategy_relationship", {
                ...form.strategy_relationship,
                evidence_bar_modifier: v as StrategyRelationship["evidence_bar_modifier"],
              })
            }
          />
          <Field label="Target strategy id (optional)">
            <input
              type="text"
              value={form.strategy_relationship.target_strategy_id ?? ""}
              onChange={e =>
                update("strategy_relationship", {
                  ...form.strategy_relationship,
                  target_strategy_id: e.target.value || null,
                })
              }
              style={inputStyle}
              placeholder="e.g. regime_aware_momentum::stop_5_target_15"
              spellCheck={false}
            />
          </Field>
        </Grid>
        <Field label="Kill criteria — when do you give up on this idea?">
          <Textarea
            value={form.kill_criteria_user}
            onChange={value => update("kill_criteria_user", value)}
            rows={2}
            placeholder="e.g. abandon if it can't beat SPY across the chosen eras with acceptable drawdown"
          />
        </Field>
        <Field label="Prior work references (comma-separated)">
          <input
            type="text"
            value={form.prior_work_refs}
            onChange={e => update("prior_work_refs", e.target.value)}
            style={inputStyle}
            placeholder="e.g. asness_2013_value_momentum, RAM_stop_5_target_15"
            spellCheck={false}
          />
        </Field>
        <Field label="Changes from references">
          <Textarea
            value={form.changes_from_refs}
            onChange={value => update("changes_from_refs", value)}
            rows={2}
            placeholder="What's new vs. the references — or 'fresh idea, no references'"
          />
        </Field>
      </Section>

      <Section title="Universe" subtitle="Tell Talon what tradable set to consider.">
        <Grid>
          <Select
            label="Shape"
            value={form.universe_shape}
            options={UNIVERSE_SHAPE_OPTIONS}
            onChange={v => update("universe_shape", v as AuthoringUniverseShape)}
          />
          <Select
            label="Regime expectation"
            value={form.regime_expectation}
            options={REGIME_OPTIONS}
            onChange={v => update("regime_expectation", v as RegimeExpectation)}
          />
        </Grid>
        {form.universe_shape === "FIXED_LIST" && (
          <Field label="Fixed list (comma-separated symbols)">
            <input
              type="text"
              value={form.universe_fixed_list}
              onChange={e => update("universe_fixed_list", e.target.value)}
              style={inputStyle}
              placeholder="e.g. AAPL, MSFT, GOOGL, META, AMZN, NVDA"
              spellCheck={false}
            />
          </Field>
        )}
      </Section>

      <DefaultsSection
        open={showDefaults}
        onToggle={() => setShowDefaults(prev => !prev)}
        overriddenCount={overriddenCount}
        stillDefaultCount={stillDefaultCount}
      >
        <WrappedField
          label="Universe size band"
          touched={touchedWrapped.has("universe_size_band")}
          input={
            <input
              type="text"
              value={form.universe_size_band}
              onChange={e => updateWrapped("universe_size_band", e.target.value)}
              style={inputStyle}
              spellCheck={false}
            />
          }
        />
        <WrappedField
          label="Allowed data inputs (comma-separated)"
          touched={touchedWrapped.has("allowed_data_inputs")}
          input={
            <input
              type="text"
              value={form.allowed_data_inputs}
              onChange={e => updateWrapped("allowed_data_inputs", e.target.value)}
              style={inputStyle}
              spellCheck={false}
            />
          }
        />
        <WrappedField
          label="Entry confirmation"
          touched={touchedWrapped.has("entry_confirmation")}
          input={
            <Textarea
              value={form.entry_confirmation}
              onChange={value => updateWrapped("entry_confirmation", value)}
              rows={2}
            />
          }
        />
        <WrappedField
          label="Exit logic"
          touched={touchedWrapped.has("exit_logic")}
          input={
            <Textarea
              value={form.exit_logic}
              onChange={value => updateWrapped("exit_logic", value)}
              rows={2}
            />
          }
        />
        <WrappedField
          label="Risk profile"
          touched={touchedWrapped.has("risk_profile")}
          input={
            <input
              type="text"
              value={form.risk_profile}
              onChange={e => updateWrapped("risk_profile", e.target.value)}
              style={inputStyle}
              spellCheck={false}
            />
          }
        />
        <WrappedField
          label="Benchmark"
          touched={touchedWrapped.has("benchmark")}
          input={
            <input
              type="text"
              value={form.benchmark}
              onChange={e => updateWrapped("benchmark", e.target.value)}
              style={inputStyle}
              spellCheck={false}
            />
          }
        />
        <WrappedField
          label="Era validation strategy"
          touched={touchedWrapped.has("era_validation_strategy")}
          input={
            <input
              type="text"
              value={form.era_validation_strategy}
              onChange={e => updateWrapped("era_validation_strategy", e.target.value)}
              style={inputStyle}
              spellCheck={false}
            />
          }
        />
        <WrappedField
          label="Era weighting"
          touched={touchedWrapped.has("era_weighting")}
          input={
            <input
              type="text"
              value={form.era_weighting}
              onChange={e => updateWrapped("era_weighting", e.target.value)}
              style={inputStyle}
              spellCheck={false}
            />
          }
        />
        <WrappedField
          label="Historical window"
          touched={touchedWrapped.has("historical_window")}
          input={
            <Grid>
              <Field label="Start date">
                <input
                  type="date"
                  value={form.historical_window.start_date}
                  onChange={e =>
                    updateWrapped("historical_window", {
                      ...form.historical_window,
                      start_date: e.target.value,
                    })
                  }
                  style={inputStyle}
                />
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  value={form.historical_window.end_date}
                  onChange={e =>
                    updateWrapped("historical_window", {
                      ...form.historical_window,
                      end_date: e.target.value,
                    })
                  }
                  style={inputStyle}
                />
              </Field>
            </Grid>
          }
        />
        <WrappedField
          label="Promotion bar"
          touched={touchedWrapped.has("promotion_bar")}
          input={
            <input
              type="text"
              value={form.promotion_bar}
              onChange={e => updateWrapped("promotion_bar", e.target.value)}
              style={inputStyle}
              spellCheck={false}
            />
          }
        />
        <WrappedField
          label="Talon exclusions (no-go zones)"
          touched={touchedWrapped.has("talon_exclusions")}
          input={
            <Textarea
              value={form.talon_exclusions}
              onChange={value => updateWrapped("talon_exclusions", value)}
              rows={2}
              placeholder="e.g. don't infer live readiness from backtest values"
            />
          }
        />
      </DefaultsSection>

      <Footer
        busy={busy}
        canSubmit={canSubmit(form)}
        overriddenCount={overriddenCount}
        onSubmit={submit}
      />
    </main>
  )
}

function buildQuestionnaire(form: FormState, touched: Set<WrappedKey>): StrategyAuthoringQuestionnaire {
  const wrapString = (key: WrappedKey, value: string) =>
    wrap(value, touched.has(key))
  const wrapWindow = (key: WrappedKey, value: HistoricalWindow) =>
    wrap(value, touched.has(key))
  return {
    render_mode: form.render_mode,
    pattern_description: form.pattern_description,
    sleeve: form.sleeve,
    trade_horizon: form.trade_horizon,
    capital_tier: form.capital_tier,
    capital_custom_usd:
      form.capital_tier === "CUSTOM" && form.capital_custom_usd
        ? Number(form.capital_custom_usd)
        : null,
    strategy_relationship: form.strategy_relationship,
    kill_criteria_user: form.kill_criteria_user,
    edge_family: form.edge_family,
    prior_work_refs: splitCsv(form.prior_work_refs),
    changes_from_refs: form.changes_from_refs,
    universe_shape: form.universe_shape,
    universe_fixed_list:
      form.universe_shape === "FIXED_LIST" ? splitCsv(form.universe_fixed_list) : null,
    regime_expectation: form.regime_expectation,
    universe_size_band: wrapString("universe_size_band", form.universe_size_band),
    allowed_data_inputs: wrap(splitCsv(form.allowed_data_inputs), touched.has("allowed_data_inputs")),
    entry_confirmation: wrapString("entry_confirmation", form.entry_confirmation),
    exit_logic: wrapString("exit_logic", form.exit_logic),
    risk_profile: wrapString("risk_profile", form.risk_profile),
    benchmark: wrapString("benchmark", form.benchmark),
    era_validation_strategy: wrapString("era_validation_strategy", form.era_validation_strategy),
    era_weighting: wrapString("era_weighting", form.era_weighting),
    historical_window: wrapWindow("historical_window", form.historical_window),
    promotion_bar: wrapString("promotion_bar", form.promotion_bar),
    talon_exclusions: wrapString("talon_exclusions", form.talon_exclusions),
    field_presentations: WRAPPED_KEYS.reduce<Record<string, "PRESENTED" | "HIDDEN" | "SUGGESTED" | "ACCEPTED">>(
      (acc, key) => {
        acc[key] = touched.has(key) ? "ACCEPTED" : "SUGGESTED"
        return acc
      },
      {},
    ),
  }
}

function wrap<T>(value: T, touched: boolean) {
  return {
    value,
    provenance: {
      source: touched ? ("USER" as const) : ("TUNABLE_DEFAULT" as const),
      confidence: touched ? ("HIGH" as const) : ("MEDIUM" as const),
      rationale: touched
        ? "Operator entered this value during questionnaire."
        : "Talon default carried into the questionnaire; operator did not override.",
      source_artifact_id: null,
      operator_confirmed: touched,
    },
  }
}

function splitCsv(input: string): string[] {
  return input
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
}

function canSubmit(form: FormState): boolean {
  if (!form.pattern_description.trim()) return false
  if (!form.kill_criteria_user.trim()) return false
  if (form.universe_shape === "FIXED_LIST" && splitCsv(form.universe_fixed_list).length === 0) {
    return false
  }
  return true
}

function Header({
  idea,
  mode,
  onModeChange,
}: {
  idea: IdeaArtifact
  mode: StrategyAuthoringRenderMode
  onModeChange: (next: StrategyAuthoringRenderMode) => void
}) {
  return (
    <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span
        className="t-eyebrow"
        style={{ fontSize: 10, letterSpacing: "0.16em", color: "var(--vr-cream-mute)" }}
      >
        DRAFT STRATEGY AUTHORING PACKET
      </span>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--ff-serif)",
            fontSize: 26,
            color: "var(--vr-cream)",
            lineHeight: 1.2,
            flex: 1,
            minWidth: 240,
          }}
        >
          {idea.title}
        </h1>
        <ModePill mode={mode} onChange={onModeChange} />
      </div>
      <span className="t-mono" style={{ fontSize: 10.5, color: "var(--vr-cream-faint)" }}>
        {idea.idea_id} · {idea.sleeve}
      </span>
    </header>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          className="t-eyebrow"
          style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--vr-gold)" }}
        >
          {title}
        </span>
        {subtitle && (
          <span
            className="t-read"
            style={{ fontSize: 11.5, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}
          >
            {subtitle}
          </span>
        )}
      </div>
      <div className="vr-card" style={cardStyle}>
        {children}
      </div>
    </section>
  )
}

function DefaultsSection({
  open,
  onToggle,
  overriddenCount,
  stillDefaultCount,
  children,
}: {
  open: boolean
  onToggle: () => void
  overriddenCount: number
  stillDefaultCount: number
  children: React.ReactNode
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <span
          className="t-eyebrow"
          style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--vr-gold)" }}
        >
          TALON DEFAULTS · {open ? "▲ HIDE" : "▼ REVIEW"}
        </span>
        <span
          className="t-read"
          style={{ fontSize: 11.5, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}
        >
          {stillDefaultCount} field{stillDefaultCount === 1 ? "" : "s"} still defaulted to Talon ·{" "}
          {overriddenCount} overridden by you. Defaults submit as TUNABLE_DEFAULT provenance —
          you can confirm or override later on the packet detail screen.
        </span>
      </button>
      {open && (
        <div className="vr-card" style={{ ...cardStyle, gap: 16 }}>
          {children}
        </div>
      )}
    </section>
  )
}

function WrappedField({
  label,
  touched,
  input,
}: {
  label: string
  touched: boolean
  input: React.ReactNode
}) {
  const provenance = useMemo(
    () => ({
      source: touched ? ("USER" as const) : ("TUNABLE_DEFAULT" as const),
      confidence: touched ? ("HIGH" as const) : ("MEDIUM" as const),
      rationale: touched
        ? "Operator overrode the Talon default for this field."
        : "Talon will carry this default into the packet unless you change it.",
      source_artifact_id: null,
      operator_confirmed: false,
    }),
    [touched],
  )
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="t-eyebrow" style={eyebrowStyle}>
          {label.toUpperCase()}
        </span>
        <ProvenanceChip provenance={provenance} />
      </div>
      {input}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="t-eyebrow" style={eyebrowStyle}>
        {label.toUpperCase()}
      </span>
      {children}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
      }}
    >
      {children}
    </div>
  )
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (next: string) => void
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={inputStyle}
      >
        {options.map(opt => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </Field>
  )
}

function Textarea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string
  onChange: (next: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      style={{
        ...inputStyle,
        fontFamily: "var(--ff-read)",
        resize: "vertical",
        minHeight: 60,
      }}
    />
  )
}

function Footer({
  busy,
  canSubmit,
  overriddenCount,
  onSubmit,
}: {
  busy: boolean
  canSubmit: boolean
  overriddenCount: number
  onSubmit: () => void
}) {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--vr-line)",
        paddingTop: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <span
        className="t-read"
        style={{ fontSize: 11.5, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}
      >
        Submitting calls Talon to synthesize a Strategy Authoring Packet. The result is
        persisted as DRAFT — you&apos;ll land on the packet detail screen to review assumptions
        and walk it through review → adversarial → approve → bench handoff. {overriddenCount}{" "}
        of {WRAPPED_KEYS.length} defaultable fields will carry your overrides.
      </span>
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || !canSubmit}
        style={{
          ...primaryButton,
          background: busy || !canSubmit ? "transparent" : "var(--vr-gold)",
          color: busy || !canSubmit ? "var(--vr-gold)" : "var(--vr-ink)",
          borderColor: "var(--vr-gold)",
          opacity: !canSubmit ? 0.45 : 1,
          alignSelf: "flex-start",
        }}
      >
        {busy ? "Talon synthesizing…" : "Draft packet with Talon"}
      </button>
    </footer>
  )
}

const cardStyle: React.CSSProperties = {
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.16em",
  color: "var(--vr-cream-faint)",
  fontFamily: "var(--ff-mono)",
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontSize: 12,
  color: "var(--vr-cream)",
  background: "var(--vr-ink)",
  border: "1px solid var(--vr-line)",
  borderRadius: 2,
  padding: "6px 8px",
  outline: "none",
  fontFamily: "var(--ff-mono)",
}

const primaryButton: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.16em",
  fontFamily: "var(--ff-mono)",
  textTransform: "uppercase",
  padding: "9px 18px",
  borderRadius: 3,
  border: "1px solid",
  cursor: "pointer",
}
