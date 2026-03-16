"use client"

import { useState, useCallback, useMemo } from "react"
import {
  ReactFlow, Node, Edge, Background, Controls,
  Handle, Position, NodeProps, useNodesState,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { AGENTS, GROUP_COLORS, MODEL_COLORS, Agent } from "@/components/agent-data"
import {
  Search, ChevronDown, ChevronUp, Clock, FileInput, FileOutput,
  Power, X, List, GitBranch, Cpu, Layers,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
type ViewMode = "overview" | "map" | "agents" | "models"

// ─── Stage definitions ────────────────────────────────────────────────────────
const STAGES = [
  {
    id: "research",
    name: "Research & Analysis",
    groups: ["research"],
    purpose: "Market scanning, thesis formation, strategy generation",
    keyOutput: "strategy_spec.json",
    timeWindow: "07:35–08:01",
  },
  {
    id: "risk",
    name: "Risk & Approval",
    groups: ["risk"],
    purpose: "Per-trade evaluation, pipeline health audit, final authorization",
    keyOutput: "risk_decision.json",
    timeWindow: "08:08–08:20",
  },
  {
    id: "options",
    name: "Options · Active Trades",
    groups: ["options", "bps"],
    purpose: "Options screening, position selection, order execution",
    keyOutput: "bps_execution_log.json",
    timeWindow: "08:25–09:40",
  },
  {
    id: "execution",
    name: "Execution",
    groups: ["execution"],
    purpose: "Order routing, intraday monitoring, EOD position decisions",
    keyOutput: "eod_decision.json",
    timeWindow: "08:32–15:30",
  },
  {
    id: "audit",
    name: "Audit & Governance",
    groups: ["audit"],
    purpose: "End-of-day reconciliation, compliance, next-day gate",
    keyOutput: "session_close.json",
    timeWindow: "16:05–16:20",
  },
] as const

// ─── Cross-handoff edges (used for focus mode + map) ──────────────────────────
const CROSS_HANDOFFS: [string, string][] = [
  ["07",  "08"],
  ["08b", "bps-pm"],
  ["08b", "19"],
  ["21",  "11"],
  ["19",  "11"],
  ["14",  "15"],
]

function getNeighborIds(agentId: string): Set<string> {
  const agent = AGENTS.find(a => a.id === agentId)
  if (!agent) return new Set()
  const neighbors = new Set(AGENTS.filter(a => a.group === agent.group).map(a => a.id))
  for (const [src, tgt] of CROSS_HANDOFFS) {
    if (src === agentId) neighbors.add(tgt)
    if (tgt === agentId) neighbors.add(src)
  }
  // Always include self
  neighbors.add(agentId)
  return neighbors
}

// ─── Shared: Agent Detail Panel ───────────────────────────────────────────────
function AgentDetailPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const colors = GROUP_COLORS[agent.group]
  const modelStyle = MODEL_COLORS[agent.model]
  const isDisabled = agent.status === "disabled"

  const upstream = CROSS_HANDOFFS
    .filter(([, tgt]) => tgt === agent.id)
    .map(([src]) => AGENTS.find(a => a.id === src)?.shortName)
    .filter(Boolean) as string[]
  const downstream = CROSS_HANDOFFS
    .filter(([src]) => src === agent.id)
    .map(([, tgt]) => AGENTS.find(a => a.id === tgt)?.shortName)
    .filter(Boolean) as string[]

  return (
    <div className="flex flex-col w-72 sm:w-80 flex-shrink-0 bg-zinc-900 border-l border-zinc-800 overflow-hidden z-20">
      {/* Header */}
      <div className={`px-4 py-3 border-b border-zinc-800 flex items-start justify-between gap-3 ${isDisabled ? "bg-zinc-950" : colors.bg}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={`text-[10px] font-mono font-bold ${isDisabled ? "text-zinc-600" : colors.text}`}>{agent.label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${isDisabled ? "border-zinc-700 text-zinc-500" : `${colors.border} ${colors.text}`}`}>
              {colors.label}
            </span>
            {isDisabled && (
              <span className="text-[9px] text-zinc-500 flex items-center gap-0.5">
                <Power className="w-2.5 h-2.5" /> OFF
              </span>
            )}
          </div>
          <div className={`text-sm font-semibold truncate ${isDisabled ? "text-zinc-500" : "text-zinc-100"}`}>{agent.shortName}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-[10px] flex items-center gap-0.5 ${isDisabled ? "text-zinc-600" : "text-zinc-400"}`}>
              <Clock className="w-2.5 h-2.5" /> {agent.time}
            </span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${isDisabled ? "border-zinc-800 text-zinc-700" : `${modelStyle.border} ${modelStyle.text}`}`}>
              {agent.model}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 mt-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">What it does</div>
          <p className={`text-[13px] leading-relaxed ${isDisabled ? "text-zinc-600" : "text-zinc-300"}`}>{agent.description}</p>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 flex items-center gap-1">
            <FileInput className="w-3 h-3" /> Inputs
          </div>
          <ul className="space-y-1">
            {agent.inputs.map((inp, i) => (
              <li key={i} className={`text-[11px] font-mono rounded px-2 py-1 ${isDisabled ? "bg-zinc-900 text-zinc-600" : "bg-zinc-800 text-zinc-400"}`}>{inp}</li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 flex items-center gap-1">
            <FileOutput className="w-3 h-3" /> Output
          </div>
          <div className={`text-[11px] font-mono rounded px-2 py-1 ${isDisabled ? "bg-zinc-900 text-zinc-600" : "bg-zinc-800 text-emerald-300"}`}>{agent.output}</div>
        </div>

        {(upstream.length > 0 || downstream.length > 0) && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Cross-stage links</div>
            {upstream.length > 0 && (
              <div className="text-[11px] text-zinc-500 mb-1">
                ← receives from <span className="text-zinc-300">{upstream.join(", ")}</span>
              </div>
            )}
            {downstream.length > 0 && (
              <div className="text-[11px] text-zinc-500">
                → hands off to <span className="text-zinc-300">{downstream.join(", ")}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Mission Control Strip ─────────────────────────────────────────────────────
const VIEW_TABS: { id: ViewMode; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview",  Icon: Layers    },
  { id: "map",      label: "Full Map",  Icon: GitBranch },
  { id: "agents",   label: "Agents",    Icon: List      },
  { id: "models",   label: "Models",    Icon: Cpu       },
]

function MissionControlStrip({ view, onViewChange }: { view: ViewMode; onViewChange: (v: ViewMode) => void }) {
  const total    = AGENTS.length
  const active   = AGENTS.filter(a => a.status !== "disabled").length
  const disabled = AGENTS.filter(a => a.status === "disabled").length

  return (
    <div className="bg-zinc-950 border-b border-zinc-800 flex-shrink-0">
      {/* Stats row */}
      <div className="px-4 sm:px-6 py-2 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
          <span className="text-[11px] text-zinc-300 font-medium">{active} active</span>
        </div>
        {disabled > 0 && (
          <span className="text-[11px] text-zinc-600 flex items-center gap-1">
            <Power className="w-2.5 h-2.5" /> {disabled} disabled
          </span>
        )}
        <span className="text-zinc-700 text-[11px]">·</span>
        <span className="text-[11px] text-zinc-600">{total} agents</span>
        <div className="ml-auto flex items-center gap-1.5">
          {(["Opus","Sonnet","Haiku","Script"] as const).map(m => {
            const count = AGENTS.filter(a => a.model === m && a.status !== "disabled").length
            if (!count) return null
            return (
              <span key={m} className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${MODEL_COLORS[m].text} ${MODEL_COLORS[m].border}`}>
                {m} ×{count}
              </span>
            )
          })}
        </div>
      </div>

      {/* View tab row */}
      <div className="px-4 sm:px-6 flex border-t border-zinc-900">
        {VIEW_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 -mb-px transition-colors ${
              view === id
                ? "border-violet-500 text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Icon className="w-3 h-3" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center pb-1" style={{ fontSize: 10, color: "#3f3f46" }}>
          PAPER · OpenClaw
        </div>
      </div>
    </div>
  )
}

// ─── Overview / Stages view ───────────────────────────────────────────────────
function StageCard({
  stage,
  onSelectAgent,
}: {
  stage: typeof STAGES[number]
  onSelectAgent: (a: Agent) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const stageAgents = AGENTS.filter(a => (stage.groups as readonly string[]).includes(a.group))
  const activeCount   = stageAgents.filter(a => a.status !== "disabled").length
  const disabledCount = stageAgents.length - activeCount
  const primaryGroup  = stage.groups[0]
  const colors        = GROUP_COLORS[primaryGroup]

  const modelCounts = stageAgents.reduce((acc, a) => {
    acc[a.model] = (acc[a.model] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden" style={{ background: "#0a0a0f" }}>
      {/* Stage header button */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-stretch gap-0">
          {/* Left accent bar */}
          <div
            className={`w-1 flex-shrink-0 ${colors.bg.replace("bg-", "bg-")} opacity-80`}
            style={{ background: expanded ? undefined : undefined }}
          />
          <div
            className="w-0.5 flex-shrink-0"
            style={{
              background: `linear-gradient(to bottom, transparent, currentColor, transparent)`,
              color: colors.border.includes("blue") ? "#3b82f6"
                   : colors.border.includes("orange") ? "#f97316"
                   : colors.border.includes("violet") ? "#8b5cf6"
                   : colors.border.includes("emerald") ? "#10b981"
                   : colors.border.includes("purple") ? "#a855f7"
                   : "#52525b",
            }}
          />

          <div className="flex-1 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className={`text-sm font-semibold ${colors.text}`}>{stage.name}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{stage.purpose}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                <span className="text-[10px] text-zinc-500">{activeCount} agents</span>
                {disabledCount > 0 && (
                  <span className="text-[10px] text-zinc-700 flex items-center gap-0.5">
                    <Power className="w-2.5 h-2.5" />{disabledCount}
                  </span>
                )}
                {expanded
                  ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" />
                  : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
                }
              </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {stage.timeWindow}
              </span>
              <span className="text-zinc-800 text-[10px]">·</span>
              {Object.entries(modelCounts).map(([model, count]) => (
                <span
                  key={model}
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${MODEL_COLORS[model as keyof typeof MODEL_COLORS].text} ${MODEL_COLORS[model as keyof typeof MODEL_COLORS].border}`}
                >
                  {model} ×{count}
                </span>
              ))}
              <span className="text-zinc-800 text-[10px]">·</span>
              <span className="text-[10px] font-mono text-emerald-700">{stage.keyOutput}</span>
            </div>
          </div>
        </div>
      </button>

      {/* Expanded agent rows */}
      {expanded && (
        <div className="border-t border-zinc-800/60">
          {stageAgents.map((agent, i) => {
            const isDisabled = agent.status === "disabled"
            const mStyle = MODEL_COLORS[agent.model]
            return (
              <button
                key={agent.id}
                onClick={() => onSelectAgent(agent)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.025] transition-colors ${i > 0 ? "border-t border-zinc-800/50" : ""}`}
                style={{ opacity: isDisabled ? 0.45 : 1 }}
              >
                {/* ID */}
                <span className="text-[10px] font-mono text-zinc-700 w-8 flex-shrink-0 text-right">
                  {agent.label.replace("Agent-", "").replace("BPS-", "")}
                </span>
                {/* Name */}
                <span className={`text-[13px] font-medium flex-1 text-left ${isDisabled ? "text-zinc-600 line-through decoration-zinc-700" : "text-zinc-200"}`}>
                  {agent.shortName}
                </span>
                {/* Time (hidden on very small screens) */}
                <span className="text-[10px] font-mono text-zinc-700 hidden sm:block flex-shrink-0">{agent.time}</span>
                {/* Model badge */}
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0 ${isDisabled ? "border-zinc-800 text-zinc-700" : `${mStyle.border} ${mStyle.text}`}`}>
                  {agent.model}
                </span>
                {/* Status dot */}
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isDisabled ? "bg-zinc-700" : "bg-emerald-500"}`} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StagesView({ onSelectAgent }: { onSelectAgent: (a: Agent) => void }) {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-2">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] uppercase tracking-widest text-zinc-700">Pipeline sequence · 5 stages</span>
        <div className="flex-1 h-px bg-zinc-900" />
        <span className="text-[10px] text-zinc-700">tap to expand</span>
      </div>

      {STAGES.map((stage, i) => (
        <div key={stage.id}>
          <StageCard stage={stage} onSelectAgent={onSelectAgent} />
          {i < STAGES.length - 1 && (
            <div className="flex justify-center my-0.5">
              <div className="w-px h-3 bg-zinc-800" />
            </div>
          )}
        </div>
      ))}

      {/* Footer note */}
      <p className="text-[10px] text-zinc-700 text-center pt-2">
        Autonomous · Paper mode · OpenClaw × Alpaca
      </p>
    </div>
  )
}

// ─── Agent List view ──────────────────────────────────────────────────────────
type StatusFilter = "all" | "active" | "disabled"

function AgentListView({ onSelectAgent }: { onSelectAgent: (a: Agent) => void }) {
  const [query, setQuery]             = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [groupFilter, setGroupFilter]  = useState("all")

  const filtered = useMemo(() => AGENTS.filter(a => {
    if (statusFilter === "active"   && a.status === "disabled") return false
    if (statusFilter === "disabled" && a.status !== "disabled") return false
    if (groupFilter !== "all" && !(STAGES.find(s => s.id === groupFilter)?.groups as readonly string[] | undefined)?.includes(a.group)) return false
    if (query) {
      const q = query.toLowerCase()
      return a.shortName.toLowerCase().includes(q) || a.label.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    }
    return true
  }), [query, statusFilter, groupFilter])

  const byStage = useMemo(() => STAGES.map(stage => ({
    stage,
    agents: filtered.filter(a => (stage.groups as readonly string[]).includes(a.group)),
  })).filter(({ agents }) => agents.length > 0), [filtered])

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      {/* Search + status filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search agents..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          />
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {(["all", "active", "disabled"] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-2 rounded-lg text-[11px] font-medium capitalize transition-colors ${
                statusFilter === f ? "bg-zinc-800 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Stage filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setGroupFilter("all")}
          className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
            groupFilter === "all" ? "border-zinc-500 text-zinc-300" : "border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400"
          }`}
        >
          All
        </button>
        {STAGES.map(s => {
          const c = GROUP_COLORS[s.groups[0]]
          const active = groupFilter === s.id
          return (
            <button
              key={s.id}
              onClick={() => setGroupFilter(groupFilter === s.id ? "all" : s.id)}
              className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                active ? `${c.border} ${c.text}` : "border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400"
              }`}
            >
              {s.name}
            </button>
          )
        })}
      </div>

      {/* Results */}
      {byStage.length === 0 ? (
        <div className="text-sm text-zinc-600 text-center py-8">No agents match</div>
      ) : (
        byStage.map(({ stage, agents }) => (
          <div key={stage.id}>
            <div className={`text-[10px] uppercase tracking-widest mb-2 flex items-center gap-2 ${GROUP_COLORS[stage.groups[0]].text}`}>
              {stage.name}
              <span className="text-zinc-700 normal-case tracking-normal font-normal">{agents.length}</span>
            </div>
            <div className="rounded-xl border border-zinc-800 overflow-hidden" style={{ background: "#0a0a0f" }}>
              {agents.map((agent, i) => {
                const isDisabled = agent.status === "disabled"
                const mStyle = MODEL_COLORS[agent.model]
                return (
                  <button
                    key={agent.id}
                    onClick={() => onSelectAgent(agent)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.025] transition-colors ${i > 0 ? "border-t border-zinc-800/60" : ""}`}
                    style={{ opacity: isDisabled ? 0.5 : 1 }}
                  >
                    <span className="text-[10px] font-mono text-zinc-700 w-8 text-right flex-shrink-0">
                      {agent.label.replace("Agent-", "").replace("BPS-", "")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] font-medium ${isDisabled ? "text-zinc-600" : "text-zinc-200"}`}>{agent.shortName}</div>
                      <div className="text-[10px] text-zinc-600 mt-0.5 font-mono">{agent.time}</div>
                    </div>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0 ${isDisabled ? "border-zinc-800 text-zinc-700" : `${mStyle.border} ${mStyle.text}`}`}>
                      {agent.model}
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isDisabled ? "bg-zinc-700" : "bg-emerald-500"}`} />
                  </button>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ─── Models view ──────────────────────────────────────────────────────────────
const MODEL_DESCRIPTIONS: Record<string, string> = {
  Opus:   "Highest-stakes decisions",
  Sonnet: "Research & analysis",
  Haiku:  "Fast classification",
  Script: "Deterministic execution",
}

function ModelsView({ onSelectAgent }: { onSelectAgent: (a: Agent) => void }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
        {(["Opus", "Sonnet", "Haiku", "Script"] as const).map(model => {
          const agents = AGENTS.filter(a => a.model === model)
          const mStyle = MODEL_COLORS[model]
          return (
            <div key={model}>
              <div className="mb-3">
                <div className={`text-sm font-semibold font-mono ${mStyle.text}`}>{model}</div>
                <div className="text-[10px] text-zinc-600 mt-0.5">{MODEL_DESCRIPTIONS[model]}</div>
                <div className="text-[10px] text-zinc-700 mt-0.5">{agents.length} agents</div>
              </div>
              <div className="space-y-1.5">
                {agents.map(agent => {
                  const isDisabled = agent.status === "disabled"
                  const stageColor = GROUP_COLORS[agent.group].text
                  return (
                    <button
                      key={agent.id}
                      onClick={() => onSelectAgent(agent)}
                      className="w-full text-left px-3 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors"
                      style={{ opacity: isDisabled ? 0.4 : 1, background: "#0a0a0f" }}
                    >
                      <div className={`text-[12px] font-medium ${isDisabled ? "text-zinc-600" : "text-zinc-200"}`}>{agent.shortName}</div>
                      <div className={`text-[9px] mt-0.5 ${stageColor}`} style={{ opacity: 0.7 }}>
                        {GROUP_COLORS[agent.group].label}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Map view — improved ReactFlow graph ──────────────────────────────────────
const MAP_COL_X: Record<string, number> = {
  research: 60, risk: 360, options: 570, bps: 730, execution: 960, audit: 1230,
}
const MAP_NODE_W = 158
const MAP_NODE_H = 72
const MAP_GAP_Y  = 88

function buildInitialNodes(): Node[] {
  const groupIdx: Record<string, number> = {}
  return AGENTS.map(agent => {
    const g   = agent.group
    const idx = groupIdx[g] ?? 0
    groupIdx[g] = idx + 1
    const groupAgents = AGENTS.filter(a => a.group === g)
    const startY = 80 + (AGENTS.length / 5 - groupAgents.length) * (MAP_NODE_H + MAP_GAP_Y) / 2
    const y = startY + idx * (MAP_NODE_H + MAP_GAP_Y)
    return {
      id: agent.id,
      type: "mapAgent",
      position: { x: MAP_COL_X[g], y },
      data: { agent, isSelected: false, isFaded: false },
      draggable: true,
    }
  })
}

function buildEdges(selectedId: string | null): Edge[] {
  const neighborIds = selectedId ? getNeighborIds(selectedId) : null
  const edges: Edge[] = []

  const groupOrder = ["research", "risk", "options", "bps", "execution", "audit"] as const
  groupOrder.forEach(group => {
    const ga = AGENTS.filter(a => a.group === group)
    for (let i = 0; i < ga.length - 1; i++) {
      const fromId = ga[i].id
      const toId   = ga[i + 1].id
      const isDisabledEdge = ga[i].status === "disabled" || ga[i + 1].status === "disabled"
      const faded = neighborIds !== null && !(neighborIds.has(fromId) && neighborIds.has(toId))
      edges.push({
        id: `${fromId}-${toId}`,
        source: fromId,
        target: toId,
        style: {
          stroke: isDisabledEdge ? "#27272a" : "#52525b",
          strokeWidth: isDisabledEdge ? 1 : 1.5,
          opacity: faded ? 0.04 : isDisabledEdge ? 0.2 : 1,
        },
      })
    }
  })

  CROSS_HANDOFFS.forEach(([src, tgt]) => {
    const faded = neighborIds !== null && !(neighborIds.has(src) && neighborIds.has(tgt))
    edges.push({
      id: `x-${src}-${tgt}`,
      source: src,
      target: tgt,
      animated: !faded,
      style: {
        stroke: "#71717a",
        strokeWidth: 1.5,
        strokeDasharray: "5 3",
        opacity: faded ? 0.04 : 0.65,
      },
    })
  })

  const cycleFaded = neighborIds !== null && !(neighborIds.has("16") && neighborIds.has("08"))
  edges.push({
    id: "loop-16-08",
    source: "16",
    target: "08",
    animated: !cycleFaded,
    label: "next day",
    labelStyle: { fontSize: 9, fill: cycleFaded ? "#27272a" : "#a78bfa" },
    labelBgStyle: { fill: "#18181b" },
    style: { stroke: "#7c3aed", strokeWidth: 1.5, strokeDasharray: "4 3", opacity: cycleFaded ? 0.04 : 0.8 },
    type: "straight",
  })

  return edges
}

// Simplified map node — less clutter, better scan
function MapAgentNode({ data }: NodeProps) {
  const agent      = data.agent as Agent
  const colors     = GROUP_COLORS[agent.group]
  const modelStyle = MODEL_COLORS[agent.model]
  const isSelected = data.isSelected as boolean
  const isFaded    = data.isFaded as boolean
  const isDisabled = agent.status === "disabled"

  return (
    <div
      style={{
        width: MAP_NODE_W,
        minHeight: MAP_NODE_H,
        opacity: isFaded ? 0.18 : isDisabled ? 0.32 : 1,
        transition: "opacity 0.15s ease, transform 0.1s ease",
        transform: isSelected ? "scale(1.06)" : "scale(1)",
      }}
      className={`
        relative rounded-xl border-2 px-3 py-2.5 cursor-pointer select-none
        ${isDisabled
          ? "bg-zinc-950 border-zinc-800"
          : isSelected
            ? `${colors.bg} border-white shadow-lg shadow-white/10`
            : `${colors.bg} ${colors.border} hover:border-white/50`
        }
      `}
    >
      <Handle type="target" position={Position.Left}  className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />

      {/* Status */}
      <div className="absolute top-2 right-2">
        {isDisabled
          ? <Power className="w-2.5 h-2.5 text-zinc-700" />
          : <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block" />
        }
      </div>

      {/* Name — larger, cleaner */}
      <div className={`text-[13px] font-semibold leading-tight pr-4 ${isDisabled ? "text-zinc-600" : "text-zinc-100"}`}>
        {agent.shortName}
      </div>

      {/* Model + time */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${isDisabled ? "border-zinc-800 text-zinc-700" : `${modelStyle.text} ${modelStyle.border}`}`}>
          {agent.model}
        </span>
        <span className={`text-[9px] ${isDisabled ? "text-zinc-700" : "text-zinc-600"}`}>{agent.time}</span>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />
    </div>
  )
}

const MAP_NODE_TYPES = { mapAgent: MapAgentNode }

function MapLegend() {
  return (
    <div className="absolute bottom-4 left-4 z-10 space-y-1.5 pointer-events-none">
      <div className="bg-zinc-900/92 backdrop-blur border border-zinc-800 rounded-lg px-3 py-2 flex flex-wrap gap-3 text-[10px]">
        {Object.entries(GROUP_COLORS).filter(([k]) => k !== "options").map(([key, c]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded border ${c.bg} ${c.border}`} />
            <span className={c.text}>{c.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 border-l border-zinc-700 pl-2">
          <Power className="w-2.5 h-2.5 text-zinc-700" />
          <span className="text-zinc-600">Disabled</span>
        </div>
      </div>
      <div className="bg-zinc-900/92 backdrop-blur border border-zinc-800 rounded-lg px-3 py-2 flex gap-4 text-[10px] flex-wrap">
        <div className="flex gap-2 items-center">
          <span className="text-zinc-600">Model:</span>
          {(["Opus","Sonnet","Haiku","Script"] as const).map(m => (
            <span key={m} className={`font-mono ${MODEL_COLORS[m].text}`}>{m}</span>
          ))}
        </div>
        <div className="border-l border-zinc-700 pl-3 flex gap-3 items-center">
          <div className="flex items-center gap-1"><div className="w-4 border-t border-zinc-400" /><span className="text-zinc-500">Flow</span></div>
          <div className="flex items-center gap-1"><div className="w-4 border-t border-dashed border-zinc-500" /><span className="text-zinc-500">Handoff</span></div>
          <div className="flex items-center gap-1"><div className="w-4 border-t border-dashed border-purple-500" /><span className="text-purple-400">Day cycle</span></div>
        </div>
      </div>
      <div className="text-[10px] text-zinc-700 pl-1">Click a node to focus its connections</div>
    </div>
  )
}

function MapView({
  selectedId,
  onSelectAgent,
}: {
  selectedId: string | null
  onSelectAgent: (a: Agent) => void
}) {
  const [nodes, , onNodesChange] = useNodesState(buildInitialNodes())

  // Derive display nodes — preserves dragged positions, updates focus state
  const displayNodes = useMemo(() => {
    const neighborIds = selectedId ? getNeighborIds(selectedId) : null
    return nodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        isSelected: n.id === selectedId,
        isFaded: neighborIds !== null && !neighborIds.has(n.id),
      },
    }))
  }, [nodes, selectedId])

  // Edges fully derived from selection state
  const edges = useMemo(() => buildEdges(selectedId), [selectedId])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const agent = AGENTS.find(a => a.id === node.id)
    if (agent) onSelectAgent(agent)
  }, [onSelectAgent])

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        nodeTypes={MAP_NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.2}
        maxZoom={2}
        className="bg-zinc-950"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1c1c27" gap={28} />
        <Controls className="!bg-zinc-900 !border-zinc-700 [&>button]:!bg-zinc-900 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-800" />
      </ReactFlow>
      <MapLegend />
    </div>
  )
}

// ─── Main Shell ───────────────────────────────────────────────────────────────
export function PipelineFlow() {
  const [view, setView]                 = useState<ViewMode>("overview")
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  const handleSelectAgent = useCallback((agent: Agent) => {
    setSelectedAgent(prev => (prev?.id === agent.id ? null : agent))
  }, [])

  const handleViewChange = useCallback((v: ViewMode) => {
    setView(v)
    // Keep selected agent when moving to/from map for focus continuity
  }, [])

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      <MissionControlStrip view={view} onViewChange={handleViewChange} />

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className={`flex-1 min-w-0 ${view === "map" ? "overflow-hidden" : "overflow-y-auto"}`}>
          {view === "overview" && <StagesView   onSelectAgent={handleSelectAgent} />}
          {view === "agents"   && <AgentListView onSelectAgent={handleSelectAgent} />}
          {view === "models"   && <ModelsView    onSelectAgent={handleSelectAgent} />}
          {view === "map"      && (
            <MapView
              selectedId={selectedAgent?.id ?? null}
              onSelectAgent={handleSelectAgent}
            />
          )}
        </div>

        {/* Detail panel */}
        {selectedAgent && (
          <AgentDetailPanel
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </div>
    </div>
  )
}
