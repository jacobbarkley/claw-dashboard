#!/usr/bin/env python3
"""
Local dev pull adapter for bench artifacts.

Walks trading-bot's bench results directory and copies the working set
of artifacts into claw-dashboard/data/bench/ so the Next app can read them
at request time. Produces:

  data/bench/runs/<bench_id>/<run_id>/bench_spec.snapshot.json
  data/bench/runs/<bench_id>/<run_id>/bench_run_bundle.json
  data/bench/runs/<bench_id>/<run_id>/crypto_bench_leaderboard.json
  data/bench/latest_by_bench/<bench_id>.json   (pointer to newest run by generated_at)
  data/bench/index.json                         (flat list of all benches with summary)

NOTE: crypto_bench_report.json is INTENTIONALLY skipped — that file embeds the
full leaderboard + era_results (170MB+ in real runs) and is too big for git/Vercel.
The headline data we need for index + leaderboard views lives in the other three.
When the candidate detail drawer wants era_results, we'll add a separate path.

This is a LOCAL DEV ADAPTER. Production should use Codex's push-based publication
from trading-bot per the bench-ui-primer-2026-04-16.md memory doc.
"""

from __future__ import annotations
import json
import os
import shutil
from datetime import datetime
from pathlib import Path


def _path_from_env(env_name: str, default: Path) -> Path:
    """Allow local/dev callers to override source roots without editing the script."""

    override = os.environ.get(env_name)
    return Path(override).expanduser() if override else default


TRADING_BOT_BENCH_RESULTS = _path_from_env(
    "TRADING_BOT_BENCH_RESULTS",
    Path.home() / ".openclaw/workspace/trading-bot/backtest/bench/results",
)
TRADING_BOT_BENCH_SPECS = _path_from_env(
    "TRADING_BOT_BENCH_SPECS",
    Path.home() / ".openclaw/workspace/trading-bot/backtest/bench/specs",
)
TRADING_BOT_BENCH_MANIFESTS = _path_from_env(
    "TRADING_BOT_BENCH_MANIFESTS",
    Path.home() / ".openclaw/workspace/trading-bot/backtest/bench/manifests",
)
TRADING_BOT_REBUILD_LATEST = _path_from_env(
    "TRADING_BOT_REBUILD_LATEST",
    Path.home() / ".openclaw/workspace/trading-bot/state/rebuild_latest",
)
DASHBOARD_BENCH_DATA = _path_from_env(
    "DASHBOARD_BENCH_DATA",
    Path.home() / "claude/claw-dashboard/data/bench",
)

# Runtime artifacts copied verbatim — used to render promotion provenance and
# tie an executed strategy back to its checked-in manifest. Optional: any file
# that is missing on this revision of the rebuild is silently skipped.
RUNTIME_ARTIFACT_FILES = (
    "active_strategy.json",
    "execution_manifest.json",
    "session_context.json",
)

# Required files per run — at minimum we need the spec snapshot + bundle.
# The leaderboard/report names vary by sleeve (crypto_bench_*, stock_bench_*).
REQUIRED_FILES = (
    "bench_spec.snapshot.json",
    "bench_run_bundle.json",
)

# Additional files to copy if present (any *_leaderboard.json or *_report.json)
OPTIONAL_PATTERNS = ("*_leaderboard.json", "*_report.json", "*_comparison_report.json")


def parse_iso(ts: str | None) -> datetime:
    if not ts:
        return datetime.min
    try:
        return datetime.fromisoformat(ts)
    except ValueError:
        return datetime.min


