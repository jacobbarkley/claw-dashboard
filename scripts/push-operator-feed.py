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
import time
from typing import Optional
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo


class AlpacaFetchError(RuntimeError):
    """Raised when an Alpaca API call fails after creds were present.

    Distinct from the legitimate no-creds / no-orders paths so that the
    main entrypoint can abort the push cleanly instead of silently
    committing a feed with an empty order blotter.
    """

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
ALPACA_STOCK_DATA_FEED = (os.environ.get('OPENCLAW_ALPACA_STOCK_DATA_FEED') or 'iex').strip() or None
ORDER_BLOTTER_RETENTION_DAYS = 60
ORDER_BLOTTER_MAX_ROWS = 60
ALPACA_FETCH_RETRY_DELAYS_SECONDS = (1.0, 2.0)
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


def build_freshness_marker(
    subsystem: str,
    *,
    status: str,
    source: str,
    attempts: int = 0,
    reason: Optional[str] = None,
    fallback_used: bool = False,
    stale_from: Optional[str] = None,
) -> dict:
    return {
        'subsystem': subsystem,
        'status': status,
        'source': source,
        'as_of': datetime.now(timezone.utc).isoformat(),
        'attempts': attempts,
        'fallback_used': fallback_used,
        'stale_from': stale_from,
        'reason': reason,
    }


def previous_feed_freshness(previous_feed: dict, subsystem: str) -> dict:
    operator = previous_feed.get('operator', {}) if isinstance(previous_feed, dict) else {}
    freshness = operator.get('freshness', {}) if isinstance(operator, dict) else {}
    marker = freshness.get(subsystem) if isinstance(freshness, dict) else None
    return marker if isinstance(marker, dict) else {}


def previous_feed_stale_from(previous_feed: dict, subsystem: str) -> Optional[str]:
    marker = previous_feed_freshness(previous_feed, subsystem)
    return str(marker.get('as_of') or marker.get('stale_from') or previous_feed.get('generated_at') or '') or None


def fetch_with_retry(
    subsystem: str,
    *,
    source: str,
    fetcher,
    previous_available: bool = False,
    stale_from: Optional[str] = None,
):
    attempts = 0
    last_error: Optional[str] = None
    total_attempts = len(ALPACA_FETCH_RETRY_DELAYS_SECONDS) + 1
    for attempt_index in range(total_attempts):
        attempts += 1
        try:
            return (
                fetcher(),
                build_freshness_marker(
                    subsystem,
                    status='fresh',
                    source=source,
                    attempts=attempts,
                ),
            )
        except AlpacaFetchError as exc:
            last_error = str(exc)
            if attempt_index < total_attempts - 1:
                time.sleep(ALPACA_FETCH_RETRY_DELAYS_SECONDS[attempt_index])

    status = 'stale' if previous_available else 'failed'
    return (
        None,
        build_freshness_marker(
            subsystem,
            status=status,
            source=source,
            attempts=attempts,
            reason=last_error,
            fallback_used=previous_available,
            stale_from=stale_from,
        ),
    )


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


def alpaca_stock_data_params(params: dict) -> dict:
    out = dict(params)
    if ALPACA_STOCK_DATA_FEED:
        out.setdefault('feed', ALPACA_STOCK_DATA_FEED)
    return out


def normalize_stock_snapshots(payload: dict, symbols: list[str]) -> dict[str, dict]:
    snapshots = payload.get('snapshots')
    if isinstance(snapshots, dict):
        return {
            str(symbol).strip().upper(): snapshot
            for symbol, snapshot in snapshots.items()
            if symbol and isinstance(snapshot, dict)
        }

    requested_symbols = {str(symbol).strip().upper() for symbol in symbols if str(symbol).strip()}
    direct_snapshots: dict[str, dict] = {}
    for symbol, snapshot in payload.items():
        normalized_symbol = str(symbol).strip().upper()
        if normalized_symbol in requested_symbols and isinstance(snapshot, dict):
            direct_snapshots[normalized_symbol] = snapshot
    if direct_snapshots:
        return direct_snapshots

    raise AlpacaFetchError('Alpaca /v2/stocks/snapshots payload missing snapshots map')


def fetch_stock_snapshots(symbols: list[str], creds: Optional[dict]) -> dict[str, dict]:
    if creds is None or not symbols:
        return {}
    payload = alpaca_data_request(
        creds,
        '/v2/stocks/snapshots',
        params=alpaca_stock_data_params({'symbols': ','.join(symbols)}),
    )
    if payload is None:
        raise AlpacaFetchError('Alpaca /v2/stocks/snapshots fetch failed')
    if not isinstance(payload, dict):
        raise AlpacaFetchError(f"Alpaca /v2/stocks/snapshots returned unexpected shape: {type(payload).__name__}")
    return normalize_stock_snapshots(payload, symbols)


def alpaca_trading_request(creds: dict, path: str, *, params: Optional[dict] = None):
    base_url = creds.get('ALPACA_BASE_URL') or 'https://paper-api.alpaca.markets'
    url = f'{base_url}{path}'
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


