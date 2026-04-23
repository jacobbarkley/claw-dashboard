import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabSubmitForm } from "@/components/vires/lab/submit-form"

export const metadata = {
  title: "Vires Capital — Research Lab · New campaign",
}

export default async function ViresLabNewCampaignPage({
  params,
}: {
  params: Promise<{ idea: string }>
}) {
  const { idea } = await params
  return (
    <>
      <LabSubNav />
      <div style={{ padding: "24px 20px 12px", maxWidth: 640, margin: "0 auto" }}>
        <div
          className="t-eyebrow"
          style={{ fontSize: 10, color: "var(--vr-gold)", marginBottom: 10, letterSpacing: "0.14em" }}
        >
          Research Lab · New campaign
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
          Submit a bounded parameter sweep
        </h1>
        <p
          style={{
            marginTop: 10,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--vr-cream-mute)",
          }}
        >
          Pick a preset, dial the sweep inside its bounds, add a thesis note,
          and submit. The dashboard commits a governed request file to the
          repo and returns the preallocated <span className="t-mono">job_id</span>{" "}
          immediately — live progress lights up when the worker picks up the
          request.
        </p>
      </div>
      <LabSubmitForm ideaId={decodeURIComponent(idea)} />
    </>
  )
}
