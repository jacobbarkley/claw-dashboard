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
import { AGENTS, GROUP_COLORS, Agent } from "@/components/agent-data"
import { X, Clock, ArrowRight, FileInput, FileOutput } from "lucide-react"

// ─── Layout constants ───────────────────────────────────────────────────────
const COL_X: Record<string, number> = {
  research:  100,
  risk:      480,
  execution: 860,
  audit:     1240,
}
const NODE_W = 160
const NODE_H = 72
const GAP_Y  = 96

function groupedY(agents: Agent[], group: string, idx: number) {
  const groupAgents = agents.filter(a => a.group === group)
  const startY = 80 + (AGENTS.length / 4 - groupAgents.length) * (NODE_H + GAP_Y) / 2
  return startY + idx * (NODE_H + GAP_Y)
}

// ─── Custom node ─────────────────────────────────────────────────────────────
function AgentNode({ data }: NodeProps) {
  const agent = data.agent as Agent
  const colors = GROUP_COLORS[agent.group]
  const isSelected = data.isSelected as boolean

  return (
    <div
      className={`
        relative rounded-xl border-2 px-3 py-2 cursor-pointer select-none transition-all
        ${colors.bg} ${isSelected ? "border-white shadow-lg shadow-white/10 scale-105" : colors.border}
        hover:border-white/60 hover:scale-105
      `}
      style={{ width: NODE_W, minHeight: NODE_H }}
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />
      <div className={`text-[10px] font-mono font-bold ${colors.text} mb-0.5`}>{agent.label}</div>
      <div className="text-xs font-semibold text-zinc-100 leading-tight">{agent.shortName}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1">
        <Clock className="w-2.5 h-2.5" />
        {agent.time}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />
    </div>
  )
}

const nodeTypes = { agent: AgentNode }

// ─── Detail panel ─────────────────────────────────────────────────────────────
function AgentDetail({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const colors = GROUP_COLORS[agent.group]
  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col z-10 overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 border-b border-zinc-800 flex items-start justify-between ${colors.bg}`}>
        <div>
          <div className={`text-[10px] font-mono font-bold ${colors.text}`}>{agent.label}</div>
          <div className="text-sm font-semibold text-zinc-100">{agent.shortName}</div>
          <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3" />
            {agent.time}
            <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded border ${colors.border} ${colors.text}`}>
              {colors.label}
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
          <p className="text-zinc-300 leading-relaxed text-[13px]">{agent.description}</p>
        </div>

        {/* Inputs */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 flex items-center gap-1">
            <FileInput className="w-3 h-3" /> Inputs
          </div>
          <ul className="space-y-1">
            {agent.inputs.map((inp, i) => (
              <li key={i} className="text-[11px] font-mono text-zinc-400 bg-zinc-800 rounded px-2 py-1">
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
          <div className="text-[11px] font-mono text-emerald-300 bg-zinc-800 rounded px-2 py-1">
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

  // Sequential edges within each group
  const groupOrder = ["research", "risk", "execution", "audit"] as const
  const edges: Edge[] = []

  // Within-group edges
  groupOrder.forEach(group => {
    const groupAgents = AGENTS.filter(a => a.group === group)
    for (let i = 0; i < groupAgents.length - 1; i++) {
      edges.push({
        id: `${groupAgents[i].id}-${groupAgents[i + 1].id}`,
        source: groupAgents[i].id,
        target: groupAgents[i + 1].id,
        animated: false,
        style: { stroke: "#52525b", strokeWidth: 1.5 },
      })
    }
  })

  // Cross-group handoff edges (last of group → first of next group)
  const crossHandoffs: [string, string][] = [
    ["07", "08"],   // Validation → Risk Eval
    ["08b", "11"],  // Risk Gate → Pre-Open Refresh
    ["14", "15"],   // EOD → Post-Close (execution → audit)
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

  return { nodes, edges }
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div className="absolute bottom-4 left-4 bg-zinc-900/90 border border-zinc-800 rounded-lg px-3 py-2 flex gap-4 text-[11px] z-10">
      {Object.entries(GROUP_COLORS).map(([key, c]) => (
        <div key={key} className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded border ${c.bg} ${c.border}`} />
          <span className={c.text}>{c.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5 ml-2 border-l border-zinc-700 pl-2">
        <div className="w-6 border-t-2 border-dashed border-zinc-400" />
        <span className="text-zinc-400">Group handoff</span>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function PipelineFlow() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedAgent = selectedId ? AGENTS.find(a => a.id === selectedId) ?? null : null

  const { nodes: initialNodes, edges: initialEdges } = buildGraph(selectedId)
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  // Update node selection highlight when selectedId changes
  const onNodeClick = useCallback((_: any, node: Node) => {
    const agentId = (node.data.agent as Agent).id
    setSelectedId(prev => prev === agentId ? null : agentId)
  }, [])

  // Keep nodes updated with selection state
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
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
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