def fetch_recent_orders_map(creds: Optional[dict], *, after_days: int = ORDER_BLOTTER_RETENTION_DAYS) -> dict[str, dict]:
    if creds is None:
        return {}
    after = (datetime.now(timezone.utc) - timedelta(days=after_days)).isoformat().replace('+00:00', 'Z')
    payload = alpaca_trading_request(
        creds,
        '/v2/orders',
        params={
            'status': 'all',
            'limit': 500,
            'direction': 'desc',
            'nested': 'false',
            'after': after,
        },
    )
    # alpaca_trading_request returns None on URLError / HTTPError / timeout
    # / JSONDecodeError. An Alpaca outage here used to silently fall
    # through as `{}` and produce a feed with an empty order blotter,
    # which was indistinguishable from "genuinely zero orders" for the
    # dashboard. Raise instead so main() can abort the push and the next
    # cron run can try again. A valid empty list (e.g., a fresh paper
    # account with no orders) still returns `{}` without raising.
    if payload is None:
        raise AlpacaFetchError("Alpaca /v2/orders fetch failed; skipping this cron cycle")
    if not isinstance(payload, list):
        raise AlpacaFetchError(f"Alpaca /v2/orders returned unexpected shape: {type(payload).__name__}")
    return {
        str(item.get('id')): item
        for item in payload
        if isinstance(item, dict) and item.get('id')
    }


def fetch_stock_return_20d_map(symbols: list[str], creds: Optional[dict]) -> dict[str, float]:
    if creds is None or not symbols:
        return {}

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=45)
    payload = alpaca_data_request(
        creds,
        '/v2/stocks/bars',
        params=alpaca_stock_data_params({
            'symbols': ','.join(symbols),
            'timeframe': '1Day',
            'start': start.isoformat().replace('+00:00', 'Z'),
            'end': end.isoformat().replace('+00:00', 'Z'),
            'limit': 30,
            'adjustment': 'raw',
            'sort': 'asc',
        }),
    )
    if payload is None:
        raise AlpacaFetchError('Alpaca /v2/stocks/bars fetch failed')
    if not isinstance(payload, dict):
        raise AlpacaFetchError(f"Alpaca /v2/stocks/bars returned unexpected shape: {type(payload).__name__}")

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
    else:
        raise AlpacaFetchError('Alpaca /v2/stocks/bars payload missing bars data')

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
    # Pick the most recently generated crypto manifest as the active one.
    # Prior logic used `next()` on the sorted-ascending promoted list, which
    # meant the older manifest always won — stale on any new promotion.
    # Until Codex ships a formal `selected_crypto_manifest` signal on the
    # runtime (parallel to `strategy_bank.active_record_id` for stocks),
    # newest-wins is the right heuristic because only promoted manifests
    # reach the manifests/ directory.
    _crypto_candidates = [item for item in promoted_manifests if item.get('sleeve') == 'CRYPTO']
    crypto_manifest = max(
        _crypto_candidates,
        key=lambda m: str(m.get('generated_at') or ''),
        default=None,
    )
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
    universe_freshness = strategy_universe.get('freshness')
    if not isinstance(universe_freshness, dict):
        raise RuntimeError('operator feed contract violation: strategy_universe.freshness missing')
    for key in ('stock_snapshots', 'stock_return_20d'):
        if not isinstance(universe_freshness.get(key), dict):
            raise RuntimeError(f'operator feed contract violation: strategy_universe.freshness.{key} missing')

    for item in symbols:
        if not isinstance(item, dict):
            raise RuntimeError('operator feed contract violation: strategy_universe.symbols contains non-object entries')
        for key in ('return_20d_pct', 'strategy_member'):
            if key not in item:
                raise RuntimeError(f'operator feed contract violation: strategy_universe.symbols[].{key} missing')

    sleeve_equity_history = output.get('sleeve_equity_history')
    if not isinstance(sleeve_equity_history, dict):
        raise RuntimeError('operator feed contract violation: sleeve_equity_history missing')

    operator = output.get('operator', {})
    if not isinstance(operator, dict):
        raise RuntimeError('operator feed contract violation: operator missing')

    strategy_bank = operator.get('strategy_bank', {})
    if not isinstance(strategy_bank, dict) or 'promoted' not in strategy_bank or not isinstance(strategy_bank.get('promoted'), list):
        raise RuntimeError('operator feed contract violation: operator.strategy_bank.promoted missing')

    crypto_signals = operator.get('crypto_signals')
    if not isinstance(crypto_signals, dict):
        raise RuntimeError('operator feed contract violation: operator.crypto_signals missing')

    allocation_history = operator.get('allocation_history')
    if not isinstance(allocation_history, dict):
        raise RuntimeError('operator feed contract violation: operator.allocation_history missing')

    order_blotter = operator.get('order_blotter')
    if not isinstance(order_blotter, dict):
        raise RuntimeError('operator feed contract violation: operator.order_blotter missing')
    operator_freshness = operator.get('freshness')
    if not isinstance(operator_freshness, dict):
        raise RuntimeError('operator feed contract violation: operator.freshness missing')
    if not isinstance(operator_freshness.get('recent_orders'), dict):
        raise RuntimeError('operator feed contract violation: operator.freshness.recent_orders missing')

    for sleeve in ('stocks', 'options', 'crypto'):
        if sleeve not in sleeve_equity_history:
            raise RuntimeError(f'operator feed contract violation: sleeve_equity_history.{sleeve} missing')
        if sleeve not in allocation_history:
            raise RuntimeError(f'operator feed contract violation: operator.allocation_history.{sleeve} missing')
        if sleeve not in order_blotter:
            raise RuntimeError(f'operator feed contract violation: operator.order_blotter.{sleeve} missing')


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


