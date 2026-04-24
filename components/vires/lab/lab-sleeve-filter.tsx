"use client"

// Filter bar for Lab list pages. Thin wrapper around the shared
// SleeveFilterBar that wires it to the Lab's own localStorage-backed
// sleeve filter state. Counts default to zero; pass real counts in
// when the caller has them (e.g. Jobs page once the filter has data).

import { SleeveFilterBar } from "../campaigns-shared"
import { useLabSleeveFilter } from "./use-lab-sleeve-filter"

export function LabSleeveFilter({
  counts,
}: {
  counts?: Record<string, number> & { ALL: number }
}) {
  const [sleeve, setSleeve] = useLabSleeveFilter()
  const resolved = counts ?? { ALL: 0, STOCKS: 0, OPTIONS: 0, CRYPTO: 0 }
  return (
    <div style={{ margin: "14px 0 4px" }}>
      <SleeveFilterBar
        value={sleeve}
        onChange={setSleeve}
        counts={resolved}
        ariaLabel="Lab sleeve filter"
      />
    </div>
  )
}
