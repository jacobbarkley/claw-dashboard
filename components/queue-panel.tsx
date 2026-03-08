"use client"

import { useState } from "react"
import { Nav } from "@/components/nav"
import { Separator } from "@/components/ui/separator"
import { ChevronDown, ChevronRight, Lock, AlertTriangle, CheckCircle2 } from "lucide-react"

interface QueueItem {
  id: string
  category: string
  title: string
  what: string
  blocker?: string
  blocker_type?: "external" | "internal"
  prereq?: string | null
  priority?: string
  priority_features?: string
  ticket?: string | null
  tags?: string[]
}

interface CompletedItem {
  id: string
  category?: string
  title: string
  what: string
  completed_at: string
  ticket?: string | null
  tags?: string[]
}

interface QueueData {
  generated_at: string
  queued: QueueItem[]
  completed: CompletedItem[]
}

const CATEGORIES: Record<string, { label: string; color: string; dot: string }> = {
  trading:      { label: "Trading",          color: "text-emerald-400", dot: "bg-emerald-400" },
  llc:          { label: "LLC & Legal",       color: "text-yellow-400",  dot: "bg-yellow-400" },
  architecture: { label: "Architecture",      color: "text-blue-400",    dot: "bg-blue-400" },
  project:      { label: "Separate Projects", color: "text-purple-400",  dot: "bg-purple-400" },
}

const PRIORITY_COLORS: Record<string, string> = {
  high:   "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low:    "text-zinc-400 bg-zinc-500/10 border-zinc-700",
}

const BLOCKER_COLORS: Record<string, string> = {
  external: "text-purple-300 bg-purple-500/10 border-purple-500/30",
  internal: "text-orange-300 bg-orange-500/10 border-orange-500/30",
}

function QueueCard({ item }: { item: QueueItem }) {
  const [expanded, setExpanded] = useState(false)
  const blockerColor = BLOCKER_COLORS[item.blocker_type ?? "internal"]
  const priorityColor = PRIORITY_COLORS[item.priority ?? "low"]

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-500">{item.id}</span>
          {item.ticket && (
            <span className="font-mono text-[10px] text-zinc-600 border border-zinc-800 px-1.5 py-0.5 rounded">
              {item.ticket}
            </span>
          )}
        </div>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize shrink-0 ${priorityColor}`}>
          {item.priority}
        </span>
      </div>

      <p className="text-sm font-medium text-zinc-100 leading-snug">{item.title}</p>

      {item.blocker && (
        <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${blockerColor}`}>
          <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold uppercase tracking-wide text-[10px] block mb-0.5">
              {item.blocker_type === "external" ? "External blocker" : "Internal blocker"}
            </span>
            {item.blocker}
          </div>
        </div>
      )}

      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {expanded ? "Less" : "Details"}
      </button>

      {expanded && (
        <div className="space-y-3 text-xs text-zinc-400">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">What</div>
            <p className="leading-relaxed">{item.what}</p>
          </div>
          {item.priority_features && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">Priority features</div>
              <p className="leading-relaxed">{item.priority_features}</p>
            </div>
          )}
          {item.prereq && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">Pre-req</div>
              <p className="leading-relaxed">{item.prereq}</p>
            </div>
          )}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {item.tags.map(tag => (
                <span key={tag} className="bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded text-[10px]">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CategorySection({ category, items }: { category: string; items: QueueItem[] }) {
  const meta = CATEGORIES[category] ?? { label: category, color: "text-zinc-400", dot: "bg-zinc-400" }
  const blocked = items.filter(i => i.blocker)
  const ready   = items.filter(i => !i.blocker)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
        <h2 className={`text-xs font-semibold uppercase tracking-widest ${meta.color}`}>
          {meta.label}
        </h2>
        <span className="text-xs text-zinc-600 font-mono">{items.length}</span>
        {blocked.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-orange-400 ml-1">
            <AlertTriangle className="w-3 h-3" />
            {blocked.length} blocked
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {ready.map(item  => <QueueCard key={item.id} item={item} />)}
        {blocked.map(item => <QueueCard key={item.id} item={item} />)}
      </div>
    </div>
  )
}

function CompletedSection({ items }: { items: CompletedItem[] }) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Completed — {items.length}
      </button>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(item => (
            <div key={item.id} className="rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-3 space-y-2 opacity-60">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="font-mono text-[10px] text-zinc-500">{item.id}</span>
                <span className="text-[10px] text-zinc-600">{item.completed_at}</span>
              </div>
              <p className="text-xs text-zinc-400 font-medium">{item.title}</p>
              <p className="text-[11px] text-zinc-600 leading-relaxed">{item.what}</p>
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.tags.map(tag => (
                    <span key={tag} className="bg-zinc-800/60 text-zinc-600 px-1.5 py-0.5 rounded text-[10px]">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function QueuePanel({ data }: { data: QueueData | null }) {
  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400 text-sm">No queue data found</div>
      </div>
    )
  }

  // Group by category, preserving CATEGORIES order
  const grouped = Object.keys(CATEGORIES).reduce<Record<string, QueueItem[]>>((acc, cat) => {
    const items = data.queued.filter(i => i.category === cat)
    if (items.length > 0) acc[cat] = items
    return acc
  }, {})

  const totalBlocked = data.queued.filter(i => i.blocker).length

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <Nav active="queue" />

      <div className="px-6 py-6 space-y-8 max-w-4xl mx-auto">
        {/* Summary */}
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-2xl font-bold text-zinc-100">{data.queued.length}</span>
            <span className="text-zinc-500 ml-2">queued</span>
          </div>
          {totalBlocked > 0 && (
            <div className="flex items-center gap-1.5 text-orange-400">
              <AlertTriangle className="w-4 h-4" />
              <span>{totalBlocked} blocked</span>
            </div>
          )}
          <div className="text-zinc-600">{data.completed.length} completed</div>
        </div>

        {/* Category legend */}
        <div className="flex flex-wrap gap-4">
          {Object.entries(CATEGORIES).map(([key, meta]) => {
            const count = data.queued.filter(i => i.category === key).length
            if (count === 0) return null
            return (
              <div key={key} className="flex items-center gap-1.5 text-xs">
                <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
                <span className={meta.color}>{meta.label}</span>
                <span className="text-zinc-600 font-mono">({count})</span>
              </div>
            )
          })}
        </div>

        <Separator className="bg-zinc-800" />

        {/* Grouped sections */}
        <div className="space-y-8">
          {Object.entries(grouped).map(([cat, items]) => (
            <CategorySection key={cat} category={cat} items={items} />
          ))}
        </div>

        <Separator className="bg-zinc-800" />

        <CompletedSection items={data.completed} />
      </div>
    </div>
  )
}
