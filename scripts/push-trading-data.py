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

WORKSPACE = Path.home() / ".openclaw/workspace/trading-bot"
OUTPUT    = Path(__file__).parent.parent / "data/trading.json"


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


def build_account(positions: list) -> dict:
    total_market_value = sum(safe_float(p.get("market_value"), 0) for p in positions)
    total_unrealized   = sum(safe_float(p.get("unrealized_pnl"), 0) for p in positions)
    entry_value        = total_market_value - total_unrealized
    unrealized_pct     = (total_unrealized / entry_value * 100) if entry_value else None
    return {
        "positions_value":    round(total_market_value, 2),
        "unrealized_pnl":     round(total_unrealized, 2),
        "unrealized_pnl_pct": round(unrealized_pct, 2) if unrealized_pct is not None else None,
        "cash":               None,  # requires live Alpaca API call
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


def build_equity_curve(series: list) -> list:
    cumulative = 0.0
    curve = []
    for day in series:
        cumulative += day["net_pnl"] or 0
        curve.append({"date": day["date"], "equity": round(cumulative, 2)})
    return curve


def build_watchlist(strategy: dict, positions: list) -> list:
    """Items in strategy_spec that are NOT currently held."""
    held = {p["symbol"] for p in positions}
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
            })
    return watchlist


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

    perf_dir = WORKSPACE / "data/daily-performance"

    positions   = build_positions(snapshot)
    account     = build_account(positions)
    daily       = build_daily_series(perf_dir)
    equity      = build_equity_curve(daily)
    watchlist   = build_watchlist(strategy, positions)
    exits       = build_exit_candidates(eod, positions)
    tunables    = build_tunables(policy)
    perf_kpis   = kpis.get("performance_kpis", {})
    pipeline    = build_pipeline_status(audit, session)

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
            "max_win_streak": perf_kpis.get("max_win_streak", 0),
            "max_loss_streak": perf_kpis.get("max_loss_streak", 0),
        },
        "daily_performance": daily,
        "equity_curve":      equity,
        "watchlist":         watchlist,
        "exit_candidates":   exits,
        "tunables":          tunables,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, indent=2, default=str))
    print(f"Wrote trading.json — {len(positions)} positions, {len(daily)} days, {len(watchlist)} watchlist, {len(exits)} exit candidates")


if __name__ == "__main__":
    main()
