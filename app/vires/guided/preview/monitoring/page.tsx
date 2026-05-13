import { redirect } from "next/navigation"

import { MonitoringSurface } from "@/components/vires/guided/monitoring-surface"
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
  readGuidedEnrollmentView,
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
const SIGNIN_FROM_PATH = "/vires/guided/preview/monitoring"
const SHELL_TITLE = "Paper monitoring readback"
const SHELL_SURFACE_ID = "S10"
const SHELL_SUBTITLE =
  "S10 preview · live read of guided_enrollment_view.v1 + disclosure evidence_summary. 5-axis evidence rendered orthogonally — never collapsed."

export default async function GuidedMonitoringPreview() {
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

  try {
    const view = await readGuidedEnrollmentView(JACOB_PAPER_ACTIVE_ENROLLMENT_ID, scope)
    return (
      <PreviewPageShell title={SHELL_TITLE} subtitle={SHELL_SUBTITLE} surfaceId={SHELL_SURFACE_ID}>
        <MonitoringSurface view={view} />
      </PreviewPageShell>
    )
  } catch (err) {
    if (err instanceof GuidedArtifactMissingError) {
      return (
        <PreviewPageShell title={SHELL_TITLE} surfaceId={SHELL_SURFACE_ID}>
          <GuidedSurfaceEmptyState
            title="No monitoring data yet"
            body="Performance and risk metrics will appear here once your enrollment is active."
          />
        </PreviewPageShell>
      )
    }
    if (err instanceof GuidedUserStateUnavailableError) {
      return (
        <PreviewPageShell title={SHELL_TITLE} surfaceId={SHELL_SURFACE_ID}>
          <GuidedSurfaceErrorState
            title="Guided state service is not configured"
            body="An operator needs to configure the Guided projection endpoint before this page can show real data."
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
}
