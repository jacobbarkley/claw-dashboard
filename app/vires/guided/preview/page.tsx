import Link from "next/link"
import { InternalPreviewBanner } from "@/components/vires/guided/shared"

// Preview-only index for the Guided Stage 2 mocked previews.
// Internal/dev surface only — not surfaced in any public navigation.
// Every surface is mocked; nothing fetches real backend data.

const SURFACES: Array<{ slug: string; title: string; description: string }> = [
  {
    slug: "questionnaire",
    title: "Questionnaire",
    description: "S1 + S2 — multi-step intake against questionnaire.v1, deterministic options.",
  },
  {
    slug: "match",
    title: "Match proposal",
    description: "S3 — friendly_name, drawdown headline, mandate_subtitle, matched_tags rationale, candidates considered.",
  },
  {
    slug: "disclosure",
    title: "Disclosure acceptance",
    description: "S4 — mobile-first 30-sec read with 5-axis evidence, mandate disclosure, attestation.",
  },
  {
    slug: "broker",
    title: "Broker connect & states",
    description: "S5–S8 — connect, pending check, BROKER_RETRYABLE / BROKER_ACTION_REQUIRED / BROKER_INELIGIBLE.",
  },
  {
    slug: "active",
    title: "ACTIVE paper enrollment",
    description: "S9 — enrollment ACTIVE against CANDIDATE library entry. Two-ACTIVEs distinction enforced.",
  },
  {
    slug: "monitoring",
    title: "Paper monitoring readback",
    description: "S10 — 5-axis evidence by tier, cold-start tracker, mandate disclosure, backing-strategy state.",
  },
  {
    slug: "events",
    title: "Unified event history",
    description: "S11 — every lane visible, source-primary filter, support_intervention rendered distinctly.",
  },
]

export default function GuidedPreviewIndex() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--vr-bg, #0c0a17)",
        padding: "32px 16px 80px",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <InternalPreviewBanner context="Stage 2 · index" />
        <h1
          style={{
            fontSize: 30,
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            color: "var(--vr-cream, #f1ece0)",
            fontWeight: 400,
            marginTop: 0,
            marginBottom: 8,
            lineHeight: 1.2,
          }}
        >
          Guided slice — Stage 2 mocked previews
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--vr-cream-mute, #8c8579)",
            lineHeight: 1.6,
            maxWidth: 600,
            marginBottom: 28,
          }}
        >
          Hi-fi comps + mocked preview routes against the frozen Phase 0 contracts in <code>guided.py</code>.
          No real backend. No live navigation. Surfaces below exist only for the build-plan handoff.
          When Codex&apos;s backend Phase 1–5 lands, Phase 6 swaps the mocks for real projections.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SURFACES.map(s => (
            <Link
              key={s.slug}
              href={`/vires/guided/preview/${s.slug}`}
              style={{
                display: "block",
                padding: 18,
                border: "1px solid var(--vr-line, #2a2438)",
                borderRadius: 3,
                background: "rgba(241,236,224,0.025)",
                color: "var(--vr-cream, #f1ece0)",
                textDecoration: "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h2
                  style={{
                    fontSize: 18,
                    fontFamily: "var(--ff-serif)",
                    fontStyle: "italic",
                    fontWeight: 400,
                    color: "var(--vr-cream, #f1ece0)",
                    margin: 0,
                  }}
                >
                  {s.title}
                </h2>
                <span style={{ fontSize: 11, color: "var(--vr-gold, #c8a968)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
                  →
                </span>
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--vr-cream-dim, #c4bdac)",
                  marginTop: 6,
                  marginBottom: 0,
                  lineHeight: 1.55,
                }}
              >
                {s.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
