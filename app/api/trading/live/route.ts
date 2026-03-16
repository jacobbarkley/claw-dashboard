import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const ALPACA_BASE = "https://paper-api.alpaca.markets/v2"

async function alpacaFetch(path: string, key: string, secret: string) {
  const res = await fetch(`${ALPACA_BASE}${path}`, {
    headers: {
      "APCA-API-KEY-ID": key,
      "APCA-API-SECRET-KEY": secret,
    },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Alpaca ${path}: ${res.status}`)
  return res.json()
}

export async function GET() {
  const key = process.env.ALPACA_API_KEY_ID
  const secret = process.env.ALPACA_API_SECRET_KEY

  if (!key || !secret) {
    return NextResponse.json(
      { error: "ALPACA_API_KEY_ID / ALPACA_API_SECRET_KEY not configured" },
      { status: 503 }
    )
  }

  try {
    const [positions, account] = await Promise.all([
      alpacaFetch("/positions", key, secret),
      alpacaFetch("/account", key, secret),
    ])

    const mapped = positions.map((p: Record<string, string>) => ({
      symbol: p.symbol,
      qty: Number(p.qty),
      side: p.side,
      avg_entry: Number(p.avg_entry_price),
      current_price: Number(p.current_price),
      market_value: Number(p.market_value),
      unrealized_pnl: Number(p.unrealized_pl),
      unrealized_pct: Number(p.unrealized_plpc) * 100,
      change_today: Number(p.change_today),
      change_today_pct: Number(p.change_today) !== 0 && Number(p.current_price) !== 0
        ? (Number(p.change_today) / (Number(p.current_price) - Number(p.change_today))) * 100
        : 0,
    }))

    return NextResponse.json({
      fetched_at: new Date().toISOString(),
      positions: mapped,
      account: {
        equity: Number(account.equity),
        cash: Number(account.cash),
        buying_power: Number(account.buying_power),
        portfolio_value: Number(account.portfolio_value),
        positions_value: mapped.reduce((s: number, p: { market_value: number }) => s + p.market_value, 0),
      },
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
