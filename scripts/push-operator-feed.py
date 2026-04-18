#!/usr/bin/env python3
"""Build the phase-1 operator feed from rebuild artifacts.

Writes: data/operator-feed.json
"""

from collections import deque
import json
from datetime import datetime, timezone
import os
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

WORKSPACE = Path(os.environ.get('OPENCLAW_WORKSPACE', str(Path.home() / '.openclaw/workspace/trading-bot')))
REBUILD_LATEST = Path(os.environ.get('OPENCLAW_REBUILD_LATEST', str(WORKSPACE / 'state/rebuild_latest')))
REBUILD_HISTORY = Path(os.environ.get('OPENCLAW_REBUILD_HISTORY', str(WORKSPACE / 'state/rebuild_history')))
CHECKPOINT05 = Path(
    os.environ.get(
        'OPENCLAW_CHECKPOINT05_PATH',
        str(WORKSPACE / 'state/rebuild_reports/checkpoint05/checkpoint05_status_latest.json'),
    )
)
PERF_DIR = Path(os.environ.get('OPENCLAW_PERF_DIR', str(WORKSPACE / 'data/daily-performance')))
POLICY_PATH = Path(os.environ.get('OPENCLAW_POLICY_PATH', str(WORKSPACE / 'config/rebuild_policy.json')))
MODE_STATE_PATH = Path(os.environ.get('OPENCLAW_MODE_STATE_PATH', str(REBUILD_LATEST / 'operator_mode_state.json')))
MODE_HISTORY_PATH = Path(os.environ.get('OPENCLAW_MODE_HISTORY_PATH', str(REBUILD_HISTORY / 'mode_transition_events.jsonl')))
APPROVAL_QUEUE_PATH = Path(os.environ.get('OPENCLAW_APPROVAL_QUEUE_PATH', str(REBUILD_LATEST / 'approval_queue.json')))
STRATEGY_BANK_PATH = Path(os.environ.get('OPENCLAW_STRATEGY_BANK_PATH', str(REBUILD_LATEST / 'strategy_bank.json')))
ACTIVE_STRATEGY_PATH = Path(os.environ.get('OPENCLAW_ACTIVE_STRATEGY_PATH', str(REBUILD_LATEST / 'active_strategy.json')))
OUTPUT = Path(__file__).parent.parent / 'data/operator-feed.json'
ET = ZoneInfo('America/New_York')
OVERRIDE_ENV_KEYS = [
    'OPENCLAW_WORKSPACE',
    'OPENCLAW_REBUILD_LATEST',
    'OPENCLAW_REBUILD_HISTORY',
    'OPENCLAW_CHECKPOINT05_PATH',
    'OPENCLAW_PERF_DIR',
    'OPENCLAW_POLICY_PATH',
    'OPENCLAW_MODE_STATE_PATH',
    'OPENCLAW_MODE_HISTORY_PATH',
    'OPENCLAW_APPROVAL_QUEUE_PATH',
    'OPENCLAW_STRATEGY_BANK_PATH',
    'OPENCLAW_ACTIVE_STRATEGY_PATH',
]


