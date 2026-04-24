import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { JobsListPoll } from "@/components/vires/lab/jobs-list-poll"

export const metadata = {
  title: "Vires Capital — Research Lab · Jobs",
}

export default function ViresLabJobsPage() {
  return (
    <>
      <LabSubNav />
      <div style={{ padding: "24px 20px 12px", maxWidth: 720, margin: "0 auto" }}>
        <div
          className="t-eyebrow"
          style={{ fontSize: 10, color: "var(--vr-gold)", marginBottom: 10, letterSpacing: "0.14em" }}
        >
          Research Lab · Jobs
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
          Live queue + recent history
        </h1>
        <p
          style={{
            marginTop: 12,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--vr-cream-mute)",
          }}
        >
          Live jobs are read from the managed state store, polled every ~15
          seconds. Each row deep-links into the job detail view. Historical
          jobs (terminal cold-tree artifacts) will appear below the live
          queue once Codex's result/candidate projection slice lands —
          right now only live queue is wired.
        </p>
      </div>
      <div style={{ padding: "0 20px 120px", maxWidth: 720, margin: "0 auto" }}>
        <JobsListPoll />
      </div>
    </>
  )
}
