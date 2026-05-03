import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { IdeaForm } from "@/components/vires/lab/idea-form"
import { strategyReferenceModelEnabled } from "@/lib/feature-flags.server"
import { loadPresetStrategyOptions } from "@/lib/research-lab-presets.server"

export const metadata = {
  title: "Vires Capital — Lab · New Idea",
}

export default async function ViresLabNewIdeaPage() {
  const strategyOptions = await loadPresetStrategyOptions()
  const referenceModel = strategyReferenceModelEnabled()

  return (
    <>
      <LabSubNav />
      <div style={{ padding: "24px 20px 12px", maxWidth: 640, margin: "0 auto" }}>
        <div
          className="t-eyebrow"
          style={{ fontSize: 10, color: "var(--vr-gold)", marginBottom: 10, letterSpacing: "0.14em" }}
        >
          New idea
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
          Shape something worth testing
        </h1>
        <p
          style={{
            marginTop: 10,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--vr-cream-mute)",
          }}
        >
          {referenceModel
            ? "Save a thesis as new strategy work. Optional references give Talon and Codex a parent strategy to start from."
            : "Save a thesis against a registered strategy. DRAFT stays quiet; READY makes the idea eligible for jobs and autopilot pickup."}
        </p>
      </div>
      <div style={{ padding: "0 20px 120px", maxWidth: 640, margin: "0 auto" }}>
        <IdeaForm strategyOptions={strategyOptions} referenceModelEnabled={referenceModel} />
      </div>
    </>
  )
}
