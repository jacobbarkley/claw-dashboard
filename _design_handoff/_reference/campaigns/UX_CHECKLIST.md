# Bench Campaigns — UX Checklist

Per Rev-3 protocol: every surface ships with what it shows, what it does NOT show, and why the exclusions are intentional.

## Campaign Index — Masthead

| Shows | |
|---|---|
| Eyebrow `Bench · Campaigns` | Matches existing nav idiom |
| Freshness stamp from `registry.generated_at` | Signals operator-feed cadence |
| Serif headline framing Production vs Bench | Primer's "what is competing to deserve capital" |
| 4 counters: Active · Exploring · Converging · Promoted | Rolled up from `campaigns[].status` |

| Does NOT show | Why |
|---|---|
| "Last sync" or "Next refresh" timer | No polling in v1; manifest writes are event-driven per contract |
| Filter by sleeve | Every campaign in v1 is `STOCKS`; filters are premature |
| Filter by status | 2 campaigns; filters would add chrome without value. Add when n ≥ 6. |
| Search box | Same reason |
| "New campaign" CTA | Campaigns are created by backend agents checking in a manifest, not from the UI |

## Campaign Card

| Shows | |
|---|---|
| Sleeve chip + `· vs {benchmark_symbol}` + status pill | Immediate triage |
| `title` (serif) + `summary` (body) | Thesis at a glance |
| **Current leader row with tier-differentiated visual** | Contract-critical distinction |
| 2×2 lever grid: leader stability · last run · param sweep · candidates | The "what's the lever?" signals |
| Runner-up gap band | Honest copy when unquantified |
| Families-in-play chips | Reveals multi-family competition |
| Latest change-log entry | Preview; full timeline is detail-page |
| Footer: `Updated Xm ago · by {actor}` + "Open campaign →" | Freshness + affordance |

| Does NOT show | Why |
|---|---|
| `LEADER`, `CHALLENGER`, `PROMOTED_REFERENCE` all rendered the same way | Contract explicitly requires distinct treatment; promoted reference is a line in the sand, not a peer |
| A dash or "pending" for `runner_up_gap.value: null` | Honest-data rule; the `summary` sentence IS the surface |
| Synthetic history / sparkline / trendline | No history field in the contract; inventing it would violate the honest-data rule |
| "Leader confidence" badge | Not in the contract. Status + stability sessions already carry this signal. |
| Per-candidate metrics on the index | Candidates are a detail-page concern |
| Full candidate list | Same reason — count is the right grain here |
| "Promote" / "Retire" / "Adjust" action buttons | Writes come from agents via the manifest, not from this UI |
| Who-wrote-this actor badge prominently | Contract: UI should not care who wrote the update; `updated_by` lives in small footer metadata only |
| Relative time on hover / tooltip with absolute time | V1 scope; consider if operators ask for it |

## Role visual distinction (contract-critical)

| Role | Treatment |
|---|---|
| `LEADER` | Outlined gold "LEADING" pill on a neutral row; eyebrow "Current leader" |
| `PROMOTED_REFERENCE` | **Filled** gold "BASELINE" tag on a faint gold-tinted row; eyebrow "Baseline to beat" |
| `CHALLENGER` | Cream outline "CHALLENGER" (detail-page only on v1 index) |

**Test:** A `CONVERGING` card with a `PROMOTED_REFERENCE` leader looks materially different from a `CONVERGING` card with a `LEADER` leader. Status alone does not carry the whole signal.

## Change-log preview row (index)

| Shows | |
|---|---|
| Kind icon (distinct per enum value) | Semantic differentiation |
| Kind label (humanized) | Readable name |
| Relative time | Freshness cue |
| Event title | What happened |

| Does NOT show | Why |
|---|---|
| `detail` field | Reserved for detail-page timeline |
| `actor` | Same reason; index is thesis-focused |
| From/to candidate links | Same reason |
| Multiple entries per card | Index is a preview; detail carries the full timeline |

## Navigation

| Shows | |
|---|---|
| Bench sub-nav: `Runs` / `Campaigns` | Campaigns ARE bench — sibling tabs preserve the mental model |
| Persistence of active sub-tab across reload | Matches existing `vr-page` pattern |
| Back button on detail stub | Consistent with passport/run-detail back nav |

| Does NOT show | Why |
|---|---|
| Campaigns as a top-level nav item | Would split research artifacts across two surfaces |
| Breadcrumbs | App is shallow enough; back buttons are enough |
| Cross-campaign "active runs" aggregator | Lives on existing Runs tab; don't duplicate |

## Empty / degraded states covered

See `DEGRADATION.md` for the full matrix.

- Null `runner_up_gap.value` with summary present → honest prose
- Null `runner_up_candidate_id` → gap band renders without the runner-up footnote
- Empty `change_log` → latest-change block omitted entirely (not a "No activity" placeholder)
- Challenger with `latest_run.run_id: null` → not surfaced on index at all; deferred to detail
- Unknown `change_log[].kind` → neutral dot + raw kind lowercased as fallback

## Scope footnote card

At the bottom of the index: a dashed card stating "Detail pages and the full change-log timeline land in the next package." This is intentional — it tells operators what is and isn't shipped rather than leaving them to wonder why clicking a card shows a stub.
