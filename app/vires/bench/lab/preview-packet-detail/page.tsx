// Preview route for the Strategy Authoring Packet detail screen using
// the RAM reference fixture from PR #3. Renders the same PacketDetailClient
// that the live route uses, so layout/copy can be verified without needing
// a real persisted packet first.
//
// Mutations (slug confirm, transitions) will hit the live PATCH endpoint
// against the fixture's packet_id — they'll 404 since the fixture isn't
// persisted. That's expected; this preview is for visual review only.
//
// Will be removed once real packets exist and the live route can be hit.

import { PacketDetailClient } from "@/components/vires/lab/strategy-authoring/packet-detail-client"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import { compileStrategyAuthoringPacket } from "@/lib/research-lab-strategy-authoring-compiler"
import { validateStrategyAuthoringPacket } from "@/lib/research-lab-strategy-authoring"
import { RAM_REFERENCE_STRATEGY_AUTHORING_PACKET_FIXTURE } from "@/lib/research-lab-strategy-authoring.fixture"

export const metadata = {
  title: "Vires Capital — Lab · Packet Detail Preview",
}

export const dynamic = "force-dynamic"

export default function PreviewPacketDetailPage() {
  const packet = RAM_REFERENCE_STRATEGY_AUTHORING_PACKET_FIXTURE
  const compileResult = compileStrategyAuthoringPacket(packet)
  const validationIssues = validateStrategyAuthoringPacket(packet)
  return (
    <>
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "20px 20px 0",
        }}
      >
        <div
          className="vr-card"
          style={{
            padding: "10px 14px",
            border: "1px dashed var(--vr-line-hi)",
            background: "transparent",
          }}
        >
          <span
            className="t-eyebrow"
            style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "var(--vr-cream-mute)" }}
          >
            ⓘ PREVIEW · RAM reference fixture · mutations will 404 (fixture is not persisted)
          </span>
        </div>
      </div>
      <PacketDetailClient
        initialView={{
          packet,
          compile_result: compileResult,
          validation_issues: validationIssues,
          trial_ledger_entries: [],
        }}
        scope={PHASE_1_DEFAULT_SCOPE}
      />
    </>
  )
}
