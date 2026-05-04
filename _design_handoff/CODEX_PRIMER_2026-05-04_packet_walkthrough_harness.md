# Codex Primer - Packet Authoring Walkthrough Harness

**Date:** 2026-05-04
**Scope:** Opt-in smoke tooling for the Talon Strategy Authoring Packet path.

## Why This Exists

The packet authoring flow has failed in tedious places: missing environment
keys, invalid `StrategyAuthoringPacketV1` payloads, stale local deployments,
and UI errors that hid the exact validation paths. This harness gives Codex or
Claude a repeatable way to walk the plumbing before Jacob spends another click
cycle finding the next failure.

## Commands

Offline deterministic check:

```bash
npm run lab:packet-walkthrough
npm run lab:packet-walkthrough:mock
```

The mock mode calls the real packet finalizer and validator with a fixture
synthesis payload. It intentionally includes cross-section Talon mistakes:

- `strategy_spec.sleeve` disagrees with the questionnaire.
- entry conditions use old data aliases such as `price_ohlcv`.
- trial budget is too small for variants x eras.
- portfolio fit is `WAIVED` without notes.

Expected result: all walkthrough checks pass, the server normalizes those
conditions, and the compiler remains `BLOCKED` because the packet is still in
`REVIEW` and mapping work is explicit.

Live dev or preview check:

```bash
npm run lab:packet-walkthrough:live -- --base-url http://localhost:3000 --idea idea_01KQRJ889RV37QZPEAGGV37QZP
```

Use a Vercel preview URL for deployment smoke:

```bash
npm run lab:packet-walkthrough:live -- --base-url https://<preview>.vercel.app --idea <idea_id>
```

Live mode is a dry run by default. Add `--persist` only when intentionally
testing packet persistence. Add `--sleeve STOCKS|CRYPTO|OPTIONS` if the target
idea is not a stocks idea.

## Safety Rules

- Do not add this to normal lint/test/build gates.
- Mock mode performs no external API calls.
- Live mode is explicit because it calls `/clarify` and `/packets`, which can
  reach Anthropic and Vercel/GitHub-backed persistence when `--persist` is set.
- Keep test suites isolated from live Anthropic, Vercel, GitHub, broker,
  Discord, Telegram, and other external services.

## Sleeve Coverage

The offline fixture covers STOCKS only because it is exercising packet
finalizer behavior, not strategy alpha. Live mode can send STOCKS, CRYPTO, or
OPTIONS questionnaires, but each run still depends on the target idea's sleeve
and the live data catalog.
