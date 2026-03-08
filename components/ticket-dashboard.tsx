"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { AlertTriangle, CheckCircle2, Circle, Clock, ExternalLink, Zap } from "lucide-react"

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
  { status: "READY",               label: "Ready",       color: "text-zinc-400" },
  { status: "IN_WORK",             label: "In Work",     color: "text-blue-400" },
  { status: "EXECUTING",           label: "Executing",   color: "text-blue-400" },
  { status: "VERIFYING",           label: "Verifying",   color: "text-yellow-400" },
  { status: "COMMITTING",          label: "Committing",  color: "text-yellow-400" },
  { status: "UNDER_INVESTIGATION", label: "Investigating", color: "text-orange-400" },
  { status: "RE_TEST",             label: "Re-Test",     color: "text-orange-400" },
  { status: "DONE",                label: "Done",        color: "text-emerald-400" },
  { status: "RESOLVED",            label: "Resolved",    color: "text-emerald-400" },
]

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

function TicketCard({ ticket }: { ticket: Ticket }) {
  const escalateToClaudeUrl = `/api/escalate-claude?ticket=${ticket.ticket_id}`

  return (
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
        <a
          href={escalateToClaudeUrl}
          className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
          title="Escalate to Claude"
        >
          <ExternalLink className="w-3 h-3" />
          Claude
        </a>
      </div>
    </div>
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
        {tickets.map(t => (
          <TicketCard key={t.ticket_id} ticket={t} />
        ))}
      </div>
    </div>
  )
}

function KanbanBoard({ byStatus }: { byStatus: Record<string, Ticket[]> }) {
  const activeColumns = KANBAN_COLUMNS.filter(col => (byStatus[col.status]?.length ?? 0) > 0)

  if (activeColumns.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">
        No active tickets
      </div>
    )
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(activeColumns.length, 4)}, minmax(0, 1fr))` }}>
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
            <span className="text-zinc-500 font-mono">
              {p.done}/{p.total}
            </span>
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
          <div className="text-zinc-600 text-sm">Run <code className="bg-zinc-800 px-1 rounded">python3 scripts/parse-tickets.py</code> to generate data</div>
        </div>
      </div>
    )
  }

  const blockers = data.by_status["BLOCKED"] ?? []
  const nonBlockerByStatus = Object.fromEntries(
    Object.entries(data.by_status).filter(([k]) => k !== "BLOCKED")
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
        {/* Summary cards */}
        <SummaryCards summary={data.summary} />

        {/* Blockers — always top if any */}
        {blockers.length > 0 && <BlockersPanel tickets={blockers} />}

        {/* Kanban */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Active Board
          </h2>
          <KanbanBoard byStatus={nonBlockerByStatus} />
        </div>

        <Separator className="bg-zinc-800" />

        {/* Phase progress */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Rebuild Progress
          </h2>
          <div className="max-w-lg">
            <PhaseProgress phases={data.phases} />
          </div>
        </div>
      </div>
    </div>
  )
}