def load(path: Path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {}


def build_source_context() -> dict:
    override_values = {key: os.environ[key] for key in OVERRIDE_ENV_KEYS if os.environ.get(key)}
    override_active = bool(override_values)
    label = os.environ.get('OPENCLAW_FEED_SOURCE_LABEL')
    if not label:
        label = 'preview_override' if override_active else 'canonical'
    return {
        'mode': 'override' if override_active else 'canonical',
        'label': label,
        'override_active': override_active,
        'override_keys': sorted(override_values.keys()),
        'note': (
            'Feed generated from override artifact roots. Treat as preview/demo data until regenerated canonically.'
            if override_active
            else 'Feed generated from canonical rebuild artifacts.'
        ),
    }


def safe_float(value, default=None):
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def summarize_symbols(items: list[dict], key: str = 'symbol', limit: int = 5) -> list[str]:
    symbols: list[str] = []
    for item in items:
        symbol = item.get(key)
        if symbol and symbol not in symbols:
            symbols.append(symbol)
        if len(symbols) >= limit:
            break
    return symbols


def summarize_symbol_text(symbols: list[str], total_count: int) -> str:
    if not symbols:
        return 'No names surfaced yet.'
    if total_count > len(symbols):
        return f"{', '.join(symbols)} +{total_count - len(symbols)} more"
    return ', '.join(symbols)


def describe_jump_regime(jump_pctile) -> Optional[str]:
    value = safe_float(jump_pctile)
    if value is None:
        return None
    if value >= 90:
        return 'jump stress is elevated'
    if value >= 65:
        return 'jump activity is running hot'
    if value <= 20:
        return 'jump activity is muted'
    return 'jump activity is mixed'


def build_plan_narrative(pre_gate: dict, trade_plan: dict, gate_attr: dict) -> str:
    pre_gate_items = pre_gate.get('items', [])
    trade_items = trade_plan.get('items', [])
    pre_gate_count = pre_gate.get('candidate_count', len(pre_gate_items) or 0)
    trade_count = len(trade_items)
    pre_gate_symbols = summarize_symbols(pre_gate_items)
    trade_symbols = summarize_symbols(trade_items)
    suppression = gate_attr.get('suppression_cause')
    entry_mode = gate_attr.get('entry_mode') or trade_plan.get('entry_mode') or pre_gate.get('entry_mode')
    blocked_reasons = trade_plan.get('blocked_reasons', []) or gate_attr.get('blocked_reasons', [])

    if trade_plan.get('status') == 'READY' and trade_count:
        return (
            f"{trade_count} trade(s) are ready to express today: "
            f"{summarize_symbol_text(trade_symbols, trade_count)}."
        )
    if pre_gate_count and suppression == 'GATE_BLOCKED':
        reasons = ', '.join(blocked_reasons[:2]) if blocked_reasons else 'the current gate state'
        return (
            f"{pre_gate_count} candidate(s) cleared research, but the plan stayed blocked by "
            f"{title_case_token(entry_mode) if entry_mode else 'the active gate'} ({reasons}). "
            f"Current candidate set: {summarize_symbol_text(pre_gate_symbols, pre_gate_count)}."
        )
    if pre_gate_count:
        return (
            f"{pre_gate_count} candidate(s) surfaced in research. Current set: "
            f"{summarize_symbol_text(pre_gate_symbols, pre_gate_count)}."
        )
    return 'No candidates surfaced in the current rebuild slice.'


def title_case_token(value: Optional[str]) -> str:
    if not value:
        return 'Unknown'
    return ' '.join(part.capitalize() for part in str(value).split('_') if part)


def build_research_narrative(market: dict, theses: list[dict]) -> str:
    tradable_symbols = market.get('tradable_symbols', [])
    long_bias = sum(1 for item in theses if item.get('side_bias') == 'LONG')
    short_bias = sum(1 for item in theses if item.get('side_bias') == 'SHORT')
    lead = theses[0] if theses else None
    coverage_preview = summarize_symbol_text(tradable_symbols[:5], len(tradable_symbols))
    bias_text = f'{long_bias} long / {short_bias} short'
    if lead and lead.get('symbol'):
        return (
            f"Coverage spans {len(tradable_symbols)} liquid names ({coverage_preview}). "
            f"Current thesis mix is {bias_text}. Lead idea is {lead.get('symbol')} "
            f"{title_case_token(lead.get('side_bias'))} on a {title_case_token(lead.get('catalyst_label'))} setup."
        )
    return f"Coverage spans {len(tradable_symbols)} liquid names ({coverage_preview}). No lead thesis is populated yet."


def build_regime_narrative(regime: dict, populated: bool) -> str:
    if not populated:
        return 'Regime context has not populated yet.'
    parts: list[str] = []
    vix_level = safe_float(regime.get('vix_level'))
    if vix_level is not None and regime.get('vix_regime'):
        parts.append(f"VIX is {vix_level:.2f} in a {title_case_token(regime.get('vix_regime'))} regime")
    hmm_regime = regime.get('hmm_regime')
    if hmm_regime:
        parts.append(f"HMM reads {title_case_token(hmm_regime)}")
    jump_text = describe_jump_regime(regime.get('jump_variation_pctile'))
    if jump_text:
        parts.append(jump_text)
    if not parts:
        return 'Only partial regime context is available right now.'
    return '. '.join(parts) + '.'


def build_strategy_bank_narrative(active_record: dict | None, strategy_records: list[dict]) -> str:
    if not strategy_records:
        return 'No promoted strategies are banked yet.'
    if active_record is None:
        return f"{len(strategy_records)} promoted strategy variant(s) are banked, but none is currently active."
    return (
        f"Active strategy is {active_record.get('display_name') or active_record.get('record_id')} "
        f"in stage {title_case_token(active_record.get('promotion_stage'))}. "
        f"{max(len(strategy_records) - 1, 0)} other banked variant(s) remain available for selection."
    )


def summarize_strategy_record(record: dict, active_record_id: str | None) -> dict:
    profile = record.get('planning_profile', {}) if isinstance(record, dict) else {}
    performance = record.get('performance_summary', {}) if isinstance(record, dict) else {}
    evidence = record.get('evidence', {}) if isinstance(record, dict) else {}
    return {
        'record_id': record.get('record_id'),
        'selected': record.get('record_id') == active_record_id,
        'strategy_id': record.get('strategy_id'),
        'variant_id': record.get('variant_id'),
        'strategy_family': record.get('strategy_family'),
        'display_name': record.get('display_name'),
        'description': record.get('description'),
        'promotion_stage': record.get('promotion_stage'),
        'signal_source': record.get('signal_source'),
        'allowed_sides': profile.get('allowed_sides', []),
        'symbols': profile.get('symbols', []),
        'max_positions': profile.get('max_positions'),
        'risk_pct_per_trade': safe_float(profile.get('risk_pct_per_trade')),
        'stop_loss_pct': safe_float(profile.get('stop_loss_pct')),
        'target_pct': safe_float(profile.get('target_pct')),
        'max_hold_days': profile.get('max_hold_days'),
        'performance_summary': {
            'verdict_reason': performance.get('verdict_reason'),
            'total_trades': performance.get('total_trades'),
            'evaluated_trading_days': performance.get('evaluated_trading_days'),
            'total_return_pct': safe_float(performance.get('total_return_pct')),
            'benchmark_return_pct': safe_float(performance.get('benchmark_return_pct')),
            'excess_return_pct': safe_float(performance.get('excess_return_pct')),
            'deployment_matched_benchmark_return_pct': safe_float(
                performance.get('deployment_matched_benchmark_return_pct')
            ),
            'deployment_matched_excess_return_pct': safe_float(
                performance.get('deployment_matched_excess_return_pct')
            ),
            'sharpe_ratio': safe_float(performance.get('sharpe_ratio')),
            'sortino_ratio': safe_float(performance.get('sortino_ratio')),
            'calmar_ratio': safe_float(performance.get('calmar_ratio')),
            'max_drawdown_pct': safe_float(performance.get('max_drawdown_pct')),
            'profit_factor': safe_float(performance.get('profit_factor')),
            'expectancy_per_trade_usd': safe_float(performance.get('expectancy_per_trade_usd')),
            'win_rate_pct': safe_float(performance.get('win_rate_pct')),
            'profitable_fold_pct': safe_float(performance.get('profitable_fold_pct')),
        },
        'notes': record.get('notes', []),
        'evidence': {
            'campaign_id': evidence.get('campaign_id'),
            'campaign_run_id': evidence.get('campaign_run_id'),
            'experiment_id': evidence.get('experiment_id'),
            'validation_run_id': evidence.get('validation_run_id'),
        },
    }


def build_strategy_bank(active_strategy: dict, strategy_bank: dict) -> dict:
    active_record = active_strategy.get('record') if isinstance(active_strategy, dict) else None
    active_record_id = strategy_bank.get('active_record_id') if isinstance(strategy_bank, dict) else None
    strategy_records = strategy_bank.get('strategies', []) if isinstance(strategy_bank, dict) else []
    records = [summarize_strategy_record(record, active_record_id) for record in strategy_records]
    active_summary = summarize_strategy_record(active_record, active_record_id) if active_record else None
    return {
        'active_record_id': active_record_id,
        'strategy_count': len(records),
        'active': active_summary,
        'banked_strategies': records,
        'narrative': build_strategy_bank_narrative(active_summary, records),
    }


def load_jsonl_tail(path: Path, limit: int = 20) -> list[dict]:
    if not path.exists():
        return []
    tail: deque[str] = deque(maxlen=limit)
    try:
        with path.open() as handle:
            for line in handle:
                line = line.strip()
                if line:
                    tail.append(line)
    except Exception:
        return []

    items: list[dict] = []
    for line in tail:
        try:
            value = json.loads(line)
        except Exception:
            continue
        if isinstance(value, dict):
            items.append(value)
    return items


def build_positions(market: dict, legacy_snapshot: dict) -> list[dict]:
    legacy_items = {item.get('symbol'): item for item in legacy_snapshot.get('positions', []) if item.get('symbol')}
    positions = []
    for item in market.get('positions', []):
        symbol = item.get('symbol')
        legacy = legacy_items.get(symbol, {})
        qty = safe_float(item.get('quantity'), 0.0)
        current_price = safe_float(legacy.get('current_price'))
        if current_price is None and qty:
            current_price = safe_float(item.get('market_value_usd'), 0.0) / qty
        unrealized = safe_float(item.get('unrealized_pnl_usd'))
        entry_basis = abs(safe_float(item.get('avg_price'), 0.0) * qty)
        unrealized_pct = (unrealized / entry_basis * 100) if unrealized is not None and entry_basis else None
        positions.append({
            'symbol': symbol,
            'qty': qty,
            'side': 'short' if qty < 0 else 'long',
            'entry_price': safe_float(item.get('avg_price'), 0.0),
            'current_price': current_price or 0.0,
            'market_value': safe_float(item.get('market_value_usd'), 0.0),
            'unrealized_pnl': unrealized,
            'unrealized_pct': round(unrealized_pct, 2) if unrealized_pct is not None else None,
            'change_today_pct': round(safe_float(legacy.get('change_today'), 0.0) * 100, 2) if legacy else 0.0,
            'asset_type': item.get('asset_type', 'EQUITY'),
        })
    return positions


def build_account(market: dict, legacy_snapshot: dict, positions: list[dict], source_context: dict, as_of_date: str) -> dict:
    account = market.get('account', {})
    legacy_account = legacy_snapshot.get('account', {})
    history = legacy_snapshot.get('portfolio_history', {})
    positions_value = round(sum(safe_float(p.get('market_value'), 0.0) for p in positions), 2)
    equity_deployed = round(sum(safe_float(p.get('market_value'), 0.0) for p in positions if p.get('asset_type') == 'EQUITY'), 2)
    crypto_deployed = round(sum(safe_float(p.get('market_value'), 0.0) for p in positions if p.get('asset_type') == 'CRYPTO'), 2)
    options_deployed = round(sum(abs(safe_float(p.get('market_value'), 0.0)) for p in positions if p.get('asset_type') == 'OPTION'), 2)
    unrealized_pnl = round(sum(safe_float(p.get('unrealized_pnl'), 0.0) for p in positions), 2)
    entry_basis = positions_value - unrealized_pnl
    base_value = safe_float(history.get('base_value'))
    equity = safe_float(account.get('equity_usd'))
    last_equity = safe_float(legacy_account.get('last_equity'))
    total_pnl = round(equity - base_value, 2) if equity is not None and base_value is not None else None
    total_pnl_pct = round(total_pnl / base_value * 100, 4) if total_pnl is not None and base_value else None
    current_et_date = datetime.now(ET).date().isoformat()
    same_session_day = as_of_date == current_et_date
    can_trust_today_pnl = source_context.get('mode') == 'canonical' and same_session_day
    today_pnl = round(equity - last_equity, 2) if can_trust_today_pnl and equity is not None and last_equity is not None else None
    today_pnl_pct = round(today_pnl / last_equity * 100, 4) if today_pnl is not None and last_equity else None
    unrealized_pct = round(unrealized_pnl / entry_basis * 100, 2) if entry_basis else None
    return {
        'equity': equity,
        'cash': safe_float(account.get('cash_usd')),
        'buying_power': safe_float(account.get('buying_power_usd')),
        'base_value': base_value,
        'total_pnl': total_pnl,
        'total_pnl_pct': total_pnl_pct,
        'today_pnl': today_pnl,
        'today_pnl_pct': today_pnl_pct,
        'positions_value': positions_value,
        'equity_deployed': equity_deployed,
        'crypto_deployed': crypto_deployed,
        'options_deployed': options_deployed,
        'unrealized_pnl': unrealized_pnl,
        'unrealized_pnl_pct': unrealized_pct,
    }


def build_kpis(legacy_kpis: dict, open_positions: int) -> dict:
    perf = legacy_kpis.get('performance_kpis', {})
    return {
        'total_trades': int(perf.get('total_trades') or 0),
        'closed_trades': int(perf.get('closed_trades') or 0),
        'open_trades': int(perf.get('open_trades') or open_positions),
        'win_rate_pct': safe_float(perf.get('win_rate_pct')),
        'profit_factor': safe_float(perf.get('profit_factor')),
        'expectancy': safe_float(perf.get('expectancy')),
        'net_pnl': safe_float(perf.get('net_pnl'), 0.0),
        'max_drawdown_pct': safe_float(perf.get('max_drawdown_pct')),
        'max_drawdown_usd': safe_float(perf.get('max_drawdown_usd')),
        'max_win_streak': int(perf.get('max_win_streak') or 0),
        'max_loss_streak': int(perf.get('max_loss_streak') or 0),
        'source': 'legacy_pipeline_kpis_v1',
    }


def build_daily_performance() -> list[dict]:
    if not PERF_DIR.exists():
        return []
    rows = []
    for path in sorted(PERF_DIR.glob('*.json')):
        summary = load(path).get('summary', {})
        rows.append({
            'date': summary.get('date') or path.stem,
            'net_pnl': safe_float(summary.get('net_pnl'), 0.0),
            'trades': int(summary.get('total_trades') or 0),
            'winners': int(summary.get('winners') or 0),
            'losers': int(summary.get('losers') or 0),
            'win_rate': safe_float(summary.get('win_rate_pct')),
        })
    return rows


def build_equity_curve(legacy_snapshot: dict) -> list[dict]:
    return [
        {
            'date': row.get('date'),
            'equity': safe_float(row.get('equity'), 0.0),
            'profit_loss': safe_float(row.get('profit_loss')),
            'profit_loss_pct': safe_float(row.get('profit_loss_pct')),
        }
        for row in (legacy_snapshot.get('portfolio_history', {}) or {}).get('series', [])
        if row.get('date')
    ]


def build_watchlist(pre_gate: dict, trade_plan: dict, thesis_set: dict, held_symbols: set[str]) -> dict:
    plan_items = {item.get('symbol'): item for item in trade_plan.get('items', []) if item.get('symbol')}
    thesis_items = {item.get('symbol'): item for item in thesis_set.get('items', []) if item.get('symbol')}
    items = []
    for item in pre_gate.get('items', []):
        symbol = item.get('symbol')
        thesis = thesis_items.get(symbol, {})
        plan = plan_items.get(symbol, {})
        stop_value = safe_float(plan.get('stop_price') or item.get('stop_price'), 0.0)
        target_value = safe_float(plan.get('target_price') or item.get('target_price'), 0.0)
        items.append({
            'symbol': symbol,
            'trigger': thesis.get('catalyst_label') or 'UNKNOWN',
            'stop': f'{stop_value:.2f}',
            'target': f'{target_value:.2f}',
            'modifier': thesis.get('confidence') or 'UNKNOWN',
            'note': thesis.get('thesis_summary') or 'Rebuild pre-gate candidate.',
            'in_position': symbol in held_symbols,
        })
    return {
        'items': items,
        'as_of': pre_gate.get('trading_date'),
        'source': 'rebuild_pregate_intent',
    }


def build_pipeline_status(session: dict, checkpoint05: dict, daily_evaluation: dict, policy: dict, mode_state: dict) -> dict:
    entry_mode = session.get('entry_mode', 'OPEN')
    verdict = 'PASS' if checkpoint05.get('checkpoint_status') == 'REVIEW_READY' else 'WARN'
    if entry_mode == 'HALT':
        verdict = 'FAIL'
    incident_flags = daily_evaluation.get('incident_flags', [])
    current_mode = (
        mode_state.get('effective_mode')
        or mode_state.get('current_mode')
        or 'SHADOW'
    )
    execution_policy = mode_state.get('execution_policy', {})
    broker_environment = execution_policy.get('broker_environment', str(policy.get('mode', 'paper')).upper())
    return {
        'trading_date': session.get('trading_date'),
        'run_id': session.get('run_id'),
        'circuit_breaker': entry_mode,
        'verdict': verdict,
        'critical_issues': 1 if entry_mode == 'HALT' else 0,
        'high_issues': len(checkpoint05.get('blocking_notes', [])),
        'medium_issues': len(incident_flags),
        'chain_ok': len(incident_flags) == 0,
        'approval_path': current_mode,
        'paper_compliant': str(broker_environment).upper() == 'PAPER',
        'audit_written_at': datetime.now(timezone.utc).isoformat(),
    }


def build_tunables(policy: dict, session: dict, mode_state: dict) -> dict:
    execution_policy = mode_state.get('execution_policy', {})
    broker_environment = str(execution_policy.get('broker_environment', str(policy.get('mode', 'paper')).upper())).upper()
    execution_enabled = bool(execution_policy.get('execution_enabled', False))
    return {
        'trading_mode': broker_environment,
        'live_trading_enabled': broker_environment == 'LIVE',
        'paper_autopilot_enabled': execution_enabled and broker_environment == 'PAPER',
        'max_daily_loss_pct': None,
        'max_risk_per_trade_pct': policy.get('max_risk_per_trade_pct'),
        'max_aggregate_open_risk_pct': policy.get('max_gross_exposure_pct'),
        'max_concurrent_positions': policy.get('max_positions'),
        'consecutive_loss_limit': None,
        'consecutive_loss_size_modifier': None,
        'reduce_only_size_cap': 'NO_NEW_ENTRIES' if session.get('entry_mode') != 'OPEN' else 'FULL_SIZE',
        'updated_at': session.get('started_at'),
    }


def build_mode_note(mode_state: dict, checkpoint05: dict) -> str:
    current_mode = mode_state.get('current_mode') or 'SHADOW'
    gate_state = mode_state.get('gate_state', {})
    if current_mode == 'SHADOW':
        if checkpoint05.get('checkpoint_status') != 'REVIEW_READY':
            return 'Checkpoint-05 is still accumulating; operator mode remains SHADOW.'
        if gate_state.get('blocking_incidents'):
            return 'Checkpoint-05 is ready, but incidents are still blocking a paper promotion.'
        return 'Checkpoint-05 is review-ready; governed promotion to Autonomous Paper is now eligible.'
    if current_mode == 'AUTONOMOUS_PAPER':
        return 'Governed Autonomous Paper mode is active; paper execution may run without approval.'
    if current_mode == 'DECISION_SUPPORT':
        return 'Governed Decision Support mode is active; live plans require human approval before submission.'
    return 'Live Autonomous remains out of phase-1 scope.'


def build_mode_history(events: list[dict]) -> dict:
    latest = events[-1] if events else None
    recent_events = [
        {
            'event_type': item.get('event_type'),
            'from_mode': item.get('from_mode'),
            'to_mode': item.get('to_mode'),
            'requested_by': item.get('requested_by'),
            'reason': item.get('reason'),
            'timestamp': item.get('timestamp'),
        }
        for item in reversed(events[-3:])
    ]
    return {
        'history_window': 20,
        'event_count': len(events),
        'latest_event': {
            'event_type': latest.get('event_type'),
            'from_mode': latest.get('from_mode'),
            'to_mode': latest.get('to_mode'),
            'requested_by': latest.get('requested_by'),
            'reason': latest.get('reason'),
            'timestamp': latest.get('timestamp'),
        } if latest else None,
        'recent_events': recent_events,
        'note': 'No governed mode-change events recorded yet.' if latest is None else 'Showing the latest governed mode-control events from rebuild history.',
    }


def build_operator(session: dict, market: dict, thesis_set: dict, pre_gate: dict, trade_plan: dict, gate_attr: dict, daily_eval: dict, checkpoint05: dict, mode_state: dict, mode_history: dict, approval_queue: dict, active_strategy: dict, strategy_bank: dict) -> dict:
    theses = thesis_set.get('items', [])
    regime = market.get('regime', {})
    vix_level = safe_float(regime.get('vix_level'))
    regime_populated = bool(
        ((vix_level not in (None, 0.0)) and regime.get('vix_regime'))
        or regime.get('hmm_regime')
        or (safe_float(regime.get('jump_variation_pctile')) not in (None, 0.0))
    )
    execution_policy = mode_state.get('execution_policy', {})
    gate_state = mode_state.get('gate_state', {})
    approval_items = approval_queue.get('items', []) if isinstance(approval_queue, dict) else []
    approval_summary = None
    if approval_items:
        first_item = approval_items[0]
        latest_expiry = max((item.get('expires_at') for item in approval_items if item.get('expires_at')), default=None)
        latest_status = first_item.get('status')
        pending_count = sum(1 for item in approval_items if item.get('status') == 'PENDING')
        approval_summary = {
            'active_count': len(approval_items),
            'pending_count': pending_count,
            'latest_status': latest_status,
            'latest_expiry': latest_expiry,
            'scope': first_item.get('scope'),
            'plan_id': first_item.get('plan_id'),
            'trade_count': first_item.get('trade_count'),
            'symbols': first_item.get('symbols', []),
            'gross_risk_pct': safe_float((first_item.get('summary') or {}).get('gross_risk_pct')),
            'entry_mode': (first_item.get('summary') or {}).get('entry_mode'),
            'blocked_reasons': (first_item.get('summary') or {}).get('blocked_reasons', []),
            'status_note': 'Decision-support queue is awaiting operator action.'
            if pending_count > 0
            else 'Decision-support queue is present with no pending approvals.',
        }
    return {
        'mode': {
            'current_mode': mode_state.get('current_mode', 'SHADOW'),
            'effective_mode': mode_state.get('effective_mode', mode_state.get('current_mode', 'SHADOW')),
            'requested_mode': mode_state.get('requested_mode'),
            'target_paper_mode': 'AUTONOMOUS_PAPER',
            'target_live_mode': 'DECISION_SUPPORT',
            'broker_environment': execution_policy.get('broker_environment', 'PAPER'),
            'execution_enabled': bool(execution_policy.get('execution_enabled', False)),
            'approval_required': bool(execution_policy.get('approval_required', False)),
            'live_autonomous_available': False,
            'allowed_transitions': mode_state.get('allowed_transitions', []),
            'last_transition_reason': mode_state.get('last_transition_reason'),
            'applied_at': mode_state.get('applied_at'),
            'requested_at': mode_state.get('requested_at'),
            'gate_state': gate_state,
            'note': build_mode_note(mode_state, checkpoint05),
        },
        'session': {
            'run_id': session.get('run_id'),
            'phase': session.get('phase'),
            'entry_mode': session.get('entry_mode'),
            'policy_version': session.get('policy_version'),
        },
        'checkpoint05': {
            'checkpoint_status': checkpoint05.get('checkpoint_status'),
            'evidence_sufficient': checkpoint05.get('evidence_sufficient'),
            'total_shadow_days': checkpoint05.get('total_shadow_days', 0),
            'substantive_shadow_days': checkpoint05.get('substantive_shadow_days', 0),
            'substantive_pregate_days': checkpoint05.get('substantive_pregate_days', 0),
            'one_sided_days': checkpoint05.get('one_sided_days', 0),
            'trivial_days': checkpoint05.get('trivial_days', 0),
            'avg_substantive_match': checkpoint05.get('avg_substantive_match'),
            'latest_suppression_cause': checkpoint05.get('latest_suppression_cause'),
            'blocking_notes': checkpoint05.get('blocking_notes', []),
        },
        'plan': {
            'pre_gate_status': pre_gate.get('status', 'NO_CANDIDATES'),
            'pre_gate_candidate_count': pre_gate.get('candidate_count', 0),
            'pre_gate_symbols': summarize_symbols(pre_gate.get('items', [])),
            'trade_plan_status': trade_plan.get('status', 'NO_TRADES'),
            'trade_plan_count': len(trade_plan.get('items', [])),
            'trade_plan_symbols': summarize_symbols(trade_plan.get('items', [])),
            'blocked_reasons': trade_plan.get('blocked_reasons', []),
            'suppression_cause': gate_attr.get('suppression_cause', 'UNKNOWN'),
            'narrative': build_plan_narrative(pre_gate, trade_plan, gate_attr),
        },
        'research': {
            'tradable_symbol_count': len(market.get('tradable_symbols', [])),
            'coverage_symbols': summarize_symbols([{'symbol': symbol} for symbol in market.get('tradable_symbols', [])]),
            'research_item_count': len(load(REBUILD_LATEST / 'research_dataset.json').get('items', [])),
            'thesis_item_count': len(theses),
            'long_bias_count': sum(1 for item in theses if item.get('side_bias') == 'LONG'),
            'short_bias_count': sum(1 for item in theses if item.get('side_bias') == 'SHORT'),
            'neutral_count': sum(1 for item in theses if item.get('side_bias') == 'NONE'),
            'top_theses': [
                {
                    'symbol': item.get('symbol'),
                    'side_bias': item.get('side_bias'),
                    'confidence': item.get('confidence'),
                    'bull_prob': item.get('bull_prob'),
                    'bear_prob': item.get('bear_prob'),
                    'catalyst_label': item.get('catalyst_label'),
                    'thesis_summary': item.get('thesis_summary'),
                }
                for item in theses[:5]
            ],
            'narrative': build_research_narrative(market, theses),
        },
        'regime': {
            **regime,
            'populated': regime_populated,
            'narrative': build_regime_narrative(regime, regime_populated),
        },
        'report_paths': {
            'local_only': True,
            'checkpoint05_status': str(CHECKPOINT05),
            'shadow_report': checkpoint05.get('shadow_report_path'),
            'pregate_report': checkpoint05.get('pregate_report_path'),
        },
        'approval': approval_summary,
        'strategy_bank': build_strategy_bank(active_strategy, strategy_bank),
        'mode_history': mode_history,
        'incident_flags': daily_eval.get('incident_flags', []),
        'notes': daily_eval.get('notes', []),
    }


def main():
    session = load(REBUILD_LATEST / 'session_context.json')
    market = load(REBUILD_LATEST / 'market_snapshot.json')
    thesis_set = load(REBUILD_LATEST / 'thesis_set.json')
    pre_gate = load(REBUILD_LATEST / 'pre_gate_intent.json')
    trade_plan = load(REBUILD_LATEST / 'trade_plan.json')
    gate_attr = load(REBUILD_LATEST / 'gate_attribution.json')
    daily_eval = load(REBUILD_LATEST / 'daily_evaluation.json')
    checkpoint05 = load(CHECKPOINT05)
    mode_state = load(MODE_STATE_PATH)
    mode_history = build_mode_history(load_jsonl_tail(MODE_HISTORY_PATH))
    approval_queue = load(APPROVAL_QUEUE_PATH)
    strategy_bank = load(STRATEGY_BANK_PATH)
    active_strategy = load(ACTIVE_STRATEGY_PATH)
    legacy_positions = load(WORKSPACE / 'state/positions_snapshot.json')
    legacy_kpis = load(WORKSPACE / 'state/pipeline_kpis_v1.json')
    policy = load(POLICY_PATH)
    source_context = build_source_context()
    as_of_date = session.get('trading_date') or datetime.now(ET).date().isoformat()

    held_symbols = {item.get('symbol') for item in market.get('positions', [])}
    positions = build_positions(market, legacy_positions)
    output = {
        'contract_version': '1',
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'as_of_date': as_of_date,
        'source_context': source_context,
        'account': build_account(market, legacy_positions, positions, source_context, as_of_date),
        'positions': positions,
        'pipeline_status': build_pipeline_status(session, checkpoint05, daily_eval, policy, mode_state),
        'kpis': build_kpis(legacy_kpis, len(positions)),
        'daily_performance': build_daily_performance(),
        'equity_curve': build_equity_curve(legacy_positions),
        'watchlist': build_watchlist(pre_gate, trade_plan, thesis_set, held_symbols),
        'exit_candidates': [],
        'tunables': build_tunables(policy, session, mode_state),
        'options': None,
        'hedges': None,
        'bps': None,
        'operator': build_operator(session, market, thesis_set, pre_gate, trade_plan, gate_attr, daily_eval, checkpoint05, mode_state, mode_history, approval_queue, active_strategy, strategy_bank),
    }
    output['kpis']['positions_count'] = len(positions)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, indent=2, default=str), encoding='utf-8')
    print(f'Wrote operator-feed.json -> {OUTPUT}')


if __name__ == '__main__':
    main()
