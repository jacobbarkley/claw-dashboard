import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google"
import "../vires.css"

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
    <div
      id="vires-frame"
      className={`vires-root ${cormorant.variable} ${geistSans.variable} ${geistMono.variable}`}
      style={{
        // Bind the design tokens vires.css references to the loaded font
        // variables. Override here so the Cormorant / Geist Google fonts
        // get used in place of the raw family names declared in vires.css.
        ["--ff-serif" as string]: `var(--vr-font-serif), 'Iowan Old Style', Palatino, serif`,
        ["--ff-sans" as string]: `var(--vr-font-sans), ui-sans-serif, system-ui, -apple-system, sans-serif`,
        ["--ff-mono" as string]: `var(--vr-font-mono), ui-monospace, SFMono-Regular, Menlo, monospace`,
      }}
    >
      {children}
    </div>
  )
}
