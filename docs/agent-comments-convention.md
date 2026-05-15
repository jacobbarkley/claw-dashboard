# Agent-comment convention

This is the bridge protocol between Claude (Anthropic Claude Code) and
Codex (OpenAI Codex CLI) for code-review conversations on shared
repositories. The point is to remove Jacob from the loop as the
copy-and-paste bridge: both agents read each other's comments directly
via `gh` and respond on the PR.

This doc is the durable agreement. Step 4 (Linear + Spec Kit + Cyrus +
OpenClaw digest, see `_design_handoff/INFRA_LINEAR_CYRUS_SPECKIT_STEP4_SPEC_2026-05-13.md`)
adds work-intake automation on top of this; the comment convention here
is the substrate Step 4 builds on, and it works tonight without any
Step 4 infrastructure in place.

## Who reads what

- Both agents have `gh` CLI authorized against `github.com/jacobbarkley/*`.
- Reviews happen in PR comments. Each agent fetches the other's comments
  with `gh pr view <num> --comments` or
  `gh api repos/{owner}/{repo}/pulls/{num}/comments` for inline review
  threads.
- No agent waits for Jacob to relay anything. Jacob's role compresses to
  prioritization and final-say merges.

## Tag prefixes

Every agent comment carries a stable tag prefix on the **first line** so
the reading agent can filter and route correctly:

| Author | Prefix    | Example                          |
| ------ | --------- | -------------------------------- |
| Claude | `[claude]` | `[claude] Pushed fix in cb787db1.` |
| Codex  | `[codex]`  | `[codex] Tightening request below.` |
| Cyrus  | `[cyrus-bot]` | `[cyrus-bot] Auto-opened from Linear VIRES-42.` |
| Jacob  | (none — bare comment) | Anything Jacob types is implicitly Jacob. |

Reasoning: the tag lets each agent quickly distinguish "the other agent
asked me something" from "Jacob asked me something" from "I am
re-reading my own comment." `[cyrus-bot]` exists because §4c-spike Cyrus
may post under Jacob's personal Linear/GitHub credentials until the
OAuth/app identity lands; the prefix prevents identity confusion in the
meantime (and is logged as debt in
`_design_handoff/INFRA_LINEAR_CYRUS_SPECKIT_STEP4_SPEC_2026-05-13.md`).

## Comment kinds

Three kinds of comment with distinct conventions:

### 1. PR-level conversational comment

Use for: review summaries, status updates ("tightened in commit X"),
hand-off pings, and high-level approvals.

Post via:

```
gh pr comment <num> --body "<body>"
```

Read via:

```
gh pr view <num> --comments
```

Body shape:

```
[agent] One-sentence headline.

Optional details:
- Bullet
- Bullet

Optional commit refs like cb787db1 or PR refs like #27.
```

### 2. Inline review comment (line-anchored)

Use for: requesting a code change at a specific line, raising a concern
that points to a file.

Post via:

```
gh pr review <num> --comment --body "<body>"
```

…or for line-anchored review comments via the REST API:

```
gh api -X POST repos/jacobbarkley/<repo>/pulls/<num>/comments \
  -f body="[agent] Suggestion: prefer X over Y here." \
  -f commit_id="<sha>" \
  -f path="<file>" \
  -F line=<n> \
  -f side=RIGHT
```

Read via:

```
gh api repos/jacobbarkley/<repo>/pulls/<num>/comments
```

### 3. Review (with verdict)

Use sparingly — only when an agent is doing a formal review pass and
recording approval, request-for-changes, or comment-only verdict.

```
gh pr review <num> --approve --body "[agent] LGTM after the three tightenings landed."
gh pr review <num> --request-changes --body "[agent] Blocking — see inline."
gh pr review <num> --comment --body "[agent] Non-blocking notes."
```

## Responding to comments

When you read the other agent's comment, your reply policy is:

- **If the request is well-scoped and you can address it** → make the
  code change, push to the same branch, comment on the PR:
  `[agent] Addressed in <sha>: <one-line summary>.`
- **If the request needs negotiation** → reply on the PR with `[agent]`
  prefix and the counter-proposal. Don't ping Jacob unless the back-and-
  forth has stalled or the disagreement is about scope rather than
  implementation.
- **If the request is out of scope for this PR** → reply with
  `[agent] Out of scope here; filed as <ticket-ref> / <follow-up PR>`.
  Never silently ignore a comment.

After pushing a fix, do not request re-review by email or chat. The
other agent polls the PR and will see the new comment + commit.

## Polling cadence

Tonight (manual): each agent checks open PRs when re-invoked by Jacob.
For active conversations, use the `/loop` skill to set a cadence on the
Claude side, e.g.:

```
/loop 10m gh pr list --repo jacobbarkley/claw-dashboard --state open and address any new [codex] comments
```

Codex's CLI has an equivalent loop mode; Jacob configures it on his end.

After Step 4 lands, the OpenClaw daily digest at 17:30 ET surfaces any
PR that's stalled — i.e. one agent commented and the other agent hasn't
pushed or replied within N hours. The agent named in the most-recent
`[other-agent]` comment is the implicit owner of the next response.

## What still goes through Jacob

The convention does **not** route around Jacob for:

- **Merge approvals** that fall outside the auto-merge rule (anything
  touching env, auth, private data, trading runtime, production
  deploys, or contract/data plumbing). The auto-merge rule itself is in
  `MEMORY.md → feedback_agents_merge_routine_prs.md` and only covers
  production-effect-neutral or doc-only PRs.
- **Scope disagreements** where the two agents pull in opposite
  directions and neither is convincing the other. Surface to Jacob with
  a single `[agent] Need Jacob's call between X and Y` comment.
- **External coordination** that touches systems neither agent owns
  (vendor support, billing, paid services).

## Migration from chat-relay

Until Codex has internalized this convention in his session, Jacob may
still see Codex's review responses in chat. When that happens, Jacob
should paste them onto the relevant PR with the `[codex]` prefix (he's
acting as Codex's CLI proxy). After one or two sessions, that step
disappears.

Either agent can update this doc by PR. Adding a new agent (e.g. a
future code-review agent that lives in CI) means adding its prefix to
the table above and a one-line note on how it posts.
