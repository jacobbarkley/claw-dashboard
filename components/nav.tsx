import Link from "next/link"
import { Zap, Activity, GitBranch, TrendingUp, List, Settings } from "lucide-react"

const LINKS = [
  { href: "/dashboard", label: "Ops",      icon: Activity   },
  { href: "/pipeline",  label: "Pipeline", icon: GitBranch  },
  { href: "/trading",   label: "Trading",  icon: TrendingUp },
  { href: "/queue",     label: "Queue",    icon: List       },
  { href: "/tunables",  label: "Tunables", icon: Settings   },
]

export function Nav({ active }: { active: "dashboard" | "pipeline" | "trading" | "queue" | "tunables" }) {
  return (
    <>
      {/* Top nav — logo always visible; links hidden on mobile */}
      <div className="border-b border-zinc-800 px-6 py-3 flex items-center gap-6 shrink-0">
        <div className="flex items-center gap-2 mr-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="font-semibold text-zinc-100 text-sm tracking-tight">ClawBoy</span>
        </div>
        <div className="hidden sm:flex items-center gap-6">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm transition-colors ${
                active === href.slice(1)
                  ? "text-zinc-100 font-medium"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 flex">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const isActive = active === href.slice(1)
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors ${
                isActive ? "text-zinc-100" : "text-zinc-600 hover:text-zinc-400"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[9px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </>
  )
}
