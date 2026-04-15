"use client"

import { useState, useMemo } from "react"
import { Nav } from "@/components/nav"
import { Card, CardContent } from "@/components/ui/card"
import {
  ChevronDown, ChevronRight, Lock, AlertTriangle, CheckCircle2,
  Zap, Circle, Clock, Pause, Target, Filter, Layers,
} from "lucide-react"

// ─── Types (matches queue.json shape) ────────────────────────────────────────

interface QueueItem {
  id: string
  category: string
  title: string
  what: string
  blocker?: string | null
  blocker_type?: string | null
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
  closed_at?: string
  close_note?: string
  blocker?: string | null
  blocker_type?: string | null
  prereq?: string | null
  priority?: string
  ticket?: string | null
  tags?: string[]
}

interface QueueData {
  generated_at: string
  queued: QueueItem[]
  completed: CompletedItem[]
}

interface OperatorFeedData {
  contract_version?: string
  generated_at?: string
  as_of_date?: string
  pipeline_status?: {
    circuit_breaker?: string
    verdict?: string
    approval_path?: string
    chain_ok?: boolean
    high_issues?: number
    medium_issues?: number
  }
  operator?: {
    mode?: {
      current_mode?: string
      target_paper_mode?: string
      target_live_mode?: string
      note?: string
    }
    session?: {
      entry_mode?: string
    }
    checkpoint05?: {
      checkpoint_status?: string
      evidence_sufficient?: boolean | null
      total_shadow_days?: number
      substantive_shadow_days?: number
      substantive_pregate_days?: number
      one_sided_days?: number
      trivial_days?: number
      latest_suppression_cause?: string
      blocking_notes?: string[]
    }
    plan?: {
      pre_gate_candidate_count?: number
      trade_plan_status?: string
      trade_plan_count?: number
      suppression_cause?: string
      blocked_reasons?: string[]
    }
    incident_flags?: string[]
  }
}

// ─── Task State System ───────────────────────────────────────────────────────
// UX: Derived state answers "what can I do with this?" — not just priority level.
// Ready = actionable now. Blocked = has explicit blocker. Strategic = high priority,
// long-horizon. Parked = low priority, no immediate action.

type TaskState = "ready" | "blocked" | "strategic" | "parked"

function deriveState(item: QueueItem): TaskState {
  if (item.blocker) return "blocked"
  if (item.priority === "critical" || item.priority === "high") return "ready"
  if (item.priority === "medium") return "strategic"
  return "parked"
}

