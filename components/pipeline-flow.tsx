"use client"

import { useState, useCallback } from "react"
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  Handle,
  Position,
  NodeProps,
  useNodesState,
  useEdgesState,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { AGENTS, GROUP_COLORS, MODEL_COLORS, Agent } from "@/components/agent-data"
import { X, Clock, FileInput, FileOutput, Power } from "lucide-react"

// ─── Layout constants ────────────────────────────────────────────────────────
const COL_X: Record<string, number> = {
  research:  60,
  risk:      370,
  options:   640,
  bps:       800,
  execution: 1030,
  audit:     1330,
}
const NODE_W = 150
const NODE_H = 78
const GAP_Y  = 96

function groupedY(agents: Agent[], group: string, idx: number) {
  const groupAgents = agents.filter(a => a.group === group)
  const startY = 80 + (AGENTS.length / 5 - groupAgents.length) * (NODE_H + GAP_Y) / 2
  return startY + idx * (NODE_H + GAP_Y)
}

// ─── Custom node ─────────────────────────────────────────────────────────────
function AgentNode({ data }: NodeProps) {
  const agent = data.agent as Agent
  const colors = GROUP_COLORS[agent.group]
  const modelStyle = MODEL_COLORS[agent.model]
  const isSelected = data.isSelected as boolean
  const isDisabled = agent.status === "disabled"

  return (
    <div
      className={`
        relative rounded-xl border-2 px-3 py-2 cursor-pointer select-none transition-all
        ${isDisabled
          ? "bg-zinc-950 border-zinc-800 opacity-35"
          : `${colors.bg} ${isSelected ? "border-white shadow-lg shadow-white/10 scale-105" : colors.border}`
        }
        ${!isDisabled ? "hover:border-white/60 hover:scale-105" : ""}
      `}
      style={{ width: NODE_W, minHeight: NODE_H }}
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />

      {/* Disabled indicator */}
      {isDisabled && (
        <div className="absolute top-1.5 right-1.5">
          <Power className="w-2.5 h-2.5 text-zinc-600" />
        </div>
      )}

      <div className={`text-[10px] font-mono font-bold mb-0.5 ${isDisabled ? "text-zinc-600" : colors.text}`}>
        {agent.label}
      </div>
      <div className={`text-xs font-semibold leading-tight ${isDisabled ? "text-zinc-600" : "text-zinc-100"}`}>
        {agent.shortName}
      </div>
      <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${isDisabled ? "text-zinc-700" : "text-zinc-500"}`}>
        <Clock className="w-2.5 h-2.5" />
        {agent.time}
      </div>

      {/* Model badge */}
      <div className="mt-1.5">
        <span
          className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
            isDisabled
              ? "text-zinc-700 border-zinc-800"
              : `${modelStyle.text} ${modelStyle.border}`
          }`}
          style={{ letterSpacing: "0.04em" }}
        >
          {agent.model}
        </span>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />
    </div>
  )
}

const nodeTypes = { agent: AgentNode }

