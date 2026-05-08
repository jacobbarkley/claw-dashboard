#!/usr/bin/env python3
"""Mirror public/static Guided artifacts into the dashboard data tree.

Writes:
- data/guided/strategy_library.json
- data/guided/questionnaire.json
- data/guided/disclosures/*.json

This script intentionally does not mirror proposals, enrollments, or views.
Those artifacts carry user state and must not be committed to git-backed
dashboard data.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import os
from pathlib import Path
import sys
import tempfile


DASHBOARD_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKSPACE = Path.home() / ".openclaw/workspace/trading-bot"
PUBLIC_GUIDED_FILES = (
    "strategy_library.json",
    "questionnaire.json",
)
BLOCKED_USER_STATE_DIRS = {"proposals", "enrollments", "views"}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Mirror public/static Guided data into claw-dashboard/data/guided")
    parser.add_argument(
        "--source",
        choices=["auto", "bootstrap", "rebuild"],
        default=os.environ.get("GUIDED_DATA_SOURCE", "auto"),
        help="Use bootstrap output, existing rebuild state, or auto-detect rebuild state first.",
    )
    parser.add_argument(
        "--workspace",
        type=Path,
        default=Path(os.environ.get("OPENCLAW_WORKSPACE", DEFAULT_WORKSPACE)),
        help="Path to the trading-bot workspace.",
    )
    parser.add_argument(
        "--rebuild-guided-root",
        type=Path,
        default=None,
        help="Path to state/rebuild_latest/guided; defaults under --workspace.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(os.environ.get("GUIDED_DATA_DIR", "data/guided")),
        help="Dashboard output directory. Relative paths resolve from the dashboard repo root.",
    )
    parser.add_argument(
        "--generated-at",
        default=os.environ.get("GUIDED_BOOTSTRAP_AT"),
        help="Optional ISO timestamp used for deterministic bootstrap snapshots.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    workspace = args.workspace.expanduser().resolve()
    rebuild_guided_root = (
        args.rebuild_guided_root.expanduser().resolve()
        if args.rebuild_guided_root is not None
        else workspace / "state/rebuild_latest/guided"
    )
    output_dir = _resolve_output_dir(args.output_dir)
    generated_at = _parse_datetime(args.generated_at)

    _install_backend_import_path(workspace)
    artifacts = _load_public_artifacts(
        source=args.source,
        rebuild_guided_root=rebuild_guided_root,
        generated_at=generated_at,
    )
    written = _write_public_artifacts(output_dir, artifacts)
    for path in written:
        print(f"Wrote {_display_path(path)}")
    return 0


def _install_backend_import_path(workspace: Path) -> None:
    src_path = workspace / "src"
    if not src_path.exists():
        raise SystemExit(f"trading-bot src path not found: {src_path}")
    sys.path.insert(0, str(src_path))


def _load_public_artifacts(
    *,
    source: str,
    rebuild_guided_root: Path,
    generated_at: datetime | None,
) -> dict[str, object]:
    if source in {"auto", "rebuild"} and _has_rebuild_public_artifacts(rebuild_guided_root):
        return _read_rebuild_public_artifacts(rebuild_guided_root)
    if source == "rebuild":
        raise SystemExit(f"Guided rebuild public artifacts not found under {rebuild_guided_root}")
    return _build_bootstrap_public_artifacts(generated_at=generated_at)


def _has_rebuild_public_artifacts(root: Path) -> bool:
    return all((root / filename).exists() for filename in PUBLIC_GUIDED_FILES) and (root / "disclosures").is_dir()


def _read_rebuild_public_artifacts(root: Path) -> dict[str, object]:
    from openclaw_core.models.guided import DisclosureVersion, Questionnaire, StrategyLibrary

    strategy_library = StrategyLibrary.model_validate_json((root / "strategy_library.json").read_text())
    questionnaire = Questionnaire.model_validate_json((root / "questionnaire.json").read_text())
    disclosures = [
        DisclosureVersion.model_validate_json(path.read_text())
        for path in sorted((root / "disclosures").glob("*.json"))
    ]
    return _validated_public_artifacts(
        strategy_library=strategy_library,
        questionnaire=questionnaire,
        disclosures=disclosures,
    )


def _build_bootstrap_public_artifacts(*, generated_at: datetime | None) -> dict[str, object]:
    from openclaw_core.services.guided import GuidedRuntime, GuidedStore

    with tempfile.TemporaryDirectory(prefix="guided-bootstrap-") as tmp:
        runtime = GuidedRuntime(store=GuidedStore(Path(tmp) / "guided"))
        bootstrap = runtime.bootstrap_entry_zero(now=generated_at)
        return _validated_public_artifacts(
            strategy_library=bootstrap.library,
            questionnaire=bootstrap.questionnaire,
            disclosures=[bootstrap.disclosure],
        )


def _validated_public_artifacts(
    *,
    strategy_library: object,
    questionnaire: object,
    disclosures: list[object],
) -> dict[str, object]:
    _assert_public_static("strategy_library", strategy_library)
    for index, entry in enumerate(getattr(strategy_library, "entries", []), start=1):
        _assert_public_static(f"strategy_library.entries[{index}]", entry)
    _assert_public_static("questionnaire", questionnaire)
    for disclosure in disclosures:
        _assert_public_static(f"disclosure:{getattr(disclosure, 'disclosure_version_id', 'unknown')}", disclosure)
    return {
        "strategy_library": strategy_library,
        "questionnaire": questionnaire,
        "disclosures": disclosures,
    }


def _assert_public_static(label: str, artifact: object) -> None:
    retention = getattr(artifact, "retention", None)
    if retention is None:
        raise SystemExit(f"{label} is missing retention metadata.")
    if retention.retention_class != "PUBLIC_STATIC":
        raise SystemExit(f"{label} is not PUBLIC_STATIC; refusing to mirror.")
    if retention.contains_user_data or retention.contains_broker_data or retention.contains_regulated_data:
        raise SystemExit(f"{label} carries private or regulated state; refusing to mirror.")


def _write_public_artifacts(output_dir: Path, artifacts: dict[str, object]) -> list[Path]:
    for blocked in BLOCKED_USER_STATE_DIRS:
        blocked_path = output_dir / blocked
        if blocked_path.exists():
            raise SystemExit(f"Refusing to write while user-state path exists in dashboard data: {blocked_path}")

    written = [
        _atomic_write_json(output_dir / "strategy_library.json", artifacts["strategy_library"]),
        _atomic_write_json(output_dir / "questionnaire.json", artifacts["questionnaire"]),
    ]
    disclosure_dir = output_dir / "disclosures"
    for disclosure in artifacts["disclosures"]:
        disclosure_id = getattr(disclosure, "disclosure_version_id")
        written.append(_atomic_write_json(disclosure_dir / f"{disclosure_id}.json", disclosure))
    return written


def _atomic_write_json(path: Path, artifact: object) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(artifact.model_dump_json(indent=2) + "\n", encoding="utf-8")  # type: ignore[attr-defined]
    tmp.replace(path)
    return path


def _resolve_output_dir(path: Path) -> Path:
    expanded = path.expanduser()
    if expanded.is_absolute():
        return expanded
    return DASHBOARD_ROOT / expanded


def _display_path(path: Path) -> str:
    try:
        return str(path.relative_to(DASHBOARD_ROOT))
    except ValueError:
        return str(path)


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"
    return datetime.fromisoformat(normalized)


if __name__ == "__main__":
    raise SystemExit(main())
