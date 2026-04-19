import { anthropic } from "@ai-sdk/anthropic"
import { streamText, generateText, convertToModelMessages } from "ai"
import { promises as fs } from "fs"
import path from "path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

async function readJson(filename: string) {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), filename), "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function buildSystemPrompt(feed: Record<string, unknown> | null): string {
  const sections: string[] = [
    `You are Talon, the trading assistant embedded in Jacob's ClawBoy dashboard.`,
    `You operate inside an overlay panel on the trading page at claw-dashboard.vercel.app.`,
    `Your name is Talon — sharp, decisive, always at Jacob's side.`,
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    ``,
    `Your role:`,
    `- Answer questions about the portfolio, strategy, market regime, and trading decisions`,
    `- Explain what the system did today and why`,
    `- Be honest about what you know and don't know`,
    `- Keep answers concise — this is a chat, not a report`,
    `- Use plain language. Jacob is technical but values clarity over jargon.`,
    `- No emojis unless asked.`,
  ]

  if (feed) {
    const account = feed.account as Record<string, number> | undefined
    const operator = feed.operator as Record<string, unknown> | undefined
    const mode = operator?.mode as Record<string, unknown> | undefined
    const regime = operator?.regime as Record<string, unknown> | undefined
    const plan = operator?.plan as Record<string, unknown> | undefined
    const strategyBank = operator?.strategy_bank as Record<string, unknown> | undefined
    const active = strategyBank?.active as Record<string, unknown> | undefined
    const positions = feed.positions as Array<Record<string, unknown>> | undefined
    const incidents = operator?.incident_flags as string[] | undefined

    sections.push(``, `--- LIVE SYSTEM STATE ---`)

    if (mode) {
      sections.push(`Mode: ${mode.current_mode} | Broker: ${mode.broker_environment} | Execution: ${mode.execution_enabled ? "enabled" : "disabled"}`)
    }

    if (account) {
      sections.push(`Account: $${Number(account.equity ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} equity | $${Number(account.cash ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} cash | $${Number(account.positions_value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} deployed`)
    }

    if (positions && positions.length > 0) {
      const posLines = positions.map((p: Record<string, unknown>) =>
        `  ${p.symbol}: ${p.qty} shares @ $${Number(p.entry_price ?? 0).toFixed(2)} | mkt $${Number(p.current_price ?? 0).toFixed(2)} | P&L ${Number(p.unrealized_pnl ?? 0) >= 0 ? "+" : ""}$${Number(p.unrealized_pnl ?? 0).toFixed(2)}`
      ).join("\n")
      sections.push(`Open positions:\n${posLines}`)
    } else {
      sections.push(`Open positions: none (or only cash management like SGOV)`)
    }

    if (regime) {
      const parts = [
        regime.vix_level != null ? `VIX ${regime.vix_level}` : null,
        regime.vix_regime ? `(${regime.vix_regime})` : null,
        regime.hmm_regime ? `HMM ${regime.hmm_regime}` : null,
        regime.jump_variation_regime ? `JV ${regime.jump_variation_regime}` : null,
      ].filter(Boolean)
      sections.push(`Market regime: ${parts.join(" | ") || "unavailable"}`)
      if (regime.narrative) sections.push(`Regime narrative: ${regime.narrative}`)
    }

    if (active) {
      const perf = active.performance_summary as Record<string, number> | undefined
      sections.push(`Active strategy: ${active.display_name}`)
      sections.push(`  Family: ${active.strategy_family} | Symbols: ${(active.symbols as string[])?.join(", ") ?? "?"}`)
      sections.push(`  Rules: stop ${active.stop_loss_pct}% | target ${active.target_pct}% | max hold ${active.max_hold_days}d | max ${active.max_positions} positions`)
      if (perf) {
        sections.push(`  Backtest: ${perf.total_return_pct?.toFixed(1)}% return | Sharpe ${perf.sharpe_ratio?.toFixed(2)} | ${perf.total_trades} trades | ${perf.win_rate_pct?.toFixed(1)}% win rate`)
      }
    }

    if (plan) {
      sections.push(`Today's plan: ${plan.trade_plan_status} | ${plan.trade_plan_count ?? 0} trades ready`)
      if (plan.suppression_cause && plan.suppression_cause !== "NOT_SUPPRESSED") {
        sections.push(`  Suppression: ${plan.suppression_cause}`)
      }
    }

    if (incidents && incidents.length > 0) {
      sections.push(`Active incidents: ${incidents.join(", ")}`)
    }

    const kpis = feed.kpis as Record<string, unknown> | undefined
    if (kpis) {
      sections.push(`KPIs: win rate ${kpis.win_rate_pct}% | PF ${kpis.profit_factor} | expectancy $${kpis.expectancy} | max DD $${kpis.max_drawdown_usd}`)
    }
  }

  return sections.join("\n")
}