def normalize_symbol(symbol: Optional[str]) -> str:
    return str(symbol or '').replace('/', '').upper()


def normalize_order_side(value: Optional[str]) -> str:
    token = str(value or '').strip().upper()
    if token in {'BUY', 'SELL'}:
        return token
    if token == 'SHORT':
        return 'SELL'
    return 'BUY'


def prettify_order_note(note: Optional[str]) -> Optional[str]:
    if not note:
        return None
    text = str(note).strip()
    if not text:
        return None
    replacements = {
        'cash_management_park_required': 'Cash management reserve park',
        'cash_management_unpark_required': 'Cash management reserve release',
        'first_crypto_probe': 'Manual BTC paper probe',
    }
    if text in replacements:
        return replacements[text]
    if '_' in text and text.lower() == text:
        return text.replace('_', ' ')
    return text


def build_crypto_blotter_note(report: dict) -> Optional[str]:
    state = title_case_token(report.get('active_regime_state'))
    target_notional = safe_float(report.get('target_notional_usd'))
    action = title_case_token(report.get('action'))
    if target_notional is not None and state != 'Unknown':
        return f'Managed exposure · {state} · ${target_notional:,.0f} target · {action.lower()}.'
    if state != 'Unknown':
        return f'Managed exposure · {state}.'
    return prettify_order_note(((report.get('order_intent') or {}).get('reason')))


def iter_rebuild_report_paths(filename: str, *, after_date: str) -> list[Path]:
    root = WORKSPACE / 'state/rebuild'
    paths: list[Path] = []
    for path in root.glob(f'*/*/{filename}'):
        try:
            trading_date = path.parts[-3]
        except IndexError:
            continue
        if trading_date >= after_date:
            paths.append(path)
    paths.sort()
    return paths


def load_equity_open_dates() -> dict[str, str]:
    position_book = load(REBUILD_LATEST / 'position_book.json')
    entries = position_book.get('entries', []) if isinstance(position_book, dict) else []
    out: dict[str, str] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if entry.get('status') != 'OPEN' or entry.get('asset_type') != 'EQUITY':
            continue
        symbol = normalize_symbol(entry.get('symbol'))
        opened_date = str(entry.get('opened_trading_date') or '')[:10]
        if symbol and opened_date:
            out[symbol] = opened_date
    return out


def iter_position_book_paths() -> list[Path]:
    root = WORKSPACE / 'state/rebuild'
    paths = list(root.glob('*/*/position_book.json'))
    latest_path = REBUILD_LATEST / 'position_book.json'
    if latest_path.exists():
        paths.append(latest_path)
    paths.sort()
    return paths


def collect_latest_position_book_snapshots() -> dict[str, dict]:
    latest_by_date: dict[str, tuple[float, dict]] = {}
    for path in iter_position_book_paths():
        payload = load(path)
        trading_date = str(payload.get('trading_date') or '')[:10]
        if not trading_date:
            continue
        try:
            stamp = path.stat().st_mtime
        except OSError:
            stamp = 0.0
        current = latest_by_date.get(trading_date)
        if current is None or stamp >= current[0]:
            latest_by_date[trading_date] = (stamp, payload)
    return {
        trading_date: payload
        for trading_date, (_, payload) in sorted(latest_by_date.items())
    }


def classify_sleeve_from_asset_type(asset_type: Optional[str]) -> Optional[str]:
    token = str(asset_type or '').upper()
    if token == 'EQUITY':
        return 'stocks'
    if token == 'CRYPTO':
        return 'crypto'
    if token in {'OPTION', 'OPTIONS'}:
        return 'options'
    return None


