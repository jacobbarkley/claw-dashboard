"use client"

// Phase D UX prep — preview shell that mounts the seven-step thread
// stepper plus per-step body content, with a scrubber bar so Jacob
// (and Codex on review) can click through every state to see how the
// idea detail page evolves.
//
// Static mock data only. No API calls. The spec form's save / submit
// buttons are no-ops. Phase D-implementation replaces this shell with
// a live computation of `currentStep` from the idea's strategy_ref +
// spec state and wires the form to /api/research/specs/[id].

import { useState } from "react"

import {
  IdeaThreadStepper,
  THREAD_STEPS,
  type ThreadStep,
} from "./idea-thread-stepper"
import {
  StrategySpecForm,
  type SpecAuthoringMode,
  type SpecFormValues,
} from "./strategy-spec-form"

const MOCK_IDEA = {
  title: "Ape Wisdom — retail-attention regime overlay",
  thesis:
    "Retail attention spikes (Wikipedia pageviews + r/wallstreetbets velocity) lead institutional flow by 1–3 sessions in low-volatility regimes. Overlay long bias on names crossing both attention and momentum thresholds; flatten on regime flip.",
  sleeve: "STOCKS",
}

const SAMPLE_SPEC_VALUES: Partial<SpecFormValues> = {
  signal_logic:
    "Two-factor: (1) Wikipedia pageview z-score on rolling 90d > 2.0, (2) r/wallstreetbets mention velocity at 99th percentile of trailing 30d. Cross-confirmed within a 2-session window.",
  entry_rules:
    "Long entry on session close after both signals fire. Skip if SPY 20d realized vol > 25% (regime gate). Position-by-position, not basket.",
  exit_rules:
    "Hard exit on SPY 20d realized vol crossing 25% (regime flip). Trailing 8% stop on each name. Time stop at 10 sessions if neither attention factor stays above the entry threshold.",
  risk_model:
    "Per-name 1.5% NAV at entry. Max 8 concurrent names. Sleeve cap 12% NAV. No leverage.",
  universe:
    "Russell 1000 constituents with > $1B market cap and > $50M average daily dollar volume.",
  required_data: ["Price OHLCV", "Attention proxies", "Sentiment"],
  benchmark: "SPY",
  min_sharpe: "1.2",
  max_drawdown: "18",
  min_hit_rate: "48",
  acceptance_other:
    "Must outperform SPY in low-vol regime windows (separately reported). No more than 2 max-drawdown excursions per year.",
  candidate_strategy_family: "attention_regime_overlay",
}

const STEP_INFO: Record<ThreadStep, string> = {
  describe:
    "Capture the thesis. The system will help turn it into a testable strategy.",
  "awaiting-spec":
    "A spec turns your thesis into something Codex can build. You can draft it yourself or hand the start to Talon.",
  "spec-drafted":
    "Refine the rules until they read like a real strategy. Once submitted, the system asks you to approve before Codex starts implementing.",
  "awaiting-impl":
    "Codex builds the strategy module from the approved spec, registers it, and adds tests. This usually takes a single Codex session.",
  "ready-to-run":
    "The strategy is registered and runnable. A Lab job runs it against the configured universe and produces an equity swarm.",
  campaign:
    "When a Lab job finishes successfully, the system rolls it up into a campaign. Run more jobs across regimes before nominating.",
  "ready-to-nominate":
    "Acceptance criteria met. Nominating moves this onto the passport — the system handles identity, audit, and the strategy bank update.",
}

export function SpecPreviewShell() {
  const [step, setStep] = useState<ThreadStep>("awaiting-spec")
  const [authoringMode, setAuthoringMode] = useState<SpecAuthoringMode>("OPERATOR_DRAFTED")

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Stepper */}
      <div className="vr-card" style={{ padding: "14px 14px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              fontSize: 18,
              color: "var(--vr-cream)",
            }}
          >
            Idea thread
          </div>
          <span
            className="t-eyebrow"
            style={{
              fontSize: 9,
              color: "var(--vr-cream-mute)",
              letterSpacing: "0.14em",
            }}
          >
            Step {THREAD_STEPS.findIndex(s => s.id === step) + 1} of{" "}
            {THREAD_STEPS.length}
          </span>
        </div>
        <IdeaThreadStepper currentStep={step} onStepClick={setStep} />
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            background: "var(--vr-ink)",
            border: "1px solid var(--vr-line)",
            borderRadius: 3,
            fontSize: 11.5,
            lineHeight: 1.55,
            color: "var(--vr-cream-dim)",
            fontStyle: "italic",
            fontFamily: "var(--ff-serif)",
          }}
        >
          {STEP_INFO[step]}
        </div>
      </div>

      {/* Per-step body */}
      <StepBody
        step={step}
        authoringMode={authoringMode}
        onAuthoringModeChange={setAuthoringMode}
        onAdvance={() => advanceStep(step, setStep)}
      />
    </div>
  )
}

