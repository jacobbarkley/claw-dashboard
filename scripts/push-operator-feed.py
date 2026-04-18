#!/usr/bin/env python3
"""Build the phase-1 operator feed from rebuild artifacts.

Writes: data/operator-feed.json
"""

from __future__ import annotations

from collections import deque
import json
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
from typing import Optional
import urllib.error
import urllib.parse
import urllib.request
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
BROKER_SNAPSHOT_PATH = Path(os.environ.get('OPENCLAW_BROKER_SNAPSHOT_PATH', str(REBUILD_LATEST / 'broker_snapshot.json')))
CRYPTO_EXECUTION_PLAN_PATH = Path(
    os.environ.get('OPENCLAW_CRYPTO_EXECUTION_PLAN_PATH', str(REBUILD_LATEST / 'crypto_execution_plan.json'))
)
CRYPTO_EXECUTION_REPORT_PATH = Path(
    os.environ.get('OPENCLAW_CRYPTO_EXECUTION_REPORT_PATH', str(REBUILD_LATEST / 'crypto_execution_report.json'))
)
BENCH_MANIFESTS_DIR = Path(os.environ.get('OPENCLAW_BENCH_MANIFESTS_DIR', str(WORKSPACE / 'backtest/bench/manifests')))
ALPACA_CREDS_PATH = Path(os.environ.get('OPENCLAW_ALPACA_CREDS_PATH', str(Path.home() / '.openclaw/creds/alpaca-paper.json')))
OUTPUT = Path(__file__).parent.parent / 'data/operator-feed.json'
ET = ZoneInfo('America/New_York')
ALPACA_REQUIRED_KEYS = ('ALPACA_API_KEY_ID', 'ALPACA_API_SECRET_KEY')
ALPACA_DATA_BASE_URL = 'https://data.alpaca.markets'
BENCH_COMPARISON_KEYS = (
    'benchmark',
    'benchmark_baseline',
    'core_regime',
    'graduated_core',
    'tactical',
    'core_gated_tactical',
    'graduated_core_tactical_overlay',
)
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
    'OPENCLAW_BROKER_SNAPSHOT_PATH',
    'OPENCLAW_CRYPTO_EXECUTION_PLAN_PATH',
    'OPENCLAW_CRYPTO_EXECUTION_REPORT_PATH',
    'OPENCLAW_BENCH_MANIFESTS_DIR',
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


def load_alpaca_creds(path: Path = ALPACA_CREDS_PATH) -> Optional[dict]:
    payload = load(path)
    if not isinstance(payload, dict):
        return None
    if not all(payload.get(key) for key in ALPACA_REQUIRED_KEYS):
        return None
    return payload


def alpaca_data_request(creds: dict, path: str, *, params: Optional[dict] = None):
    url = f'{ALPACA_DATA_BASE_URL}{path}'
    if params:
        query = urllib.parse.urlencode({key: value for key, value in params.items() if value is not None})
        if query:
            url = f'{url}?{query}'

    request = urllib.request.Request(url)
    request.add_header('APCA-API-KEY-ID', creds['ALPACA_API_KEY_ID'])
    request.add_header('APCA-API-SECRET-KEY', creds['ALPACA_API_SECRET_KEY'])
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read())
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return None


def fetch_stock_snapshots(symbols: list[str], creds: Optional[dict]) -> dict[str, dict]:
    if creds is None or not symbols:
        return {}
    payload = alpaca_data_request(creds, '/v2/stocks/snapshots', params={'symbols': ','.join(symbols)})
    if not isinstance(payload, dict):
        return {}
    snapshots = payload.get('snapshots')
    if isinstance(snapshots, dict):
        return snapshots
    return payload


