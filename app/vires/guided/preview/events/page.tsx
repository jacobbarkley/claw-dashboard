import { redirect } from "next/navigation"

import { EventHistorySurface } from "@/components/vires/guided/event-history-surface"
import { MockFallbackBadge, PreviewPageShell } from "@/components/vires/guided/shared"
import { MOCK_EVENTS_VIEW } from "@/components/vires/guided/mocks"
import {
  GuidedArtifactMissingError,
  GuidedUserStateUnavailableError,
  readEnrollmentEventsView,
} from "@/lib/guided-data-source.server"
import {
  UnauthenticatedError,
  UnknownScopeIdentityError,
  resolveCurrentScope,
} from "@/lib/guided-scope.server"
import type { EnrollmentEventsView, GuidedScope } from "@/components/vires/guided/types"

export const dynamic = "force-dynamic"

const PHASE_6_2_ACTIVE_ENROLLMENT_ID = "enrollment_entry_zero_active"
const SIGNIN_FROM_PATH = "/vires/guided/preview/events"

async function loadRealOrMock(
  scope: GuidedScope,
): Promise<{ eventsView: EnrollmentEventsView; fallback: string | null }> {
  try {
    const eventsView = await readEnrollmentEventsView(PHASE_6_2_ACTIVE_ENROLLMENT_ID, scope)
    return { eventsView, fallback: null }
  } catch (err) {
    if (err instanceof GuidedUserStateUnavailableError) {
      return { eventsView: MOCK_EVENTS_VIEW, fallback: "GUIDED_LOCAL_REBUILD_PATH unset (production preview)" }
    }
    if (err instanceof GuidedArtifactMissingError) {
      return { eventsView: MOCK_EVENTS_VIEW, fallback: `seed missing (${err.artifactPath})` }
    }
    throw err
  }
}

export default async function GuidedEventsPreview() {
  let scope: GuidedScope
  try {
    scope = await resolveCurrentScope()
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      redirect(`/signin?from=${encodeURIComponent(SIGNIN_FROM_PATH)}`)
    }
    if (err instanceof UnknownScopeIdentityError) {
      return (
        <PreviewPageShell
          title="Unified event history"
          subtitle="S11 preview · mock fallback (no Guided scope mapped to this account)"
          surfaceId="S11"
        >
          <MockFallbackBadge reason={`no Guided scope mapped to ${err.email}`} />
          <EventHistorySurface eventsView={MOCK_EVENTS_VIEW} />
        </PreviewPageShell>
      )
    }
    throw err
  }

  const { eventsView, fallback } = await loadRealOrMock(scope)
  return (
    <PreviewPageShell
      title="Unified event history"
      subtitle={
        fallback
          ? "S11 preview · mock fallback (user-state read unavailable)"
          : "S11 preview · live read of enrollment_events_view.v1. All 7 source lanes represented."
      }
      surfaceId="S11"
    >
      {fallback ? <MockFallbackBadge reason={fallback} /> : null}
      <EventHistorySurface eventsView={eventsView} />
    </PreviewPageShell>
  )
}
