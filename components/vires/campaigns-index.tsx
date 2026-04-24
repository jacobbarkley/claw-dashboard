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
} from "@/lib/vires-campaigns"
import { countsBySleeve, statusCounts } from "@/lib/vires-campaigns"
import {
  SLEEVE_FILTERS,
  SleeveFilterBar,
  StatusPillCampaign,
  relTime,
  type SleeveFilter,
} from "./campaigns-shared"
import { InfoPop, SleeveChip, fmtNum, fmtPct, toneColor, toneOf, type Sleeve } from "./shared"

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

// SleeveFilterBar extracted to campaigns-shared so bench-view can reuse it.

// ─── Lever cell (index-card — NOT a button; detail page uses LeverShell) ───
// Supports two flavors: activity signals (leader stability, last run) and
// performance metrics (excess vs bench, sharpe). `infoTerm` maps to the shared
// glossary; renders an inline "i" affordance one tap from a definition.

function LeverCell({
  eyebrow,
  value,
  sub,
  valueColor,
  infoTerm,
}: {
  eyebrow: string
  value: string
  sub?: string | null
  valueColor?: string
  infoTerm?: string
}) {
  return (
    <div style={{ padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
        <span className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)" }}>
          {eyebrow}
        </span>
        {infoTerm && <InfoPop term={infoTerm} size={11} />}
      </div>
      <div
        className="t-num"
        style={{ fontSize: 14, color: valueColor ?? "var(--vr-cream)", fontWeight: 500 }}
      >
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

// ─── Campaign Card ──────────────────────────────────────────────────────────

function CampaignCard({ campaign }: { campaign: CampaignManifest }) {
  const rs = campaign.recency_signals
  const perf = campaign.baseline_performance
  const excessPct = perf?.excess_return_pct ?? null
  const sharpe = perf?.sharpe ?? null
  const sleeveKey = (campaign.sleeve ?? "").toString().toLowerCase()
  const sleeveIsValid = sleeveKey === "stocks" || sleeveKey === "options" || sleeveKey === "crypto"

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
      {/* Header: sleeve · status on the left, Open action on the right.
          Benchmark pill removed (visible on the detail page); the status
          pill takes its spot next to the sleeve chip. */}
      <div
        style={{
          padding: "14px 16px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {sleeveIsValid && <SleeveChip sleeve={sleeveKey as Sleeve} />}
        <StatusPillCampaign status={campaign.status} />
        <span style={{ flex: 1 }} />
        <span
          aria-hidden
          className="t-eyebrow"
          style={{
            fontSize: 10,
            color: "var(--vr-gold)",
            padding: "6px 12px",
            border: "1px solid var(--vr-gold-line)",
            borderRadius: 3,
            background: "var(--vr-gold-soft)",
            letterSpacing: "0.14em",
          }}
        >
          Open Campaign
        </span>
      </div>

      {/* Title + summary (campaign_pressure sentence lives on the detail page only) */}
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
      </div>

      {/* Featured candidate row removed — "Current leader" / "Baseline
          to beat" labels are visible on the campaign detail page when the
          user opens the card. Keeps the index card tight. */}

      {/* 2x2 hybrid grid — two performance metrics + two activity signals */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
        }}
      >
        <div style={{ borderRight: "1px solid var(--vr-line)", borderBottom: "1px solid var(--vr-line)" }}>
          <LeverCell
            eyebrow={`vs ${campaign.benchmark_symbol}`}
            value={excessPct != null ? fmtPct(excessPct, { sign: true }) : "—"}
            valueColor={toneColor(toneOf(excessPct))}
            infoTerm="VsBench"
          />
        </div>
        <div style={{ borderBottom: "1px solid var(--vr-line)" }}>
          <LeverCell
            eyebrow="Sharpe"
            value={sharpe != null ? fmtNum(sharpe) : "—"}
            infoTerm="Sharpe"
          />
        </div>
        <div style={{ borderRight: "1px solid var(--vr-line)" }}>
          <LeverCell
            eyebrow="Leader stability"
            value={
              rs.leader_stability_sessions != null
                ? `${rs.leader_stability_sessions} ${rs.leader_stability_sessions === 1 ? "session" : "sessions"}`
                : "—"
            }
            sub={rs.last_leader_change_at ? `changed ${relTime(rs.last_leader_change_at)}` : null}
            infoTerm="LeaderStability"
          />
        </div>
        <div>
          <LeverCell
            eyebrow="Last run"
            value={campaign.last_run_at ? relTime(campaign.last_run_at) : "—"}
            sub={null}
            infoTerm="LastRun"
          />
        </div>
      </div>

      {/* Footer removed — "Updated X ago · by Codex" + standalone
          Open-campaign button both dropped. The Open action moved to
          the header top-right; updated-by moves to the detail page. */}
    </Link>
  )
}

// ─── Index page ─────────────────────────────────────────────────────────────

const LS_KEY = "vr-campaigns-sleeve"
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
