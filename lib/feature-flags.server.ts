// Server-only feature flags for the Vires Lab surfaces.
//
// Phase D-implementation lives behind `vires.lab.spec_authoring`. Read from
// VIRES_LAB_SPEC_AUTHORING; truthy values are "1", "true", "yes" (case-insensitive).
// Default is off, which keeps the existing idea detail page intact for anyone
// without the flag.

const TRUTHY = new Set(["1", "true", "yes", "on"])

function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  return TRUTHY.has(value.trim().toLowerCase())
}

export function specAuthoringEnabled(): boolean {
  return isTruthy(process.env.VIRES_LAB_SPEC_AUTHORING)
}

export function unifiedBuilderEnabled(): boolean {
  return isTruthy(process.env.VIRES_LAB_UNIFIED_BUILDER)
}
