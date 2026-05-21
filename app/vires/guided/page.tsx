import Link from "next/link"
import { redirect } from "next/navigation"
import type { CSSProperties } from "react"

import {
  GuidedNotEnabledState,
  GuidedSurfaceEmptyState,
  GuidedSurfaceErrorState,
} from "@/components/vires/guided/empty-states"
import { userVisibleGuidedEvents } from "@/components/vires/guided/audit-visibility"
import { GuidedHeroCard, PreviewPageShell, SectionLabel, formatUsd } from "@/components/vires/guided/shared"
import {
  GuidedArtifactMissingError,
  GuidedUserStateUnavailableError,
  ProjectionServiceErrorResponseError,
  ProjectionServiceUnreachableError,
  readGuidedEnrollmentView,
} from "@/lib/guided-data-source.server"
import {
  NoActiveGuidedRefsError,
  resolveActiveEnrollmentId,
} from "@/lib/guided-active-refs.server"
import {
  UnauthenticatedError,
  UnknownScopeIdentityError,
  resolveCurrentScope,
} from "@/lib/guided-scope.server"
import type { GuidedEnrollmentView, GuidedScope } from "@/components/vires/guided/types"

// /vires/guided — the Guided hub. Replaces preview/index as the user-facing
// entry to Guided. Closes the second half of GUIDED-T1-PREVIEW-ROUTE-DEHARDCODE:
// signed-in operators no longer URL-surgery to /vires/guided/preview/active —
// they land here, see their active enrollment summary, and link out to deeper
// surfaces.

export const dynamic = "force-dynamic"

const SIGNIN_FROM_PATH = "/vires/guided"
const SHELL_TITLE = "Guided"
const SHELL_SURFACE_ID = "HUB"

export default async function GuidedHub() {
  let scope: GuidedScope
  try {
    scope = await resolveCurrentScope()
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      redirect(`/signin?from=${encodeURIComponent(SIGNIN_FROM_PATH)}`)
    }
    if (err instanceof UnknownScopeIdentityError) {
      return (
        <PreviewPageShell title={SHELL_TITLE} surfaceId={SHELL_SURFACE_ID}>
          <GuidedNotEnabledState email={err.email} />
        </PreviewPageShell>
      )
    }
    throw err
  }

  let enrollmentId: string | null
  try {
    enrollmentId = resolveActiveEnrollmentId(scope)
  } catch (err) {
    if (err instanceof NoActiveGuidedRefsError) {
      enrollmentId = null
    } else {
      throw err
    }
  }

  if (enrollmentId === null) {
    return (
      <PreviewPageShell title={SHELL_TITLE} surfaceId={SHELL_SURFACE_ID}>
        <NoEnrollmentHub />
      </PreviewPageShell>
    )
  }

  let view: GuidedEnrollmentView | null = null
  let readError: "missing" | "service-unavailable" | "service-unreachable" | "service-error" | null = null
  let readErrorMessage: string | null = null
  try {
    view = await readGuidedEnrollmentView(enrollmentId, scope)
  } catch (err) {
    if (err instanceof GuidedArtifactMissingError) {
      readError = "missing"
    } else if (err instanceof GuidedUserStateUnavailableError) {
      readError = "service-unavailable"
    } else if (err instanceof ProjectionServiceUnreachableError) {
      readError = "service-unreachable"
    } else if (err instanceof ProjectionServiceErrorResponseError) {
      readError = "service-error"
      readErrorMessage = `${err.envelope.error_code}: ${err.envelope.error_message}`
    } else {
      throw err
    }
  }

  if (view === null) {
    return (
      <PreviewPageShell title={SHELL_TITLE} surfaceId={SHELL_SURFACE_ID}>
        <ReadErrorHub error={readError ?? "missing"} message={readErrorMessage} />
      </PreviewPageShell>
    )
  }

  return (
    <PreviewPageShell title={SHELL_TITLE} surfaceId={SHELL_SURFACE_ID}>
      <ActiveEnrollmentHub view={view} />
    </PreviewPageShell>
  )
}

function ActiveEnrollmentHub({ view }: { view: GuidedEnrollmentView }) {
  if (!view.enrollment) {
    // Shouldn't happen — readGuidedEnrollmentView for an active enrollment
    // should always emit an enrollment shape — but fall back honestly if it
    // does.
    return (
      <GuidedSurfaceEmptyState
        title="No enrollment in this projection"
        body="The Guided projection returned no enrollment payload. Check the read store configuration."
      />
    )
  }
  const realized = view.cumulative_paper_pnl_realized ?? 0
  const unrealized = view.cumulative_paper_pnl_unrealized ?? 0
  const totalValue = view.current_value_usd ?? 0
  const recentUserVisibleEvents = userVisibleGuidedEvents(view.recent_events)

  return (
    <GuidedHeroCard accent="var(--vr-sleeve-stocks, #c8a968)">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 style={heading}>{view.library_entry.friendly_name}</h1>
        <span style={statusPill}>{view.enrollment.status}</span>
      </div>
      <p style={subtitle}>{view.library_entry.mandate_subtitle}</p>

      <div style={summaryRow}>
        <Stat label="Total" value={formatUsd(totalValue)} mono />
        <Stat label="Realized" value={formatUsd(realized, { sign: true })} mono tone={realized >= 0 ? "good" : "bad"} />
        <Stat label="Unrealized" value={formatUsd(unrealized, { sign: true })} mono tone={unrealized >= 0 ? "good" : "bad"} />
        <Stat label="Days" value={`${view.paper_observation_days_count}`} mono />
      </div>

      <SectionLabel>Surfaces</SectionLabel>
      <div style={cardRow}>
        <HubLink href="/vires/guided/preview/active" label="Active enrollment" detail="Holdings + state" />
        <HubLink href="/vires/guided/preview/monitoring" label="Paper monitoring" detail="Evidence + cold-start tracker" />
        <HubLink href="/vires/guided/preview/events" label="Event history" detail={`${recentUserVisibleEvents.length} recent`} />
        <HubLink href="/vires/guided/preview/match" label="Original match" detail="See why this fit" />
      </div>

      <div style={footerNote}>
        Internal Guided hub. Surfaces under <code>/preview</code> remain debug-tagged today; that suffix
        retires once Vires-hub navigation is the only path operators use.
      </div>
    </GuidedHeroCard>
  )
}

