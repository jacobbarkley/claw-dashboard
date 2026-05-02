import { ViresBenchSubNav } from "@/components/vires/bench-sub-nav"
import { BenchSwipeCapture } from "@/components/vires/bench-swipe-capture"
import { labRedesignEnabled } from "@/lib/feature-flags.server"

export default function ViresBenchLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ViresBenchSubNav labRedesign={labRedesignEnabled()} />
      <BenchSwipeCapture>{children}</BenchSwipeCapture>
    </>
  )
}
