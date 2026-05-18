import { redirect } from "next/navigation"

import { MatchProposalSurfaceFromView } from "@/components/vires/guided/match-proposal-surface"
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
  readGuidedMatchProposalView,
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
// The long-term path is a Vires hub route that resolves the active match
// proposal from the signed-in scope, not a hardcoded preview URL.
const JACOB_PAPER_ACTIVE_PROPOSAL_ID = "proposal_jacob_paper_main_migration"
const SIGNIN_FROM_PATH = "/vires/guided/preview/match"
const SHELL_TITLE = "Match proposal"
const SHELL_SURFACE_ID = "S3"
const SHELL_SUBTITLE = "S3 preview · live read of guided_match_proposal_view.v1"

export default async function GuidedMatchPreview() {
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

  let view
  try {
    view = await readGuidedMatchProposalView(JACOB_PAPER_ACTIVE_PROPOSAL_ID, scope)
  } catch (err) {
    if (err instanceof GuidedArtifactMissingError) {
      return (
        <PreviewPageShell title={SHELL_TITLE} surfaceId={SHELL_SURFACE_ID}>
          <GuidedSurfaceEmptyState
            title="No match proposal yet"
            body="Your Steady Tide match will appear here once it has been proposed for this account."
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
      <MatchProposalSurfaceFromView view={view} />
    </PreviewPageShell>
  )
}
