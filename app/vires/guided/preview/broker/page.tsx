import { redirect } from "next/navigation"

import { BrokerFlowSurface } from "@/components/vires/guided/broker-flow-surface"
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
  readGuidedEnrollment,
} from "@/lib/guided-data-source.server"
import {
  UnauthenticatedError,
  UnknownScopeIdentityError,
  resolveCurrentScope,
} from "@/lib/guided-scope.server"
import type { GuidedEnrollment, GuidedScope } from "@/components/vires/guided/types"

export const dynamic = "force-dynamic"

// The broker preview reads 4 enrollment fixtures side-by-side for design
// review of the per-state broker UI. Real users have one enrollment in
// one state at a time; this preview's 4-variant layout is intentionally a
// debug surface. Variant IDs remain as seed-time fixtures (Codex's
// real-profile materializer in PR #2 does not produce these); after
// cutover the page renders an empty state until/unless equivalent variants
// exist in the projection store. Tracked by GUIDED-T1-PREVIEW-ROUTE-DEHARDCODE.
const BROKER_VARIANT_IDS = {
  pending: "enrollment_entry_zero_pending_broker",
  retryable: "enrollment_entry_zero_broker_retryable",
  actionRequired: "enrollment_entry_zero_broker_action_required",
  ineligible: "enrollment_entry_zero_broker_ineligible",
} as const

type Variants = Record<keyof typeof BROKER_VARIANT_IDS, GuidedEnrollment>

const SIGNIN_FROM_PATH = "/vires/guided/preview/broker"
const SHELL_TITLE = "Broker connect & states"
const SHELL_SURFACE_ID = "S5-S8"
const SHELL_SUBTITLE = "S5–S8 preview · live reads of 4 guided_enrollment.v1 broker variants"

export default async function GuidedBrokerPreview() {
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

  let variants: Variants
  try {
    const entries = await Promise.all(
      (Object.entries(BROKER_VARIANT_IDS) as Array<[keyof typeof BROKER_VARIANT_IDS, string]>).map(
        async ([key, enrollmentId]) => [key, await readGuidedEnrollment(enrollmentId, scope)] as const,
      ),
    )
    variants = Object.fromEntries(entries) as Variants
  } catch (err) {
    if (err instanceof GuidedArtifactMissingError) {
      return (
        <PreviewPageShell title={SHELL_TITLE} surfaceId={SHELL_SURFACE_ID}>
          <GuidedSurfaceEmptyState
            title="No broker connection state yet"
            body="Broker setup details will appear here once your enrollment is connecting to Alpaca."
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
      <BrokerFlowSurface
        pending={variants.pending}
        retryable={variants.retryable}
        actionRequired={variants.actionRequired}
        ineligible={variants.ineligible}
      />
    </PreviewPageShell>
  )
}
