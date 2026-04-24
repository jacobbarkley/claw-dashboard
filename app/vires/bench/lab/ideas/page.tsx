import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell, LabPhaseZeroSlot } from "@/components/vires/lab/phase-zero-shell"
import { LabSleeveFilter } from "@/components/vires/lab/lab-sleeve-filter"

export const metadata = {
  title: "Vires Capital — Lab · Ideas",
}

export default function ViresLabIdeasPage() {
  return (
    <>
      <LabSubNav />
      <LabPhaseZeroShell
        eyebrow="Ideas"
        title="Your strategy bank"
        pitch="Saved theses, variations, and things worth testing. Each idea is a spec you can send to the lab on demand."
      >
        <LabSleeveFilter />
        <LabPhaseZeroSlot
          label="Your ideas"
          note="The filterable list lands here — by sleeve, by tag, by status. Each card links straight to a new-campaign form prefilled from the idea."
        />
      </LabPhaseZeroShell>
    </>
  )
}