const STATE_CONFIG: Record<TaskState, {
  label: string
  color: string
  bgColor: string
  borderColor: string
  icon: typeof Circle
}> = {
  ready:     { label: "Ready Now",  color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/25", icon: Zap },
  blocked:   { label: "Blocked",    color: "text-orange-400",  bgColor: "bg-orange-500/10",  borderColor: "border-orange-500/25",  icon: Lock },
  strategic: { label: "Strategic",  color: "text-blue-400",    bgColor: "bg-blue-500/10",    borderColor: "border-blue-500/25",    icon: Target },
  parked:    { label: "Parked",     color: "text-zinc-500",    bgColor: "bg-zinc-500/8",     borderColor: "border-zinc-700",       icon: Pause },
}

// ─── Category Config ─────────────────────────────────────────────────────────

const CATEGORIES: Record<string, { label: string; color: string; dot: string; accent: string }> = {
  audit:          { label: "Audit",            color: "text-rose-400",    dot: "bg-rose-400",    accent: "border-l-rose-500/40" },
  architecture:   { label: "Architecture",     color: "text-violet-400",  dot: "bg-violet-400",  accent: "border-l-violet-500/40" },
  validation:     { label: "Validation",       color: "text-cyan-400",    dot: "bg-cyan-400",    accent: "border-l-cyan-500/40" },
  rebuild:        { label: "Rebuild",          color: "text-emerald-400", dot: "bg-emerald-400", accent: "border-l-emerald-500/40" },
  documentation:  { label: "Docs",             color: "text-sky-400",     dot: "bg-sky-400",     accent: "border-l-sky-500/40" },
  trading:        { label: "Trading",          color: "text-emerald-400", dot: "bg-emerald-400", accent: "border-l-emerald-500/40" },
  dashboard:      { label: "Dashboard",        color: "text-blue-400",    dot: "bg-blue-400",    accent: "border-l-blue-500/40" },
  infrastructure: { label: "Infrastructure",   color: "text-cyan-400",    dot: "bg-cyan-400",    accent: "border-l-cyan-500/40" },
  llc:            { label: "LLC & Legal",       color: "text-amber-400",   dot: "bg-amber-400",   accent: "border-l-amber-500/40" },
  governance:     { label: "Governance",        color: "text-yellow-400",  dot: "bg-yellow-400",  accent: "border-l-yellow-500/40" },
  project:        { label: "Separate Projects", color: "text-purple-400",  dot: "bg-purple-400",  accent: "border-l-purple-500/40" },
  strategy:       { label: "Strategy",          color: "text-teal-400",    dot: "bg-teal-400",    accent: "border-l-teal-500/40" },
  "strategy-bank":{ label: "Strategy Bank",     color: "text-teal-300",    dot: "bg-teal-300",    accent: "border-l-teal-400/40" },
  operator:       { label: "Operator",          color: "text-indigo-400",  dot: "bg-indigo-400",  accent: "border-l-indigo-500/40" },
  docs:           { label: "Docs",              color: "text-sky-400",     dot: "bg-sky-400",     accent: "border-l-sky-500/40" },
  content:        { label: "Content",           color: "text-pink-400",    dot: "bg-pink-400",    accent: "border-l-pink-500/40" },
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-rose-300 bg-rose-500/12 border-rose-500/35",
  high:   "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low:    "text-zinc-500 bg-zinc-500/8 border-zinc-700",
}

// ─── View Modes ──────────────────────────────────────────────────────────────

type ViewMode = "category" | "priority" | "status" | "all"

const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: "category", label: "Category" },
  { key: "priority", label: "Priority" },
  { key: "status",   label: "Status" },
  { key: "all",      label: "All" },
]

// ─── Roadmap Control Strip ───────────────────────────────────────────────────
// UX: Unequal weights — "Ready Now" is the hero metric. This is the decision
// cockpit, not a passive counter row. Most actionable info is most prominent.

