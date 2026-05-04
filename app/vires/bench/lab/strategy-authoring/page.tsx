// Strategy Authoring index — lists every persisted Strategy Authoring
// Packet for the operator's scope. Entry point into the lifecycle.
//
// Drafting starts from an idea (POST /packets requires an idea_id), so
// the empty state and the page footer both point operators back to
// /vires/bench/lab/ideas to pick or create one.

import Link from "next/link"
import { notFound } from "next/navigation"

import { packetAuthoringEnabled } from "@/lib/feature-flags.server"
import {
  PHASE_1_DEFAULT_SCOPE,
  type StrategyAuthoringPacketStatus,
  type StrategyAuthoringPacketV1,
} from "@/lib/research-lab-contracts"
import { loadStrategyAuthoringPackets } from "@/lib/research-lab-strategy-authoring.server"

export const metadata = {
  title: "Vires Capital — Lab · Strategy Authoring",
}

export const dynamic = "force-dynamic"

const STATUS_COLOR: Record<StrategyAuthoringPacketStatus, string> = {
  DRAFT: "var(--vr-cream-faint)",
  REVIEW: "var(--vr-gold)",
  ADVERSARIAL: "var(--vr-gold)",
  APPROVED: "var(--vr-up)",
  REJECTED: "var(--vr-down)",
  ARCHIVED: "var(--vr-cream-faint)",
}

const STATUS_ORDER: StrategyAuthoringPacketStatus[] = [
  "DRAFT",
  "REVIEW",
  "ADVERSARIAL",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
]

export default async function StrategyAuthoringIndexPage() {
  if (!packetAuthoringEnabled()) {
    notFound()
  }
  const scope = PHASE_1_DEFAULT_SCOPE
  const packets = await loadStrategyAuthoringPackets(scope)
  const buckets = bucketByStatus(packets)
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "32px 20px 120px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span
          className="t-eyebrow"
          style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--vr-gold)" }}
        >
          STRATEGY AUTHORING
        </span>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--ff-serif)",
            fontSize: 28,
            color: "var(--vr-cream)",
            lineHeight: 1.2,
          }}
        >
          Packets
        </h1>
        <p
          className="t-read"
          style={{ margin: 0, fontSize: 13, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}
        >
          Every governed authoring packet in your scope. A packet starts from an
          idea, gets a Talon-synthesized first draft, and walks through review,
          adversarial check, approval, and bench handoff.
        </p>
      </header>

      {packets.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {STATUS_ORDER.map(status => {
            const list = buckets.get(status)
            if (!list || list.length === 0) return null
            return (
              <Section key={status} status={status} count={list.length}>
                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {list.map(p => (
                    <PacketRow key={p.packet_id} packet={p} />
                  ))}
                </ul>
              </Section>
            )
          })}
        </div>
      )}

      <footer
        style={{
          borderTop: "1px solid var(--vr-line)",
          paddingTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <span
          className="t-eyebrow"
          style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "var(--vr-cream-faint)" }}
        >
          START A NEW PACKET
        </span>
        <p
          className="t-read"
          style={{ margin: 0, fontSize: 12, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}
        >
          Drafting begins from an idea. Open <Link href="/vires/bench/lab/ideas" style={linkStyle}>
            ideas
          </Link>, pick or create the thesis, then use “Draft Strategy Authoring Packet” on the
          idea page.
        </p>
      </footer>
    </main>
  )
}

function bucketByStatus(packets: StrategyAuthoringPacketV1[]) {
  const out = new Map<StrategyAuthoringPacketStatus, StrategyAuthoringPacketV1[]>()
  for (const p of packets) {
    const existing = out.get(p.status) ?? []
    existing.push(p)
    out.set(p.status, existing)
  }
  for (const list of out.values()) {
    list.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }
  return out
}

function EmptyState() {
  return (
    <div
      className="vr-card"
      style={{
        padding: "20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        border: "1px dashed var(--vr-line-hi)",
        background: "transparent",
      }}
    >
      <span
        className="t-eyebrow"
        style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--vr-cream-mute)" }}
      >
        NO PACKETS YET
      </span>
      <p
        className="t-read"
        style={{ margin: 0, fontSize: 12.5, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}
      >
        Strategy authoring starts from an idea. Pick one in{" "}
        <Link href="/vires/bench/lab/ideas" style={linkStyle}>
          /vires/bench/lab/ideas
        </Link>{" "}
        and use “Draft Strategy Authoring Packet” on its detail page.
      </p>
    </div>
  )
}

function Section({
  status,
  count,
  children,
}: {
  status: StrategyAuthoringPacketStatus
  count: number
  children: React.ReactNode
}) {
  const color = STATUS_COLOR[status]
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          className="t-eyebrow"
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            color,
            border: `1px solid ${color}`,
            padding: "2px 8px",
            borderRadius: 2,
            fontFamily: "var(--ff-mono)",
          }}
        >
          {status}
        </span>
        <span
          className="t-mono"
          style={{ fontSize: 10.5, color: "var(--vr-cream-faint)" }}
        >
          {count}
        </span>
      </div>
      {children}
    </section>
  )
}

function PacketRow({ packet }: { packet: StrategyAuthoringPacketV1 }) {
  const slug = packet.strategy_spec.strategy_id.value
  const slugConfirmed = packet.strategy_spec.strategy_id.provenance.operator_confirmed
  return (
    <li>
      <Link
        href={`/vires/bench/lab/strategy-authoring/packets/${encodeURIComponent(packet.packet_id)}`}
        className="vr-card"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "12px 14px",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            className="t-read"
            style={{ fontSize: 13.5, color: "var(--vr-cream)", fontFamily: "var(--ff-serif)" }}
          >
            {packet.strategy_spec.strategy_name}
          </span>
          {!slugConfirmed && (
            <span
              className="t-eyebrow"
              style={{
                fontSize: 8.5,
                letterSpacing: "0.14em",
                color: "var(--vr-gold)",
                border: "1px solid var(--vr-gold)",
                padding: "1px 5px",
                borderRadius: 2,
                fontFamily: "var(--ff-mono)",
              }}
            >
              SLUG UNCONFIRMED
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span
            className="t-mono"
            style={{ fontSize: 10, color: "var(--vr-cream-faint)" }}
          >
            {slug}
          </span>
          <span
            className="t-mono"
            style={{ fontSize: 10, color: "var(--vr-cream-faint)" }}
          >
            {packet.strategy_spec.sleeve} · {packet.strategy_spec.strategy_family}
          </span>
          <span
            className="t-mono"
            style={{ fontSize: 10, color: "var(--vr-cream-faint)" }}
          >
            updated {fmtDate(packet.updated_at)}
          </span>
        </div>
      </Link>
    </li>
  )
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const linkStyle: React.CSSProperties = {
  color: "var(--vr-gold)",
  textDecoration: "underline",
  textUnderlineOffset: 2,
}
