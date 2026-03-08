import Link from "next/link"
import { Zap } from "lucide-react"

const LINKS = [
  { href: "/dashboard", label: "Ops" },
  { href: "/pipeline",  label: "Pipeline" },
  { href: "/trading",   label: "Trading",  soon: true },
  { href: "/ideas",     label: "Ideas",    soon: true },
]

export function Nav({ active }: { active: "dashboard" | "pipeline" | "trading" | "ideas" }) {
  return (
    <div className="border-b border-zinc-800 px-6 py-3 flex items-center gap-6 shrink-0">
      <div className="flex items-center gap-2 mr-2">
        <Zap className="w-4 h-4 text-yellow-400" />
        <span className="font-semibold text-zinc-100 text-sm tracking-tight">ClawBoy</span>
      </div>
      {LINKS.map(({ href, label, soon }) => (
        soon ? (
          <span key={href} className="text-sm text-zinc-600 cursor-default select-none">
            {label}
          </span>
        ) : (
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
        )
      ))}
    </div>
  )
}
