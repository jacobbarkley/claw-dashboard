import { redirect } from "next/navigation"

import { EventHistorySurface } from "@/components/vires/guided/event-history-surface"
import {
  GuidedNotEnabledState,
  GuidedSurfaceEmptyState,
  GuidedSurfaceErrorState,
} from "@/components/vires/guided/empty-states"
import { PreviewPageShell } from "@/components/vires/guided/shared"
import {
  GuidedArtifactMissingError,
  GuidedUserStateUnavailableError,
  ProjectionServiceErrorResponseError,
  ProjectionServiceUnreachableError,
  readEnrollmentEventsView,
} from "@/lib/guided-data-source.server"
import {
  UnauthenticatedError,
  UnknownScopeIdentityError,
  resolveCurrentScope,
} from "@/lib/guided-scope.server"
import type { GuidedScope } from "@/components/vires/guided/types"

export const dynamic = "force-dynamic"

// Temporary URL-hardcoded canonical ID. Tracked by
// GUIDED-T1-PREVIEW-ROUTE-DEHARDCODE in the deferred obligations ledger.
const JACOB_PAPER_ACTIVE_ENROLLMENT_ID = "enrollment_jacob_paper_main_active"
const SIGNIN_FROM_PATH = "/vires/guided/preview/events"
const SHELL_TITLE = "Unified event history"
const SHELL_SURFACE_ID = "S11"
const SHELL_SUBTITLE = "S11 preview · live read of enrollment_events_view.v1. All 7 source lanes represented."

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
        <PreviewPageShell title={SHELL_TITLE} surfaceId={SHELL_SURFACE_ID}>
          <GuidedNotEnabledState email={err.email} />
        </PreviewPageShell>
      )
    }
    throw err
  }

  let eventsView
  try {
    eventsView = await readEnrollmentEventsView(JACOB_PAPER_ACTIVE_ENROLLMENT_ID, scope)
  } catch (err) {
    if (err instanceof GuidedArtifactMissingError) {
      return (
        <PreviewPageShell title={SHELL_TITLE} surfaceId={SHELL_SURFACE_ID}>
          <GuidedSurfaceEmptyState
            title="No Guided activity yet"
            body="Enrollment events — broker setup, paper trades, status changes — will appear here as they happen."
          />
        </PreviewPageShell>
      )
    }
    if (err instanceof GuidedUserStateUnavailableError) {
      return (
        <PreviewPageShell title={SHELL_TITLE} surfaceId={SHELL_SURFACE_ID}>
          <GuidedSurfaceErrorState
            title="Guided state service is not configured"
            body="This user-state surface is not wired on the current Guided read store."
          />
        </PreviewPageShell>
      )
    }
    if (err instanceof ProjectionServiceUnreachableError) {
      return (
        <PreviewPageShell title={SHELL_TITLE} surfaceId={SHELL_SURFACE_ID}>
          <GuidedSurfaceErrorState
            title="Guided state service temporarily unavailable"
            body="The projection endpoint did not respond. Try again in a moment."
          />
        </PreviewPageShell>
      )
    }
    if (err instanceof ProjectionServiceErrorResponseError) {
      return (
        <PreviewPageShell title={SHELL_TITLE} surfaceId={SHELL_SURFACE_ID}>
          <GuidedSurfaceErrorState
            title="Guided state service returned an error"
            body={`${err.envelope.error_code}: ${err.envelope.error_message}`}
          />
        </PreviewPageShell>
      )
    }
    throw err
  }
  return (
    <PreviewPageShell title={SHELL_TITLE} subtitle={SHELL_SUBTITLE} surfaceId={SHELL_SURFACE_ID}>
      <EventHistorySurface eventsView={eventsView} />
    </PreviewPageShell>
  )
}
