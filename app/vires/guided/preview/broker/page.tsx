import { redirect } from "next/navigation"

import { BrokerFlowSurface } from "@/components/vires/guided/broker-flow-surface"
import { MockFallbackBadge, PreviewPageShell } from "@/components/vires/guided/shared"
import {
  MOCK_ENROLLMENT_BROKER_ACTION_REQUIRED,
  MOCK_ENROLLMENT_BROKER_INELIGIBLE,
  MOCK_ENROLLMENT_BROKER_RETRYABLE,
  MOCK_ENROLLMENT_PENDING_BROKER,
} from "@/components/vires/guided/mocks"
import {
  GuidedArtifactMissingError,
  GuidedUserStateUnavailableError,
  readGuidedEnrollment,
} from "@/lib/guided-data-source.server"
import {
  UnauthenticatedError,
  UnknownScopeIdentityError,
  resolveCurrentScope,
} from "@/lib/guided-scope.server"
import type { GuidedEnrollment, GuidedScope } from "@/components/vires/guided/types"

export const dynamic = "force-dynamic"

const SIGNIN_FROM_PATH = "/vires/guided/preview/broker"

const BROKER_VARIANT_IDS = {
  pending: "enrollment_entry_zero_pending_broker",
  retryable: "enrollment_entry_zero_broker_retryable",
  actionRequired: "enrollment_entry_zero_broker_action_required",
  ineligible: "enrollment_entry_zero_broker_ineligible",
} as const

const MOCK_VARIANTS = {
  pending: MOCK_ENROLLMENT_PENDING_BROKER,
  retryable: MOCK_ENROLLMENT_BROKER_RETRYABLE,
  actionRequired: MOCK_ENROLLMENT_BROKER_ACTION_REQUIRED,
  ineligible: MOCK_ENROLLMENT_BROKER_INELIGIBLE,
} as const

type Variants = Record<keyof typeof BROKER_VARIANT_IDS, GuidedEnrollment>

async function loadRealOrMock(
  scope: GuidedScope,
): Promise<{ variants: Variants; fallback: string | null }> {
  try {
    const entries = await Promise.all(
      (Object.entries(BROKER_VARIANT_IDS) as Array<[keyof typeof BROKER_VARIANT_IDS, string]>).map(
        async ([key, enrollmentId]) => [key, await readGuidedEnrollment(enrollmentId, scope)] as const,
      ),
    )
    const variants = Object.fromEntries(entries) as Variants
    return { variants, fallback: null }
  } catch (err) {
    if (err instanceof GuidedUserStateUnavailableError) {
      return { variants: MOCK_VARIANTS, fallback: "GUIDED_LOCAL_REBUILD_PATH unset (production preview)" }
    }
    if (err instanceof GuidedArtifactMissingError) {
      return { variants: MOCK_VARIANTS, fallback: `seed missing (${err.artifactPath})` }
    }
    throw err
  }
}

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
        <PreviewPageShell
          title="Broker connect & states"
          subtitle="S5–S8 preview · mock fallback (no Guided scope mapped to this account)"
          surfaceId="S5-S8"
        >
          <MockFallbackBadge reason={`no Guided scope mapped to ${err.email}`} />
          <BrokerFlowSurface
            pending={MOCK_VARIANTS.pending}
            retryable={MOCK_VARIANTS.retryable}
            actionRequired={MOCK_VARIANTS.actionRequired}
            ineligible={MOCK_VARIANTS.ineligible}
          />
        </PreviewPageShell>
      )
    }
    throw err
  }

  const { variants, fallback } = await loadRealOrMock(scope)
  return (
    <PreviewPageShell
      title="Broker connect & states"
      subtitle={
        fallback
          ? "S5–S8 preview · mock fallback (user-state read unavailable)"
          : "S5–S8 preview · live reads of 4 guided_enrollment.v1 broker variants"
      }
      surfaceId="S5-S8"
    >
      {fallback ? <MockFallbackBadge reason={fallback} /> : null}
      <BrokerFlowSurface
        pending={variants.pending}
        retryable={variants.retryable}
        actionRequired={variants.actionRequired}
        ineligible={variants.ineligible}
      />
    </PreviewPageShell>
  )
}