function advanceStep(
  current: ThreadStep,
  setStep: (s: ThreadStep) => void,
) {
  const idx = THREAD_STEPS.findIndex(s => s.id === current)
  const next = THREAD_STEPS[Math.min(idx + 1, THREAD_STEPS.length - 1)]
  if (next) setStep(next.id)
}

function StepBody({
  step,
  authoringMode,
  onAuthoringModeChange,
  onAdvance,
}: {
  step: ThreadStep
  authoringMode: SpecAuthoringMode
  onAuthoringModeChange: (mode: SpecAuthoringMode) => void
  onAdvance: () => void
}) {
  switch (step) {
    case "describe":
      return (
        <PlaceholderPanel
          title="Describe your idea"
          body="The Idea creation form lives at /vires/bench/lab/ideas/new. In the live thread, this step is what the operator sees while writing the title and thesis — not on the detail page. We render a stub here so the scrubber stays consistent."
          ctaLabel="Mock: save idea"
          onCta={onAdvance}
        />
      )
    case "awaiting-spec":
      return <AwaitingSpecPanel onAuthorYourself={onAdvance} />
    case "spec-drafted":
      return (
        <SpecDraftedPanel
          authoringMode={authoringMode}
          onAuthoringModeChange={onAuthoringModeChange}
          onSubmit={onAdvance}
        />
      )
    case "awaiting-impl":
      return (
        <PlaceholderPanel
          title="Codex is building this"
          body="The approved spec is on Codex's queue. You'll see this idea move to 'Ready to run' once the strategy module is registered and the smoke checks pass. Usually a single Codex session."
          ctaLabel="Mock: simulate Codex finishing"
          onCta={onAdvance}
        />
      )
    case "ready-to-run":
      return (
        <PlaceholderPanel
          title="Ready to run in Lab"
          body="The strategy is registered. Submit a Lab job to evaluate it against the universe and acceptance criteria you defined. The existing Lab submit form lives at /vires/bench/lab/submit and gets pre-filled from the spec."
          ctaLabel="Mock: run job + roll up campaign"
          onCta={onAdvance}
        />
      )
    case "campaign":
      return (
        <PlaceholderPanel
          title="Campaign rolled up"
          body="A successful Lab job created a campaign. Review the equity swarm + leaderboard before nominating. Run more jobs across regimes if the acceptance criteria need cross-regime evidence."
          ctaLabel="Mock: campaign passes acceptance"
          onCta={onAdvance}
        />
      )
    case "ready-to-nominate":
      return <ReadyToNominatePanel />
  }
}

function AwaitingSpecPanel({
  onAuthorYourself,
}: {
  onAuthorYourself: () => void
}) {
  return (
    <div className="vr-card" style={{ padding: "16px 16px 18px" }}>
      <div
        style={{
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          fontSize: 18,
          color: "var(--vr-cream)",
          marginBottom: 6,
        }}
      >
        Sketch the strategy
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--vr-cream-dim)",
          marginBottom: 14,
          lineHeight: 1.55,
        }}
      >
        Talon can draft a starting point from your thesis, or you can write
        the spec yourself. Either way you review and approve before Codex
        starts implementing.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ActionRow
          title="Draft with Talon"
          subtitle="Talon reads your thesis, asks clarifying questions, and produces an editable spec. Hidden until Talon is unblocked."
          ctaLabel="Draft with Talon"
          ctaTone="muted"
          disabled
          onClick={() => {}}
        />
        <ActionRow
          title="Author the spec yourself"
          subtitle="Open a blank spec form. You'll fill in signal logic, universe, entry / exit rules, and acceptance criteria."
          ctaLabel="Author spec"
          ctaTone="primary"
          onClick={onAuthorYourself}
        />
      </div>
    </div>
  )
}

function SpecDraftedPanel({
  authoringMode,
  onAuthoringModeChange,
  onSubmit,
}: {
  authoringMode: SpecAuthoringMode
  onAuthoringModeChange: (mode: SpecAuthoringMode) => void
  onSubmit: () => void
}) {
  // Local two-substate flip inside the spec-drafted step:
  //   DRAFTING → form with save / submit-for-approval
  //   AWAITING_APPROVAL → read-only summary with approve / send-back
  // Faithful to §2 of PHASE_D_UX_PREP — submitting does NOT skip the
  // approval beat in the preview.
  const [awaitingApproval, setAwaitingApproval] = useState(false)

  if (awaitingApproval) {
    return (
      <AwaitingApprovalPanel
        onApprove={onSubmit}
        onSendBack={() => setAwaitingApproval(false)}
      />
    )
  }

  return (
    <StrategySpecForm
      ideaTitle={MOCK_IDEA.title}
      ideaThesis={MOCK_IDEA.thesis}
      ideaSleeve={MOCK_IDEA.sleeve}
      initialValues={{ ...SAMPLE_SPEC_VALUES, authoring_mode: authoringMode }}
      onSaveDraft={values => {
        onAuthoringModeChange(values.authoring_mode)
      }}
      onSubmitForApproval={values => {
        onAuthoringModeChange(values.authoring_mode)
        setAwaitingApproval(true)
      }}
      onCancel={() => {}}
    />
  )
}