function RoadmapStrip({ items }: { items: QueueItem[] }) {
  const ready    = items.filter(i => deriveState(i) === "ready").length
  const blocked  = items.filter(i => deriveState(i) === "blocked").length
  const strategic = items.filter(i => deriveState(i) === "strategic").length

  const rebuildTrack = items.filter(i => ["audit", "architecture", "validation", "rebuild", "documentation"].includes(i.category)).length
  const delivery = items.filter(i => ["trading", "infrastructure", "dashboard"].includes(i.category)).length
  const admin       = items.filter(i => ["llc", "governance"].includes(i.category)).length

  return (
    <div className="space-y-3">
      {/* Primary: Ready Now (hero) + Blocked */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className={`border col-span-2 sm:col-span-1 ${
          ready > 0 ? "bg-emerald-950/25 border-emerald-500/25" : "bg-zinc-900 border-zinc-800"
        }`}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className={`text-3xl sm:text-4xl font-bold tabular-nums ${
              ready > 0 ? "text-emerald-400" : "text-zinc-300"
            }`}>{ready}</div>
            <div className="text-[11px] text-zinc-500 mt-1 uppercase tracking-wide font-medium flex items-center gap-1.5">
              <Zap className="w-3 h-3" />
              Ready Now
            </div>
          </CardContent>
        </Card>

        <Card className={`border ${
          blocked > 0 ? "bg-orange-950/20 border-orange-500/25" : "bg-zinc-900 border-zinc-800"
        }`}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className={`text-2xl font-bold tabular-nums ${
              blocked > 0 ? "text-orange-400" : "text-zinc-300"
            }`}>{blocked}</div>
            <div className="text-[11px] text-zinc-500 mt-1 uppercase tracking-wide font-medium flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              Blocked
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-blue-400 tabular-nums">{strategic}</div>
            <div className="text-[11px] text-zinc-500 mt-1 uppercase tracking-wide font-medium flex items-center gap-1.5">
              <Target className="w-3 h-3" />
              Strategic
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-zinc-300 tabular-nums">{items.length}</div>
            <div className="text-[11px] text-zinc-500 mt-1 uppercase tracking-wide font-medium flex items-center gap-1.5">
              <Layers className="w-3 h-3" />
              Total Queued
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary: composition breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wide font-medium">Rebuild Core</span>
          <span className="text-sm font-bold text-zinc-300 tabular-nums">{rebuildTrack}</span>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wide font-medium">Delivery</span>
          <span className="text-sm font-bold text-zinc-300 tabular-nums">{delivery}</span>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wide font-medium">Admin / Other</span>
          <span className="text-sm font-bold text-zinc-300 tabular-nums">{items.length - rebuildTrack - delivery}</span>
        </div>
      </div>
    </div>
  )
}

function OperatorPulse({ operatorData }: { operatorData: OperatorFeedData | null }) {
  if (!operatorData?.operator || !operatorData.pipeline_status) return null

  const mode = operatorData.operator.mode
  const session = operatorData.operator.session
  const checkpoint = operatorData.operator.checkpoint05
  const plan = operatorData.operator.plan
  const incidentFlags = operatorData.operator.incident_flags ?? []
  const pipeline = operatorData.pipeline_status
  const blockingNotes = checkpoint?.blocking_notes ?? []

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.14),_transparent_30%),linear-gradient(180deg,rgba(24,24,27,0.98),rgba(9,9,11,0.98))] p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Operator Pulse</div>
        <div className="text-lg sm:text-xl font-semibold text-zinc-100">
            {mode?.current_mode ?? "UNKNOWN"} now, {mode?.target_paper_mode ?? "UNKNOWN"} next
          </div>
          <p className="text-sm text-zinc-400 max-w-2xl">
            {mode?.note ?? "Queue is now anchored to the rebuild operator contract instead of legacy-only backlog context."}
          </p>
        </div>
        <div className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
          pipeline.verdict === "FAIL"
            ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
            : pipeline.verdict === "PASS"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-300"
        }`}>
          {pipeline.verdict ?? "WARN"}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-950/70">
          <CardContent className="pt-4 px-4 pb-4 space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Mode & Gate</div>
            <div className="text-sm font-medium text-zinc-100">{mode?.current_mode ?? "UNKNOWN"}</div>
            <div className="text-xs text-zinc-400">Circuit breaker: <span className="text-zinc-200">{pipeline.circuit_breaker ?? "UNKNOWN"}</span></div>
            <div className="text-xs text-zinc-400">Entry mode: <span className="text-zinc-200">{session?.entry_mode ?? "UNKNOWN"}</span></div>
            <div className="text-xs text-zinc-400">Approval path: <span className="text-zinc-200">{pipeline.approval_path ?? "UNKNOWN"}</span></div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/70">
          <CardContent className="pt-4 px-4 pb-4 space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Checkpoint 05</div>
            <div className="text-sm font-medium text-zinc-100">{checkpoint?.checkpoint_status ?? "UNKNOWN"}</div>
            <div className="flex items-center gap-4 text-xs text-zinc-400">
              <span>{checkpoint?.substantive_shadow_days ?? 0} post-gate</span>
              <span>{checkpoint?.substantive_pregate_days ?? 0} pre-gate</span>
            </div>
            <div className="text-xs text-zinc-400">Window: <span className="text-zinc-200">{checkpoint?.total_shadow_days ?? 0} days</span></div>
            <div className="text-xs text-zinc-400">Evidence: <span className="text-zinc-200">{checkpoint?.evidence_sufficient === true ? "sufficient" : checkpoint?.evidence_sufficient === false ? "insufficient" : "not yet determined"}</span></div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/70">
          <CardContent className="pt-4 px-4 pb-4 space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Today’s Plan</div>
            <div className="text-sm font-medium text-zinc-100">{plan?.trade_plan_status ?? "UNKNOWN"}</div>
            <div className="flex items-center gap-4 text-xs text-zinc-400">
              <span>{plan?.pre_gate_candidate_count ?? 0} candidates</span>
              <span>{plan?.trade_plan_count ?? 0} tradable</span>
            </div>
            <div className="text-xs text-zinc-400">Suppression: <span className="text-zinc-200">{plan?.suppression_cause ?? "UNKNOWN"}</span></div>
            {!!plan?.blocked_reasons?.length && (
              <div className="text-xs text-zinc-400">
                Block reasons: <span className="text-zinc-200">{plan.blocked_reasons.join(", ")}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
        <span className={`rounded-full border px-2 py-1 ${operatorData.contract_version === "1" ? "border-zinc-700 bg-zinc-900/70 text-zinc-300" : "border-rose-500/20 bg-rose-500/10 text-rose-300"}`}>
          Contract v{operatorData.contract_version ?? "unknown"}
        </span>
        <span className={`rounded-full border px-2 py-1 ${pipeline.chain_ok ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
          {pipeline.chain_ok ? "Chain healthy" : "Chain has incidents"}
        </span>
        {typeof pipeline.high_issues === "number" && (
          <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-rose-300">
            {pipeline.high_issues} high issue{pipeline.high_issues === 1 ? "" : "s"}
          </span>
        )}
        {typeof pipeline.medium_issues === "number" && (
          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-300">
            {pipeline.medium_issues} medium issue{pipeline.medium_issues === 1 ? "" : "s"}
          </span>
        )}
        {!!incidentFlags.length && (
          <span className="rounded-full border border-zinc-700 bg-zinc-900/70 px-2 py-1">
            {incidentFlags.length} incident flag{incidentFlags.length === 1 ? "" : "s"}
          </span>
        )}
        {checkpoint?.latest_suppression_cause && (
          <span className="rounded-full border border-zinc-700 bg-zinc-900/70 px-2 py-1">
            Latest suppression: {checkpoint.latest_suppression_cause}
          </span>
        )}
        {!!blockingNotes.length && (
          <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-rose-300">
            {blockingNotes.length} blocking note{blockingNotes.length === 1 ? "" : "s"}
          </span>
        )}
        {operatorData.as_of_date && (
          <span className="rounded-full border border-zinc-700 bg-zinc-900/70 px-2 py-1 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            As of {operatorData.as_of_date}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── View Switcher + Filter Bar ──────────────────────────────────────────────
// UX: Sticky on mobile for fast scanning. View mode switches grouping logic.

function ViewSwitcher({
  active,
  onChange,
}: {
  active: ViewMode
  onChange: (v: ViewMode) => void
}) {
  return (
    <div className="sticky top-[53px] z-30 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800/50 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 flex items-center gap-1">
      <Filter className="w-3.5 h-3.5 text-zinc-600 shrink-0 mr-1" />
      {VIEW_TABS.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
            active === tab.key
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ─── Task Card ───────────────────────────────────────────────────────────────
// UX: Collapsed = glanceable triage row. Expanded = structured decision sections.
// No walls of text. Bold labels, short content. State is the first visual signal.

function QueueCard({ item }: { item: QueueItem }) {
  const [expanded, setExpanded] = useState(false)
  const state = deriveState(item)
  const stateConfig = STATE_CONFIG[state]
  const StateIcon = stateConfig.icon
  const priorityColor = PRIORITY_COLORS[item.priority ?? "low"]

  // Parse "what" into structured sections for expanded view.
  // First sentence = description. Rest is detail.
  const whatSentences = (item.what ?? "").split(/(?<=\.)\s+/)
  const description = whatSentences[0] ?? ""
  const detail = whatSentences.slice(1).join(" ")

  const cardGradient = state === "ready"
    ? "radial-gradient(circle at top left, rgba(34,197,94,0.14), transparent 35%), radial-gradient(circle at bottom right, rgba(59,130,246,0.10), transparent 30%), linear-gradient(180deg, rgba(24,24,27,0.98), rgba(9,9,11,0.98))"
    : state === "blocked"
      ? "radial-gradient(circle at top left, rgba(249,115,22,0.12), transparent 35%), radial-gradient(circle at bottom right, rgba(139,92,246,0.08), transparent 30%), linear-gradient(180deg, rgba(24,24,27,0.98), rgba(9,9,11,0.98))"
      : state === "strategic"
        ? "radial-gradient(circle at top left, rgba(59,130,246,0.12), transparent 35%), radial-gradient(circle at bottom right, rgba(139,92,246,0.08), transparent 30%), linear-gradient(180deg, rgba(24,24,27,0.98), rgba(9,9,11,0.98))"
        : "linear-gradient(180deg, rgba(24,24,27,0.95), rgba(9,9,11,0.95))"

  return (
    <div
      className={`rounded-xl border transition-colors ${
        state === "blocked"
          ? "border-orange-500/20"
          : state === "ready"
            ? "border-emerald-500/15"
            : state === "parked"
              ? "border-zinc-800/60"
              : "border-zinc-800"
      }`}
      style={{ background: cardGradient }}
    >
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left p-3 sm:p-4 flex items-start gap-3"
      >
        <span className="mt-1 text-zinc-600 shrink-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>

        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Top row: ID + priority + state */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[10px] text-zinc-600">{item.id}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize shrink-0 ${priorityColor}`}>
              {item.priority}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${stateConfig.bgColor} ${stateConfig.color} ${stateConfig.borderColor}`}>
              <StateIcon className="w-2.5 h-2.5" />
              {stateConfig.label}
            </span>
          </div>

          {/* Hero: title */}
          <p className={`text-[13px] sm:text-sm leading-snug font-medium ${
            state === "parked" ? "text-zinc-400" : "text-zinc-100"
          }`}>
            {item.title}
          </p>

          {/* Blocker callout — visible in collapsed state for blocked items */}
          {item.blocker && !expanded && (
            <p className="text-[11px] text-orange-400/80 flex items-center gap-1.5 mt-0.5">
              <Lock className="w-3 h-3 shrink-0" />
              {item.blocker}
            </p>
          )}
        </div>
      </button>

      {/* Expanded: structured decision sections */}
      {expanded && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 ml-6 space-y-3 border-t border-zinc-800/50 pt-3">
          {/* What */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mb-1">What</div>
            <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>
          </div>

          {/* Why it matters / priority features */}
          {(item.priority_features || detail) && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mb-1">Why it matters</div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {item.priority_features || detail}
              </p>
            </div>
          )}

          {/* Dependencies / blockers */}
          {item.blocker && (
            <div className={`rounded-md border px-3 py-2 text-xs ${
              item.blocker_type === "data"
                ? "text-purple-300 bg-purple-500/8 border-purple-500/25"
                : "text-orange-300 bg-orange-500/8 border-orange-500/25"
            }`}>
              <div className="text-[10px] uppercase tracking-widest font-semibold mb-0.5 flex items-center gap-1.5">
                <Lock className="w-3 h-3 shrink-0" />
                {item.blocker_type === "data" ? "Data dependency" : "Blocker"}
              </div>
              {item.blocker}
            </div>
          )}

          {/* Prerequisites */}
          {item.prereq && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mb-1">Prerequisites</div>
              <p className="text-xs text-zinc-400 leading-relaxed">{item.prereq}</p>
            </div>
          )}

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {item.tags.map(tag => (
                <span key={tag} className="bg-zinc-800/80 text-zinc-500 px-1.5 py-0.5 rounded text-[10px]">
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

// ─── Category Section ────────────────────────────────────────────────────────
// UX: Collapsible with inline status counts. Left accent border per category.

function CategorySection({
  category,
  items,
  defaultOpen,
}: {
  category: string
  items: QueueItem[]
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const meta = CATEGORIES[category] ?? { label: category, color: "text-zinc-400", dot: "bg-zinc-400", accent: "border-l-zinc-500/40" }
  const readyCount   = items.filter(i => deriveState(i) === "ready").length
  const blockedCount = items.filter(i => deriveState(i) === "blocked").length

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full text-left rounded-md px-3 py-2 border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
        <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
        <span className={`text-xs font-semibold uppercase tracking-wide ${meta.color}`}>
          {meta.label}
        </span>
        <span className="text-xs text-zinc-600 font-mono ml-auto flex items-center gap-2">
          {readyCount > 0 && (
            <span className="text-emerald-400/70">{readyCount} ready</span>
          )}
          {blockedCount > 0 && (
            <span className="text-orange-400/70 flex items-center gap-0.5">
              <AlertTriangle className="w-3 h-3" />
              {blockedCount}
            </span>
          )}
          <span>{items.length}</span>
        </span>
      </button>

      {open && (
        <div className={`space-y-2 border-l-2 ${meta.accent} ml-1 pl-3`}>
          {/* Ready/actionable items first, then blocked, then parked */}
          {items
            .sort((a, b) => {
              const order: Record<TaskState, number> = { ready: 0, blocked: 1, strategic: 2, parked: 3 }
              return order[deriveState(a)] - order[deriveState(b)]
            })
            .map(item => <QueueCard key={item.id} item={item} />)
          }
        </div>
      )}
    </div>
  )
}

// ─── Priority Section ────────────────────────────────────────────────────────

function PrioritySection({
  priority,
  items,
  defaultOpen,
}: {
  priority: string
  items: QueueItem[]
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const color = PRIORITY_COLORS[priority] ?? ""
  const label = priority.charAt(0).toUpperCase() + priority.slice(1)

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full text-left rounded-md px-3 py-2 border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${color}`}>
          {label}
        </span>
        <span className="text-xs text-zinc-600 font-mono ml-auto">{items.length}</span>
      </button>

      {open && (
        <div className="space-y-2 ml-1 pl-3 border-l-2 border-zinc-700/50">
          {items.map(item => <QueueCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}

// ─── Status Section (by derived state) ───────────────────────────────────────

function StatusSection({
  state,
  items,
  defaultOpen,
}: {
  state: TaskState
  items: QueueItem[]
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const cfg = STATE_CONFIG[state]
  const Icon = cfg.icon

  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 w-full text-left rounded-md px-3 py-2 border transition-colors ${cfg.bgColor} ${cfg.borderColor}`}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
        <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
        <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>
          {cfg.label}
        </span>
        <span className="text-xs text-zinc-600 font-mono ml-auto">{items.length}</span>
      </button>

      {open && (
        <div className={`space-y-2 ml-1 pl-3 border-l-2 ${cfg.borderColor}`}>
          {items.map(item => <QueueCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}

// ─── Completed Section ───────────────────────────────────────────────────────
// UX: Collapsed by default, muted styling. Easy to ignore during triage.

function CompletedSection({ items }: { items: CompletedItem[] }) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full text-left rounded-md px-3 py-2 border border-zinc-800/60 bg-zinc-900/40 hover:bg-zinc-900/60 transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />}
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/50" />
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
          Completed
        </span>
        <span className="text-xs text-zinc-700 font-mono ml-auto">{items.length}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5 ml-1 pl-3 border-l-2 border-zinc-800/40">
          {items.map(item => (
            <div key={item.id} className="rounded-lg border border-zinc-800/40 bg-zinc-900/30 p-3 space-y-1.5 opacity-50 hover:opacity-70 transition-opacity">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-emerald-500/60 shrink-0" />
                <span className="font-mono text-[10px] text-zinc-600">{item.id}</span>
                {item.closed_at && (
                  <span className="text-[10px] text-zinc-700 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {item.closed_at}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 font-medium line-through decoration-zinc-700">{item.title}</p>
              {item.close_note && (
                <p className="text-[10px] text-zinc-600 italic">{item.close_note}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function QueuePanel({ data, operatorData }: { data: QueueData | null; operatorData?: OperatorFeedData | null }) {
  const [viewMode, setViewMode] = useState<ViewMode>("category")

  // Group items by category
  const categoryGroups = useMemo(() => {
    if (!data) return {}
    const catOrder = ["audit", "architecture", "validation", "rebuild", "strategy", "strategy-bank", "trading", "operator", "infrastructure", "docs", "documentation", "dashboard", "llc", "governance", "content", "project"]
    return catOrder.reduce<Record<string, QueueItem[]>>((acc, cat) => {
      const items = data.queued.filter(i => i.category === cat)
      if (items.length > 0) acc[cat] = items
      return acc
    }, {})
  }, [data])

  // Group items by priority
  const priorityGroups = useMemo(() => {
    if (!data) return {}
    const priOrder = ["critical", "high", "medium", "low"]
    return priOrder.reduce<Record<string, QueueItem[]>>((acc, pri) => {
      const items = data.queued.filter(i => (i.priority ?? "low") === pri)
      if (items.length > 0) acc[pri] = items
      return acc
    }, {})
  }, [data])

  // Group items by derived state
  const statusGroups = useMemo(() => {
    if (!data) return {} as Record<TaskState, QueueItem[]>
    const stateOrder: TaskState[] = ["ready", "blocked", "strategic", "parked"]
    return stateOrder.reduce<Record<string, QueueItem[]>>((acc, s) => {
      const items = data.queued.filter(i => deriveState(i) === s)
      if (items.length > 0) acc[s] = items
      return acc
    }, {})
  }, [data])

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400 text-sm">No queue data found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-20 sm:pb-0">
      <Nav active="queue" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Roadmap Control Strip */}
        <RoadmapStrip items={data.queued} />

        {/* View Switcher — sticky on mobile */}
        <ViewSwitcher active={viewMode} onChange={setViewMode} />

        {/* Grouped Sections */}
        <div className="space-y-3">
          {viewMode === "category" &&
            Object.entries(categoryGroups).map(([cat, items]) => (
              <CategorySection
                key={cat}
                category={cat}
                items={items}
                defaultOpen={items.some(i => deriveState(i) === "ready" || deriveState(i) === "blocked")}
              />
            ))
          }

          {viewMode === "priority" &&
            Object.entries(priorityGroups).map(([pri, items]) => (
              <PrioritySection
                key={pri}
                priority={pri}
                items={items}
                defaultOpen={pri === "critical" || pri === "high"}
              />
            ))
          }

          {viewMode === "status" &&
            (["ready", "blocked", "strategic", "parked"] as TaskState[]).map(state =>
              statusGroups[state] ? (
                <StatusSection
                  key={state}
                  state={state}
                  items={statusGroups[state]}
                  defaultOpen={state === "ready" || state === "blocked"}
                />
              ) : null
            )
          }

          {viewMode === "all" &&
            [...data.queued]
              .sort((a, b) => {
                const numA = parseInt(a.id.replace(/\D/g, "") || "0")
                const numB = parseInt(b.id.replace(/\D/g, "") || "0")
                return numB - numA
              })
              .map(item => <QueueCard key={item.id} item={item} />)
          }
        </div>

        {/* Completed — subordinate, collapsed by default */}
        <div className="pt-2">
          <CompletedSection items={data.completed} />
        </div>
      </div>
    </div>
  )
}
