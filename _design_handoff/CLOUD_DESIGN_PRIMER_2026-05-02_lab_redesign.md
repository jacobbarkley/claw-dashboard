# Cloud Design Primer — Vires Lab redesign

**Date:** 2026-05-02
**From:** Claude (Opus 4.7), per Jacob's request
**For:** Cloud design agent
**Goal:** Get fully oriented on the Vires Capital research Lab as it
exists today, render the current state faithfully, then iterate
with Jacob on a redesign. **No code edits in this pass — this is
"see the building before redrawing it."**

---

## §1 — What this app is

Vires Capital is a single-operator (currently) trading research +
operations dashboard. It runs at `claw-dashboard-kappa.vercel.app`
and ships from `git@github.com:jacobbarkley/claw-dashboard.git`.

Jacob is the operator. He uses this primarily on **mobile (iPhone,
PWA-installed)** to manage real paper trading and research workflow.
Desktop is secondary. Mobile-first is mandatory.

The app has two top-level surfaces:

- **Trading** — live operator feed, sleeves (Stocks / Options /
  Crypto), positions, orders. Stable, functional, not the focus
  of this redesign.
- **Bench** — research surface, includes the **Lab** (the focus
  here), passport view, campaigns, plateau/promotion flow.

The Lab is where ideas get authored, drafted into specs, run as
backtests, scored, and (eventually) promoted into live strategies.
It's the operator-facing workflow surface for the entire research
loop. **It's the part of the app that needs to feel like a premium
research tool, not a CRUD UI.**

---

## §2 — Repo orientation

Clone: `git@github.com:jacobbarkley/claw-dashboard.git` (or browse
on GitHub directly — public-readable to authorized users).

**Files you should read in this order:**

1. **`CLAUDE.md`** (repo root) — operator-surface law. Notably:
   "thin operator surface, NOT a second source of truth." The Lab
   is more interactive than the trading page, but the same
   principle holds.

2. **`_design_handoff/vires_capital/files/vires.css`** — the
   design tokens. Color system, typography, spacing, shadows.
   You'll reference these constantly. Key tokens:
   - `--vr-ink` (background), `--vr-cream` (primary text),
     `--vr-gold` (accent — used sparingly, never decoratively)
   - `--ff-serif` (Cormorant Garamond — display + emphasis)
   - `--ff-sans` (default body)
   - `--ff-mono` (data, IDs, code, prices)

3. **`_design_handoff/vires_capital/README.md`** — design system
   intent. The brand voice is "old-money private bank meets
   quant research lab." Cream-on-ink, hairline rules, gold
   accents only when they earn their place. No emojis. No icons
   unless functionally necessary.

4. **`_design_handoff/CLAUDE_PRIMER_2026-05-01_experiment_aware_spec_page_ux.md`**
   — the most recent UX thinking on the spec edit page,
   specifically how strategy + experiment plan are coupled.

5. **`_design_handoff/CODEX_PRIMER_2026-05-01_talon_draft_v2_durable_jobs.md`**
   — backend pipeline that's about to land. Affects the spec
   edit page (durable job state replaces today's synchronous
   request).

6. **`_design_handoff/CODEX_PRIMER_2026-05-01_strategy_reference_model.md`**
   — the new-idea form is about to gain a "reference strategies"
   picker (0–2 lineage parents). Worth knowing about; not yet
   wired into the UI.

---

## §3 — Lab routes (what to render)

All under `/vires/bench/lab/`. URLs in the live app:

| Route | File | Purpose |
|-------|------|---------|
| `/vires/bench/lab` | `app/vires/bench/lab/page.tsx` | Lab home — phase-zero shell, sleeve filter, ideas/jobs/reports nav |
| `/vires/bench/lab/ideas` | `app/vires/bench/lab/ideas/page.tsx` | Ideas list — every idea ever authored |
| `/vires/bench/lab/ideas/new` | `app/vires/bench/lab/ideas/new/page.tsx` | New-idea form (recently cleaned up — `idea-form.tsx`) |
| `/vires/bench/lab/ideas/[id]` | `app/vires/bench/lab/ideas/[id]/page.tsx` | Idea detail — the **lifecycle thread** (most important page) |
| `/vires/bench/lab/ideas/[id]/edit` | … | Edit idea metadata |
| `/vires/bench/lab/ideas/[id]/spec/edit` | … | Spec authoring page (form + Talon chat panel) |
| `/vires/bench/lab/jobs` | `app/vires/bench/lab/jobs/page.tsx` | Job list — every backtest run |
| `/vires/bench/lab/jobs/[id]` | `app/vires/bench/lab/jobs/[id]/page.tsx` | Job detail — run anatomy, verdict, leaderboard, trade atlas |
| `/vires/bench/lab/new-campaign/[idea]` | … | Spawn a campaign from an idea |
| `/vires/bench/lab/reports` | … | Reports / aggregate views |
| `/vires/bench/lab/spec-preview` | … | Standalone preview surface |
| `/vires/bench/lab/equity-swarm-preview` | … | Standalone preview for the equity swarm chart |

**Shared components live in `components/vires/lab/`** — the most
load-bearing ones:

- `idea-thread-live.tsx` — the lifecycle stepper on the idea
  detail page (Spec → Draft → Approval → Implementation →
  Run → Verdict → Promotion). This is the **central UX of the
  Lab** and it's getting close to right but not there yet.
- `strategy-spec-form.tsx` — the spec authoring form (~1000
  lines). Lots of structured fields: signal logic, universe,
  entry/exit rules, sweep params, acceptance criteria,
  experiment plan.
- `talon-chat-panel.tsx` — the AI drafting/refinement chat that
  appears above the spec form.
- `experiment-plan-section.tsx` — the structured experiment plan
  editor (benchmark, eras, evidence thresholds, verdict rules).
- `run-anatomy-panel.tsx`, `verdict-explained-panel.tsx`,
  `result-leaderboard.tsx`, `equity-curve-swarm.tsx` — the job
  detail page composition.
- `idea-form.tsx` — new-idea page (just cleaned up; will gain a
  reference-strategies picker per §6 of the strategy-reference
  primer).

---

## §4 — Honest read on current state

What's working:

- The **lifecycle thread metaphor** is the right spine. Operator
  sees their idea move through clearly-named stages.
- **Talon AI drafting** flow is functional (sync endpoint today,
  async durable jobs in flight). Operator can chat with the model
  to draft a complete spec from a thesis.
- **Job detail page** — Run Anatomy + Verdict Explained + Trade
  Atlas (when the artifact ships) is starting to "tell the truth
  beautifully" about a run.

What's shaky:

- **Density / hierarchy.** The spec edit page has *many* fields.
  Operator-drafted specs are overwhelming. The form doesn't guide
  attention; it just lays everything out.
- **Mobile readability.** Some surfaces feel cramped or lose
  hierarchy on iPhone screen real estate. Specifically: the
  experiment plan section, the run anatomy windows, the
  candidate scorecard.
