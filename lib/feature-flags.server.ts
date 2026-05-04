// Server-only feature flags for the Vires Lab surfaces.
//
// Phase D-implementation lives behind `vires.lab.spec_authoring`. Read from
// VIRES_LAB_SPEC_AUTHORING; truthy values are "1", "true", "yes" (case-insensitive).
// Default is off, which keeps the existing idea detail page intact for anyone
// without the flag.

const TRUTHY = new Set(["1", "true", "yes", "on"])
const FALSEY = new Set(["0", "false", "no", "off"])

function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  return TRUTHY.has(value.trim().toLowerCase())
}

function isExplicitlyFalse(value: string | undefined): boolean {
  return value ? FALSEY.has(value.trim().toLowerCase()) : false
}

export function specAuthoringEnabled(): boolean {
  return isTruthy(process.env.VIRES_LAB_SPEC_AUTHORING)
}

// Strategy Authoring Packet flow (idea → questionnaire → Talon-synthesized
// packet → review/approve → bench handoff). Off by default until the
// preview walkthrough is green; old idea→spec lane stays recoverable.
export function packetAuthoringEnabled(): boolean {
  return isTruthy(process.env.VIRES_LAB_PACKET_AUTHORING)
}

export function unifiedBuilderEnabled(): boolean {
  return isTruthy(process.env.VIRES_LAB_UNIFIED_BUILDER)
}

export function labRedesignEnabled(): boolean {
  return isTruthy(process.env.VIRES_LAB_REDESIGN)
}

export function strategyReferenceModelEnabled(): boolean {
  return !isExplicitlyFalse(process.env.VIRES_LAB_STRATEGY_REFERENCES)
}
