#!/usr/bin/env python3
"""
push-trading-data.py
Collects trading state files from the OpenClaw workspace and outputs data/trading.json.
Run via push-trading-data.sh after the 16:35 performance aggregator.
"""

import json
import os
import glob
from pathlib import Path
from datetime import datetime, timezone

WORKSPACE        = Path.home() / ".openclaw/workspace/trading-bot"
OPTIONS_WORKSPACE = WORKSPACE / "options"
BPS_WORKSPACE    = OPTIONS_WORKSPACE / "bps"
OUTPUT           = Path(__file__).parent.parent / "data/trading.json"


def load(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def safe_float(v, default=None):
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


def build_account(positions: list, snapshot: dict) -> dict:
    # True account data from Alpaca (preferred)
    alpaca = snapshot.get("account") or {}
    equity       = safe_float(alpaca.get("equity"))
    cash         = safe_float(alpaca.get("cash"))
    last_equity  = safe_float(alpaca.get("last_equity"))
    buying_power = safe_float(alpaca.get("buying_power"))

    # Positions-derived fallbacks
    total_market_value = sum(safe_float(p.get("market_value"), 0) for p in positions)
    total_unrealized   = sum(safe_float(p.get("unrealized_pnl"), 0) for p in positions)
    entry_value        = total_market_value - total_unrealized
    unrealized_pct     = (total_unrealized / entry_value * 100) if entry_value else None

    # Portfolio history for starting equity reference
    ph         = snapshot.get("portfolio_history") or {}
    base_value = safe_float(ph.get("base_value"))   # starting equity ($100k)

    # Total P&L = current equity vs starting equity
    total_pnl     = round(equity - base_value, 2)           if equity and base_value else None
    total_pnl_pct = round(total_pnl / base_value * 100, 4)  if total_pnl is not None and base_value else None

    # Today's P&L = current equity vs prior close
    today_pnl     = round(equity - last_equity, 2)           if equity and last_equity else None
    today_pnl_pct = round(today_pnl / last_equity * 100, 4)  if today_pnl is not None and last_equity else None

    return {
        # True account values
        "equity":             equity,
        "cash":               cash,
        "buying_power":       buying_power,
        "base_value":         base_value,
        # P&L from starting equity
        "total_pnl":          total_pnl,
        "total_pnl_pct":      total_pnl_pct,
        # P&L vs prior close
        "today_pnl":          today_pnl,
        "today_pnl_pct":      today_pnl_pct,
        # Positions breakdown
        "positions_value":    round(total_market_value, 2),
        "unrealized_pnl":     round(total_unrealized, 2),
        "unrealized_pnl_pct": round(unrealized_pct, 2) if unrealized_pct is not None else None,
    }


def build_positions(snapshot: dict) -> list:
    raw = snapshot.get("payload", {}).get("positions") or snapshot.get("positions") or []
    result = []
    for p in raw:
        result.append({
            "symbol":          p.get("symbol"),
            "qty":             safe_float(p.get("qty")),
            "side":            p.get("side", "long"),
            "entry_price":     safe_float(p.get("avg_entry_price")),
            "current_price":   safe_float(p.get("current_price")),
            "market_value":    safe_float(p.get("market_value")),
            "unrealized_pnl":  safe_float(p.get("unrealized_pl")),
            "unrealized_pct":  round(safe_float(p.get("unrealized_plpc"), 0) * 100, 2),
            "change_today_pct":round(safe_float(p.get("change_today"), 0) * 100, 2),
        })
    return result


def build_daily_series(perf_dir: Path) -> list:
    series = []
    for f in sorted(perf_dir.glob("*.json")):
        try:
            d = json.loads(f.read_text())
            summary = d.get("summary", {})
            series.append({
                "date":       summary.get("date") or f.stem,
                "net_pnl":    safe_float(summary.get("net_pnl"), 0),
                "trades":     summary.get("total_trades", 0),
                "winners":    summary.get("winners", 0),
                "losers":     summary.get("losers", 0),
                "win_rate":   safe_float(summary.get("win_rate_pct")),
            })
        except Exception:
            pass
    return series


def build_equity_curve(snapshot: dict, daily_series: list) -> list:
    """
    Use Alpaca portfolio history (true account equity) as the primary source.
    Falls back to cumulative realized P&L from trade journal if history unavailable.
    """
    ph = snapshot.get("portfolio_history") or {}
    series = ph.get("series") or []
    if series:
        return [{"date": e["date"], "equity": e["equity"], "profit_loss": e.get("profit_loss")} for e in series]
    # Fallback: cumulative realized P&L (less accurate — ignores unrealized)
    cumulative = 0.0
    curve = []
    for day in daily_series:
        cumulative += day["net_pnl"] or 0
        curve.append({"date": day["date"], "equity": round(cumulative, 2), "profit_loss": None})
    return curve


def build_watchlist(strategy: dict, positions: list, weekly_watchlist: dict) -> dict:
    """
    Watchlist with staleness metadata.
    Primary: weekly_watchlist.json (nightly generator, always populated).
    Fallback: strategy_spec items not currently held (weekday mornings only).
    """
    held = {p["symbol"] for p in positions}

    # Primary: persistent weekly watchlist (survives weekends + nights)
    if weekly_watchlist.get("setups"):
        items = []
        for item in weekly_watchlist["setups"]:
            sym = item.get("symbol")
            if sym:
                items.append({
                    "symbol":  sym,
                    "trigger": item.get("entry_trigger", ""),
                    "stop":    item.get("stop_loss", ""),
                    "target":  item.get("target", ""),
                    "modifier":item.get("conviction", ""),
                    "note":    item.get("note", ""),
                    "in_position": sym in held,
                })
        return {
            "items":    items,
            "as_of":    weekly_watchlist.get("generated_at", "")[:10],
            "source":   "weekly",
        }

    # Fallback: today's strategy_spec (weekday mornings only)
    items = (strategy.get("payload") or {}).get("items", [])
    watchlist = []
    for item in items:
        sym = item.get("symbol")
        if sym and sym not in held:
            watchlist.append({
                "symbol":  sym,
                "trigger": item.get("entry_trigger", ""),
                "stop":    item.get("stop_loss", ""),
                "target":  item.get("primary_target", ""),
                "modifier":item.get("position_size_modifier", ""),
                "note":    item.get("fragility_note", ""),
                "in_position": False,
            })
    strategy_date = strategy.get("pipeline_date", "") or ""
    return {
        "items":  watchlist,
        "as_of":  strategy_date[:10] if strategy_date else None,
        "source": "strategy_spec",
    }


def build_exit_candidates(eod: dict, positions: list) -> list:
    held = {p["symbol"]: p for p in positions}
    items = eod.get("payload", {}).get("items", [])
    candidates = []
    for item in items:
        sym = item.get("symbol")
        decision = item.get("decision", "")
        if decision in ("URGENT_CLOSE", "CLOSE_BEFORE_BELL") and sym:
            pos = held.get(sym, {})
            candidates.append({
                "symbol":   sym,
                "decision": decision,
                "urgency":  item.get("urgency", ""),
                "reason":   item.get("reason", ""),
                "overnight_risk": item.get("overnight_risk_note", ""),
                "unrealized_pnl": pos.get("unrealized_pnl"),
                "unrealized_pct": pos.get("unrealized_pct"),
            })
    return candidates


def build_tunables(policy: dict) -> dict:
    c = policy.get("constraints", {})
    return {
        "trading_mode":              policy.get("trading_mode", "PAPER"),
        "live_trading_enabled":      policy.get("live_trading_enabled", False),
        "paper_autopilot_enabled":   policy.get("paper_autopilot_enabled", True),
        "max_daily_loss_pct":        c.get("max_daily_loss_pct"),
        "max_risk_per_trade_pct":    c.get("max_risk_per_trade_pct"),
        "max_aggregate_open_risk_pct": c.get("max_aggregate_open_risk_pct"),
        "max_concurrent_positions":  c.get("max_concurrent_positions"),
        "consecutive_loss_limit":    c.get("consecutive_loss_limit"),
        "consecutive_loss_size_modifier": c.get("consecutive_loss_size_modifier"),
        "reduce_only_size_cap":      c.get("reduce_only_size_cap"),
        "updated_at":                policy.get("updated_at"),
    }


def build_options(candidates_raw: dict, screened_raw: dict, strategy_raw: dict,
                  gate_raw: dict, exec_log_raw: dict) -> dict:
    # Gate summary
    gate = gate_raw
    gate_summary = {
        "status":           gate.get("status", "UNKNOWN"),
        "checked_at":       gate.get("checked_at"),
        "csp_slots_used":   next((c["detail"] for c in gate.get("checks", []) if c["check"] == "CSP_CONCENTRATION"), ""),
        "available_capital": gate.get("capital_summary", {}).get("available_options_capital"),
        "cash_buffer_pct":  round(gate.get("capital_summary", {}).get("cash_buffer_pct", 0) * 100, 1)
                            if gate.get("capital_summary", {}).get("cash_buffer_pct") is not None else None,
        "csp_slots_max":    2,
    }
    # Count used CSP slots from per_trade
    used = len([t for t in gate.get("per_trade", []) if t.get("type") == "CSP"])
    gate_summary["csp_slots_used"] = used

    # Candidates (from options_screener.py output)
    raw_candidates = candidates_raw.get("candidates", [])
    candidates = []
    for c in raw_candidates:
        best = c.get("best_csp") or {}
        candidates.append({
            "symbol":              c.get("symbol"),
            "current_price":       safe_float(c.get("current_price")),
            "expiry":              c.get("expiry"),
            "dte":                 c.get("dte"),
            "atm_iv":              round(safe_float(c.get("atm_iv"), 0) * 100, 1),
            "iv_rank":             c.get("iv_rank"),
            "iv_rank_source":      c.get("iv_rank_source"),
            "in_equity_pipeline":  c.get("in_equity_pipeline", False),
            "thesis_direction":    c.get("thesis_direction"),
            "thesis_conviction":   c.get("thesis_conviction"),
            # Best CSP strike
            "strike":              safe_float(best.get("strike")),
            "bid":                 safe_float(best.get("bid")),
            "delta":               safe_float(best.get("delta_approx")),
            "premium_yield_pct":   safe_float(best.get("premium_yield_pct")),
            "annualized_yield_pct": safe_float(best.get("annualized_yield_pct")),
            "assignment_capital":  safe_float(best.get("assignment_capital")),
            "open_interest":       best.get("open_interest"),
        })

    # Screened candidates (Agent-17 qualitative layer)
    screened = []
    for s in screened_raw.get("screened", []):
        screened.append({
            "symbol":               s.get("symbol"),
            "thesis_alignment":     s.get("thesis_alignment_score"),
            "assignment_willing":   s.get("assignment_willingness"),
            "narrative_risk":       s.get("narrative_risk_flags", []),
            "recommendation":       s.get("recommendation"),
            "rationale":            s.get("rationale", ""),
        })

    # Active trade specifications (Agent-18 output)
    active_trades = []
    for t in strategy_raw.get("trades", []):
        active_trades.append({
            "symbol":         t.get("symbol"),
            "type":           t.get("type"),          # CSP or CC
            "strike":         safe_float(t.get("strike")),
            "expiry":         t.get("expiry"),
            "dte":            t.get("dte"),
            "contracts":      t.get("contracts", 1),
            "limit_price":    safe_float(t.get("limit_price")),
            "wheel_state":    t.get("wheel_state", "IDLE"),
            "profit_target":  safe_float(t.get("profit_target_pct")),
            "status":         t.get("status"),
        })

    # Execution log (filled orders)
    executions = []
    for e in exec_log_raw.get("executions", []):
        executions.append({
            "symbol":      e.get("symbol"),
            "type":        e.get("type"),
            "strike":      safe_float(e.get("strike")),
            "expiry":      e.get("expiry"),
            "contracts":   e.get("contracts", 1),
            "fill_price":  safe_float(e.get("fill_price")),
            "premium":     safe_float(e.get("premium_collected")),
            "filled_at":   e.get("filled_at"),
            "status":      e.get("status"),
            "pnl":         safe_float(e.get("realized_pnl")),
        })

    return {
        "gate":            gate_summary,
        "candidates":      candidates,
        "screened":        screened,
        "active_trades":   active_trades,
        "executions":      executions,
        "scan_summary":    candidates_raw.get("scan_summary"),
        "as_of":           candidates_raw.get("written_at") or gate_raw.get("checked_at"),
    }


def build_bps(pos_status: dict, screened: dict, strategy: dict, exec_log: list) -> dict | None:
    """Build BPS module summary. Returns None if no BPS data exists."""
    if not pos_status and not screened and not strategy:
        return None

    # Active open spread positions
    positions = []
    for p in pos_status.get("positions", []):
        positions.append({
            "spread_id":          p.get("spread_id"),
            "symbol":             p.get("symbol"),
            "expiry":             p.get("expiry"),
            "short_strike":       safe_float(p.get("short_strike")),
            "long_strike":        safe_float(p.get("long_strike")),
            "width":              safe_float(p.get("width")),
            "contracts":          p.get("contracts", 1),
            "collateral":         safe_float(p.get("collateral")),
            "net_credit":         safe_float(p.get("net_credit_per_share")),
            "max_profit":         safe_float(p.get("max_profit")),
            "max_loss":           safe_float(p.get("max_loss")),
            "current_pl":         safe_float(p.get("current_pl")),
            "profit_pct_of_max":  safe_float(p.get("profit_pct_of_max")),
            "dte":                p.get("dte"),
            "exit_reasons":       p.get("exit_reasons", []),
        })

    # Today's targets: approved screened candidates
    targets = []
    for c in screened.get("candidates", []):
        if c.get("agent_20_decision") not in ("APPROVE", "CONDITIONAL"):
            continue
        targets.append({
            "symbol":             c.get("symbol"),
            "price":              safe_float(c.get("price")),
            "sector":             c.get("sector", ""),
            "expiry":             c.get("expiry"),
            "dte":                c.get("dte"),
            "short_strike":       safe_float(c.get("short_strike")),
            "long_strike":        safe_float(c.get("long_strike")),
            "spread_width":       safe_float(c.get("spread_width")),
            "net_credit":         safe_float(c.get("net_credit")),
            "credit_width_ratio": safe_float(c.get("credit_width_ratio")),
            "annualized_yield_pct": safe_float(c.get("annualized_yield_pct")),
            "max_loss_per_contract": safe_float(c.get("max_loss_per_contract")),
            "iv_rank_proxy":      safe_float(c.get("iv_rank_proxy")),
            "decision":           c.get("agent_20_decision"),
            "rationale":          c.get("agent_20_rationale", ""),
            "selected":           False,  # will be updated below
        })

    # Mark selected targets from strategy
    selected_syms = {p.get("symbol") for p in strategy.get("positions", [])}
    for t in targets:
        if t["symbol"] in selected_syms:
            t["selected"] = True

    # Recent execution entries (last 5 from flattened log)
    recent_fills = []
    for entry in exec_log[-5:]:
        for r in entry.get("results", []):
            recent_fills.append({
                "symbol":   r.get("symbol", r.get("spread_id", "")),
                "action":   r.get("action"),
                "status":   r.get("status"),
                "expiry":   r.get("expiry"),
                "short_strike": safe_float(r.get("short_strike")),
                "long_strike":  safe_float(r.get("long_strike")),
                "contracts": r.get("contracts"),
                "limit_credit": safe_float(r.get("limit_credit")),
                "exit_reasons": r.get("exit_reasons", []),
            })

    return {
        "as_of":                 pos_status.get("generated_at", screened.get("generated_at")),
        "account_equity":        safe_float(pos_status.get("account_equity")),
        "available_capital":     safe_float(pos_status.get("available_capital")),
        "free_capital":          safe_float(pos_status.get("free_capital")),
        "current_open_positions": pos_status.get("current_open_positions", 0),
        "new_positions_possible": pos_status.get("new_positions_possible", 0),
        "max_active_positions":  10,
        "exits_needed":          pos_status.get("exits_needed", []),
        "positions":             positions,
        "targets":               targets,
        "recent_fills":          recent_fills,
        "screener_status":       screened.get("status"),
        "scanned":               screened.get("scanned"),
        "approved":              screened.get("approved"),
    }


def build_pipeline_status(audit: dict, session: dict) -> dict:
    payload = audit.get("payload", {})
    return {
        "trading_date":    session.get("trading_date") or audit.get("pipeline_date"),
        "run_id":          session.get("run_id"),
        "circuit_breaker": audit.get("circuit_breaker_state", "UNKNOWN"),
        "verdict":         payload.get("control_verdict", "UNKNOWN"),
        "critical_issues": payload.get("critical_issue_count", 0),
        "high_issues":     payload.get("high_issue_count", 0),
        "medium_issues":   payload.get("medium_issue_count", 0),
        "chain_ok":        payload.get("pipeline_chain_ok", False),
        "approval_path":   payload.get("approval_path_summary"),
        "paper_compliant": payload.get("paper_mode_compliant", True),
        "audit_written_at": audit.get("written_at"),
    }


def main():
    snapshot = load(WORKSPACE / "state/positions_snapshot.json")
    kpis     = load(WORKSPACE / "state/pipeline_kpis_v1.json")
    strategy = load(WORKSPACE / "state/strategy_spec.json")
    eod      = load(WORKSPACE / "state/eod_decision.json")
    policy   = load(WORKSPACE / "policies/risk_policy.json")
    audit    = load(WORKSPACE / "state/daily_audit_state.json")
    session  = load(WORKSPACE / "state/session_context.json")

    # Wheel/CSP options (disabled but preserved — gracefully absent)
    opt_candidates = load(OPTIONS_WORKSPACE / "state/options_candidates.json")
    opt_screened   = load(OPTIONS_WORKSPACE / "state/options_screened.json")
    opt_strategy   = load(OPTIONS_WORKSPACE / "state/options_strategy.json")
    opt_gate       = load(OPTIONS_WORKSPACE / "state/gate_options_risk.json")
    opt_exec       = load(OPTIONS_WORKSPACE / "state/options_execution_log.json")

    # BPS module (gracefully absent before first run)
    bps_pos_status = load(BPS_WORKSPACE / "state/bps_position_status.json")
    bps_screened   = load(BPS_WORKSPACE / "state/bps_screened.json")
    bps_strategy   = load(BPS_WORKSPACE / "state/bps_strategy.json")
    bps_exec_raw   = BPS_WORKSPACE / "state/bps_execution_log.json"
    bps_exec_log: list = []
    try:
        raw = json.loads(bps_exec_raw.read_text())
        bps_exec_log = raw if isinstance(raw, list) else [raw]
    except Exception:
        pass

    # Weekly persistent watchlist (nightly generator)
    weekly_watchlist = load(WORKSPACE / "state/weekly_watchlist.json")

    perf_dir = WORKSPACE / "data/daily-performance"

    positions   = build_positions(snapshot)
    account     = build_account(positions, snapshot)
    daily       = build_daily_series(perf_dir)
    equity      = build_equity_curve(snapshot, daily)
    watchlist   = build_watchlist(strategy, positions, weekly_watchlist)
    exits       = build_exit_candidates(eod, positions)
    tunables    = build_tunables(policy)
    perf_kpis   = kpis.get("performance_kpis", {})
    pipeline    = build_pipeline_status(audit, session)
    options     = build_options(opt_candidates, opt_screened, opt_strategy, opt_gate, opt_exec)
    bps         = build_bps(bps_pos_status, bps_screened, bps_strategy, bps_exec_log)

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "as_of_date":   snapshot.get("pipeline_date") or snapshot.get("fetched_at", "")[:10],
        "account":      account,
        "positions":    positions,
        "pipeline_status": pipeline,
        "kpis": {
            "total_trades":   perf_kpis.get("total_trades", 0),
            "closed_trades":  perf_kpis.get("closed_trades", 0),
            "open_trades":    perf_kpis.get("open_trades", 0),
            "win_rate_pct":   perf_kpis.get("win_rate_pct"),
            "profit_factor":  perf_kpis.get("profit_factor"),
            "expectancy":     perf_kpis.get("expectancy"),
            "net_pnl":        perf_kpis.get("net_pnl", 0),
            "max_drawdown_pct": perf_kpis.get("max_drawdown_pct"),
            "max_drawdown_usd": perf_kpis.get("max_drawdown_usd"),
            "max_win_streak": perf_kpis.get("max_win_streak", 0),
            "max_loss_streak": perf_kpis.get("max_loss_streak", 0),
        },
        "daily_performance": daily,
        "equity_curve":      equity,
        "watchlist":         watchlist,
        "exit_candidates":   exits,
        "tunables":          tunables,
        "options":           options,
        "bps":               bps,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, indent=2, default=str))
    n_wl  = len(watchlist.get("items", []))
    n_bps = len(bps.get("positions", [])) if bps else 0
    n_opts = len(options.get("candidates", []))
    print(f"Wrote trading.json — {len(positions)} positions, {len(daily)} days, {n_wl} watchlist, {len(exits)} exits, {n_opts} wheel candidates, {n_bps} BPS positions")


if __name__ == "__main__":
    main()