def build_sleeve_equity_history(
    positions: list[dict],
    as_of_date: str,
) -> dict[str, dict]:
    current_totals = {'stocks': 0.0, 'crypto': 0.0, 'options': 0.0}
    for item in positions:
        sleeve = classify_sleeve_from_asset_type(item.get('asset_type'))
        if sleeve is None:
            continue
        current_totals[sleeve] += max(safe_float(item.get('market_value'), 0.0) or 0.0, 0.0)

    snapshots = collect_latest_position_book_snapshots()
    raw_series: dict[str, list[dict]] = {'stocks': [], 'crypto': [], 'options': []}

    for trading_date, payload in snapshots.items():
        totals = {'stocks': 0.0, 'crypto': 0.0, 'options': 0.0}
        for entry in payload.get('entries', []):
            if not isinstance(entry, dict) or entry.get('status') != 'OPEN':
                continue
            sleeve = classify_sleeve_from_asset_type(entry.get('asset_type'))
            if sleeve is None:
                continue
            totals[sleeve] += max(safe_float(entry.get('market_value_usd'), 0.0) or 0.0, 0.0)
        for sleeve, total in totals.items():
            raw_series[sleeve].append({
                'date': trading_date,
                'market_value': round(total, 2),
            })

    def finalize_sleeve(
        *,
        sleeve: str,
        sleeve_label: str,
        benchmark_symbol: str,
        unavailable_reason: str,
    ) -> dict:
        series = raw_series[sleeve]
        has_history = bool(series)
        current_total = round(current_totals[sleeve], 2)

        if not has_history:
            return {
                'status': 'unavailable',
                'source': 'position_book_daily_latest',
                'sleeveLabel': sleeve_label,
                'benchmark_symbol': benchmark_symbol,
                'reason': (
                    unavailable_reason
                    if current_total <= 0
                    else 'Live sleeve value exists, but no daily ledger snapshot has been captured yet.'
                ),
                'series': [],
            }

        normalized = [dict(point) for point in series]
        if normalized and normalized[-1]['date'] == as_of_date:
            normalized[-1]['market_value'] = current_total
        elif normalized:
            normalized.append({
                'date': as_of_date,
                'market_value': current_total,
            })
        else:
            normalized = [{
                'date': as_of_date,
                'market_value': current_total,
            }]

        if len(normalized) == 1:
            normalized = [dict(normalized[0]), dict(normalized[0])]

        return {
            'status': 'available',
            'source': 'position_book_daily_latest',
            'sleeveLabel': sleeve_label,
            'benchmark_symbol': benchmark_symbol,
            'reason': None,
            'series': normalized,
        }

    return {
        'stocks': finalize_sleeve(
            sleeve='stocks',
            sleeve_label='Stocks sleeve',
            benchmark_symbol='SPY',
            unavailable_reason='No equity sleeve history has been captured yet.',
        ),
        'crypto': finalize_sleeve(
            sleeve='crypto',
            sleeve_label='Crypto sleeve',
            benchmark_symbol='BTC/USD',
            unavailable_reason='No crypto sleeve history has been captured yet.',
        ),
        'options': finalize_sleeve(
            sleeve='options',
            sleeve_label='Options sleeve',
            benchmark_symbol='SPY',
            unavailable_reason='No option sleeve history exists yet. This lights up after the first live options position.',
        ),
    }


