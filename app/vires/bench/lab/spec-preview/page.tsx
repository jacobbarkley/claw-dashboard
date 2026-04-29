import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { SpecPreviewShell } from "@/components/vires/lab/spec-preview-shell"

export const metadata = {
  title: "Vires Capital — Lab · Spec authoring preview",
}

export default function SpecPreviewPage() {
  return (
    <>
      <LabSubNav />
      <div style={{ padding: "24px 20px 12px", maxWidth: 760, margin: "0 auto" }}>
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            lineHeight: 1.15,
            color: "var(--vr-cream)",
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            fontWeight: 400,
          }}
        >
          Spec authoring preview
        </h1>
        <p
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "var(--vr-cream-mute)",
            lineHeight: 1.55,
          }}
        >
          Phase D UX prep — static mock with no API. Click through the
          seven-step thread to see how the idea detail page evolves from
          &lsquo;describe&rsquo; to &lsquo;ready to nominate&rsquo;. Live
          wiring waits on Phase C&rsquo;s spec contract.
        </p>
      </div>
      <div style={{ padding: "0 20px 120px", maxWidth: 760, margin: "0 auto" }}>
        <SpecPreviewShell />
      </div>
    </>
  )
}