- **Status / state copy.** Lots of small italicized gray captions
  were recently removed (operator feedback: "I can't even read
  it"). The replacement pattern — info-bubble icons next to
  labels — hasn't been built out consistently yet.
- **Lab landing surface (`/vires/bench/lab`)** is functional but
  doesn't feel like a *premium research tool*. It's a list-of-
  things hub. Should it lead with active campaign? Most recent
  job? An invitation to draft a new idea?
- **Cross-page consistency.** The Lab borrows from the Vires
  design system but doesn't always speak the language. Some cards
  use the right tokens; some look more utilitarian.

---

## §5 — Constraints to respect

1. **Mobile-first.** Everything must work on iPhone PWA before
   it works on desktop. Desktop is a 2-column derivative, not the
   primary surface.

2. **Multi-tenant law.** This app will eventually have multiple
   users and ship to the App Store. Designs that assume "one
   operator, one God-view" need to think about per-user scope
   isolation. Practically: no global "show all campaigns" views,
   no shared dashboards across users.

3. **Vires brand voice.** Old-money private bank tone. Restrained.
   Typographically careful. Cream and ink. Gold only when it earns
   its place. Hairline rules over heavy borders. Serif for display
   + emphasis, sans for body, mono for data.

4. **No emojis. No decorative icons.** Functional icons only when
   text would be ambiguous.

5. **Honesty over decoration.** When data is missing, say so
   plainly ("HISTORY PENDING" placeholder, not a fake chart). When
   a verdict is BLOCKED, name what's blocking it directly.

6. **Don't invent contracts.** Every backend field this UI reads
   is owned by either the trading-bot rebuild repo or the operator
   feed contract. UI redesigns that require new fields need to
   route through Codex (the backend agent), not be assumed.

---

## §6 — In-flight work (don't redesign these out)

These are landing imminently and should inform — not be ignored
by — the redesign:

1. **Talon Draft v2 durable jobs.** The spec edit page will gain a
   poll-based job state machine (QUEUED / RUNNING / REPAIRING /
   READY / WARN / BLOCKED / FAILED / CANCELLED). The button
   "never disappears." Spec-edit page UX needs to absorb this.

2. **Strategy reference picker on new-idea form.** 0–2 reference
   strategies the new idea derives from, each with an optional
   delta note. Lineage edges for future grouping/sorting.

3. **Trade Atlas on job detail.** Per-trade entry/exit/P&L/era
   table + summary metrics row. Contract drafted, awaiting
   producer-side artifact.

4. **SGOV-aware sleeve history.** The stocks sleeve hero
   currently shows a "HISTORY PENDING" placeholder pending
   strategy-only equity history from the producer. The job detail
   pages may have analogous gaps.

---

## §7 — What Jacob's looking for from you

In rough priority:

1. **Render the current Lab faithfully** — show what each page
   looks like today, on mobile width first. This grounds the
   conversation.

2. **Identify the 2–3 highest-leverage redesign moves** —
   not "redesign everything," but "if we got X right, the whole
   Lab feels different." Common candidates: lab landing, idea
   thread spine, spec edit hierarchy.

3. **Propose a redesigned spec edit page** specifically. This is
   the page operators spend the most time on and is the most
   visually overwhelming. Trade Atlas + Run Anatomy already
   point at the visual direction; the spec edit page hasn't
   gotten the same treatment.

4. **Stay in-language.** Cream on ink, hairline rules, serif
   display, gold-when-earned, mono for data. If you propose a
   visual move that breaks the language, name it explicitly so
   we can decide.

Iteration cadence: Jacob will review your renderings on his phone,
push back on density / hierarchy / language, and we'll iterate from
there. Codex (backend agent) and I (Claude — UI agent) will pick up
the implementation once a direction is locked.

---

## §8 — A few honest UX questions worth your read

1. **Should the Lab landing lead with the operator's current
   active research thread, not a list of all ideas?** The phone
   home screen for the Lab is currently "here are all your
   things." Maybe it should be "here's what you're in the middle
   of, with a way to drop into history."

2. **Does the lifecycle thread metaphor scale?** Right now it's
   one vertical timeline per idea. When operators have 30+ ideas,
   does the list-of-threads view break down? What's the
   compression?

3. **Where does Talon belong in the UI ontology?** Today Talon
   appears as a chat panel on the spec edit page and a button on
   the idea thread. It's an integrated assistant, not a chatbot —
   but the UI doesn't always reflect that distinction.

4. **How do we surface "this proposal is BLOCKED on data we
   don't have" without it feeling like an error state?** It's
   actually a feature — Talon caught something — but it currently
   reads like a failure.

These aren't asks; they're prompts you can engage with or set
aside. Use them to calibrate where the design vocabulary needs
sharpening vs. where it's already working.

---

## §9 — What you don't need to worry about

- Authentication, billing, deployment infrastructure — out of
  scope.
- The Trading top-level surface — stable, not part of this
  redesign pass.
- Backend contracts — work with the shapes that exist; flag any
  field you wish existed and we'll route to Codex.
- Multi-user UI affordances (account switching, shared views) —
  multi-tenant law applies to data isolation, but the UI is still
  single-operator until we scope that work explicitly.

---

If anything in here is unclear or you'd like a deeper read on any
specific page, name it and Jacob can route the question to me
directly.
