# Codex Primer — Lab idea lifecycle + Trade Atlas + UX sweep

Date: 2026-04-28
From: Claude (Opus 4.7)
For: Codex
Audience: anyone picking up Lab work after this session

This is a checkpoint of what Claude shipped today on the dashboard side
of the Lab so you can plan parallel work without stepping on it.

---

## 1. New API surface — idea editing & deletion

`app/api/research/ideas/[id]/route.ts` was extended:

**PATCH** now accepts (in addition to existing `promotion_target` / `promote_to_campaign` / `status`):
- `title`, `thesis`, `sleeve`, `strategy_id`, `code_pending`,
  `strategy_family`, `tags`, `params`

These are gated as **draft-only edits**:
- Returns 409 if `status !== "DRAFT"`
- Returns 409 if `hasLabCampaignForIdea(ideaId)` is true
- Validates `strategy_id` against `data/research_lab/presets/_index.json`
- Toggling `code_pending: true` auto-clears both `strategy_id` and
  `strategy_family` server-side (the latter was just added — without it
  a stale family survived the toggle)

**DELETE** is a hard delete of the YAML:
- Refuses 409 if status is QUEUED or ACTIVE
- Refuses 409 if a Lab campaign references the idea
- Idempotent on missing files (returns `mode: "noop"`)
- Goes through the same GitHub Contents API path as PATCH/POST

`OPERATOR_ALLOWED_TRANSITIONS` defines the operator-writable status
graph; the lab pipeline still owns DRAFT → QUEUED → ACTIVE writes.
Code-pending ideas are blocked from READY by an explicit guard.

---

## 2. New UI surfaces

| File | What it does |
|---|---|
| `components/vires/lab/idea-status-control.tsx` | Popover on the idea detail page. Operator-allowed status transitions, hard delete with safety rails, "Convert to code-pending" quick action. Click-outside / Esc / touch dismiss with busy-guard. After save shows "saved ✓ — deployed in ~2 min" (no `router.refresh()` because the YAML reload is on next deploy, not next render). |
| `components/vires/lab/idea-edit-form.tsx` | Full edit form mirroring create-form fields. Mounted at `/vires/bench/lab/ideas/[id]/edit`. Send `strategy_family` explicitly so the toggle to code-pending defensively clears it. |
| `app/vires/bench/lab/ideas/[id]/edit/page.tsx` | Server route that loads idea + preset index, gates on `status === "DRAFT" && !hasLabCampaignForIdea`, returns a NotEditableShell otherwise. |
| `components/vires/lab/equity-curve-swarm.tsx` | **Trade Atlas** — multi-line equity headline + per-trade swarm. Library-agnostic API: `<TradeAtlas data scaleMode onTradeSelect>`. Recharts Brush for drag-to-zoom. Headline plotted as $-delta from starting capital. Tooltip dedupes Area/Line collisions on the same dataKey. Currently NOT mounted on the jobs page — waiting for a real `equity_swarm_artifact` to exist before rendering. |
| `components/vires/lab/equity-curve-swarm.mock.ts` | TS contract mirroring producer commit `bdb4f8d` shape (nullable benchmark, `side`, `exit_reason`, `as_of_date`, `source_*`). |
| `app/vires/bench/lab/equity-swarm-preview/page.tsx` | Mock preview page for visual iteration. |

The contract handoff doc is `_design_handoff/CODEX_PRIMER_2026-04-28_lab_equity_swarm_contract.md`.

---

## 3. Show-don't-tell UX sweep

Saved as durable feedback memory: `feedback_show_dont_tell.md`. The rule:

> Drop decorative `t-eyebrow` micro-labels above main page surfaces. The
> visual identity (serif italic title + InfoBubble) carries the meaning.
> Keep eyebrows only where they're *functional* — column headers, form
> field labels, chip groups, tiny status flags.

Touched on this pass:
- Idea detail page: dropped redundant `Idea` eyebrow over the title;
  serif italic title carries it.
- New campaign page: dropped `New campaign` and `Configuring` eyebrows.
- Idea form: simplified Talon/code-pending guidance copy.
- `result-leaderboard.tsx`: top eyebrow → serif italic "Leaderboard".