// ─── Detail panel ─────────────────────────────────────────────────────────────
function AgentDetail({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const colors = GROUP_COLORS[agent.group]
  const modelStyle = MODEL_COLORS[agent.model]
  const isDisabled = agent.status === "disabled"

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col z-10 overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 border-b border-zinc-800 flex items-start justify-between ${isDisabled ? "bg-zinc-950" : colors.bg}`}>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div className={`text-[10px] font-mono font-bold ${isDisabled ? "text-zinc-600" : colors.text}`}>
              {agent.label}
            </div>
            {isDisabled && (
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500 flex items-center gap-1">
                <Power className="w-2 h-2" /> OFF
              </span>
            )}
          </div>
          <div className={`text-sm font-semibold ${isDisabled ? "text-zinc-500" : "text-zinc-100"}`}>
            {agent.shortName}
          </div>
          <div className={`text-[11px] flex items-center gap-2 mt-1 flex-wrap ${isDisabled ? "text-zinc-600" : "text-zinc-400"}`}>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {agent.time}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${isDisabled ? "border-zinc-700 text-zinc-600" : `${colors.border} ${colors.text}`}`}>
              {colors.label}
            </span>
            {/* Model badge */}
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${isDisabled ? "border-zinc-800 text-zinc-700" : `${modelStyle.border} ${modelStyle.text}`}`}>
              {agent.model}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors mt-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm">
        {/* Description */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">What it does</div>
          <p className={`leading-relaxed text-[13px] ${isDisabled ? "text-zinc-600" : "text-zinc-300"}`}>
            {agent.description}
          </p>
        </div>

        {/* Inputs */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 flex items-center gap-1">
            <FileInput className="w-3 h-3" /> Inputs
          </div>
          <ul className="space-y-1">
            {agent.inputs.map((inp, i) => (
              <li key={i} className={`text-[11px] font-mono rounded px-2 py-1 ${isDisabled ? "bg-zinc-900 text-zinc-600" : "bg-zinc-800 text-zinc-400"}`}>
                {inp}
              </li>
            ))}
          </ul>
        </div>

        {/* Output */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 flex items-center gap-1">
            <FileOutput className="w-3 h-3" /> Output
          </div>
          <div className={`text-[11px] font-mono rounded px-2 py-1 ${isDisabled ? "bg-zinc-900 text-zinc-600" : "bg-zinc-800 text-emerald-300"}`}>
            {agent.output}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Build nodes + edges ──────────────────────────────────────────────────────
function buildGraph(selectedId: string | null) {
  const groupIdx: Record<string, number> = {}
  const nodes: Node[] = AGENTS.map(agent => {
    const g = agent.group
    const idx = groupIdx[g] ?? 0
    groupIdx[g] = idx + 1
    return {
      id: agent.id,
      type: "agent",
      position: { x: COL_X[g], y: groupedY(AGENTS, g, idx) },
      data: { agent, isSelected: agent.id === selectedId },
      draggable: true,
    }
  })

  const groupOrder = ["research", "risk", "options", "bps", "execution", "audit"] as const
  const edges: Edge[] = []

  // Within-group edges
  groupOrder.forEach(group => {
    const groupAgents = AGENTS.filter(a => a.group === group)
    for (let i = 0; i < groupAgents.length - 1; i++) {
      const isDisabledEdge = groupAgents[i].status === "disabled" || groupAgents[i + 1].status === "disabled"
      edges.push({
        id: `${groupAgents[i].id}-${groupAgents[i + 1].id}`,
        source: groupAgents[i].id,
        target: groupAgents[i + 1].id,
        animated: false,
        style: {
          stroke: isDisabledEdge ? "#27272a" : "#52525b",
          strokeWidth: 1.5,
          opacity: isDisabledEdge ? 0.3 : 1,
        },
      })
    }
  })

  // Cross-group handoff edges
  const crossHandoffs: [string, string, boolean?][] = [
    ["07",  "08"],          // Validation → Risk Eval
    ["08b", "bps-pm"],      // Risk Gate → BPS Position Manager (parallel)
    ["08b", "19"],          // Risk Gate → Morning Reviewer (parallel)
    ["21",  "11"],          // BPS Strategy → Pre-Open Refresh (capacity awareness)
    ["19",  "11"],          // Morning Reviewer → Pre-Open Refresh
    ["14",  "15"],          // EOD → Post-Close
  ]

  crossHandoffs.forEach(([src, tgt]) => {
    edges.push({
      id: `cross-${src}-${tgt}`,
      source: src,
      target: tgt,
      animated: true,
      style: { stroke: "#a1a1aa", strokeWidth: 2, strokeDasharray: "5 3" },
    })
  })

  // Day-cycle loop
  edges.push({
    id: "loop-16-08",
    source: "16",
    target: "08",
    animated: true,
    label: "next day gate",
    labelStyle: { fontSize: 9, fill: "#a78bfa" },
    labelBgStyle: { fill: "#18181b" },
    style: { stroke: "#7c3aed", strokeWidth: 1.5, strokeDasharray: "4 3" },
    type: "straight",
  })

  return { nodes, edges }
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2">
      {/* Groups */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg px-3 py-2 flex flex-wrap gap-3 text-[11px]">
        {Object.entries(GROUP_COLORS).map(([key, c]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded border ${c.bg} ${c.border}`} />
            <span className={c.text}>{c.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 border-l border-zinc-700 pl-3">
          <div className="w-6 border-t-2 border-dashed border-zinc-400" />
          <span className="text-zinc-400">Handoff</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 border-t-2 border-dashed border-purple-500" />
          <span className="text-purple-400">Day cycle</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Power className="w-3 h-3 text-zinc-600" />
          <span className="text-zinc-600">Disabled</span>
        </div>
      </div>

      {/* Model key */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg px-3 py-2 flex gap-4 text-[11px]">
        <span className="text-zinc-600 mr-1">Model:</span>
        {(["Opus", "Sonnet", "Haiku", "Script"] as const).map(m => (
          <span key={m} className={`font-mono ${MODEL_COLORS[m].text}`}>{m}</span>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function PipelineFlow() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedAgent = selectedId ? AGENTS.find(a => a.id === selectedId) ?? null : null

  const { nodes: initialNodes, edges: initialEdges } = buildGraph(selectedId)
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  const onNodeClick = useCallback((_: any, node: Node) => {
    const agentId = (node.data.agent as Agent).id
    setSelectedId(prev => prev === agentId ? null : agentId)
  }, [])

  const displayNodes = nodes.map(n => ({
    ...n,
    data: { ...n.data, isSelected: (n.data.agent as Agent).id === selectedId },
  }))

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.25}
        maxZoom={2}
        className="bg-zinc-950"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#27272a" gap={24} />
        <Controls className="!bg-zinc-900 !border-zinc-700 [&>button]:!bg-zinc-900 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-800" />
      </ReactFlow>

      <Legend />

      {selectedAgent && (
        <AgentDetail agent={selectedAgent} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
