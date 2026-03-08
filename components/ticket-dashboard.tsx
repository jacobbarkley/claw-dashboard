"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertTriangle, ChevronDown, ChevronRight, Clock, Copy, Check, Zap } from "lucide-react"

interface Ticket {
  ticket_id: string
  title: string
  phase?: number
  priority?: string
  severity?: string
  status: string
  created_at?: string
  last_updated?: string
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

const KANBAN_COLUMNS = [
  { status: "READY",               label: "Ready",         color: "text-zinc-400" },
  { status: "IN_WORK",             label: "In Work",       color: "text-blue-400" },
  { status: "EXECUTING",           label: "Executing",     color: "text-blue-400" },
  { status: "VERIFYING",           label: "Verifying",     color: "text-yellow-400" },
  { status: "COMMITTING",          label: "Committing",    color: "text-yellow-400" },
  { status: "UNDER_INVESTIGATION", label: "Investigating", color: "text-orange-400" },
  { status: "RE_TEST",             label: "Re-Test",       color: "text-orange-400" },
]

const CLOSED_STATUSES = new Set(["DONE", "RESOLVED"])

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

function formatDate(iso?: string) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  } catch { return null }
}

const PUSH_COMMAND = "bash /home/jacobbarkley/claude/claw-dashboard/scripts/push-dashboard-data.sh"

function buildEscalationMessage(ticket: Ticket): string {
  const now = new Date().toISOString().slice(0, 19) + "-05:00"
  return `---
id: MSG-XXX
from: Dashboard
sent_at: ${now}
priority: high
status: unread
subject: Escalation — ${ticket.ticket_id}
body: |
  Ticket escalated to Claude from the dashboard.

  ticket_id: ${ticket.ticket_id}
  title: ${ticket.title}
  status: ${ticket.status}
  priority: ${ticket.priority ?? "unknown"}
  severity: ${ticket.severity ?? "unknown"}
  last_updated: ${ticket.last_updated ?? "unknown"}
  tags: ${ticket.tags?.join(", ") ?? "none"}

  Please investigate and update the ticket status.
---`
}

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

