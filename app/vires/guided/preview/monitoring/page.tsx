import { MonitoringSurface } from "@/components/vires/guided/monitoring-surface"
import { PreviewPageShell } from "@/components/vires/guided/shared"
import { MOCK_ENROLLMENT_VIEW_ACTIVE } from "@/components/vires/guided/mocks"

export default function GuidedMonitoringPreview() {
  return (
    <PreviewPageShell
      title="Paper monitoring readback"
      subtitle="S10 mocked. Reads from guided_enrollment_view.v1 + disclosure_version.v1.evidence_summary. 5-axis evidence rendered orthogonally — never collapsed."
      surfaceId="S10"
    >
      <MonitoringSurface view={MOCK_ENROLLMENT_VIEW_ACTIVE} />
    </PreviewPageShell>
  )
}
