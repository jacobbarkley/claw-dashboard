// Server-component wrapper for the Lab sub-nav. Reads the redesign flag
// at the source so every Lab page renders the right tab set automatically
// — no per-caller `redesign` prop wiring on idea/job/spec sub-pages.

import { labRedesignEnabled } from "@/lib/feature-flags.server"

import { LabSubNavClient } from "./lab-sub-nav-client"

export function LabSubNav({ redesign }: { redesign?: boolean } = {}) {
  // Explicit `redesign` overrides the flag (kept so existing call sites that
  // pass `redesign` don't change behavior). Default reads the env flag.
  const on = redesign ?? labRedesignEnabled()
  return <LabSubNavClient redesign={on} />
}