function NoEnrollmentHub() {
  return (
    <GuidedHeroCard>
      <h1 style={heading}>You haven&apos;t started a Guided strategy yet</h1>
      <p style={subtitle}>
        Guided is a bounded paper strategy sleeve — not the whole portfolio. Start with a short
        questionnaire to find what fits.
      </p>

      <SectionLabel>Get started</SectionLabel>
      <div style={cardRow}>
        <HubLink
          href="/vires/guided/preview/questionnaire"
          label="Start questionnaire"
          detail="~2 minutes · 4 questions"
          primary
        />
        <HubLink
          href="/vires/guided/preview/disclosure"
          label="Read the disclosure"
          detail="Before committing, see what you accept"
        />
      </div>

      <div style={footerNote}>
        Internal Guided hub. No active enrollment for the current scope; if you expected one, check
        the operator who provisioned this account or the Guided scope mapping.
      </div>
    </GuidedHeroCard>
  )
}

function ReadErrorHub({
  error,
  message,
}: {
  error: "missing" | "service-unavailable" | "service-unreachable" | "service-error"
  message: string | null
}) {
  if (error === "missing") {
    return (
      <GuidedSurfaceEmptyState
        title="No paper enrollment yet"
        body="Your Guided enrollment hasn't been provisioned. If you completed the questionnaire and accepted disclosure, your enrollment will appear here once broker setup completes."
      />
    )
  }
  if (error === "service-unavailable") {
    return (
      <GuidedSurfaceErrorState
        title="Guided state service is not configured"
        body="An operator needs to configure the Guided read store before this page can show real data."
      />
    )
  }
  if (error === "service-unreachable") {
    return (
      <GuidedSurfaceErrorState
        title="Guided state service temporarily unavailable"
        body="The projection endpoint did not respond. Try again in a moment."
      />
    )
  }
  return (
    <GuidedSurfaceErrorState
      title="Guided state service returned an error"
      body={message ?? "Unknown error from the projection endpoint."}
    />
  )
}

function HubLink({
  href,
  label,
  detail,
  primary,
}: {
  href: string
  label: string
  detail: string
  primary?: boolean
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: 16,
        border: `1px solid ${primary ? "var(--vr-gold, #c8a968)" : "var(--vr-line, #2a2438)"}`,
        background: primary ? "rgba(200,169,104,0.06)" : "rgba(241,236,224,0.02)",
        borderRadius: 3,
        color: "var(--vr-cream, #f1ece0)",
        textDecoration: "none",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: primary ? "var(--vr-gold, #c8a968)" : "var(--vr-cream-mute, #8c8579)",
          fontWeight: primary ? 600 : 500,
          marginBottom: 6,
        }}
      >
        {label} →
      </div>
      <div style={{ fontSize: 12, color: "var(--vr-cream-dim, #c4bdac)", lineHeight: 1.55 }}>{detail}</div>
    </Link>
  )
}

function Stat({
  label,
  value,
  mono,
  tone,
}: {
  label: string
  value: string
  mono?: boolean
  tone?: "good" | "bad"
}) {
  const color =
    tone === "good"
      ? "var(--vr-good, #9ec4a0)"
      : tone === "bad"
        ? "var(--vr-bad, #c89090)"
        : "var(--vr-cream, #f1ece0)"
  return (
    <div style={statCell}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--vr-cream-mute, #8c8579)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 16, color, fontFamily: mono ? "var(--ff-mono)" : undefined }}>{value}</div>
    </div>
  )
}

const heading: CSSProperties = {
  fontSize: 26,
  fontFamily: "var(--ff-serif)",
  fontStyle: "italic",
  color: "var(--vr-cream, #f1ece0)",
  fontWeight: 400,
  margin: 0,
  marginBottom: 4,
  lineHeight: 1.2,
}

const subtitle: CSSProperties = {
  fontSize: 12,
  color: "var(--vr-cream-mute, #8c8579)",
  lineHeight: 1.55,
  marginTop: 0,
  marginBottom: 18,
}

const statusPill: CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--vr-gold, #c8a968)",
  fontWeight: 600,
}

const summaryRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 12,
  padding: 14,
  border: "1px solid var(--vr-line, #2a2438)",
  background: "rgba(241,236,224,0.02)",
  borderRadius: 3,
  marginBottom: 22,
}

const statCell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  minWidth: 0,
}

const cardRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  marginBottom: 18,
}

const footerNote: CSSProperties = {
  fontSize: 11,
  color: "var(--vr-cream-mute, #8c8579)",
  lineHeight: 1.55,
  paddingTop: 14,
  borderTop: "1px solid var(--vr-line, #2a2438)",
  marginTop: 14,
}