def fetch_stock_return_20d_map(symbols: list[str], creds: Optional[dict]) -> dict[str, float]:
    if creds is None or not symbols:
        return {}

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=45)
    payload = alpaca_data_request(
        creds,
        '/v2/stocks/bars',
        params={
            'symbols': ','.join(symbols),
            'timeframe': '1Day',
            'start': start.isoformat().replace('+00:00', 'Z'),
            'end': end.isoformat().replace('+00:00', 'Z'),
            'limit': 30,
            'adjustment': 'raw',
            'sort': 'asc',
        },
    )
    if not isinstance(payload, dict):
        return {}

    raw_bars = payload.get('bars')
    grouped: dict[str, list[dict]] = {}

    if isinstance(raw_bars, dict):
        grouped = {
            str(symbol).upper(): bars
            for symbol, bars in raw_bars.items()
            if isinstance(bars, list)
        }
    elif isinstance(raw_bars, list):
        for bar in raw_bars:
            if not isinstance(bar, dict):
                continue
            symbol = str(bar.get('S') or bar.get('symbol') or '').upper()
            if not symbol:
                continue
            grouped.setdefault(symbol, []).append(bar)

    out: dict[str, float] = {}
    for symbol, bars in grouped.items():
        closes = [safe_float(bar.get('c')) for bar in bars]
        closes = [value for value in closes if value not in (None, 0)]
        if len(closes) < 2:
            continue
        anchor_idx = -21 if len(closes) >= 21 else 0
        start_close = closes[anchor_idx]
        end_close = closes[-1]
        if start_close in (None, 0) or end_close is None:
            continue
        out[symbol] = round((end_close / start_close - 1) * 100, 4)
    return out


def load_workspace_relative_json(path_value: Optional[str]) -> dict:
    if not path_value:
        return {}
    path = Path(path_value)
    if not path.is_absolute():
        path = WORKSPACE / path
    return load(path)


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
        'selected_at': record.get('selected_at'),
        'registered_at': record.get('registered_at'),
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


def summarize_manifest_performance(manifest: dict) -> dict | None:
    source = manifest.get('source', {}) if isinstance(manifest, dict) else {}
    report = load_workspace_relative_json(source.get('source_report_path'))
    if not isinstance(report, dict):
        return None

    if isinstance(report.get('selected_result'), dict):
        selected = report.get('selected_result', {})
        return {
            'total_return_pct': safe_float(selected.get('total_return_pct')),
            'benchmark_return_pct': safe_float(selected.get('benchmark_return_pct')),
            'excess_return_pct': safe_float(selected.get('excess_return_pct')),
            'sharpe_ratio': safe_float(selected.get('sharpe_ratio')),
            'calmar_ratio': safe_float(selected.get('calmar_ratio')),
            'max_drawdown_pct': safe_float(selected.get('max_drawdown_pct')),
            'profit_factor': safe_float(selected.get('profit_factor')),
            'win_rate_pct': safe_float(selected.get('win_rate_pct')),
            'trade_count': selected.get('total_trades'),
            'days': selected.get('evaluated_trading_days'),
        }

    selected_id = manifest.get('deployment_config_id') or source.get('selected_config_id')
    for key in BENCH_COMPARISON_KEYS:
        lane = report.get(key)
        if not isinstance(lane, dict):
            continue
        if selected_id and lane.get('sleeve_id') != selected_id:
            continue
        summary = lane.get('summary', {}) if isinstance(lane.get('summary'), dict) else {}
        comparison = lane.get('benchmark_comparison', {}) if isinstance(lane.get('benchmark_comparison'), dict) else {}
        return {
            'total_return_pct': safe_float(summary.get('net_total_compounded_return_pct')),
            'benchmark_return_pct': safe_float((report.get('benchmark', {}) or {}).get('summary', {}).get('net_total_compounded_return_pct')),
            'excess_return_pct': safe_float(comparison.get('excess_return_pct')),
            'sharpe_ratio': safe_float(summary.get('sharpe_ratio')),
            'calmar_ratio': safe_float(summary.get('calmar_ratio')),
            'max_drawdown_pct': safe_float(summary.get('max_drawdown_pct')),
            'profit_factor': None,
            'win_rate_pct': safe_float(summary.get('net_win_rate_pct')),
            'trade_count': summary.get('trade_count'),
            'days': report.get('daily_bar_count'),
        }
    return None