def collect_order_blotter_events(
    positions: list[dict],
    crypto_execution_plan: dict,
    crypto_execution_report: dict,
) -> list[dict]:
    stock_symbols = {
        normalize_symbol(item.get('symbol'))
        for item in positions
        if item.get('asset_type') == 'EQUITY' and item.get('symbol')
    }
    stock_open_dates = load_equity_open_dates()
    crypto_symbols = {
        normalize_symbol(item.get('symbol'))
        for item in positions
        if item.get('asset_type') == 'CRYPTO' and item.get('symbol')
    }
    after_date = (datetime.now(ET).date() - timedelta(days=ORDER_BLOTTER_RETENTION_DAYS)).isoformat()
    events: list[dict] = []

    for path in iter_rebuild_report_paths('execution_report.json', after_date=after_date):
        report = load(path)
        if report.get('status') not in {'OK', 'PARTIAL', 'SUBMITTED'}:
            continue
        for item in report.get('items', []):
            symbol = normalize_symbol(item.get('symbol'))
            if symbol not in stock_symbols:
                continue
            if symbol in stock_open_dates and str(report.get('trading_date') or '')[:10] < stock_open_dates[symbol]:
                continue
            order_id = item.get('broker_order_id')
            if not order_id:
                continue
            events.append(
                {
                    'sleeve': 'stocks',
                    'symbol': symbol,
                    'order_id': str(order_id),
                    'fallback_qty': safe_float(item.get('quantity')),
                    'fallback_price': safe_float(item.get('avg_fill_price')),
                    'fallback_date': report.get('trading_date'),
                    'note': prettify_order_note(item.get('note')),
                    'kind': 'strategy',
                }
            )

    for path in iter_rebuild_report_paths('cash_management_execution_report.json', after_date=after_date):
        report = load(path)
        if report.get('status') not in {'OK', 'PARTIAL', 'SUBMITTED'}:
            continue
        for item in report.get('items', []):
            symbol = normalize_symbol(item.get('symbol'))
            if symbol not in stock_symbols:
                continue
            if symbol in stock_open_dates and str(report.get('trading_date') or '')[:10] < stock_open_dates[symbol]:
                continue
            order_id = item.get('broker_order_id')
            if not order_id:
                continue
            events.append(
                {
                    'sleeve': 'stocks',
                    'symbol': symbol,
                    'order_id': str(order_id),
                    'fallback_qty': safe_float(item.get('quantity')),
                    'fallback_price': safe_float(item.get('avg_fill_price')),
                    'fallback_date': report.get('trading_date'),
                    'note': prettify_order_note(item.get('note')),
                    'kind': 'cash_management',
                }
            )

    for path in iter_rebuild_report_paths('manual_trade_execution_report.json', after_date=after_date):
        report = load(path)
        if report.get('status') not in {'OK', 'PARTIAL', 'SUBMITTED'}:
            continue
        request = load(path.with_name('manual_trade_request.json'))
        request_items = request.get('items', []) if isinstance(request, dict) else []
        request_map = {
            (normalize_symbol(item.get('symbol')), str(item.get('action') or '').upper()): item
            for item in request_items
            if isinstance(item, dict)
        }
        for item in report.get('items', []):
            symbol = normalize_symbol(item.get('symbol'))
            action = normalize_order_side(item.get('action'))
            request_item = request_map.get((symbol, action)) or request_map.get((symbol, 'BUY')) or request_map.get((symbol, 'SELL')) or {}
            asset_type = str(request_item.get('asset_type') or '').upper()
            if (asset_type == 'CRYPTO' or symbol in crypto_symbols) and symbol in crypto_symbols:
                sleeve = 'crypto'
            elif (asset_type == 'EQUITY' or symbol in stock_symbols) and symbol in stock_symbols:
                sleeve = 'stocks'
            else:
                continue
            if sleeve == 'stocks' and symbol in stock_open_dates and str(report.get('trading_date') or '')[:10] < stock_open_dates[symbol]:
                continue
            order_id = item.get('broker_order_id')
            if not order_id:
                continue
            events.append(
                {
                    'sleeve': sleeve,
                    'symbol': symbol,
                    'order_id': str(order_id),
                    'fallback_qty': safe_float(item.get('quantity')),
                    'fallback_price': safe_float(item.get('avg_fill_price')),
                    'fallback_date': report.get('trading_date'),
                    'note': prettify_order_note(request_item.get('reason') or item.get('note')),
                    'kind': 'manual',
                }
            )

    # Crypto strategy fills — iterate historical crypto_execution_report.json
    # files the same way stocks iterate execution_report.json. Previously this
    # block only processed the single `crypto_execution_report` passed in at
    # call time, which meant yesterday's BTC buys fell off the blotter when
    # today's feed was generated. Dedup by broker_order_id is handled later
    # in build_order_blotter via seen_order_ids.
    historical_crypto_paths = iter_rebuild_report_paths('crypto_execution_report.json', after_date=after_date)
    # Include the passed-in report if it's not already covered by the glob
    # (e.g. the caller loaded it from outside the rebuild tree).
    singleton_crypto_report = crypto_execution_report if isinstance(crypto_execution_report, dict) else None
    crypto_reports: list[dict] = [load(path) for path in historical_crypto_paths]
    if singleton_crypto_report:
        crypto_reports.append(singleton_crypto_report)

    for crypto_report in crypto_reports:
        if not isinstance(crypto_report, dict):
            continue
        if crypto_report.get('status') not in {'OK', 'PARTIAL', 'SUBMITTED'}:
            continue
        crypto_symbol = normalize_symbol(
            crypto_report.get('symbol')
            or (crypto_execution_plan.get('symbol') if isinstance(crypto_execution_plan, dict) else None)
        )
        if crypto_symbol not in crypto_symbols:
            continue
        crypto_order_id = crypto_report.get('broker_order_id')
        if not crypto_order_id:
            continue
        events.append(
            {
                'sleeve': 'crypto',
                'symbol': crypto_symbol,
                'order_id': str(crypto_order_id),
                'fallback_qty': safe_float(((crypto_report.get('broker_response') or {}).get('filled_qty')))
                or safe_float(((crypto_report.get('order_intent') or {}).get('quantity')),
                ),
                'fallback_price': safe_float(((crypto_report.get('broker_response') or {}).get('filled_avg_price')))
                or safe_float(((crypto_report.get('order_intent') or {}).get('reference_price_usd')),
                ),
                'fallback_date': crypto_report.get('trading_date'),
                'note': build_crypto_blotter_note(crypto_report),
                'kind': 'crypto_strategy',
            }
        )

    return events


