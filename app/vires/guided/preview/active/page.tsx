import { ActiveEnrollmentSurface } from "@/components/vires/guided/active-enrollment-surface"
import { PreviewPageShell } from "@/components/vires/guided/shared"
import { MOCK_ENROLLMENT_VIEW_ACTIVE } from "@/components/vires/guided/mocks"

export default function GuidedActivePreview() {
  return (
    <PreviewPageShell
      title="ACTIVE paper enrollment"
      subtitle="S9 mocked. Reads from guided_enrollment_view.v1 with library_entry.status=CANDIDATE and enrollment.status=ACTIVE — the slice's intentional combination."
      surfaceId="S9"
    >
      <ActiveEnrollmentSurface view={MOCK_ENROLLMENT_VIEW_ACTIVE} />
    </PreviewPageShell>
  )
}
