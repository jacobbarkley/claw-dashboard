"use client"

import { useState, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertTriangle, ChevronDown, ChevronRight, Clock, Copy, Check,
  Zap, Wrench, CircleDot, Timer, CheckCircle2, Ban, User, Bot, HelpCircle,
  Filter,
} from "lucide-react"
import { Nav } from "@/components/nav"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ticket {
  ticket_id: string
  title: string
  phase?: number
  priority?: string
  severity?: string
  status: string
  created_at?: string
  last_updated?: string
  resolved_at?: string
  timebox_minutes?: number
  dependencies?: string[]
  tags?: string[]
  file?: string
}

interface PhaseData {
  phase: number
  label: string
  total: number
  done: number
  pct: number
}

interface TicketData {
  generated_at: string
  summary: {
    total: number
    blockers: number
    active: number
    done: number
  }
  phases: PhaseData[]
  by_status: Record<string, Ticket[]>
  tickets: Ticket[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CLOSED_STATUSES = new Set(["DONE", "RESOLVED"])
const BLOCKED_STATUSES = new Set(["BLOCKED", "BLOCKED_EXTERNAL"])
const HIGH_SEV = new Set(["SEV1", "SEV2"])
const HIGH_PRI = new Set(["P1", "P2"])

const PRIORITY_COLORS: Record<string, string> = {
  P0: "bg-red-500/20 text-red-300 border-red-500/30",
  P1: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  P2: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  P3: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
}

const SEV_COLORS: Record<string, string> = {
  SEV1: "bg-red-500/20 text-red-300 border-red-500/30",
  SEV2: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  SEV3: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  SEV4: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
}

// Phase labels cleaned up — fallback to "Phase N"
const PHASE_LABELS: Record<number, string> = {
  1: "Foundation",
  2: "Trading Core",
  3: "Intelligence",
  4: "Live Gate",
  5: "Expansion",
  6: "New Modules",
}

// ─── Ownership derivation ─────────────────────────────────────────────────────
// UX: Ownership is derived from tags to answer "who owns this?" at a glance
type Ownership = "claude" | "human" | "waiting" | "unassigned"

function deriveOwnership(ticket: Ticket): Ownership {
  if (BLOCKED_STATUSES.has(ticket.status)) return "waiting"
  const tagStr = (ticket.tags ?? []).join(" ").toLowerCase()
  if (/claude|agent|auto/.test(tagStr)) return "claude"
  if (/human|manual|decision/.test(tagStr)) return "human"
  return "unassigned"
}

const OWNERSHIP_CONFIG: Record<Ownership, { label: string; icon: typeof Bot; color: string }> = {
  claude:     { label: "Claude",     icon: Bot,          color: "bg-violet-500/15 text-violet-300 border-violet-500/25" },
  human:      { label: "Human",      icon: User,         color: "bg-amber-500/15 text-amber-300 border-amber-500/25" },
  waiting:    { label: "Waiting",    icon: Timer,         color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25" },
  unassigned: { label: "Unassigned", icon: HelpCircle,   color: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20" },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(iso?: string): number {
  if (!iso) return 0
  try {
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  } catch { return 0 }
}

function formatAge(iso?: string): string {
  const d = daysSince(iso)
  if (d === 0) return "today"
  if (d === 1) return "1d"
  return `${d}d`
}

function formatDate(iso?: string): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  } catch { return null }
}

// UX: Age-based color shift — amber >3d, red >7d — for open tickets only
function ageColor(iso?: string, isClosed?: boolean): string {
  if (isClosed) return "text-zinc-500"
  const d = daysSince(iso)
  if (d >= 7) return "text-red-400"
  if (d >= 3) return "text-amber-400"
  return "text-zinc-500"
}

function formatTimebox(mins?: number): string {
  if (!mins) return ""
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${mins}m`
}

function phaseLabel(phase?: number): string {
  if (!phase) return ""
  return PHASE_LABELS[phase] ?? `Phase ${phase}`
}

// ─── Ticket grouping logic ────────────────────────────────────────────────────
// UX: Groups answer "what state is this in?" not "what kanban column?"

type GroupKey = "attention" | "in_progress" | "ready" | "waiting" | "closed"

interface TicketGroup {
  key: GroupKey
  label: string
  icon: typeof AlertTriangle
  color: string
  headerColor: string
  tickets: Ticket[]
}

const IN_PROGRESS_STATUSES = new Set(["IN_WORK", "EXECUTING", "VERIFYING", "COMMITTING", "UNDER_INVESTIGATION", "RE_TEST"])

function groupTickets(tickets: Ticket[]): TicketGroup[] {
  const now = Date.now()
  const sevenDaysAgo = now - 7 * 86_400_000

  const attention: Ticket[] = []
  const inProgress: Ticket[] = []
  const ready: Ticket[] = []
  const waiting: Ticket[] = []
  const closed: Ticket[] = []

  for (const t of tickets) {
    if (CLOSED_STATUSES.has(t.status)) {
      // Only show tickets closed in last 7 days
      const resolved = t.resolved_at ?? t.last_updated
      if (resolved && new Date(resolved).getTime() >= sevenDaysAgo) {
        closed.push(t)
      }
      continue
    }

    if (BLOCKED_STATUSES.has(t.status)) {
      waiting.push(t)
      continue
    }

    if (IN_PROGRESS_STATUSES.has(t.status)) {
      inProgress.push(t)
      continue
    }

    // OPEN/READY — check if it needs attention (high sev/pri)
    const isHighSev = HIGH_SEV.has(t.severity ?? "")
    const isHighPri = HIGH_PRI.has(t.priority ?? "")
    if (isHighSev || isHighPri) {
      attention.push(t)
    } else {
      ready.push(t)
    }
  }

  // Sort: highest severity first, then priority, then oldest
  const urgencySort = (a: Ticket, b: Ticket) => {
    const sevOrder = (s?: string) => ({ SEV1: 0, SEV2: 1, SEV3: 2, SEV4: 3 }[s ?? ""] ?? 4)
    const priOrder = (p?: string) => ({ P0: 0, P1: 1, P2: 2, P3: 3 }[p ?? ""] ?? 4)
    const sd = sevOrder(a.severity) - sevOrder(b.severity)
    if (sd !== 0) return sd
    const pd = priOrder(a.priority) - priOrder(b.priority)
    if (pd !== 0) return pd
    return (a.created_at ?? "").localeCompare(b.created_at ?? "")
  }

  attention.sort(urgencySort)
  inProgress.sort(urgencySort)
  ready.sort(urgencySort)
  waiting.sort(urgencySort)
  closed.sort((a, b) => (b.last_updated ?? "").localeCompare(a.last_updated ?? ""))

  return [
    { key: "attention",   label: "Needs Attention", icon: AlertTriangle, color: "text-red-400",     headerColor: "border-red-500/30 bg-red-500/5",     tickets: attention },
    { key: "in_progress", label: "In Progress",     icon: Wrench,        color: "text-blue-400",    headerColor: "border-blue-500/30 bg-blue-500/5",    tickets: inProgress },
    { key: "ready",       label: "Ready / Queued",  icon: CircleDot,     color: "text-zinc-400",    headerColor: "border-zinc-700 bg-zinc-500/5",       tickets: ready },
    { key: "waiting",     label: "Waiting / Blocked",icon: Ban,          color: "text-amber-400",   headerColor: "border-amber-500/30 bg-amber-500/5",  tickets: waiting },
    { key: "closed",      label: "Closed Recently", icon: CheckCircle2,  color: "text-emerald-400", headerColor: "border-emerald-500/20 bg-emerald-500/5", tickets: closed },
  ]
}

// ─── Ops Cockpit metrics ──────────────────────────────────────────────────────

interface OpsMetrics {
  needsAttention: number
  activeRepairs: number
  waitingOnHuman: number
  blockers: number
  closedThisWeek: number
  pipelineImpacting: number
  agingCritical: number
}

function computeOpsMetrics(tickets: Ticket[]): OpsMetrics {
  const now = Date.now()
  const sevenDaysAgo = now - 7 * 86_400_000

  let needsAttention = 0
  let activeRepairs = 0
  let waitingOnHuman = 0
  let blockers = 0
  let closedThisWeek = 0
  let pipelineImpacting = 0
  let agingCritical = 0

  for (const t of tickets) {
    const isClosed = CLOSED_STATUSES.has(t.status)
    const isBlocked = BLOCKED_STATUSES.has(t.status)
    const isInProgress = IN_PROGRESS_STATUSES.has(t.status)
    const isHighSev = HIGH_SEV.has(t.severity ?? "")
    const isHighPri = HIGH_PRI.has(t.priority ?? "")

    if (isClosed) {
      const resolved = t.resolved_at ?? t.last_updated
      if (resolved && new Date(resolved).getTime() >= sevenDaysAgo) closedThisWeek++
      continue
    }

    if (!isClosed && (isHighSev || isHighPri)) needsAttention++
    if (isInProgress) activeRepairs++
    if (isBlocked) { blockers++; waitingOnHuman++ }
    if (deriveOwnership(t) === "human") waitingOnHuman++

    const tagStr = (t.tags ?? []).join(" ").toLowerCase()
    if (/pipeline|trading/.test(tagStr)) pipelineImpacting++

    if (!isClosed && isHighSev && daysSince(t.created_at) > 5) agingCritical++
  }

  return { needsAttention, activeRepairs, waitingOnHuman, blockers, closedThisWeek, pipelineImpacting, agingCritical }
}

// ─── Escalation / Close helpers (preserved from original) ─────────────────────

const PUSH_COMMAND = "bash /home/jacobbarkley/claude/claw-dashboard/scripts/push-dashboard-data.sh"

function buildCloseCommand(ticket: Ticket): string {
  const today = new Date().toISOString().slice(0, 10)
  return `# Close ${ticket.ticket_id}
# Edit the ticket file, then run the push script:

TICKET_FILE=~/claude/OpenClaw-s-Brain/System/Design-Backlog/rebuild-tickets/${ticket.file ?? ticket.ticket_id + ".md"}

# Update status to RESOLVED and last_updated to today:
sed -i 's/^status: .*/status: RESOLVED/' "$TICKET_FILE"
sed -i 's/^last_updated: .*/last_updated: ${today}T00:00:00-05:00/' "$TICKET_FILE"

# Push to dashboard:
${PUSH_COMMAND}`
}

// ─── Copy Modal ───────────────────────────────────────────────────────────────

function CopyModal({
  title,
  description,
  content,
}: {
  title: string
  description: string
  content: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <DialogContent className="bg-zinc-900 border-zinc-700 max-w-xl">
      <DialogHeader>
        <DialogTitle className="text-zinc-100 text-sm font-semibold">{title}</DialogTitle>
      </DialogHeader>
      <p className="text-xs text-zinc-400">{description}</p>
      <pre className="text-xs bg-zinc-950 border border-zinc-800 rounded p-3 overflow-auto max-h-64 text-zinc-300 whitespace-pre-wrap">
        {content}
      </pre>
      <button
        onClick={copy}
        className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? "Copied!" : "Copy to clipboard"}
      </button>
    </DialogContent>
  )
}

// ─── Ownership Pill ───────────────────────────────────────────────────────────

function OwnershipPill({ ownership }: { ownership: Ownership }) {
  const cfg = OWNERSHIP_CONFIG[ownership]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${cfg.color}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  )
}

// ─── Ticket Card (redesigned) ─────────────────────────────────────────────────
// UX: Title is the hero. Top row: ID + badges + ownership. Footer: age, phase, timebox, action.
// Mobile: collapsed by default — only ID + title + severity visible.

function TicketCard({ ticket, defaultExpanded }: { ticket: Ticket; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false)
  const [escalateState, setEscalateState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [escalateError, setEscalateError] = useState("")
  const [closing, setClosing] = useState(false)

  const isClosed = CLOSED_STATUSES.has(ticket.status)
  const ownership = deriveOwnership(ticket)
  const age = daysSince(ticket.created_at)
  const ageCls = ageColor(ticket.created_at, isClosed)

  // Tag display: max 2 visible, rest collapsed
  const visibleTags = (ticket.tags ?? []).slice(0, 2)
  const hiddenCount = Math.max(0, (ticket.tags ?? []).length - 2)

  async function escalate() {
    setEscalateState("sending")
    setEscalateError("")
    try {
      const res = await fetch("/api/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_id: ticket.ticket_id,
          title: ticket.title,
          status: ticket.status,
          priority: ticket.priority,
          severity: ticket.severity,
          last_updated: ticket.last_updated,
          tags: ticket.tags,
        }),
      })
      if (res.ok) {
        setEscalateState("sent")
        setTimeout(() => setEscalateState("idle"), 3000)
      } else {
        const data = await res.json().catch(() => ({}))
        setEscalateError(`${data.status ?? res.status}: ${data.detail ?? data.error ?? "unknown"}`)
        setEscalateState("error")
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "network error"
      setEscalateError(msg)
      setEscalateState("error")
    }
  }

  const escalateLabel =
    escalateState === "sending" ? "sending..." :
    escalateState === "sent"    ? "sent" :
    escalateState === "error"   ? "failed" :
    "Escalate"

  const escalateColor =
    escalateState === "sent"  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
    escalateState === "error" ? "bg-red-500/15 text-red-400 border-red-500/30" :
    "bg-blue-500/10 text-blue-400 border-blue-500/25 hover:bg-blue-500/20"

  // Mobile: collapsed = just a compact row
  return (
    <>
      <div
        className={`rounded-xl border transition-colors ${
          isClosed
            ? "border-zinc-800/60"
            : age >= 7
              ? "border-red-500/15"
              : age >= 3
                ? "border-amber-500/10"
                : "border-zinc-800"
        }`}
        style={{
          background: isClosed
            ? "linear-gradient(180deg, rgba(24,24,27,0.7), rgba(9,9,11,0.7))"
            : age >= 7
              ? "radial-gradient(circle at top left, rgba(239,68,68,0.10), transparent 40%), radial-gradient(circle at bottom right, rgba(79,70,229,0.06), transparent 40%), linear-gradient(180deg, rgba(24,24,27,0.95), rgba(9,9,11,0.95))"
              : age >= 3
                ? "radial-gradient(circle at top left, rgba(245,158,11,0.08), transparent 40%), radial-gradient(circle at bottom right, rgba(79,70,229,0.06), transparent 40%), linear-gradient(180deg, rgba(24,24,27,0.95), rgba(9,9,11,0.95))"
                : "radial-gradient(circle at top left, rgba(34,197,94,0.08), transparent 40%), radial-gradient(circle at bottom right, rgba(79,70,229,0.06), transparent 40%), linear-gradient(180deg, rgba(24,24,27,0.95), rgba(9,9,11,0.95))"
        }}
      >
        {/* Collapsed header — always visible, tappable on mobile */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full text-left p-3 sm:p-3.5 flex items-start gap-2 sm:cursor-default"
        >
          {/* Expand chevron — mobile only */}
          <span className="sm:hidden mt-0.5 text-zinc-600 shrink-0">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>

          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Top row: ID + badges + ownership */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[10px] text-zinc-500 shrink-0">{ticket.ticket_id}</span>
              {ticket.severity && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${SEV_COLORS[ticket.severity] ?? "bg-zinc-700 text-zinc-300"}`}>
                  {ticket.severity}
                </span>
              )}
              {ticket.priority && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[ticket.priority] ?? "bg-zinc-700 text-zinc-300"}`}>
                  {ticket.priority}
                </span>
              )}
              <OwnershipPill ownership={ownership} />
            </div>

            {/* Hero: title */}
            <p className={`text-[13px] sm:text-sm leading-snug font-medium ${isClosed ? "text-zinc-400 line-through decoration-zinc-700" : "text-zinc-100"}`}>
              {ticket.title}
            </p>
          </div>
        </button>

        {/* Expanded content — always visible on desktop, toggle on mobile */}
        <div className={`${expanded ? "block" : "hidden"} sm:block px-3 sm:px-3.5 pb-3 sm:pb-3.5 space-y-2.5`}>
          {/* Tags — max 2 visible */}
          {visibleTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pl-5 sm:pl-0">
              {visibleTags.map(tag => (
                <span key={tag} className="text-[10px] bg-zinc-800/80 text-zinc-500 px-1.5 py-0.5 rounded">
                  {tag}
                </span>
              ))}
              {hiddenCount > 0 && (
                <span className="text-[10px] text-zinc-600 px-1 py-0.5">
                  +{hiddenCount}
                </span>
              )}
            </div>
          )}

          {/* Footer: age · phase · timebox · actions */}
          <div className="flex items-center justify-between gap-2 pl-5 sm:pl-0 pt-0.5">
            <div className="flex items-center gap-2.5 text-[11px]">
              {ticket.created_at && (
                <span className={`flex items-center gap-1 ${ageCls}`}>
                  <Clock className="w-3 h-3" />
                  {formatAge(ticket.created_at)}
                </span>
              )}
              {ticket.phase && (
                <span className="text-zinc-500">{phaseLabel(ticket.phase)}</span>
              )}
              {ticket.timebox_minutes && (
                <span className="text-zinc-600 font-mono">{formatTimebox(ticket.timebox_minutes)}</span>
              )}
            </div>

            {/* Action buttons — structured controls */}
            {!isClosed && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); setClosing(true) }}
                  className="text-[10px] font-medium px-2 py-1 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); escalate() }}
                  disabled={escalateState === "sending" || escalateState === "sent"}
                  className={`text-[10px] font-medium px-2 py-1 rounded border transition-colors disabled:opacity-60 ${escalateColor}`}
                  title={escalateError || undefined}
                >
                  {escalateLabel}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={closing} onOpenChange={setClosing}>
        <CopyModal
          title={`Close ${ticket.ticket_id}`}
          description="Run this in your WSL terminal to mark the ticket resolved and update the dashboard."
          content={buildCloseCommand(ticket)}
          onClose={() => setClosing(false)}
        />
      </Dialog>
    </>
  )
}

// ─── Ops Cockpit ──────────────────────────────────────────────────────────────
// UX: Unequal weights — most urgent metric is largest. Feels like an ops console.

function OpsCockpit({ metrics, totalTickets }: { metrics: OpsMetrics; totalTickets: number }) {
  const hasUrgent = metrics.needsAttention > 0 || metrics.blockers > 0

  return (
    <div className="space-y-3">
      {/* Primary row: needs-attention (hero-sized) + blockers */}
      <div className={`grid gap-3 ${hasUrgent ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4"}`}>
        {/* Needs Attention — hero metric */}
        <Card className={`border col-span-2 sm:col-span-1 ${
          metrics.needsAttention > 0
            ? "bg-red-950/30 border-red-500/30"
            : "bg-zinc-900 border-zinc-800"
        }`}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className={`text-3xl sm:text-4xl font-bold tabular-nums ${
              metrics.needsAttention > 0 ? "text-red-400" : "text-zinc-300"
            }`}>
              {metrics.needsAttention}
            </div>
            <div className="text-[11px] text-zinc-500 mt-1 uppercase tracking-wide font-medium flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              Needs Attention
            </div>
          </CardContent>
        </Card>

        {/* Blockers */}
        <Card className={`border ${
          metrics.blockers > 0
            ? "bg-amber-950/20 border-amber-500/25"
            : "bg-zinc-900 border-zinc-800"
        }`}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className={`text-2xl font-bold tabular-nums ${
              metrics.blockers > 0 ? "text-amber-400" : "text-zinc-300"
            }`}>
              {metrics.blockers}
            </div>
            <div className="text-[11px] text-zinc-500 mt-1 uppercase tracking-wide font-medium flex items-center gap-1.5">
              <Ban className="w-3 h-3" />
              Blocked
            </div>
          </CardContent>
        </Card>

        {/* Active Repairs */}
        <Card className="border-zinc-800" style={{ background: "radial-gradient(circle at top left, rgba(59,130,246,0.10), transparent 40%), radial-gradient(circle at bottom right, rgba(79,70,229,0.06), transparent 40%), linear-gradient(180deg, rgba(24,24,27,0.95), rgba(9,9,11,0.95))" }}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-blue-400 tabular-nums">{metrics.activeRepairs}</div>
            <div className="text-[11px] text-zinc-500 mt-1 uppercase tracking-wide font-medium flex items-center gap-1.5">
              <Wrench className="w-3 h-3" />
              In Progress
            </div>
          </CardContent>
        </Card>

        {/* Closed This Week */}
        <Card className="border-zinc-800" style={{ background: "radial-gradient(circle at top left, rgba(34,197,94,0.10), transparent 40%), radial-gradient(circle at bottom right, rgba(79,70,229,0.06), transparent 40%), linear-gradient(180deg, rgba(24,24,27,0.95), rgba(9,9,11,0.95))" }}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-emerald-400 tabular-nums">{metrics.closedThisWeek}</div>
            <div className="text-[11px] text-zinc-500 mt-1 uppercase tracking-wide font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" />
              Closed 7d
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary row: pipeline-impacting + aging + total */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-zinc-800 px-3 py-2.5 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wide font-medium">Pipeline</span>
          <span className={`text-sm font-bold tabular-nums ${metrics.pipelineImpacting > 0 ? "text-orange-400" : "text-zinc-400"}`}>
            {metrics.pipelineImpacting}
          </span>
        </div>
        <div className="rounded-lg border border-zinc-800 px-3 py-2.5 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wide font-medium">Aging</span>
          <span className={`text-sm font-bold tabular-nums ${metrics.agingCritical > 0 ? "text-red-400" : "text-zinc-400"}`}>
            {metrics.agingCritical}
          </span>
        </div>
        <div className="rounded-lg border border-zinc-800 px-3 py-2.5 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wide font-medium">Total</span>
          <span className="text-sm font-bold text-zinc-300 tabular-nums">{totalTickets}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Phase Progress (sidebar on desktop, collapsible on mobile) ───────────────
// UX: Each phase clickable → sets phase filter. Integrated into ops story.

function PhaseProgress({
  phases,
  activePhase,
  onPhaseClick,
}: {
  phases: PhaseData[]
  activePhase: number | null
  onPhaseClick: (phase: number | null) => void
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const totalDone = phases.reduce((s, p) => s + p.done, 0)
  const totalAll = phases.reduce((s, p) => s + p.total, 0)
  const overallPct = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0

  const content = (
    <div className="space-y-3">
      {/* Overall progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-400 font-medium uppercase tracking-wide">Overall</span>
          <span className="text-xs text-zinc-500 font-mono">{overallPct}%</span>
        </div>
        <div className="relative h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-all"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      {/* Per-phase */}
      {phases.map(p => {
        const isActive = activePhase === p.phase
        return (
          <button
            key={p.phase}
            onClick={() => onPhaseClick(isActive ? null : p.phase)}
            className={`w-full text-left space-y-1.5 rounded-md px-2 py-1.5 -mx-2 transition-colors ${
              isActive ? "bg-zinc-800/80" : "hover:bg-zinc-800/40"
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className={`${isActive ? "text-zinc-100" : "text-zinc-400"} transition-colors`}>
                {PHASE_LABELS[p.phase] ?? p.label}
              </span>
              <span className="text-zinc-500 font-mono text-[11px]">{p.done}/{p.total}</span>
            </div>
            <div className="relative h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                  p.pct === 100 ? "bg-emerald-500" : p.pct > 0 ? "bg-blue-500" : "bg-zinc-700"
                }`}
                style={{ width: `${p.pct}%` }}
              />
            </div>
          </button>
        )
      })}

      {activePhase !== null && (
        <button
          onClick={() => onPhaseClick(null)}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-wide"
        >
          Clear filter
        </button>
      )}
    </div>
  )

  return (
    <>
      {/* Desktop: always visible sidebar block */}
      <div className="hidden lg:block">
        <div className="sticky top-20 space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
            <Zap className="w-3 h-3" style={{ color: "#e8c84a" }} />
            Rebuild Progress
          </h3>
          {content}
        </div>
      </div>

      {/* Mobile: collapsible */}
      <div className="lg:hidden">
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="flex items-center gap-2 w-full text-left py-2"
        >
          {mobileOpen ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
          <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Rebuild Progress
          </span>
          <span className="text-[11px] text-zinc-600 font-mono ml-auto">{overallPct}%</span>
        </button>
        {mobileOpen && <div className="pb-3">{content}</div>}
      </div>
    </>
  )
}

// ─── Ticket Group Section ─────────────────────────────────────────────────────

function TicketGroupSection({
  group,
  defaultOpen,
}: {
  group: TicketGroup
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const Icon = group.icon

  if (group.tickets.length === 0) return null

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 w-full text-left rounded-md px-3 py-2 border transition-colors ${group.headerColor}`}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
        <Icon className={`w-3.5 h-3.5 ${group.color}`} />
        <span className={`text-xs font-semibold uppercase tracking-wide ${group.color}`}>
          {group.label}
        </span>
        <span className="text-xs text-zinc-600 font-mono ml-auto">{group.tickets.length}</span>
      </button>

      {open && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {group.tickets.map(t => (
            <TicketCard
              key={t.ticket_id}
              ticket={t}
              defaultExpanded={group.key === "attention"}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Filter Tabs ──────────────────────────────────────────────────────────────
// UX: Sticky on mobile for fast scanning between groups

type FilterTab = "all" | Ownership

function FilterBar({
  active,
  onChange,
  counts,
}: {
  active: FilterTab
  onChange: (tab: FilterTab) => void
  counts: Record<FilterTab, number>
}) {
  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all",        label: "All" },
    { key: "claude",     label: "Claude" },
    { key: "human",      label: "Human" },
    { key: "waiting",    label: "Waiting" },
    { key: "unassigned", label: "Unassigned" },
  ]

  return (
    <div className="sticky top-[53px] z-30 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800/50 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 flex items-center gap-1 overflow-x-auto scrollbar-none">
      <Filter className="w-3.5 h-3.5 text-zinc-600 shrink-0 mr-1" />
      {tabs.map(tab => {
        const isActive = active === tab.key
        const count = counts[tab.key]
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
              isActive
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}
          >
            {tab.label}
            {count > 0 && (
              <span className={`ml-1 font-mono ${isActive ? "text-zinc-400" : "text-zinc-600"}`}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function TicketDashboard({ data }: { data: TicketData | null }) {
  const [ownerFilter, setOwnerFilter] = useState<FilterTab>("all")
  const [phaseFilter, setPhaseFilter] = useState<number | null>(null)

  // Apply filters
  const filteredTickets = useMemo(() => {
    if (!data) return []
    let tickets = data.tickets

    if (phaseFilter !== null) {
      tickets = tickets.filter(t => t.phase === phaseFilter)
    }

    if (ownerFilter !== "all") {
      tickets = tickets.filter(t => deriveOwnership(t) === ownerFilter)
    }

    return tickets
  }, [data, ownerFilter, phaseFilter])

  // Groups from filtered tickets
  const groups = useMemo(() => groupTickets(filteredTickets), [filteredTickets])

  // Metrics from ALL tickets (unfiltered)
  const metrics = useMemo(() => data ? computeOpsMetrics(data.tickets) : null, [data])

  // Ownership counts for filter bar (unfiltered, excluding closed)
  const ownerCounts = useMemo(() => {
    if (!data) return { all: 0, claude: 0, human: 0, waiting: 0, unassigned: 0 }
    const open = data.tickets.filter(t => !CLOSED_STATUSES.has(t.status))
    const counts: Record<FilterTab, number> = { all: open.length, claude: 0, human: 0, waiting: 0, unassigned: 0 }
    for (const t of open) {
      const o = deriveOwnership(t)
      counts[o]++
    }
    return counts
  }, [data])

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-zinc-400 text-lg">No ticket data found</div>
          <div className="text-zinc-600 text-sm font-mono">python3 scripts/parse-tickets.py</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-20 sm:pb-0">
      <Nav active="dashboard" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Ops Cockpit */}
        {metrics && <OpsCockpit metrics={metrics} totalTickets={data.summary.total} />}

        {/* Filter bar — sticky on mobile */}
        <FilterBar active={ownerFilter} onChange={setOwnerFilter} counts={ownerCounts} />

        {/* Main content: tickets + phase sidebar */}
        <div className="flex gap-6">
          {/* Ticket groups — main column */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Phase filter indicator */}
            {phaseFilter !== null && (
              <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-900/80 rounded-md px-3 py-1.5 border border-zinc-800">
                <span>Filtering: <strong className="text-zinc-200">{PHASE_LABELS[phaseFilter] ?? `Phase ${phaseFilter}`}</strong></span>
                <button onClick={() => setPhaseFilter(null)} className="text-zinc-500 hover:text-zinc-300 ml-auto">&times;</button>
              </div>
            )}

            {/* Mobile: phase progress (collapsible) */}
            <PhaseProgress
              phases={data.phases}
              activePhase={phaseFilter}
              onPhaseClick={setPhaseFilter}
            />

            {/* Grouped ticket sections */}
            {groups.map(g => (
              <TicketGroupSection
                key={g.key}
                group={g}
                defaultOpen={g.key !== "closed"}
              />
            ))}

            {/* Empty state when filters produce nothing */}
            {groups.every(g => g.tickets.length === 0) && (
              <div className="flex items-center justify-center h-32 text-zinc-600 text-sm border border-zinc-800 rounded-lg">
                No tickets match current filters
              </div>
            )}
          </div>

          {/* Desktop sidebar: phase progress */}
          <div className="hidden lg:block w-56 shrink-0">
            <PhaseProgress
              phases={data.phases}
              activePhase={phaseFilter}
              onPhaseClick={setPhaseFilter}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
