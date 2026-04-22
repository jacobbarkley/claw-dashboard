import { ViresBenchSubNav } from "@/components/vires/bench-sub-nav"
import { BenchSwipeCapture } from "@/components/vires/bench-swipe-capture"

export default function ViresBenchLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ViresBenchSubNav />
      <BenchSwipeCapture>{children}</BenchSwipeCapture>
    </>
  )
}