// Debug GET handler — browse to /api/chat and it runs a non-streaming
// test call against Anthropic, returning JSON with the outcome. This
// surfaces errors that the streaming POST path silently swallows
// (streamText's onError only logs to server console).
export async function GET() {
  const key = process.env.ANTHROPIC_API_KEY
  const keyPresent = !!key
  const keyLength = key?.length ?? 0
  const keyPrefix = key?.slice(0, 12) ?? null
  // Last 4 chars to disambiguate when the same Anthropic account has
  // multiple keys — Anthropic console lists each key's last 4 too.
  const keyTail = key ? key.slice(-4) : null
  const model = "claude-haiku-4-5-20251001"

  if (!keyPresent) {
    return new Response(
      JSON.stringify({ ok: false, reason: "ANTHROPIC_API_KEY missing from environment", model }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }

  try {
    const result = await generateText({
      model: anthropic(model),
      prompt: "Reply with exactly the single word 'ok'.",
    })
    return new Response(
      JSON.stringify({
        ok: true,
        model,
        keyLength,
        keyPrefix,
        keyTail,
        text: result.text,
        finishReason: result.finishReason,
        usage: result.usage,
      }, null, 2),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const name = err instanceof Error ? err.name : undefined
    // Anthropic SDK errors often have a `status` field on the thrown object.
    const anyErr = err as { status?: number; statusCode?: number; cause?: unknown }
    return new Response(
      JSON.stringify({
        ok: false,
        model,
        keyPresent,
        keyLength,
        keyPrefix,
        keyTail,
        error: message,
        errorName: name,
        status: anyErr.status ?? anyErr.statusCode ?? null,
        cause: anyErr.cause ? String(anyErr.cause) : null,
      }, null, 2),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}

// Translate a raw Anthropic / AI SDK error into a one-line user-readable
// explanation. Keeps the technical detail available at the end but leads
// with the thing the operator can act on.
function explainError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)

  if (/credit balance is too low/i.test(raw)) {
    return "Talon is offline — the Anthropic account is out of credits. Top up at console.anthropic.com → Plans & Billing, then try again."
  }
  if (/invalid[_ ]api[_ ]key|authentication|401/i.test(raw)) {
    return "Talon is offline — Anthropic rejected the API key (invalid, revoked, or expired). Rotate ANTHROPIC_API_KEY in the Vercel env and redeploy."
  }
  if (/rate[_ -]?limit|429/i.test(raw)) {
    return "Talon is rate-limited by Anthropic right now. Wait a minute and try again."
  }
  if (/overloaded|503/i.test(raw)) {
    return "Anthropic is overloaded right now. Wait a moment and try again."
  }
  if (/model[^\w]+not[^\w]+found|unknown model|invalid model/i.test(raw)) {
    return `Talon can't reach its model — the configured model id may be wrong or deprecated. Raw: ${raw}`
  }
  return `Talon hit an error: ${raw}`
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY missing from environment" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    const feed = await readJson("data/operator-feed.json")

    // useChat sends UIMessage[] (role + parts[]), streamText needs ModelMessage[] (role + content).
    // convertToModelMessages bridges the two formats.
    const modelMessages = await convertToModelMessages(messages)

    const result = streamText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: buildSystemPrompt(feed),
      messages: modelMessages,
      onError: ({ error }) => {
        console.error("streamText error:", error)
      },
    })

    // Wrap the AI SDK's textStream in a custom ReadableStream that catches
    // errors and emits them as plain text. Without this, Anthropic-side
    // failures (billing, rate limits, key rotation, model-not-found) arrive
    // as an empty response with content-length: 0, so the Talon panel shows
    // the user a ghost bubble with no explanation. The client uses a plain
    // TextStreamChatTransport so any bytes we write land as the assistant's
    // reply — errors become visible text in the chat.
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let emittedAnything = false
        try {
          for await (const chunk of result.textStream) {
            if (chunk) {
              emittedAnything = true
              controller.enqueue(encoder.encode(chunk))
            }
          }
          // If the stream completed with zero tokens but without throwing,
          // fall through to fetch the underlying error. finishReason and
          // providerMetadata are available on the result for diagnosis.
          if (!emittedAnything) {
            let reason: string | null = null
            try { reason = String(await result.finishReason) } catch {}
            controller.enqueue(encoder.encode(
              `Talon returned no content${reason ? ` (finish reason: ${reason})` : ""}. Check the Anthropic account billing status.`,
            ))
          }
        } catch (err) {
          console.error("streamText catch:", err)
          controller.enqueue(encoder.encode(explainError(err)))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    const message = explainError(err)
    console.error("POST /api/chat error:", err)
    // Return 200 with the error as text so the client shows it in a bubble
    // instead of firing chat.error silently.
    return new Response(message, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
}