def build_order_blotter(
    positions: list[dict],
    crypto_execution_plan: dict,
    crypto_execution_report: dict,
) -> tuple[dict[str, list[dict]], dict]:
    creds = load_alpaca_creds()
    previous_feed = load(OUTPUT)
    previous_operator = previous_feed.get('operator', {}) if isinstance(previous_feed, dict) else {}
    previous_order_blotter = previous_operator.get('order_blotter', {}) if isinstance(previous_operator, dict) else {}
    previous_order_blotter_available = any(
        isinstance(rows, list) and len(rows) > 0
        for rows in (previous_order_blotter.values() if isinstance(previous_order_blotter, dict) else [])
    )
    if creds is None:
        recent_orders: dict[str, dict] = {}
        freshness = build_freshness_marker(
            'recent_orders',
            status='unavailable',
            source='alpaca_trading',
            reason='missing_credentials',
        )
    else:
        recent_orders_payload, freshness = fetch_with_retry(
            'recent_orders',
            source='alpaca_trading',
            fetcher=lambda: fetch_recent_orders_map(creds),
            previous_available=previous_order_blotter_available,
            stale_from=previous_feed_stale_from(previous_feed, 'recent_orders'),
        )
        recent_orders = recent_orders_payload if isinstance(recent_orders_payload, dict) else {}

    events = collect_order_blotter_events(positions, crypto_execution_plan, crypto_execution_report)
    blotter: dict[str, list[tuple[str, dict]]] = {'stocks': [], 'crypto': [], 'options': []}
    seen_order_ids: set[str] = set()
    seen_entry_signatures: set[str] = set()

    if freshness.get('status') == 'stale' and isinstance(previous_order_blotter, dict):
        for sleeve in ('stocks', 'crypto', 'options'):
            rows = previous_order_blotter.get(sleeve, [])
            if not isinstance(rows, list):
                continue
            for entry in rows:
                if not isinstance(entry, dict):
                    continue
                sort_key = str(entry.get('date') or '')
                blotter[sleeve].append((sort_key, entry))
                seen_entry_signatures.add(order_blotter_entry_signature(entry))

    for event in events:
        order_id = event.get('order_id')
        if not order_id or order_id in seen_order_ids:
            continue
        seen_order_ids.add(order_id)

        order = recent_orders.get(order_id, {})
        filled_at = order.get('filled_at') or order.get('submitted_at') or order.get('created_at')
        sort_key = str(filled_at or event.get('fallback_date') or '')
        qty = (
            safe_float(order.get('filled_qty'))
            or safe_float(order.get('qty'))
            or event.get('fallback_qty')
        )
        price = safe_float(order.get('filled_avg_price')) or event.get('fallback_price')
        if qty in (None, 0) or price in (None, 0):
            continue

        side = normalize_order_side(order.get('side'))
        symbol = normalize_symbol(order.get('symbol') or event.get('symbol'))
        if not symbol:
            continue

        usd = safe_float(order.get('notional'))
        if symbol == 'BTCUSD' and usd is None and qty is not None and price is not None:
            usd = round(qty * price, 2)

        entry = {
            'date': str(filled_at or event.get('fallback_date') or datetime.now(ET).date().isoformat())[:10],
            'side': side,
            'sym': symbol,
            'qty': round(float(qty), 8) if symbol == 'BTCUSD' else round(float(qty), 4),
            'price': round(float(price), 4),
            'usd': round(float(usd), 2) if usd is not None else None,
            'note': event.get('note'),
        }
        signature = order_blotter_entry_signature(entry)
        if signature in seen_entry_signatures:
            continue
        seen_entry_signatures.add(signature)
        blotter[event['sleeve']].append((sort_key, entry))

    return ({
        sleeve: [item for _, item in sorted(rows, key=lambda row: row[0])][-ORDER_BLOTTER_MAX_ROWS:]
        for sleeve, rows in blotter.items()
    }, freshness)


def order_blotter_entry_signature(entry: dict) -> str:
    return '|'.join(
        str(entry.get(key) if entry.get(key) is not None else '')
        for key in ('date', 'side', 'sym', 'qty', 'price', 'usd', 'note')
    )