function CopyModal({
  title,
  description,
  content,
  onClose,
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

function TicketCard({ ticket }: { ticket: Ticket }) {
  const [escalateState, setEscalateState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [closing, setClosing] = useState(false)
  const isClosed = CLOSED_STATUSES.has(ticket.status)

  async function escalate() {
    setEscalateState("sending")
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
      setEscalateState(res.ok ? "sent" : "error")
      if (res.ok) setTimeout(() => setEscalateState("idle"), 3000)
    } catch {
      setEscalateState("error")
    }
  }

  const escalateLabel =
    escalateState === "sending" ? "sending…" :
    escalateState === "sent"    ? "✓ sent" :
    escalateState === "error"   ? "failed" :
    "→ Claude"

  const escalateColor =
    escalateState === "sent"  ? "text-emerald-400" :
    escalateState === "error" ? "text-red-400" :
    "text-blue-400 hover:text-blue-300"

  return (
    <>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-2 text-sm">
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-xs text-zinc-500">{ticket.ticket_id}</span>
          <div className="flex gap-1 flex-wrap justify-end">
            {ticket.priority && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[ticket.priority] ?? "bg-zinc-700 text-zinc-300"}`}>
                {ticket.priority}
              </span>
            )}
            {ticket.severity && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${SEV_COLORS[ticket.severity] ?? "bg-zinc-700 text-zinc-300"}`}>
                {ticket.severity}
              </span>
            )}
          </div>
        </div>

        <p className="text-zinc-200 leading-snug">{ticket.title}</p>

        {ticket.tags && ticket.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {ticket.tags.map(tag => (
              <span key={tag} className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            {ticket.timebox_minutes && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {ticket.timebox_minutes}m
              </span>
            )}
            {ticket.last_updated && (
              <span>{formatDate(ticket.last_updated)}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!isClosed && (
              <button
                onClick={() => setClosing(true)}
                className="text-[10px] text-emerald-500 hover:text-emerald-400 transition-colors"
              >
                ✓ Close
              </button>
            )}
            <button
              onClick={escalate}
              disabled={escalateState === "sending" || escalateState === "sent"}
              className={`text-[10px] transition-colors disabled:cursor-default ${escalateColor}`}
            >
              {escalateLabel}
            </button>
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

function BlockersPanel({ tickets }: { tickets: Ticket[] }) {
  if (tickets.length === 0) return null
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <span className="text-sm font-semibold text-red-300 uppercase tracking-wide">
          Blockers — {tickets.length}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tickets.map(t => <TicketCard key={t.ticket_id} ticket={t} />)}
      </div>
    </div>
  )
}

function KanbanBoard({ byStatus }: { byStatus: Record<string, Ticket[]> }) {
  const activeColumns = KANBAN_COLUMNS.filter(col => (byStatus[col.status]?.length ?? 0) > 0)

  if (activeColumns.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-zinc-600 text-sm border border-zinc-800 rounded-lg">
        No active tickets
      </div>
    )
  }

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${Math.min(activeColumns.length, 4)}, minmax(0, 1fr))` }}
    >
      {activeColumns.map(col => {
        const tickets = byStatus[col.status] ?? []
        return (
          <div key={col.status} className="space-y-2">
            <div className="flex items-center justify-between pb-1">
              <span className={`text-xs font-semibold uppercase tracking-wide ${col.color}`}>
                {col.label}
              </span>
              <span className="text-xs text-zinc-600 font-mono">{tickets.length}</span>
            </div>
            <div className="space-y-2">
              {tickets.map(t => <TicketCard key={t.ticket_id} ticket={t} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ClosedTickets({ byStatus }: { byStatus: Record<string, Ticket[]> }) {
  const [open, setOpen] = useState(false)
  const closed = Object.entries(byStatus)
    .filter(([k]) => CLOSED_STATUSES.has(k))
    .flatMap(([, v]) => v)
    .sort((a, b) => (b.last_updated ?? "").localeCompare(a.last_updated ?? ""))

  if (closed.length === 0) return null

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Closed — {closed.length}
      </button>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {closed.map(t => <TicketCard key={t.ticket_id} ticket={t} />)}
        </div>
      )}
    </div>
  )
}

function PhaseProgress({ phases }: { phases: PhaseData[] }) {
  return (
    <div className="space-y-3">
      {phases.map(p => (
        <div key={p.phase} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300">
              <span className="text-zinc-500 font-mono mr-2">Phase {p.phase}</span>
              {p.label}
            </span>
            <span className="text-zinc-500 font-mono">{p.done}/{p.total}</span>
          </div>
          <div className="relative h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-all"
              style={{ width: `${p.pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function SummaryCards({ summary }: { summary: TicketData["summary"] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="text-2xl font-bold text-zinc-100">{summary.total}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Total Tickets</div>
        </CardContent>
      </Card>
      <Card className={`border ${summary.blockers > 0 ? "bg-red-950/30 border-red-500/40" : "bg-zinc-900 border-zinc-800"}`}>
        <CardContent className="pt-4 pb-3 px-4">
          <div className={`text-2xl font-bold ${summary.blockers > 0 ? "text-red-400" : "text-zinc-100"}`}>
            {summary.blockers}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">Blockers</div>
        </CardContent>
      </Card>
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="text-2xl font-bold text-blue-400">{summary.active}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Active</div>
        </CardContent>
      </Card>
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="text-2xl font-bold text-emerald-400">{summary.done}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Done</div>
        </CardContent>
      </Card>
    </div>
  )
}

export function TicketDashboard({ data }: { data: TicketData | null }) {
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

  const blockers = data.by_status["BLOCKED"] ?? []
  const activeByStatus = Object.fromEntries(
    Object.entries(data.by_status).filter(([k]) => k !== "BLOCKED" && !CLOSED_STATUSES.has(k))
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-yellow-400" />
          <span className="font-semibold text-zinc-100 tracking-tight">ClawBoy Dashboard</span>
          <Separator orientation="vertical" className="h-4 bg-zinc-700" />
          <span className="text-xs text-zinc-500">Ops &amp; Rebuild Tracker</span>
        </div>
        <div className="text-xs text-zinc-600 font-mono">
          {new Date(data.generated_at).toLocaleString("en-US", {
            month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
          })}
        </div>
      </div>

      <div className="px-6 py-6 space-y-6 max-w-7xl mx-auto">
        <SummaryCards summary={data.summary} />

        {blockers.length > 0 && <BlockersPanel tickets={blockers} />}

        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Active Board</h2>
          <KanbanBoard byStatus={activeByStatus} />
        </div>

        <Separator className="bg-zinc-800" />

        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Rebuild Progress</h2>
          <div className="max-w-lg">
            <PhaseProgress phases={data.phases} />
          </div>
        </div>

        <Separator className="bg-zinc-800" />

        <ClosedTickets byStatus={data.by_status} />
      </div>
    </div>
  )
}