def load_promoted_manifests() -> list[dict]:
    if not BENCH_MANIFESTS_DIR.exists():
        return []

    manifests: list[dict] = []
    for path in sorted(BENCH_MANIFESTS_DIR.glob('*.execution_manifest.json')):
        manifest = load(path)
        if not isinstance(manifest, dict):
            continue
        performance_summary = summarize_manifest_performance(manifest)
        manifests.append({
            'manifest_id': manifest.get('manifest_id'),
            'title': manifest.get('title'),
            'sleeve': manifest.get('sleeve'),
            'strategy_id': manifest.get('strategy_id'),
            'strategy_family': manifest.get('strategy_family'),
            'deployment_config_id': manifest.get('deployment_config_id'),
            'runtime_contract': manifest.get('runtime_contract'),
            'cadence': manifest.get('cadence'),
            'benchmark_symbol': manifest.get('benchmark_symbol'),
            'generated_at': manifest.get('generated_at'),
            'broker': manifest.get('broker', {}),
            'target_spec': manifest.get('target_spec', {}),
            'source_kind': 'CHECKED_IN',
            'source': manifest.get('source', {}),
            'strategy_parameters': manifest.get('strategy_parameters', {}),
            'performance_summary': performance_summary,
        })

    manifests.sort(
        key=lambda item: (
            0 if item.get('sleeve') == 'STOCKS' else 1,
            str(item.get('generated_at') or ''),
        ),
        reverse=False,
    )
    return manifests


def build_strategy_bank(active_strategy: dict, strategy_bank: dict, promoted_manifests: list[dict]) -> dict:
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
        'promoted': promoted_manifests,
        'narrative': build_strategy_bank_narrative(active_summary, records),
    }


