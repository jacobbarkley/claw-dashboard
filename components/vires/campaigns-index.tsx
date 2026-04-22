"use client"

// Bench Campaigns — Index page.
// Ported from design_handoff_vires_capital/files/vires-campaigns.jsx
// (CampaignsMasthead, SleeveFilterBar, CampaignCard, RunnerUpBand, LeverCell,
// CampaignsPage). v2-ready: reads optional campaign_pressure / leader_comparison
// blocks when Codex's producer emits them; falls back to v1 recency_signals +
// latest_run shape otherwise.

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import type {
  CampaignManifest,
  CampaignRegistry,
  CampaignsIndexData,
  RunnerUpGap,
} from "@/lib/vires-campaigns"
import { countsBySleeve, statusCounts } from "@/lib/vires-campaigns"
import {
  ChangeLogPreviewRow,
  RoleTag,
  StatusPillCampaign,
  relTime,
} from "./campaigns-shared"
import { SleeveChip, type Sleeve } from "./shared"

// ─── Masthead ───────────────────────────────────────────────────────────────

function CampaignsMasthead({
  registry,
  campaigns,
}: {
  registry: CampaignRegistry
  campaigns: CampaignManifest[]
}) {
  const counts = statusCounts(campaigns)
  const activeCount = (counts["EXPLORING"] ?? 0) + (counts["CONVERGING"] ?? 0)
  const items: Array<{ label: string; value: number }> = [
    { label: "Active",     value: activeCount },
    { label: "Exploring",  value: counts["EXPLORING"] ?? 0 },
    { label: "Converging", value: counts["CONVERGING"] ?? 0 },
    { label: "Promoted",   value: counts["PROMOTED"] ?? 0 },
  ]
  return (
    <div
      className="vr-card"
      style={{
        padding: 22,
        background: "rgba(241,236,224,0.015)",
      }}
    >
      <div
        className="t-eyebrow"
        style={{ marginBottom: 6, display: "flex", gap: 10, alignItems: "center" }}
      >
        <span>Bench · Campaigns</span>
        <span style={{ color: "var(--vr-cream-faint)" }}>·</span>
        <span style={{ color: "var(--vr-cream-faint)" }}>
          Updated {relTime(registry.generated_at)}
        </span>
      </div>
      <div
        className="t-h2"
        style={{ lineHeight: 1.25, maxWidth: 420, marginBottom: 10, marginTop: 4 }}
      >
        What is <span className="t-accent" style={{ fontStyle: "italic" }}>competing</span> to deserve capital.
      </div>
      <div
        className="t-read"
        style={{ fontSize: 12, maxWidth: 420, color: "var(--vr-cream-dim)", lineHeight: 1.55 }}
      >
        Production tells us what deserves capital. The bench tells us what is
        competing to earn it. Each campaign is a thesis; candidates are
        implementations under stress.
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          marginTop: 18,
          borderTop: "1px solid var(--vr-line)",
          paddingTop: 14,
        }}
      >
        {items.map((s, i) => (
          <div
            key={s.label}
            style={{
              padding: "0 10px",
              borderLeft: i > 0 ? "1px solid var(--vr-line)" : "none",
            }}
          >
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 5 }}>{s.label}</div>
            <div
              className="t-h1 t-num"
              style={{
                fontSize: 24,
                color: s.label === "Promoted" ? "var(--vr-up)" : "var(--vr-cream)",
              }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sleeve filter ──────────────────────────────────────────────────────────

const SLEEVE_FILTERS: Array<{ k: "ALL" | "STOCKS" | "OPTIONS" | "CRYPTO"; l: string }> = [
  { k: "ALL",     l: "All" },
  { k: "STOCKS",  l: "Stocks" },
  { k: "OPTIONS", l: "Options" },
  { k: "CRYPTO",  l: "Crypto" },
]

function SleeveFilterBar({
  value,
  onChange,
  counts,
}: {
  value: string
  onChange: (v: "ALL" | "STOCKS" | "OPTIONS" | "CRYPTO") => void
  counts: Record<string, number> & { ALL: number }
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: 2,
        background: "rgba(241,236,224,0.02)",
        border: "1px solid var(--vr-line)",
        borderRadius: 3,
        alignSelf: "flex-start",
      }}
      role="tablist"
      aria-label="Sleeve filter"
    >
      {SLEEVE_FILTERS.map(f => {
        const active = value === f.k
        const n = counts[f.k] ?? 0
        return (
          <button
            key={f.k}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(f.k)}
            className="t-eyebrow"
            style={{
              padding: "5px 11px",
              borderRadius: 2,
              border: "none",
              background: active ? "var(--vr-gold)" : "transparent",
              color: active ? "var(--vr-ink)" : "var(--vr-cream-mute)",
              fontWeight: 600,
              fontSize: 10,
              letterSpacing: "0.14em",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {f.l}
            <span
              style={{
                fontSize: 9,
                opacity: active ? 0.75 : 0.6,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {n}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Lever cell (index-card — NOT a button; detail page uses LeverShell) ───

function LeverCell({
  eyebrow,
  value,
  sub,
}: {
  eyebrow: string
  value: string
  sub?: string | null
}) {
  return (
    <div style={{ padding: "10px 12px" }}>
      <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3, color: "var(--vr-cream-mute)" }}>
        {eyebrow}
      </div>
      <div className="t-num" style={{ fontSize: 14, color: "var(--vr-cream)", fontWeight: 500 }}>
        {value}
      </div>
      {sub && (
        <div className="t-label" style={{ fontSize: 10, color: "var(--vr-cream-faint)", marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ─── Runner-up band ─────────────────────────────────────────────────────────
// If value is null, the honest summary IS the surface. Italic serif copy, no
// "—" / "pending" / "0" substitution.

function RunnerUpBand({
  gap,
  runnerUpTitle,
}: {
  gap: RunnerUpGap | null | undefined
  runnerUpTitle: string | null | undefined
}) {
  if (!gap || !gap.summary) return null
  const quantified = gap.value != null
  return (
    <div
      style={{
        padding: "10px 14px",
        background: "rgba(241,236,224,0.02)",
        borderTop: "1px solid var(--vr-line)",
        borderBottom: "1px solid var(--vr-line)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 4,
        }}
      >
        <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)" }}>
          Runner-up gap
        </div>
        <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-faint)" }}>
          {quantified ? gap.metric : "not yet quantified"}
        </div>
      </div>
      <div
        className="t-read"
        style={{
          fontSize: 12,
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          color: "var(--vr-cream-dim)",
          lineHeight: 1.5,
        }}
      >
        {gap.summary}
      </div>
      {runnerUpTitle && (
        <div
          className="t-label"
          style={{ fontSize: 10, color: "var(--vr-cream-faint)", marginTop: 5 }}
        >
          Runner-up: {runnerUpTitle}
        </div>
      )}
    </div>
  )
}

// ─── Campaign Card ──────────────────────────────────────────────────────────

function CampaignCard({ campaign }: { campaign: CampaignManifest }) {
  const leader = campaign.candidates.find(
    c => c.candidate_id === campaign.current_leader_candidate_id,
  )
  const runnerUp = campaign.candidates.find(
    c => c.candidate_id === campaign.recency_signals.runner_up_candidate_id,
  )
  const familyCounts = campaign.family_groups
    .map(f => ({
      title: f.title,
      count: campaign.candidates.filter(c => c.family_id === f.family_id).length,
    }))
    .filter(f => f.count > 0)

  const rs = campaign.recency_signals
  const sleeveKey = (campaign.sleeve ?? "").toString().toLowerCase()
  const sleeveIsValid = sleeveKey === "stocks" || sleeveKey === "options" || sleeveKey === "crypto"
  const latestChange = campaign.change_log?.[0] ?? null
  const pressure = campaign.campaign_pressure

  return (
    <Link
      href={`/vires/bench/campaigns/${campaign.campaign_id}`}
      className="vr-card"
      style={{
        padding: 0,
        textDecoration: "none",
        color: "inherit",
        display: "block",
        background: "var(--vr-ink)",
      }}
    >
      {/* Header: sleeve · benchmark · status */}
      <div
        style={{
          padding: "14px 16px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {sleeveIsValid && <SleeveChip sleeve={sleeveKey as Sleeve} />}
        <span style={{ color: "var(--vr-cream-faint)" }}>·</span>
        <span className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)" }}>
          vs {campaign.benchmark_symbol}
        </span>
        <span style={{ flex: 1 }} />
        <StatusPillCampaign status={campaign.status} />
      </div>

      {/* Title + summary */}
      <div style={{ padding: "0 16px 12px" }}>
        <div className="t-h3" style={{ fontSize: 18, lineHeight: 1.25, marginBottom: 6 }}>
          {campaign.title}
        </div>
        <div
          className="t-read"
          style={{ fontSize: 12, color: "var(--vr-cream-dim)", lineHeight: 1.55 }}
        >
          {campaign.summary}
        </div>
        {pressure?.summary && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              color: "var(--vr-cream-dim)",
              lineHeight: 1.5,
            }}
          >
            {pressure.summary}
          </div>
        )}
      </div>

      {/* Leader row */}
      {leader && (
        <div
          style={{
            padding: "10px 14px",
            background:
              leader.role === "PROMOTED_REFERENCE"
                ? "rgba(200,169,104,0.04)"
                : "rgba(241,236,224,0.02)",
            borderTop: "1px solid var(--vr-line)",
            borderBottom: "1px solid var(--vr-line)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 4, color: "var(--vr-cream-mute)" }}>
              {leader.role === "PROMOTED_REFERENCE" ? "Baseline to beat" : "Current leader"}
            </div>
            <div
              className="t-h4"
              style={{
                fontSize: 14,
                color: "var(--vr-cream)",
                lineHeight: 1.25,
                fontFamily: "var(--ff-serif)",
                fontWeight: 500,
              }}
            >
              {leader.title}
            </div>
            <div
              className="t-ticker"
              style={{
                fontSize: 9,
                marginTop: 3,
                color: "var(--vr-cream-faint)",
                textTransform: "none",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {leader.candidate_id}
            </div>
          </div>
          <RoleTag role={leader.role} />
        </div>
      )}

      {/* 2x2 lever grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
        }}
      >
        <div style={{ borderRight: "1px solid var(--vr-line)", borderBottom: "1px solid var(--vr-line)" }}>
          <LeverCell
            eyebrow="Leader stability"
            value={
              rs.leader_stability_sessions != null
                ? `${rs.leader_stability_sessions} ${rs.leader_stability_sessions === 1 ? "session" : "sessions"}`
                : "—"
            }
            sub={rs.last_leader_change_at ? `changed ${relTime(rs.last_leader_change_at)}` : null}
          />
        </div>
        <div style={{ borderBottom: "1px solid var(--vr-line)" }}>
          <LeverCell
            eyebrow="Last run"
            value={campaign.last_run_at ? relTime(campaign.last_run_at) : "—"}
            sub={null}
          />
        </div>
        <div style={{ borderRight: "1px solid var(--vr-line)" }}>
          <LeverCell
            eyebrow="Param sweep"
            value={rs.last_param_sweep_at ? relTime(rs.last_param_sweep_at) : "—"}
            sub={rs.days_since_param_sweep != null ? `${rs.days_since_param_sweep}d since` : null}
          />
        </div>
        <div>
          <LeverCell
            eyebrow="Candidates"
            value={`${campaign.candidates.length}`}
            sub={`${familyCounts.length} ${familyCounts.length === 1 ? "family" : "families"}`}
          />
        </div>
      </div>

      {/* Runner-up band (honest-data surface) */}
      <RunnerUpBand gap={rs.runner_up_gap} runnerUpTitle={runnerUp?.title ?? null} />

      {/* Families-in-play chip strip */}
      {familyCounts.length > 0 && (
        <div style={{ padding: "10px 14px 6px" }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 6, color: "var(--vr-cream-mute)" }}>
            Families in play
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {familyCounts.map(f => (
              <span
                key={f.title}
                className="t-eyebrow"
                style={{
                  fontSize: 9,
                  padding: "3px 8px 2px",
                  color: "var(--vr-cream-dim)",
                  border: "1px solid var(--vr-line)",
                  borderRadius: 2,
                  letterSpacing: "0.12em",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                {f.title}
                <span style={{ opacity: 0.7 }}>· {f.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Latest change-log preview */}
      {latestChange && (
        <div style={{ padding: "8px 14px 10px", borderTop: "1px solid var(--vr-line)" }}>
          <ChangeLogPreviewRow event={latestChange} />
        </div>
      )}

      {/* Footer meta */}
      <div
        style={{
          padding: "10px 14px 12px",
          borderTop: "1px solid var(--vr-line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-faint)" }}>
          Updated {relTime(campaign.updated_at)}
          {campaign.updated_by ? ` · by ${campaign.updated_by}` : ""}
        </div>
        <span
          className="t-eyebrow"
          style={{ fontSize: 9, color: "var(--vr-gold)", display: "inline-flex", gap: 5, alignItems: "center" }}
        >
          Open campaign
          <svg width="10" height="10" viewBox="0 0 8 8" fill="none">
            <path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </span>
      </div>
    </Link>
  )
}

// ─── Index page ─────────────────────────────────────────────────────────────

const LS_KEY = "vr-campaigns-sleeve"
type SleeveFilter = "ALL" | "STOCKS" | "OPTIONS" | "CRYPTO"
const VALID_FILTERS: ReadonlyArray<SleeveFilter> = ["ALL", "STOCKS", "OPTIONS", "CRYPTO"]

export function ViresCampaignsIndex({ data }: { data: CampaignsIndexData | null }) {
  const [sleeve, setSleeve] = useState<SleeveFilter>("ALL")
  const [hydrated, setHydrated] = useState(false)

  // Hydrate filter from localStorage on mount. We accept the one-time
  // cascading render the lint rule warns about — we have to read localStorage
  // post-mount (SSR has no window) and can't use a lazy useState initializer.
  useEffect(() => {
    try {
      const v = localStorage.getItem(LS_KEY)
      if (v && (VALID_FILTERS as readonly string[]).includes(v)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSleeve(v as SleeveFilter)
      }
    } catch {
      // localStorage unavailable — stay on default
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(LS_KEY, sleeve)
    } catch {
      // ignore
    }
  }, [sleeve, hydrated])

  const campaigns = data?.campaigns ?? []
  const counts = useMemo(() => countsBySleeve(campaigns), [campaigns])
  const filtered = useMemo(() => {
    if (sleeve === "ALL") return campaigns
    return campaigns.filter(c => (c.sleeve ?? "").toUpperCase() === sleeve)
  }, [campaigns, sleeve])

  if (!data) {
    return (
      <div style={{ padding: 16 }}>
        <div
          className="vr-card"
          style={{ padding: 22, textAlign: "center", color: "var(--vr-cream-dim)" }}
        >
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>Bench · Campaigns</div>
          <div className="t-read" style={{ fontSize: 12, lineHeight: 1.55 }}>
            No campaign registry has landed in{" "}
            <span className="t-ticker">data/bench/campaigns/</span> yet. Codex&apos;s
            producer ships the manifests; the UI renders what it finds.
          </div>
        </div>
      </div>
    )
  }

  const sleeveLabel =
    SLEEVE_FILTERS.find(f => f.k === sleeve)?.l.toLowerCase() ?? "sleeve"

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <CampaignsMasthead registry={data.registry} campaigns={campaigns} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="t-eyebrow" style={{ color: "var(--vr-cream-mute)" }}>
          Research programs
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div className="t-h2" style={{ fontSize: 22, lineHeight: 1.2 }}>
            Active campaigns
          </div>
          <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-faint)" }}>
            {filtered.length} {sleeve === "ALL" ? "total" : `in ${sleeveLabel}`}
          </div>
        </div>
        <SleeveFilterBar value={sleeve} onChange={setSleeve} counts={counts} />
      </div>

      {filtered.length === 0 ? (
        <div
          className="vr-card"
          style={{
            padding: 22,
            textAlign: "center",
            color: "var(--vr-cream-dim)",
            background: "var(--vr-ink)",
          }}
        >
          <div className="t-read" style={{ fontSize: 12, lineHeight: 1.55 }}>
            No {sleeveLabel} campaigns. Nothing is being researched for this sleeve yet.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 14,
          }}
        >
          {filtered.map(c => (
            <CampaignCard key={c.campaign_id} campaign={c} />
          ))}
        </div>
      )}
    </div>
  )
}