def build_allocation_history(
    positions: list[dict],
    promoted_manifests: list[dict],
    crypto_execution_plan: dict,
    as_of_date: str,
) -> dict[str, dict]:
    def build_snapshot(
        *,
        sleeve_label: str,
        source: str,
        sleeve_positions: list[dict],
        active: bool,
        reason: str,
        regimes: Optional[list[dict]] = None,
        regime_tones: Optional[dict] = None,
    ) -> dict:
        if not active:
            return {
                'status': 'unavailable',
                'source': source,
                'sleeveLabel': sleeve_label,
                'reason': reason,
            }

        total = sum(max(safe_float(item.get('market_value'), 0.0), 0.0) for item in sleeve_positions)
        ordered_positions = sorted(
            [item for item in sleeve_positions if item.get('symbol')],
            key=lambda item: safe_float(item.get('market_value'), 0.0),
            reverse=True,
        )
        symbols = [
            {
                'sym': normalize_symbol(item.get('symbol')),
                'label': 'BTC' if normalize_symbol(item.get('symbol')) == 'BTCUSD' else normalize_symbol(item.get('symbol')),
                'color': None,
            }
            for item in ordered_positions
        ]
        weights = {}
        if total > 0:
            for item in ordered_positions:
                symbol = normalize_symbol(item.get('symbol'))
                market_value = max(safe_float(item.get('market_value'), 0.0), 0.0)
                if symbol:
                    weights[symbol] = round((market_value / total) * 100, 2)

        series = [
            {
                'date': as_of_date,
                'weights': weights,
                'cash': round(max(0.0, 100.0 - sum(weights.values())), 2),
                'total': round(total, 2),
            }
        ]
        return {
            'status': 'available',
            'source': source,
            'sleeveLabel': sleeve_label,
            'reason': None,
            'symbols': symbols,
            'regimes': regimes or [],
            'regimeTones': regime_tones or {},
            'series': series,
        }

    stock_positions = [item for item in positions if item.get('asset_type') == 'EQUITY']
    crypto_positions = [item for item in positions if item.get('asset_type') == 'CRYPTO']
    # Pick the most recently generated crypto manifest as the active one.
    # Prior logic used `next()` on the sorted-ascending promoted list, which
    # meant the older manifest always won — stale on any new promotion.
    # Until Codex ships a formal `selected_crypto_manifest` signal on the
    # runtime (parallel to `strategy_bank.active_record_id` for stocks),
    # newest-wins is the right heuristic because only promoted manifests
    # reach the manifests/ directory.
    _crypto_candidates = [item for item in promoted_manifests if item.get('sleeve') == 'CRYPTO']
    crypto_manifest = max(
        _crypto_candidates,
        key=lambda m: str(m.get('generated_at') or ''),
        default=None,
    )
    crypto_state = str(crypto_execution_plan.get('active_regime_state') or '').upper()
    effective_date = str(
        crypto_execution_plan.get('effective_timestamp')
        or crypto_execution_plan.get('signal_timestamp')
        or as_of_date
    )[:10]
    crypto_regimes = (
        [{'from': effective_date, 'to': as_of_date, 'label': crypto_state}] if crypto_state else []
    )
    crypto_regime_tones = {
        'RISK_ON': {'label': 'Tier 1 · Risk on', 'tone': 'pos'},
        'ACCUMULATE': {'label': 'Tier 2 · Accumulate', 'tone': 'neutral'},
        'RISK_OFF': {'label': 'Tier 3 · Risk off', 'tone': 'warn'},
    }

    return {
        'stocks': build_snapshot(
            sleeve_label='Stocks sleeve',
            source='trade_log',
            sleeve_positions=stock_positions,
            active=True,
            reason='Allocation history begins when the stock sleeve records daily snapshots.',
        ),
        'crypto': build_snapshot(
            sleeve_label='Crypto sleeve',
            source='ladder_log',
            sleeve_positions=crypto_positions,
            active=bool(crypto_manifest or crypto_positions),
            reason='No promoted crypto sleeve is active yet.',
            regimes=crypto_regimes,
            regime_tones=crypto_regime_tones,
        ),
        'options': build_snapshot(
            sleeve_label='Options sleeve',
            source='feed',
            sleeve_positions=[],
            active=False,
            reason='No strategies deployed yet. Allocation history begins when the first variant is promoted from the Bench.',
        ),
    }


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
    previous_feed = load(OUTPUT)
    previous_universe = previous_feed.get('strategy_universe', {}) if isinstance(previous_feed, dict) else {}
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
            'freshness': {
                'stock_snapshots': build_freshness_marker(
                    'stock_snapshots',
                    status='unavailable',
                    source='alpaca_market_data',
                    reason='no_symbols',
                ),
                'stock_return_20d': build_freshness_marker(
                    'stock_return_20d',
                    status='unavailable',
                    source='alpaca_market_data',
                    reason='no_symbols',
                ),
            },
        }

    research_items = research_dataset.get('items', []) if isinstance(research_dataset, dict) else []
    research_map = {
        str(item.get('symbol')).strip().upper(): item
        for item in research_items
        if item.get('symbol')
    }
    previous_items = previous_universe.get('symbols', []) if isinstance(previous_universe, dict) else []
    previous_symbol_map = {
        str(item.get('symbol')).strip().upper(): item
        for item in previous_items
        if isinstance(item, dict) and item.get('symbol')
    }
    previous_snapshot_available = any(
        isinstance(item, dict) and any(item.get(key) is not None for key in ('current_price', 'prior_close', 'change_usd', 'change_pct'))
        for item in previous_items
    )
    previous_return_available = any(
        isinstance(item, dict) and safe_float(item.get('return_20d_pct')) is not None
        for item in previous_items
    )
    position_map = {
        str(item.get('symbol')).strip().upper(): item
        for item in positions
        if item.get('symbol')
    }

    creds = load_alpaca_creds()
    if creds is None:
        snapshots: dict[str, dict] = {}
        return_20d_map: dict[str, float] = {}
        snapshot_freshness = build_freshness_marker(
            'stock_snapshots',
            status='unavailable',
            source='alpaca_market_data',
            reason='missing_credentials',
        )
        return_20d_freshness = build_freshness_marker(
            'stock_return_20d',
            status='unavailable',
            source='alpaca_market_data',
            reason='missing_credentials',
        )
    else:
        snapshots_payload, snapshot_freshness = fetch_with_retry(
            'stock_snapshots',
            source='alpaca_market_data',
            fetcher=lambda: fetch_stock_snapshots(ordered_symbols, creds),
            previous_available=previous_snapshot_available,
            stale_from=previous_feed_stale_from(previous_feed, 'stock_snapshots'),
        )
        return_payload, return_20d_freshness = fetch_with_retry(
            'stock_return_20d',
            source='alpaca_market_data',
            fetcher=lambda: fetch_stock_return_20d_map(ordered_symbols, creds),
            previous_available=previous_return_available,
            stale_from=previous_feed_stale_from(previous_feed, 'stock_return_20d'),
        )
        snapshots = snapshots_payload if isinstance(snapshots_payload, dict) else {}
        return_20d_map = return_payload if isinstance(return_payload, dict) else {}

    if snapshot_freshness.get('status') == 'fresh':
        source = 'alpaca_market_data_snapshots'
    elif snapshot_freshness.get('status') == 'stale':
        source = 'alpaca_market_data_snapshots_stale_fallback'
    else:
        source = 'rebuild_research_dataset_fallback'
    allow_snapshot_stale_fallback = snapshot_freshness.get('status') == 'stale'
    allow_return_stale_fallback = return_20d_freshness.get('status') == 'stale'
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
        previous_item = previous_symbol_map.get(symbol, {})

        current_price = safe_float(latest_trade.get('p'))
        if current_price is None:
            current_price = safe_float(daily_bar.get('c'))
        if current_price is None:
            current_price = safe_float(research_item.get('price'))
        if current_price is None:
            current_price = safe_float(position_item.get('current_price'))
        if current_price is None and allow_snapshot_stale_fallback:
            current_price = safe_float(previous_item.get('current_price'))

        prior_close = safe_float(prev_daily_bar.get('c'))
        if prior_close is None:
            held_change_pct = safe_float(position_item.get('change_today_pct'))
            if held_change_pct not in (None, -100.0) and current_price is not None:
                prior_close = current_price / (1 + held_change_pct / 100)
        if prior_close is None and allow_snapshot_stale_fallback:
            prior_close = safe_float(previous_item.get('prior_close'))

        change_usd = None
        change_pct = None
        if current_price is not None and prior_close not in (None, 0):
            change_usd = current_price - prior_close
            change_pct = change_usd / prior_close * 100
        if change_usd is None and allow_snapshot_stale_fallback:
            change_usd = safe_float(previous_item.get('change_usd'))
        if change_pct is None and allow_snapshot_stale_fallback:
            change_pct = safe_float(previous_item.get('change_pct'))

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
            'return_20d_pct': return_20d_map.get(symbol)
            if symbol in return_20d_map
            else (safe_float(previous_item.get('return_20d_pct')) if allow_return_stale_fallback else None),
            'in_position': symbol in position_map,
            'strategy_member': symbol in active_symbols,
            'position_qty': position_qty if position_qty is not None else 0.0,
        })

    return {
        'as_of': max(as_of_candidates) if as_of_candidates else (
            previous_universe.get('as_of') if isinstance(previous_universe, dict) and previous_universe.get('as_of') else datetime.now(ET).isoformat()
        ),
        'source': source,
        'symbols': items,
        'freshness': {
            'stock_snapshots': snapshot_freshness,
            'stock_return_20d': return_20d_freshness,
        },
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
    allocation_history: dict[str, dict],
    order_blotter: dict[str, list[dict]],
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
        'allocation_history': allocation_history,
        'order_blotter': order_blotter,
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
    allocation_history = build_allocation_history(positions, promoted_manifests, crypto_execution_plan, as_of_date)
    order_blotter, order_blotter_freshness = build_order_blotter(positions, crypto_execution_plan, crypto_execution_report)
    sleeve_equity_history = build_sleeve_equity_history(positions, as_of_date)
    held_symbols = {item.get('symbol') for item in positions if item.get('symbol')}
    strategy_universe = build_strategy_universe(market, active_strategy, positions, research_dataset)
    operator_freshness = {
        'recent_orders': order_blotter_freshness,
        'stock_snapshots': (strategy_universe.get('freshness', {}) if isinstance(strategy_universe, dict) else {}).get('stock_snapshots', {}),
        'stock_return_20d': (strategy_universe.get('freshness', {}) if isinstance(strategy_universe, dict) else {}).get('stock_return_20d', {}),
    }
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
        'sleeve_equity_history': sleeve_equity_history,
        'strategy_universe': strategy_universe,
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
            allocation_history,
            order_blotter,
        ),
    }
    output['operator']['freshness'] = operator_freshness
    output['kpis']['positions_count'] = len(positions)
    validate_output_contract(output)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, indent=2, default=str), encoding='utf-8')
    print(f'Wrote operator-feed.json -> {OUTPUT}')


if __name__ == '__main__':
    main()