def build_crypto_signals(
    positions: list[dict],
    promoted_manifests: list[dict],
    crypto_execution_plan: dict,
    crypto_execution_report: dict,
) -> dict:
    crypto_manifest = next((item for item in promoted_manifests if item.get('sleeve') == 'CRYPTO'), None)
    crypto_positions = [item for item in positions if item.get('asset_type') == 'CRYPTO']
    params = crypto_manifest.get('strategy_parameters', {}) if isinstance(crypto_manifest, dict) else {}
    state_to_exposure = {
        'RISK_ON': safe_float(params.get('risk_on_exposure_pct')),
        'ACCUMULATE': safe_float(params.get('accumulate_exposure_pct')),
        'RISK_OFF': safe_float(params.get('risk_off_exposure_pct')),
    }
    current_state = (
        crypto_execution_plan.get('active_regime_state')
        or crypto_execution_plan.get('regime_state')
        or crypto_execution_plan.get('state')
    )
    current_exposure_pct = state_to_exposure.get(current_state) if current_state else None

    ladder = [
        {
            'state': 'RISK_ON',
            'label': 'Tier 1',
            'exposure_pct': state_to_exposure.get('RISK_ON'),
            'note': 'Constructive regime',
            'active': current_state == 'RISK_ON',
        },
        {
            'state': 'ACCUMULATE',
            'label': 'Tier 2',
            'exposure_pct': state_to_exposure.get('ACCUMULATE'),
            'note': 'Neutral regime',
            'active': current_state == 'ACCUMULATE',
        },
        {
            'state': 'RISK_OFF',
            'label': 'Tier 3',
            'exposure_pct': state_to_exposure.get('RISK_OFF'),
            'note': 'Risk-off',
            'active': current_state == 'RISK_OFF',
        },
    ]

    tracked_assets = []
    tier_label = next((item.get('label') for item in ladder if item.get('active')), None)
    for position in crypto_positions:
        tracked_assets.append({
            'symbol': position.get('symbol'),
            'lane': 'CORE',
            'state': current_state,
            'tier_label': tier_label,
            'target_exposure_pct': current_exposure_pct,
            'market_value': safe_float(position.get('market_value')),
            'qty': safe_float(position.get('qty')),
            'status': crypto_execution_report.get('status'),
        })

    return {
        'tsmom': {
            'status': 'RESEARCH_ONLY',
            'promoted': False,
            'cadence': '4H',
            'bar': '4H',
            'direction': None,
            'last_cross_at': None,
            'signal_strength_pct': None,
            'signal_strength_label': 'Bench only',
            'note': 'The 4H tactical overlay remains bench-only until a dedicated 4H execution manifest is promoted.',
        },
        'managed_exposure': {
            'status': 'PROMOTED' if crypto_manifest else 'NOT_PROMOTED',
            'manifest_id': crypto_manifest.get('manifest_id') if crypto_manifest else None,
            'title': crypto_manifest.get('title') if crypto_manifest else None,
            'strategy_family': crypto_manifest.get('strategy_family') if crypto_manifest else None,
            'cadence': crypto_manifest.get('cadence') if crypto_manifest else None,
            'current_state': current_state,
            'current_exposure_pct': current_exposure_pct,
            'target_notional_usd': safe_float(crypto_execution_plan.get('target_notional_usd')),
            'action': crypto_execution_plan.get('action'),
            'last_report_status': crypto_execution_report.get('status'),
            'performance_summary': crypto_manifest.get('performance_summary') if crypto_manifest else None,
            'ladder': ladder,
            'overlay_status': 'RESEARCH_ONLY',
            'note': (
                'Daily graduated core is the promoted crypto lane. Tactical remains an overlay candidate.'
                if crypto_manifest
                else 'No promoted crypto manifest is available yet.'
            ),
        },
        'tracked_assets': tracked_assets,
    }


def validate_output_contract(output: dict) -> None:
    strategy_universe = output.get('strategy_universe', {})
    if not isinstance(strategy_universe, dict):
        raise RuntimeError('operator feed contract violation: strategy_universe missing')

    symbols = strategy_universe.get('symbols')
    if not isinstance(symbols, list):
        raise RuntimeError('operator feed contract violation: strategy_universe.symbols missing')

    for item in symbols:
        if not isinstance(item, dict):
            raise RuntimeError('operator feed contract violation: strategy_universe.symbols contains non-object entries')
        for key in ('return_20d_pct', 'strategy_member'):
            if key not in item:
                raise RuntimeError(f'operator feed contract violation: strategy_universe.symbols[].{key} missing')

    operator = output.get('operator', {})
    if not isinstance(operator, dict):
        raise RuntimeError('operator feed contract violation: operator missing')

    strategy_bank = operator.get('strategy_bank', {})
    if not isinstance(strategy_bank, dict) or 'promoted' not in strategy_bank or not isinstance(strategy_bank.get('promoted'), list):
        raise RuntimeError('operator feed contract violation: operator.strategy_bank.promoted missing')

    crypto_signals = operator.get('crypto_signals')
    if not isinstance(crypto_signals, dict):
        raise RuntimeError('operator feed contract violation: operator.crypto_signals missing')


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


def build_positions(market: dict, legacy_snapshot: dict, broker_snapshot: dict) -> list[dict]:
    broker_items = broker_snapshot.get('positions', []) if isinstance(broker_snapshot, dict) else []
    if broker_items:
        positions = []
        for item in broker_items:
            unrealized_pct = safe_float(item.get('unrealized_pnl_pct'))
            change_today_pct = safe_float(item.get('change_today_pct'))
            positions.append({
                'symbol': item.get('symbol'),
                'qty': safe_float(item.get('quantity'), 0.0),
                'side': str(item.get('side', 'LONG')).lower(),
                'entry_price': safe_float(item.get('avg_price_usd'), 0.0),
                'current_price': safe_float(item.get('current_price_usd'), 0.0),
                'market_value': safe_float(item.get('market_value_usd'), 0.0),
                'unrealized_pnl': safe_float(item.get('unrealized_pnl_usd')),
                'unrealized_pct': round(unrealized_pct * 100, 2) if unrealized_pct is not None else None,
                'change_today_pct': round(change_today_pct * 100, 2) if change_today_pct is not None else 0.0,
                'asset_type': item.get('asset_type', 'EQUITY'),
            })
        return positions

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