Functional eyebrows kept:
- `FormRow` labels in idea-form / idea-edit-form
- `ChipToggle` labels (sleeve, strategy mode, status)
- KPI/column headers in tables and cards

---

## 4. Bug fixes shipped this session

- **Tooltip duplicate "strategy"**: Area + Line both had
  `dataKey="strategy"`. Fixed by deduping via reverse iteration in
  custom tooltip filter — Line wins.
- **Trade row dividers too thick**: Removed `borderTop`, replaced with
  `.ta-trade-row:hover` soft surface in `vires.css`.
- **`--vr-font-mono` doesn't exist**: 4 spots fixed to `--ff-mono`.
- **Click-outside dismiss broken on popover**: useEffect with mousedown
  / touchstart / keydown listeners, busy-guarded.
- **Delete looked broken**: actually worked, but Vercel deploy lag
  meant operator saw stale list. Fixed UX with explicit "deleted ✓ —
  deployed in ~2 min" state.
- **strategy_family stuck on "regime aware momentum" after code-pending
  toggle**: Backend now auto-clears `strategy_family` when
  `code_pending` toggles to true, parallel to the existing
  `strategy_id` auto-clear. Edit form also defensively sends
  `strategy_family: ""` in code-pending payloads.

---

## 5. Architectural awareness — Vercel deploy lag

Every operator action commits to GitHub. The detail/list pages are
server-rendered from the deployed bundle. So:

- Status PATCH or DELETE → commit lands → ~2 min Vercel rebuild → list
  reflects new state on next request after rebuild.
- This is fine for ideas (low-frequency, owned by operator), but
  **don't** wire any high-frequency state through the same path.
- All operator-action UIs now show "saved ✓ — deployed in ~2 min" so
  the operator stops thinking the action failed.

---

## 6. What's still pending

- **Trade Atlas mount on jobs page**: deferred until a real
  `equity_swarm_artifact` exists. Don't render "awaiting completion"
  empty state everywhere — it's noise without data.
- **Cron wrapper install**: Codex still needs to land
  `*/5 * * * * /usr/bin/flock -n /tmp/research-lab-worker.lock …` for
  Lab artifacts to actually start producing. Until then the equity
  swarm artifact never materializes and the new idea lifecycle
  surfaces are the only Lab-related thing operators can exercise.
- **Lab repositioning + friendliness sweep**: hold for Claude Design
  review *after* one real run is walked end-to-end. See
  `~/.claude/projects/-home-jacobbarkley/memory/lab-redesign-thread-2026-04-27.md`.
- **Auto-clear semantics edge case**: if an operator manually sends
  `code_pending: false` AND a registered `strategy_id` but no
  `strategy_family`, the family is whatever the existing YAML had.
  That's fine for the UI flow today (edit form always sends family
  alongside strategy_id), but worth knowing if you build another
  caller of this PATCH endpoint.

---

## 7. Files I touched (reference)

```
app/api/research/ideas/[id]/route.ts              # PATCH ext + DELETE
app/vires/bench/lab/ideas/[id]/page.tsx           # mounted status control + edit pill
app/vires/bench/lab/ideas/[id]/edit/page.tsx      # NEW
app/vires/bench/lab/new-campaign/[idea]/page.tsx  # eyebrow sweep
app/vires/bench/lab/equity-swarm-preview/page.tsx # NEW (mock only)
app/vires.css                                     # benchmark color, .ta-trade-row hover
components/vires/lab/equity-curve-swarm.tsx       # NEW (Trade Atlas)
components/vires/lab/equity-curve-swarm.mock.ts   # NEW
components/vires/lab/idea-form.tsx                # spec capture + sweep
components/vires/lab/idea-edit-form.tsx           # NEW
components/vires/lab/idea-status-control.tsx      # NEW
components/vires/lab/result-leaderboard.tsx       # eyebrow + ff-mono fix
```

No changes to `components/trading-dashboard.tsx` or any operator-feed
plumbing — Lab work is fully isolated from the trading page.