function AwaitingApprovalPanel({
  onApprove,
  onSendBack,
}: {
  onApprove: () => void
  onSendBack: () => void
}) {
  return (
    <div className="vr-card" style={{ padding: "16px 16px 18px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            fontSize: 18,
            color: "var(--vr-cream)",
          }}
        >
          Spec submitted — awaiting approval
        </div>
        <span
          style={{
            padding: "3px 8px",
            fontSize: 9,
            fontFamily: "var(--ff-mono)",
            letterSpacing: "0.08em",
            borderRadius: 2,
            border: "1px solid var(--vr-gold-line)",
            color: "var(--vr-gold)",
            background: "var(--vr-gold-soft)",
          }}
        >
          AWAITING_APPROVAL
        </span>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--vr-cream-dim)",
          lineHeight: 1.55,
          marginBottom: 14,
        }}
      >
        Re-read the rules end to end. Approve to send the spec to Codex
        for implementation, or send it back if anything still needs to
        be tightened.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onApprove}
          style={{
            padding: "8px 14px",
            fontSize: 11.5,
            fontFamily: "var(--ff-mono)",
            background: "var(--vr-up-soft)",
            border: "1px solid var(--vr-up)",
            color: "var(--vr-up)",
            borderRadius: 3,
            cursor: "pointer",
          }}
        >
          Mock: approve spec →
        </button>
        <button
          type="button"
          onClick={onSendBack}
          style={{
            padding: "8px 14px",
            fontSize: 11.5,
            fontFamily: "var(--ff-mono)",
            background: "transparent",
            border: "1px solid var(--vr-line)",
            color: "var(--vr-cream-mute)",
            borderRadius: 3,
            cursor: "pointer",
          }}
        >
          Send back for revision
        </button>
      </div>
    </div>
  )
}

function ReadyToNominatePanel() {
  return (
    <div className="vr-card" style={{ padding: "16px 16px 18px" }}>
      <div
        style={{
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          fontSize: 18,
          color: "var(--vr-cream)",
          marginBottom: 6,
        }}
      >
        Acceptance criteria met
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--vr-cream-dim)",
          marginBottom: 14,
          lineHeight: 1.55,
        }}
      >
        Sharpe 1.34 · Max DD 14% · Hit rate 51% — all above thresholds.
        Nominating moves this onto the passport. The system handles identity
        resolution and the strategy bank update.
      </div>
      <button
        type="button"
        style={{
          padding: "10px 16px",
          fontSize: 12,
          fontFamily: "var(--ff-mono)",
          background: "var(--vr-up-soft)",
          border: "1px solid var(--vr-up)",
          color: "var(--vr-up)",
          borderRadius: 3,
          cursor: "pointer",
        }}
      >
        Nominate for promotion →
      </button>
    </div>
  )
}

function PlaceholderPanel({
  title,
  body,
  ctaLabel,
  onCta,
}: {
  title: string
  body: string
  ctaLabel: string
  onCta: () => void
}) {
  return (
    <div className="vr-card" style={{ padding: "16px 16px 18px" }}>
      <div
        style={{
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          fontSize: 18,
          color: "var(--vr-cream)",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--vr-cream-dim)",
          marginBottom: 14,
          lineHeight: 1.55,
        }}
      >
        {body}
      </div>
      <button
        type="button"
        onClick={onCta}
        style={{
          padding: "8px 14px",
          fontSize: 11.5,
          fontFamily: "var(--ff-mono)",
          background: "var(--vr-gold-soft)",
          border: "1px solid var(--vr-gold-line)",
          color: "var(--vr-gold)",
          borderRadius: 3,
          cursor: "pointer",
        }}
      >
        {ctaLabel}
      </button>
    </div>
  )
}

function ActionRow({
  title,
  subtitle,
  ctaLabel,
  ctaTone,
  onClick,
  disabled,
}: {
  title: string
  subtitle: string
  ctaLabel: string
  ctaTone: "primary" | "muted"
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        border: "1px solid var(--vr-line)",
        borderRadius: 3,
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            fontSize: 14,
            color: "var(--vr-cream)",
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--vr-cream-mute)", lineHeight: 1.5 }}>
          {subtitle}
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        style={
          ctaTone === "primary"
            ? {
                padding: "8px 14px",
                fontSize: 11.5,
                fontFamily: "var(--ff-mono)",
                background: "var(--vr-gold-soft)",
                border: "1px solid var(--vr-gold-line)",
                color: "var(--vr-gold)",
                borderRadius: 3,
                cursor: disabled ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }
            : {
                padding: "8px 14px",
                fontSize: 11.5,
                fontFamily: "var(--ff-mono)",
                background: "transparent",
                border: "1px solid var(--vr-line)",
                color: "var(--vr-cream-mute)",
                borderRadius: 3,
                cursor: disabled ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }
        }
      >
        {ctaLabel}
      </button>
    </div>
  )
}
