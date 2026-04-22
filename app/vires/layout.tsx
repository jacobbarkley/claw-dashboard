import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google"
import "../vires.css"
import { ViresInnerNav } from "@/components/vires/inner-nav"
import { ViresFrame } from "@/components/vires/frame"
import { ViresTalonProvider } from "@/components/vires/talon"
import { ViresRouteTransition } from "@/components/vires/route-transition"

// Vires Capital design system fonts — loaded only inside /vires routes so
// the existing /trading, /bench, /queue surfaces keep their DM_Sans + DM_Mono.
const cormorant = Cormorant_Garamond({
  variable: "--vr-font-serif",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
})

const geistSans = Geist({
  variable: "--vr-font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
})

const geistMono = Geist_Mono({
  variable: "--vr-font-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
})

export default function ViresLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${cormorant.variable} ${geistSans.variable} ${geistMono.variable}`}>
      <ViresFrame>
        <ViresTalonProvider>
          <ViresInnerNav mode="PAPER" />
          <ViresRouteTransition>{children}</ViresRouteTransition>
        </ViresTalonProvider>
      </ViresFrame>
    </div>
  )
}