def build_strategy_universe(
    market: dict,
    active_strategy: dict,
    positions: list[dict],
    research_dataset: dict,
) -> dict:
    active_record = active_strategy.get('record', {}) if isinstance(active_strategy, dict) else {}
    planning_profile = active_record.get('planning_profile', {}) if isinstance(active_record, dict) else {}
    configured_symbols = planning_profile.get('symbols', [])
    active_symbols = [str(symbol).strip().upper() for symbol in configured_symbols if symbol]
    if not active_symbols:
        active_symbols = [str(symbol).strip().upper() for symbol in market.get('tradable_symbols', []) if symbol]

    held_equity_symbols = [
        str(item.get('symbol')).strip().upper()
        for item in positions
        if item.get('symbol') and item.get('asset_type') == 'EQUITY'
    ]

    ordered_symbols: list[str] = []
    for symbol in [*active_symbols, *held_equity_symbols]:
        if symbol and symbol not in ordered_symbols:
            ordered_symbols.append(symbol)

    if not ordered_symbols:
        return {
            'as_of': None,
            'source': 'alpaca_market_data_snapshots',
            'symbols': [],
        }

    research_items = research_dataset.get('items', []) if isinstance(research_dataset, dict) else []
    research_map = {
        str(item.get('symbol')).strip().upper(): item
        for item in research_items
        if item.get('symbol')
    }
    position_map = {
        str(item.get('symbol')).strip().upper(): item
        for item in positions
        if item.get('symbol')
    }

    creds = load_alpaca_creds()
    snapshots = fetch_stock_snapshots(ordered_symbols, creds)
    return_20d_map = fetch_stock_return_20d_map(ordered_symbols, creds)
    source = 'alpaca_market_data_snapshots' if snapshots else 'rebuild_research_dataset_fallback'
    as_of_candidates: list[str] = []
    items: list[dict] = []

    for symbol in ordered_symbols:
        snapshot = snapshots.get(symbol, {}) if isinstance(snapshots, dict) else {}
        latest_trade = snapshot.get('latestTrade', {}) if isinstance(snapshot, dict) else {}
        latest_quote = snapshot.get('latestQuote', {}) if isinstance(snapshot, dict) else {}
        daily_bar = snapshot.get('dailyBar', {}) if isinstance(snapshot, dict) else {}
        prev_daily_bar = snapshot.get('prevDailyBar', {}) if isinstance(snapshot, dict) else {}
        research_item = research_map.get(symbol, {})
        position_item = position_map.get(symbol, {})

        current_price = safe_float(latest_trade.get('p'))
        if current_price is None:
            current_price = safe_float(daily_bar.get('c'))
        if current_price is None:
            current_price = safe_float(research_item.get('price'))
        if current_price is None:
            current_price = safe_float(position_item.get('current_price'))

        prior_close = safe_float(prev_daily_bar.get('c'))
        if prior_close is None:
            held_change_pct = safe_float(position_item.get('change_today_pct'))
            if held_change_pct not in (None, -100.0) and current_price is not None:
                prior_close = current_price / (1 + held_change_pct / 100)

        change_usd = None
        change_pct = None
        if current_price is not None and prior_close not in (None, 0):
            change_usd = current_price - prior_close
            change_pct = change_usd / prior_close * 100

        timestamp = (
            latest_trade.get('t')
            or latest_quote.get('t')
            or daily_bar.get('t')
            or prev_daily_bar.get('t')
        )
        if isinstance(timestamp, str):
            as_of_candidates.append(timestamp)

        position_qty = safe_float(position_item.get('qty'), 0.0)
        items.append({
            'symbol': symbol,
            'current_price': round(current_price, 4) if current_price is not None else None,
            'prior_close': round(prior_close, 4) if prior_close is not None else None,
            'change_usd': round(change_usd, 4) if change_usd is not None else None,
            'change_pct': round(change_pct, 4) if change_pct is not None else None,
            'return_20d_pct': return_20d_map.get(symbol),
            'in_position': symbol in position_map,
            'strategy_member': symbol in active_symbols,
            'position_qty': position_qty if position_qty is not None else 0.0,
        })

    return {
        'as_of': max(as_of_candidates) if as_of_candidates else datetime.now(ET).isoformat(),
        'source': source,
        'symbols': items,
    }


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


