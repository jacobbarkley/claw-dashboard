import Link from "next/link"
import { InternalPreviewBanner } from "@/components/vires/guided/shared"

// Preview-only index for the Guided T1 surfaces.
// Internal/dev surface only — not surfaced in any public navigation.

const SURFACES: Array<{
  slug: string
  title: string
  description: string
  status: string
  statusTone: "live" | "static" | "not-wired"
}> = [
  {
    slug: "questionnaire",
    title: "Questionnaire",
    description: "S1 + S2 — static questionnaire.v1 bootstrap artifact. Answers do not persist yet.",
    status: "Static artifact",
    statusTone: "static",
  },
  {
    slug: "match",
    title: "Match proposal",
    description: "S3 — match proposal readback. Not wired on the Supabase spike path yet.",
    status: "Not wired",
    statusTone: "not-wired",
  },
  {
    slug: "disclosure",
    title: "Disclosure acceptance",
    description: "S4 — static disclosure and strategy-library artifacts for Steady Tide.",
    status: "Static artifact",
    statusTone: "static",
  },
  {
    slug: "broker",
    title: "Broker connect & states",
    description: "S5-S8 — broker-state variants. Fixture/debug IDs are not produced by the real-profile row.",
    status: "Not wired",
    statusTone: "not-wired",
  },
  {
    slug: "active",
    title: "ACTIVE paper enrollment",
    description: "S9 — live guided_enrollment_view.v1 readback from the configured Guided data source.",
    status: "Live readback",
    statusTone: "live",
  },
  {
    slug: "monitoring",
    title: "Paper monitoring readback",
    description: "S10 — live enrollment-view readback rendered as paper monitoring and evidence context.",
    status: "Live readback",
    statusTone: "live",
  },
  {
    slug: "events",
    title: "Unified event history",
    description: "S11 — event-history readback. Not wired on the Supabase spike path yet.",
    status: "Not wired",
    statusTone: "not-wired",
  },
]

const STATUS_TONE: Record<(typeof SURFACES)[number]["statusTone"], { color: string; border: string; background: string }> = {
  live: {
    color: "var(--vr-good, #9ec4a0)",
    border: "rgba(158,196,160,0.28)",
    background: "rgba(158,196,160,0.07)",
  },
  static: {
    color: "var(--vr-gold, #c8a968)",
    border: "rgba(200,169,104,0.28)",
    background: "rgba(200,169,104,0.07)",
  },
  "not-wired": {
    color: "var(--vr-cream-mute, #8c8579)",
    border: "var(--vr-line, #2a2438)",
    background: "rgba(241,236,224,0.025)",
  },
}

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
          Guided T1 preview
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
          Internal Guided surfaces after the Supabase read-store spike. Active enrollment
          is the real readback path; static artifacts remain public bootstrap content; unavailable
          user-state pages render explicit configured states instead of mock fallback data.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SURFACES.map(s => {
            const tone = STATUS_TONE[s.statusTone]
            return (
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
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
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
                  <span
                    style={{
                      flexShrink: 0,
                      padding: "4px 7px",
                      border: `1px solid ${tone.border}`,
                      borderRadius: 2,
                      background: tone.background,
                      fontSize: 9,
                      color: tone.color,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                    }}
                  >
                    {s.status}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--vr-cream-dim, #c4bdac)",
                    marginTop: 8,
                    marginBottom: 0,
                    lineHeight: 1.55,
                  }}
                >
                  {s.description}
                </p>
              </Link>
            )
          })}
        </div>
      </div>
    </main>
  )
}