def pull() -> None:
    if not TRADING_BOT_BENCH_RESULTS.exists():
        raise SystemExit(f"Bench results dir not found: {TRADING_BOT_BENCH_RESULTS}")

    runs_dir = DASHBOARD_BENCH_DATA / "runs"
    latest_dir = DASHBOARD_BENCH_DATA / "latest_by_bench"
    runs_dir.mkdir(parents=True, exist_ok=True)
    latest_dir.mkdir(parents=True, exist_ok=True)

    index_entries: list[dict] = []
    latest_by_bench: dict[str, dict] = {}

    for bench_dir in sorted(TRADING_BOT_BENCH_RESULTS.iterdir()):
        if not bench_dir.is_dir():
            continue
        bench_id = bench_dir.name
        for run_dir in sorted(bench_dir.iterdir()):
            if not run_dir.is_dir():
                continue
            run_id = run_dir.name

            # Verify required files are present — skip incomplete runs
            missing = [f for f in REQUIRED_FILES if not (run_dir / f).exists()]
            if missing:
                print(f"  skip {bench_id}/{run_id} (missing: {missing})")
                continue

            dest = runs_dir / bench_id / run_id
            dest.mkdir(parents=True, exist_ok=True)

            # Copy required files
            for fname in REQUIRED_FILES:
                shutil.copy2(run_dir / fname, dest / fname)

            # Copy optional files (leaderboards, reports — names vary by sleeve)
            import glob as _glob
            for pattern in OPTIONAL_PATTERNS:
                for match in run_dir.glob(pattern):
                    if match.stat().st_size < 50_000_000:  # skip >50MB files
                        shutil.copy2(match, dest / match.name)

            # Pull headline fields for the index
            with (run_dir / "bench_run_bundle.json").open() as fh:
                bundle = json.load(fh)
            with (run_dir / "bench_spec.snapshot.json").open() as fh:
                spec = json.load(fh)

            entry = {
                "bench_id": bench_id,
                "run_id": run_id,
                "title": spec.get("title", bench_id),
                "sleeve": spec.get("sleeve"),
                "engine": spec.get("engine"),
                "promotion_target": spec.get("promotion_target"),
                "status": bundle.get("status"),
                "selected_config_id": bundle.get("selected_config_id"),
                "evaluated_candidate_count": bundle.get("evaluated_candidate_count"),
                "search_space_size": bundle.get("search_space_size"),
                "candidate_cap": bundle.get("candidate_cap"),
                "sweep_truncated": bundle.get("sweep_truncated"),
                "primary_metric": bundle.get("primary_metric"),
                "primary_metric_value": bundle.get("primary_metric_value"),
                "generated_at": bundle.get("generated_at"),
            }
            index_entries.append(entry)

            # Track the newest run per bench by generated_at
            current = latest_by_bench.get(bench_id)
            if current is None or parse_iso(entry["generated_at"]) > parse_iso(current["generated_at"]):
                latest_by_bench[bench_id] = entry

            print(f"  pull {bench_id}/{run_id}  status={entry['status']:8s}  evaluated={entry['evaluated_candidate_count']}/{entry['search_space_size']}")

    # Copy checked-in bench specs (not results — the spec definitions)
    specs_dest = DASHBOARD_BENCH_DATA / "specs"
    specs_dest.mkdir(parents=True, exist_ok=True)
    spec_entries: list[dict] = []
    if TRADING_BOT_BENCH_SPECS.exists():
        for spec_file in sorted(TRADING_BOT_BENCH_SPECS.glob("*.bench_spec.json")):
            shutil.copy2(spec_file, specs_dest / spec_file.name)
            with spec_file.open() as fh:
                spec = json.load(fh)
            bench_id = spec.get("bench_id", spec_file.stem)
            has_runs = bench_id in {e["bench_id"] for e in index_entries}
            spec_entries.append({
                "bench_id": bench_id,
                "title": spec.get("title", bench_id),
                "sleeve": spec.get("sleeve"),
                "engine": spec.get("engine"),
                "hypothesis": spec.get("hypothesis"),
                "has_runs": has_runs,
            })
            print(f"  spec {spec_file.name}  sleeve={spec.get('sleeve'):8s}  has_runs={has_runs}")

    # Copy checked-in execution manifests (the promotion bridge)
    manifests_dest = DASHBOARD_BENCH_DATA / "manifests"
    manifests_dest.mkdir(parents=True, exist_ok=True)
    manifest_entries: list[dict] = []
    if TRADING_BOT_BENCH_MANIFESTS.exists():
        for manifest_file in sorted(TRADING_BOT_BENCH_MANIFESTS.glob("*.execution_manifest.json")):
            shutil.copy2(manifest_file, manifests_dest / manifest_file.name)
            with manifest_file.open() as fh:
                manifest = json.load(fh)
            manifest_entries.append({
                "manifest_id": manifest.get("manifest_id"),
                "title": manifest.get("title"),
                "sleeve": manifest.get("sleeve"),
                "sleeve_id": manifest.get("sleeve_id"),
                "strategy_id": manifest.get("strategy_id"),
                "strategy_family": manifest.get("strategy_family"),
                "deployment_config_id": manifest.get("deployment_config_id"),
                "runtime_contract": manifest.get("runtime_contract"),
                "cadence": manifest.get("cadence"),
                "asset_type": manifest.get("asset_type"),
                "broker_adapter": (manifest.get("broker") or {}).get("broker_adapter"),
                "broker_environment": (manifest.get("broker") or {}).get("broker_environment"),
                # source_kind is what dashboards must render distinctly
                "source_kind": "CHECKED_IN",
                "bench_id": (manifest.get("source") or {}).get("bench_id"),
                "filename": manifest_file.name,
            })
            print(f"  manifest {manifest_file.name}  sleeve={manifest.get('sleeve'):8s}  source=CHECKED_IN")

    # Copy runtime artifacts that anchor manifest provenance to the live runtime
    runtime_dest = DASHBOARD_BENCH_DATA / "runtime"
    runtime_dest.mkdir(parents=True, exist_ok=True)
    runtime_present: list[str] = []
    for fname in RUNTIME_ARTIFACT_FILES:
        src = TRADING_BOT_REBUILD_LATEST / fname
        if src.exists():
            shutil.copy2(src, runtime_dest / fname)
            runtime_present.append(fname)
            print(f"  runtime {fname}")

    # Write convenience manifests
    index_path = DASHBOARD_BENCH_DATA / "index.json"
    with index_path.open("w") as fh:
        json.dump({
            "generated_at": datetime.now().astimezone().isoformat(),
            "source": "local_dev_pull",
            "runs": index_entries,
            "specs": spec_entries,
            "manifests": manifest_entries,
            "runtime_artifacts": runtime_present,
        }, fh, indent=2)

    for bench_id, entry in latest_by_bench.items():
        with (latest_dir / f"{bench_id}.json").open("w") as fh:
            json.dump(entry, fh, indent=2)

    print(f"\nIndex: {index_path}  ({len(index_entries)} runs across {len(latest_by_bench)} benches)")
    print(f"Latest pointers: {len(latest_by_bench)} files in {latest_dir}")


if __name__ == "__main__":
    pull()
