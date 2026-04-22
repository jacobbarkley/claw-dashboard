import { ViresBenchSubNav } from "@/components/vires/bench-sub-nav"

export default function ViresBenchLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ViresBenchSubNav />
      {children}
    </>
  )
}
