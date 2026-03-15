import Link from "next/link"
import { Zap, Activity, GitBranch, TrendingUp, List, Settings } from "lucide-react"

const LINKS = [
  { href: "/dashboard", label: "Ops",      icon: Activity   },
  { href: "/pipeline",  label: "Pipeline", icon: GitBranch  },
  { href: "/trading",   label: "Trading",  icon: TrendingUp },
  { href: "/queue",     label: "Queue",    icon: List       },
  { href: "/tunables",  label: "Tunables", icon: Settings   },
]

const NAV_BG = "rgba(3, 1, 12, 0.92)"
const BORDER = "rgba(90, 70, 160, 0.14)"

export function Nav({ active }: { active: "dashboard" | "pipeline" | "trading" | "queue" | "tunables" }) {
  return (
    <>
      {/* Top nav — sticky, part of the product shell */}
      <div
        className="border-b px-6 py-3.5 flex items-center gap-8 shrink-0 backdrop-blur-md sticky top-0 z-40"
        style={{ borderColor: BORDER, background: NAV_BG }}
      >
        {/* Brand mark */}
        <div className="flex items-center gap-2 mr-1">
          <Zap className="w-3.5 h-3.5" style={{ color: "#e8c84a" }} />
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color: "#f0eff8",
          }}>CLAWBOY</span>
        </div>

        {/* Desktop links */}
        <div className="hidden sm:flex items-center gap-7">
          {LINKS.map(({ href, label }) => {
            const isActive = active === href.slice(1)
            return (
              <Link
                key={href}
                href={href}
                style={{
                  fontSize: 12,
                  fontWeight: isActive ? 500 : 400,
                  letterSpacing: "0.04em",
                  color: isActive ? "#f0eff8" : "#52506a",
                  transition: "color 0.15s",
                }}
              >
                {label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 backdrop-blur-md border-t flex"
        style={{ background: "rgba(3, 1, 12, 0.96)", borderColor: BORDER }}
      >
        {LINKS.map(({ href, label, icon: Icon }) => {
          const isActive = active === href.slice(1)
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors"
              style={{ color: isActive ? "#f0eff8" : "#3d3a52" }}
            >
              <Icon className="w-5 h-5" />
              <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.05em" }}>{label.toUpperCase()}</span>
            </Link>
          )
        })}
      </div>
    </>
  )
}