def build_operator(
    session: dict,
    market: dict,
    thesis_set: dict,
    pre_gate: dict,
    trade_plan: dict,
    gate_attr: dict,
    daily_eval: dict,
    checkpoint05: dict,
    mode_state: dict,
    mode_history: dict,
    approval_queue: dict,
    active_strategy: dict,
    strategy_bank: dict,
    positions: list[dict],
    promoted_manifests: list[dict],
    crypto_execution_plan: dict,
    crypto_execution_report: dict,
) -> dict:
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
        'strategy_bank': build_strategy_bank(active_strategy, strategy_bank, promoted_manifests),
        'crypto_signals': build_crypto_signals(
            positions,
            promoted_manifests,
            crypto_execution_plan,
            crypto_execution_report,
        ),
        'mode_history': mode_history,
        'incident_flags': daily_eval.get('incident_flags', []),
        'notes': daily_eval.get('notes', []),
    }


def main():
    session = load(REBUILD_LATEST / 'session_context.json')
    market = load(REBUILD_LATEST / 'market_snapshot.json')
    broker_snapshot = load(BROKER_SNAPSHOT_PATH)
    research_dataset = load(REBUILD_LATEST / 'research_dataset.json')
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
    promoted_manifests = load_promoted_manifests()
    crypto_execution_plan = load(CRYPTO_EXECUTION_PLAN_PATH)
    crypto_execution_report = load(CRYPTO_EXECUTION_REPORT_PATH)
    legacy_positions = load(WORKSPACE / 'state/positions_snapshot.json')
    legacy_kpis = load(WORKSPACE / 'state/pipeline_kpis_v1.json')
    policy = load(POLICY_PATH)
    source_context = build_source_context()
    as_of_date = session.get('trading_date') or datetime.now(ET).date().isoformat()

    positions = build_positions(market, legacy_positions, broker_snapshot)
    held_symbols = {item.get('symbol') for item in positions if item.get('symbol')}
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
        'strategy_universe': build_strategy_universe(market, active_strategy, positions, research_dataset),
        'watchlist': build_watchlist(pre_gate, trade_plan, thesis_set, held_symbols),
        'exit_candidates': [],
        'tunables': build_tunables(policy, session, mode_state),
        'options': None,
        'hedges': None,
        'bps': None,
        'operator': build_operator(
            session,
            market,
            thesis_set,
            pre_gate,
            trade_plan,
            gate_attr,
            daily_eval,
            checkpoint05,
            mode_state,
            mode_history,
            approval_queue,
            active_strategy,
            strategy_bank,
            positions,
            promoted_manifests,
            crypto_execution_plan,
            crypto_execution_report,
        ),
    }
    output['kpis']['positions_count'] = len(positions)
    validate_output_contract(output)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, indent=2, default=str), encoding='utf-8')
    print(f'Wrote operator-feed.json -> {OUTPUT}')


if __name__ == '__main__':
    main()
