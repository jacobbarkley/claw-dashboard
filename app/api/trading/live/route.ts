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

function parseOccSymbol(occ: string) {
  // OCC format: SYMBOL YYMMDD C/P 00000000 (8-digit strike * 1000)
  // e.g. AMD260410P00190000 = AMD put, Apr 10 2026, $190 strike
  const match = occ.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/)
  if (!match) return null
  const [, underlying, dateStr, type, strikeStr] = match
  const strike = parseInt(strikeStr, 10) / 1000
  const expiry = `20${dateStr.slice(0, 2)}-${dateStr.slice(2, 4)}-${dateStr.slice(4, 6)}`
  const now = new Date()
  const exp = new Date(expiry + "T16:00:00-04:00")
  const dte = Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / 86400000))
  return {
    underlying,
    type: type === "P" ? "PUT" : "CALL",
    strike,
    expiry,
    dte,
  }
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
    const [positions, account, orders] = await Promise.all([
      alpacaFetch("/positions", key, secret),
      alpacaFetch("/account", key, secret),
      alpacaFetch("/orders?status=closed&limit=50", key, secret),
    ])

    // Split equity and options positions
    const equityPositions = positions
      .filter((p: Record<string, string>) => p.asset_class === "us_equity")
      .map((p: Record<string, string>) => ({
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

    const optionsPositions = positions
      .filter((p: Record<string, string>) => p.asset_class === "us_option")
      .map((p: Record<string, string>) => {
        const parsed = parseOccSymbol(p.symbol)
        return {
          occ_symbol: p.symbol,
          symbol: parsed?.underlying ?? p.symbol,
          type: parsed?.type ?? "UNKNOWN",
          strike: parsed?.strike ?? 0,
          expiry: parsed?.expiry ?? "",
          dte: parsed?.dte ?? 0,
          contracts: Math.abs(Number(p.qty)),
          side: p.side,
          avg_entry: Number(p.avg_entry_price),
          current_price: Number(p.current_price),
          market_value: Number(p.market_value),
          unrealized_pnl: Number(p.unrealized_pl),
          unrealized_pct: Number(p.unrealized_plpc) * 100,
          strategy: Number(p.qty) < 0 && parsed?.type === "PUT" ? "CSP" : "UNKNOWN",
        }
      })

    // Compute live KPIs from closed orders
    const closedSells = orders.filter(
      (o: Record<string, string>) =>
        o.side === "sell" && o.status === "filled" && o.asset_class === "us_equity"
    )
    // Group buys to compute cost basis for P&L calculation
    const closedBuys = orders.filter(
      (o: Record<string, string>) =>
        o.side === "buy" && o.status === "filled" && o.asset_class === "us_equity"
    )

    // Build per-symbol cost basis from buys
    const costBasis: Record<string, number[]> = {}
    for (const b of closedBuys) {
      const sym = b.symbol as string
      if (!costBasis[sym]) costBasis[sym] = []
      costBasis[sym].push(Number(b.filled_avg_price))
    }

    // Calculate realized P&L per closed sell
    const trades: { pnl: number }[] = []
    for (const s of closedSells) {
      const sym = s.symbol as string
      const sellPrice = Number(s.filled_avg_price)
      const buyPrice = costBasis[sym]?.shift()
      if (buyPrice != null) {
        const qty = Number(s.filled_qty)
        trades.push({ pnl: (sellPrice - buyPrice) * qty })
      }
    }

    // Compute KPIs
    const winners = trades.filter(t => t.pnl > 0)
    const losers = trades.filter(t => t.pnl <= 0)
    const grossProfit = winners.reduce((s, t) => s + t.pnl, 0)
    const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0))

    let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0
    for (const t of trades) {
      if (t.pnl > 0) { curWin++; curLoss = 0; maxWinStreak = Math.max(maxWinStreak, curWin) }
      else { curLoss++; curWin = 0; maxLossStreak = Math.max(maxLossStreak, curLoss) }
    }

    // Max drawdown from cumulative P&L
    let peak = 0, maxDD = 0, cumPnl = 0
    for (const t of trades) {
      cumPnl += t.pnl
      if (cumPnl > peak) peak = cumPnl
      const dd = peak - cumPnl
      if (dd > maxDD) maxDD = dd
    }

    const kpis = {
      total_trades: trades.length + equityPositions.length,
      closed_trades: trades.length,
      open_trades: equityPositions.length,
      win_rate_pct: trades.length > 0 ? (winners.length / trades.length) * 100 : null,
      profit_factor: grossLoss > 0 ? grossProfit / grossLoss : null,
      expectancy: trades.length > 0 ? trades.reduce((s, t) => s + t.pnl, 0) / trades.length : null,
      net_pnl: trades.reduce((s, t) => s + t.pnl, 0),
      max_drawdown_pct: maxDD > 0 ? (maxDD / 100000) * 100 : null,
      max_drawdown_usd: maxDD > 0 ? maxDD : null,
      max_win_streak: maxWinStreak,
      max_loss_streak: maxLossStreak,
    }

    const equityValue = equityPositions.reduce(
      (s: number, p: { market_value: number }) => s + p.market_value, 0
    )

    return NextResponse.json({
      fetched_at: new Date().toISOString(),
      positions: equityPositions,
      options_positions: optionsPositions,
      kpis,
      account: {
        equity: Number(account.equity),
        cash: Number(account.cash),
        buying_power: Number(account.buying_power),
        portfolio_value: Number(account.portfolio_value),
        positions_value: equityValue,
      },
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
