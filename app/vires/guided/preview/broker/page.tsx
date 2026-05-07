import { BrokerFlowSurface } from "@/components/vires/guided/broker-flow-surface"
import { PreviewPageShell } from "@/components/vires/guided/shared"
import {
  MOCK_ENROLLMENT_BROKER_ACTION_REQUIRED,
  MOCK_ENROLLMENT_BROKER_INELIGIBLE,
  MOCK_ENROLLMENT_BROKER_RETRYABLE,
  MOCK_ENROLLMENT_PENDING_BROKER,
} from "@/components/vires/guided/mocks"

export default function GuidedBrokerPreview() {
  return (
    <PreviewPageShell
      title="Broker connect & states"
      subtitle="S5–S8 mocked. State picker walks all 5 surfaces against guided_enrollment.v1 + BrokerCapabilitySnapshot mocks."
      surfaceId="S5-S8"
    >
      <BrokerFlowSurface
        pending={MOCK_ENROLLMENT_PENDING_BROKER}
        retryable={MOCK_ENROLLMENT_BROKER_RETRYABLE}
        actionRequired={MOCK_ENROLLMENT_BROKER_ACTION_REQUIRED}
        ineligible={MOCK_ENROLLMENT_BROKER_INELIGIBLE}
      />
    </PreviewPageShell>
  )
}
