# Linear workflow

> **Last updated:** 2026-05-17
>
> Operator-facing guide for working with the Vires Linear workspace. Pair with
> `_design_handoff/INFRA_LINEAR_CYRUS_SPECKIT_STEP4_SPEC_2026-05-13.md` for the
> design rationale and `docs/agent-comments-convention.md` for the GitHub-side
> bridge convention.

## Workspace shape

- **Workspace:** `vires`
- **Team:** `Vires` (single team, all tickets live here; identifier prefix `VIR`)
- **Projects:** `claw-dashboard`, `vires-numeris` (optional `infra` for cross-cutting work)
- **Statuses:** `Backlog → Triaged → In Progress → In Review → Done` (plus `Cancelled` and `Duplicate` for closes)

The **Triaged** state is the agent-pickup signal — when a ticket lands in `Triaged` with a project that matches an agent's surface (`claw-dashboard` → Claude; `vires-numeris` → Codex), that agent takes ownership.

## Filing a ticket (intake)

Open a new issue in Linear from the **"Spec Kit Ticket — Intake"** template. Fill four fields:

1. **Intent / problem** — what's broken or missing, plain English. No jargon required.
2. **Done looks like** — what you'd point at to say "yes, that fixed it." Can be vague ("trading page feels less cramped"); the spec-pass agent will sharpen it.
3. **Constraints** — hard musts / must-nots. Deadlines, can't-break, must-look-like-X. Leave blank if none.
4. **Open questions** — what you're already unsure about. The agent will answer or ask back.

Set the **project** to the repo this work lives in. Leave the **status** at `Backlog` initially — flip to `Triaged` when you want the work picked up.

**API path** (for agents creating tickets on your behalf): Linear's GraphQL `issueCreate` mutation, called against `https://api.linear.app/graphql` with the API key in the `Authorization` header. The first real ticket through this path was VIR-5 (HOUSEKEEPING-004); see that ticket's payload as a working example.

## Status flow — who moves it, when

| Transition | Trigger | Mover |
|---|---|---|
| Backlog → Triaged | Prioritization decision: this is next | Jacob, or an agent on Jacob's go |
| Triaged → In Progress | Spec-pass complete, all open questions resolved | Picking-up agent |
| In Progress → In Review | PR opened | Picking-up agent |
| In Review → Done | PR merged | Whichever agent merged it |
| Anywhere → Cancelled | Decision to drop the work | Anyone with context |
| Anywhere → Duplicate | Found a duplicate ticket | Anyone with context |

## Agent SPEC-PASS pattern (first action on any Triaged ticket)

When an agent picks up a `Triaged` ticket, the **first action is NOT code**. It's a SPEC-PASS comment on the Linear ticket that expands the 4-field intake into the build-ready shape:

- **Requirements** — specific, testable. Derived from intake's "Done looks like" + constraints.
- **Design** — file paths, data shapes, sequence. The agent's proposed implementation.
- **Tasks** — dependency-ordered checklist.
- **Acceptance criteria** — how we know it's done (each item testable / observable).
- **Open questions for Jacob** — items the agent can't decide on its own.

The ticket stays in `Triaged` until **all open questions are resolved** (Jacob answers in comments, or a cross-agent review confirms). Then it moves to `In Progress` and code work begins.

This is the operational version of Codex's PR #24 answer on Spec Kit + Linear source of truth: *"Linear issue owns current requirements / open questions / status; when a ticket becomes build-ready, the agent exports/creates the repo spec under `.specify/specs/...` in the PR. The PR then links back to Linear."*

## Cross-agent review on the spec-pass

If the work touches both agents' surfaces (UX + backend, or contract changes), the spec-pass should be cross-reviewed by the other agent before moving to `In Progress`. Same `[claude]` / `[codex]` tag prefix as PR comments. If the agents disagree and neither can resolve, that's a Tier-3 surface to Jacob.

## Implementation PR — linking back to Linear

When the picking-up agent opens the implementation PR:

1. **Title** includes the Linear ticket ID, e.g., `feat: bootstrap Linear env (VIR-5)` or `[VIR-5] HOUSEKEEPING-004: Supabase migration runner GHA`.
2. **Description** links to the Linear ticket URL.
3. **Spec snapshot** lands under `.specify/specs/<ticket-id>/` in the same PR — the build-ready spec frozen at the time work begins.

The Linear ↔ GitHub integration auto-links the PR back to the ticket and updates the ticket status as the PR progresses.

## What goes through Linear vs chat

- **Linear:** anything that's actually work to be done. New features, bugfixes, refactors, doc work, infra work. The ticket is the carrier; chat is for clarifying questions on top.
- **Chat:** prioritization conversations ("what's next?"), context that doesn't translate to tickets (architectural sketches, learning), and explicit overrides ("ignore VIR-7 for now; do VIR-9 first"). When chat decides on work that ought to exist as a ticket, the picking-up agent (or Claude) creates it and links back to the chat.

## Labels (not yet in use; pending small follow-up)

These labels will get added in a follow-up workspace pass. None block ticket creation today, but they're the planned routing structure:

- `cyrus:claude`, `cyrus:codex` — agent routing once Cyrus is live (Step 4c).
- `spec:ux`, `spec:backend` — surface that the work touches.
- `priority:hi`, `priority:lo` — orthogonal to Linear's native priority field (5 levels), since we mostly think in 2.

## Credentials

`LINEAR_API_KEY` is mirrored to three places by `scripts/bootstrap-linear-env.sh`:

- OpenClaw config (`~/.openclaw/openclaw.json` at `env.LINEAR_API_KEY`) — used by the daily digest cron and any local agent session.
- GitHub Secrets on `jacobbarkley/claw-dashboard` — for GHA workflows that need to talk to Linear.
- GitHub Secrets on `jacobbarkley/vires-numeris` — same on the backend side.

This is the spike-bootstrap shape per the Step 4 spec — one key in three places. Durable shape is per-surface scoped tokens or OAuth identities, deferred until the workflow stabilizes (Step 4a/4b).

## Reference

- **Step 4 spec:** `_design_handoff/INFRA_LINEAR_CYRUS_SPECKIT_STEP4_SPEC_2026-05-13.md`
- **Bridge convention:** `docs/agent-comments-convention.md`
- **Codex session primer:** `docs/codex-session-primer.md`
- **Linear workspace:** https://linear.app/vires
- **Bootstrap script:** `scripts/bootstrap-linear-env.sh`
