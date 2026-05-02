import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { JobsListPoll } from "@/components/vires/lab/jobs-list-poll"
import { LabSleeveFilter } from "@/components/vires/lab/lab-sleeve-filter"
import { LabJobsRedesigned } from "@/components/vires/lab/lab-jobs-redesigned"
import { labRedesignEnabled } from "@/lib/feature-flags.server"

export const metadata = {
  title: "Vires Capital — Lab · Jobs",
}

export default function ViresLabJobsPage() {
  if (labRedesignEnabled()) {
    return (
      <>
        <LabSubNav redesign />
        <LabSleeveFilter />
        <LabJobsRedesigned />
      </>
    )
  }

  return (
    <>
      <LabSubNav />
      <div style={{ padding: "24px 20px 12px", maxWidth: 720, margin: "0 auto" }}>
        <div
          className="t-eyebrow"
          style={{ fontSize: 10, color: "var(--vr-gold)", marginBottom: 10, letterSpacing: "0.14em" }}
        >
          Jobs
        </div>
        <h1
          className="t-display"
          style={{
            margin: 0,
            fontSize: 26,
            lineHeight: 1.15,
            color: "var(--vr-cream)",
            fontWeight: 400,
          }}
        >
          Every run
        </h1>
        <p
          style={{
            marginTop: 10,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--vr-cream-mute)",
          }}
        >
          What&apos;s running now, what ran recently. Click into any row for details.
        </p>
        <LabSleeveFilter />
      </div>
      <div style={{ padding: "0 20px 120px", maxWidth: 720, margin: "0 auto" }}>
        <JobsListPoll />
      </div>
    </>
  )
}
