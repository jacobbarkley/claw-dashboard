// Neutral typographic empty/error states for Guided preview surfaces. These
// replace MockFallbackBadge + mock-data rendering on production user-state
// pages per the T1.0e cutover-prep slice (obligation
// GUIDED-T1-PRODUCTION-MOCK-FALLBACK-REMOVAL). Surfaces in scope: match,
// active, monitoring, events, broker.
//
// Three distinct semantic shapes — pages branch on the underlying error
// class, not on a single generic component, so the copy stays specific:
//
//   - EmptyState: "no record yet" (GuidedArtifactMissingError from the
//     projection store → backend returned 404 PROJECTION_NOT_FOUND). The
//     user-state simply doesn't exist yet for this account; UI should
//     reassure, not alarm.
//   - ErrorState: transient / configuration faults
//     (ProjectionServiceUnreachableError, GuidedUserStateUnavailableError,
//     ProjectionServiceErrorResponseError). Distinct copy per cause so
//     env-misconfigured doesn't look like backend-down.
//   - NotEnabledState: authenticated email has no Guided scope mapping
//     (UnknownScopeIdentityError). Replaces the old MockFallbackBadge +
//     mock-data render in the same branch per Q4 of the kickoff plan.
//
// Visual language mirrors PreviewPageShell + shared.tsx: cream-mute body
// text, serif italic title, no illustrations. Layout is intentionally
// padding-only so the page doesn't visually jump between populated and
// empty states.

import type { ReactNode } from "react"

const TITLE_STYLE = {
  marginTop: 0,
  marginBottom: 8,
  fontFamily: "var(--ff-serif)",
  fontStyle: "italic" as const,
  fontSize: 20,
  fontWeight: 400 as const,
  color: "var(--vr-cream, #f1ece0)",
}

const BODY_STYLE = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.55,
  color: "var(--vr-cream-mute, #8c8579)",
}

const CONTAINER_STYLE = {
  padding: "32px 22px",
  border: "1px solid var(--vr-line, #2a2438)",
  borderRadius: 4,
  background: "rgba(241,236,224,0.02)",
}

function Frame({ children }: { children: ReactNode }) {
  return <div style={CONTAINER_STYLE}>{children}</div>
}

export function GuidedSurfaceEmptyState({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <Frame>
      <h2 style={TITLE_STYLE}>{title}</h2>
      <p style={BODY_STYLE}>{body}</p>
    </Frame>
  )
}

export function GuidedSurfaceErrorState({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <Frame>
      <h2 style={TITLE_STYLE}>{title}</h2>
      <p style={BODY_STYLE}>{body}</p>
    </Frame>
  )
}

export function GuidedNotEnabledState({ email }: { email: string }) {
  return (
    <Frame>
      <h2 style={TITLE_STYLE}>Guided is not enabled for this account</h2>
      <p style={BODY_STYLE}>
        {email} is signed in, but no Guided enrollment scope is mapped to it
        yet. Contact the operator if you expected access.
      </p>
    </Frame>
  )
}
