import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { JobStatusPoll } from "@/components/vires/lab/job-status-poll"

export const metadata = {
  title: "Vires Capital — Research Lab · Job",
}

export default async function ViresLabJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const jobId = decodeURIComponent(id)

  return (
    <>
      <LabSubNav />
      <div style={{ padding: "24px 20px 12px", maxWidth: 720, margin: "0 auto" }}>
        <div
          className="t-eyebrow"
          style={{ fontSize: 10, color: "var(--vr-gold)", marginBottom: 10, letterSpacing: "0.14em" }}
        >
          Research Lab · Job
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
          Live campaign status
        </h1>
        <div
          className="t-mono"
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--vr-cream-mute)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          job_id · {jobId}
        </div>
        <p
          style={{
            marginTop: 12,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--vr-cream-mute)",
          }}
        >
          State machine from QUEUED through POST_PROCESSING to DONE, with
          live progress polled from the managed state store every ~15s.
          When the store is unreachable the surface degrades honestly —
          the job keeps running; results land on completion.
        </p>
      </div>

      <div style={{ padding: "0 20px 120px", maxWidth: 720, margin: "0 auto" }}>
        <JobStatusPoll jobId={jobId} />
      </div>
    </>
  )
}
