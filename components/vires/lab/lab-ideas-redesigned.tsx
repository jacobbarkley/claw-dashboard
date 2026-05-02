"use client"

// Redesigned Ideas list for the 2026-04-22 Lab. Card layout — stage
// progress dots, status pill, 2-line thesis preview, sleeve + strategy +
// date. Filters by sleeve via the shared lab-sleeve-filter hook.

import Link from "next/link"
import { useMemo } from "react"

import type { ResearchSleeve } from "@/lib/research-lab-contracts"
import { STAGES, STAGE_META, stageColor, type IdeaStage } from "@/lib/research-lab-stage"

import { useLabSleeveFilter } from "./use-lab-sleeve-filter"

const STATUS_COLOR: Record<string, string> = {
  DRAFT:   "var(--vr-cream-mute)",
  READY:   "var(--vr-gold)",
  QUEUED:  "var(--vr-gold)",
  ACTIVE:  "var(--vr-up)",
  SHELVED: "var(--vr-cream-faint)",
  RETIRED: "var(--vr-cream-faint)",
}

export interface IdeaCard {
  idea_id: string
  title: string
  thesis: string
  sleeve: ResearchSleeve
  status: string
  strategy_id: string
  code_pending: boolean
  created_at: string | null
  stage: IdeaStage
}

function fmtDate(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export function LabIdeasRedesigned({ ideas }: { ideas: IdeaCard[] }) {
  const [sleeve] = useLabSleeveFilter()
  const filtered = useMemo(() => {
    if (sleeve === "ALL") return ideas
    return ideas.filter(i => i.sleeve === sleeve)
  }, [ideas, sleeve])

  return (
    <div style={{ padding: "16px 20px 120px", maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <Header />
      {filtered.length === 0 ? (
        <EmptyState sleeve={sleeve} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(idea => <IdeaCardRow key={idea.idea_id} idea={idea} />)}
        </div>
      )}
    </div>
  )
}

function Header() {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
      <h1
        className="t-display"
        style={{ margin: 0, fontSize: 28, lineHeight: 1.15, color: "var(--vr-cream)", fontWeight: 400 }}
      >
        Ideas
      </h1>
      <Link
        href="/vires/bench/lab/ideas/new"
        className="t-eyebrow"
        style={{
          fontSize: 10,
          letterSpacing: "0.16em",
          padding: "6px 12px",
          borderRadius: 3,
          border: "1px solid var(--vr-gold-line)",
          background: "var(--vr-gold-soft)",
          color: "var(--vr-gold)",
          textDecoration: "none",
        }}
      >
        + NEW
      </Link>
    </div>
  )
}

function EmptyState({ sleeve }: { sleeve: string }) {
  const text = sleeve === "ALL"
    ? "No ideas yet. Start with + NEW."
    : `No ${sleeve.toLowerCase()} ideas yet.`
  return (
    <div
      className="vr-card"
      style={{
        padding: "16px",
        textAlign: "center",
        fontSize: 12,
        color: "var(--vr-cream-faint)",
        fontStyle: "italic",
      }}
    >
      {text}
    </div>
  )
}

function IdeaCardRow({ idea }: { idea: IdeaCard }) {
  const statusColor = STATUS_COLOR[idea.status] ?? "var(--vr-cream-mute)"
  return (
    <Link
      href={`/vires/bench/lab/ideas/${encodeURIComponent(idea.idea_id)}`}
      className="vr-card"
      style={{
        padding: "14px 16px",
        textDecoration: "none",
        color: "inherit",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <StageBadge stage={idea.stage} />
        <span
          className="t-eyebrow"
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            color: statusColor,
            border: `1px solid ${statusColor}`,
            padding: "2px 7px",
            borderRadius: 2,
            flexShrink: 0,
          }}
        >
          {idea.status}
        </span>
      </div>
      <div
        style={{
          fontSize: 15,
          color: "var(--vr-cream)",
          lineHeight: 1.25,
          fontWeight: 500,
        }}
      >
        {idea.title}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--vr-cream-mute)",
          lineHeight: 1.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {idea.thesis}
      </div>
      <div
        className="t-mono"
        style={{
          fontSize: 10,
          color: "var(--vr-cream-faint)",
          letterSpacing: "0.06em",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span style={{ textTransform: "lowercase" }}>{idea.sleeve}</span>
        <span>·</span>
        <span>{idea.code_pending ? "—" : idea.strategy_id}</span>
        {idea.created_at && (
          <>
            <span>·</span>
            <span>{fmtDate(idea.created_at)}</span>
          </>
        )}
      </div>
    </Link>
  )
}

function StageBadge({ stage }: { stage: IdeaStage }) {
  const idx = STAGES.indexOf(stage)
  const color = stageColor(stage)
  return (
    <span
      className="t-eyebrow"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 9,
        letterSpacing: "0.14em",
        color,
      }}
    >
      <span style={{ display: "inline-flex", gap: 2 }}>
        {STAGES.map((_, i) => (
          <span
            key={i}
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: i <= idx ? color : "rgba(241,236,224,0.12)",
            }}
          />
        ))}
      </span>
      {STAGE_META[stage].label.toUpperCase()}
    </span>
  )
}
