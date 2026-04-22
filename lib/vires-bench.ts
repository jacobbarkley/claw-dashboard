import { promises as fs } from "fs"
import path from "path"

type JsonObject = Record<string, any>

const BENCH_DIR = path.join(process.cwd(), "data", "bench")
const RUNS_DIR = path.join(BENCH_DIR, "runs")

const COMPARISON_REPORT_KEYS = [
  "benchmark",
  "benchmark_baseline",
  "core_regime",
  "graduated_core",
  "tactical",
  "core_gated_tactical",
  "graduated_core_tactical_overlay",
] as const

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function arr<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function parseDate(value: unknown): number {
  if (typeof value !== "string") return 0
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

function titleCaseToken(value: string | null | undefined): string {
  if (!value) return "Unknown"
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

function humanizeRole(run: JsonObject): string {
  const engine = str(run.engine)?.toUpperCase()
  const benchId = str(run.bench_id)?.toLowerCase() ?? ""
  const promotionTarget = str(run.promotion_target)?.toUpperCase()

  if (benchId.includes("neighborhood_probe")) return "PROBE"
  if (benchId.includes("sweep")) return "SWEEP"
  if (engine === "VALIDATION_CAMPAIGN" || promotionTarget === "FROZEN_CONFIRMATION") return "VALIDATION"
  if (engine === "CUSTOM") return "CUSTOM"
  if (promotionTarget) return titleCaseToken(promotionTarget).toUpperCase()
  if (engine) return titleCaseToken(engine).toUpperCase()
  return "RUN"
}

async function readJson<T = any>(filename: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), filename), "utf-8")
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function readFirstJson<T = any>(...filenames: string[]): Promise<T | null> {
  for (const filename of filenames) {
    const value = await readJson<T>(filename)
    if (value != null) return value
  }
  return null
}

async function readDirFilenames(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir)
  } catch {
    return []
  }
}

function summarizeParams(params: JsonObject): string | null {
  const entries = Object.entries(params).slice(0, 3)
  if (entries.length === 0) return null
  return entries
    .map(([key, value]) => `${key.replace(/_/g, " ")}=${value}`)
    .join(" · ")
}

function inferTradingDays(
  explicitDays: unknown,
  startDate: unknown,
  endDate: unknown,
): number | null {
  const explicit = num(explicitDays)
  if (explicit != null) return explicit
  const start = typeof startDate === "string" ? Date.parse(startDate) : NaN
  const end = typeof endDate === "string" ? Date.parse(endDate) : NaN
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  const dayMs = 24 * 60 * 60 * 1000
  return Math.floor((end - start) / dayMs) + 1
}

function inferBenchmarkSummary(report: JsonObject | null, spec: JsonObject | null): JsonObject {
  if (isObject(report?.benchmark?.summary)) {
    return {
      label: str(report?.benchmark?.label) ?? str(report?.benchmark?.sleeve_id) ?? "Benchmark",
      ret: num(report?.benchmark?.summary?.net_total_compounded_return_pct),
      sharpe: num(report?.benchmark?.summary?.sharpe_ratio),
      calmar: num(report?.benchmark?.summary?.calmar_ratio),
      maxDD: num(report?.benchmark?.summary?.max_drawdown_pct),
      eras: [],
    }
  }

  if (isObject(report?.benchmark_baseline?.summary)) {
    return {
      label: str(report?.benchmark_baseline?.baseline_id) ?? "Benchmark",
      ret: num(report?.benchmark_baseline?.summary?.net_total_compounded_return_pct),
      sharpe: num(report?.benchmark_baseline?.summary?.sharpe_ratio),
      calmar: num(report?.benchmark_baseline?.summary?.calmar_ratio),
      maxDD: num(report?.benchmark_baseline?.summary?.max_drawdown_pct),
      eras: [],
    }
  }

  if (isObject(report?.baselines)) {
    const firstBaseline = arr<JsonObject>(report?.baselines)[0]
    if (firstBaseline) {
      return {
        label: str(firstBaseline.label) ?? str(firstBaseline.baseline_id) ?? "Benchmark",
        ret: num(firstBaseline.summary?.net_total_compounded_return_pct),
        sharpe: num(firstBaseline.summary?.sharpe_ratio),
        calmar: num(firstBaseline.summary?.calmar_ratio),
        maxDD: num(firstBaseline.summary?.max_drawdown_pct),
        eras: [],
      }
    }
  }

  const benchmarkSymbol =
    str(report?.benchmark_symbol) ??
    str(spec?.dataset?.benchmark_symbol) ??
    str(spec?.dataset?.symbol) ??
    "Benchmark"

  return {
    label: benchmarkSymbol,
    ret: num(report?.selected_result?.benchmark_return_pct),
    sharpe: null,
    calmar: null,
    maxDD: null,
    eras: [],
  }
}

function buildStockRunCandidates(leaderboard: JsonObject[], selectedVariantId: string | null): JsonObject[] {
  return leaderboard.map((entry, idx) => ({
    id: str(entry.variant_id) ?? `variant-${idx + 1}`,
    label: str(entry.description) ?? str(entry.variant_id) ?? `Variant ${idx + 1}`,
    ret: num(entry.total_return_pct),
    sharpe: num(entry.sharpe_ratio),
    calmar: num(entry.calmar_ratio),
    maxDD: num(entry.max_drawdown_pct),
    trades: num(entry.total_trades),
    passes: str(entry.verdict) === "PASS" ? 1 : 0,
    gates: 1,
    winner: str(entry.variant_id) === selectedVariantId,
    rejected: str(entry.verdict) !== "PASS",
    plateau: str(entry.verdict) === "PASS" ? "STABLE" : "UNKNOWN",
    note: str(entry.verdict_reason),
    eras: [],
  }))
}

function buildStockRejectRules(spec: JsonObject | null, leaderboard: JsonObject[]): JsonObject[] {
  const rules = arr<JsonObject>(spec?.evaluation?.hard_reject_rules)
  if (!rules.length) return []

  return rules.map(rule => {
    const gateId = str(rule.gate_id)
    const metric = str(rule.metric)
    const op = str(rule.operator)
    const value = num(rule.value)

    const cleared = leaderboard.filter(entry => {
      const metricValue =
        metric === "total_trades" ? num(entry.total_trades)
        : metric === "max_drawdown_pct" ? num(entry.max_drawdown_pct)
        : null

      if (metricValue == null || value == null) return false
      if (op === ">=") return metricValue >= value
      if (op === "<=") return metricValue <= value
      if (op === ">") return metricValue > value
      if (op === "<") return metricValue < value
      return false
    }).length

    return {
      gate_id: gateId,
      label: str(rule.description) ?? gateId ?? "Gate",
      cleared,
      total: leaderboard.length,
    }
  })
}

function buildCryptoProbeCandidates(report: JsonObject): JsonObject[] {
  const variants = arr<JsonObject>(report.variants)
  return variants.slice(0, 12).map((variant, idx) => {
    const metric = isObject(variant.metric_snapshot) ? variant.metric_snapshot : {}
    const benchmarkComparison = isObject(variant.benchmark_comparison) ? variant.benchmark_comparison : {}
    const eraResults = arr<JsonObject>(variant.era_results).map(era => ({
      label: str(era.label) ?? str(era.era_id) ?? "Era",
      sharpe: num(era.summary?.sharpe_ratio),
      ret: num(era.summary?.net_total_compounded_return_pct),
      pass: str(era.verdict) === "PASS"
        ? true
        : str(era.verdict)
          ? false
          : (num(era.summary?.sharpe_ratio) ?? -Infinity) >= 0.5,
      verdict: str(era.verdict),
      verdict_reason: str(era.verdict_reason),
      total_trades: num(era.summary?.trade_count),
      evaluated_trading_days: num(era.evaluated_trading_days),
    }))

    return {
      id: str(variant.config_id) ?? `candidate-${idx + 1}`,
      label: summarizeParams(variant.params ?? {}) ?? str(variant.config_id) ?? `Candidate ${idx + 1}`,
      ret:
        num(metric.net_total_compounded_return_pct) ??
        num(metric.total_return_pct) ??
        num(variant.report?.summary?.net_total_compounded_return_pct),
      sharpe: num(metric.sharpe_ratio) ?? num(variant.report?.summary?.sharpe_ratio),
      calmar: num(metric.calmar_ratio) ?? num(metric.calmar) ?? num(variant.report?.summary?.calmar_ratio),
      maxDD: num(metric.max_drawdown_pct) ?? num(variant.report?.summary?.max_drawdown_pct),
      trades: num(metric.total_trades) ?? num(metric.trade_count),
      passes: variant.passes_hard_reject_rules ? 1 : 0,
      gates: 1,
      winner: !!variant.selected,
      rejected: !variant.passes_hard_reject_rules,
      provisional: false,
      plateau: variant.plateau_passed ? "STABLE" : "UNSTABLE",
      note: benchmarkComparison.excess_return_pct != null
        ? `vs benchmark ${Number(benchmarkComparison.excess_return_pct).toFixed(1)}%`
        : null,
      eras: eraResults,
    }
  })
}

function buildCryptoProbeRejectRules(spec: JsonObject | null, report: JsonObject): JsonObject[] {
  const rules = arr<JsonObject>(spec?.evaluation?.hard_reject_rules)
  const variants = arr<JsonObject>(report.variants)
  if (!rules.length || !variants.length) return []

  return rules.map(rule => {
    const gateId = str(rule.gate_id)
    const cleared = variants.filter(variant => {
      const failures = arr<string>(variant.hard_reject_failures)
      return gateId ? !failures.includes(gateId) : false
    }).length
    return {
      gate_id: gateId,
      label: str(rule.description) ?? gateId ?? "Gate",
      cleared,
      total: variants.length,
    }
  })
}

function buildCryptoComparisonCandidates(report: JsonObject, selectedConfigId: string | null): JsonObject[] {
  return COMPARISON_REPORT_KEYS
    .map(key => {
      const lane = report[key]
      if (!isObject(lane?.summary)) return null
      const benchmarkComparison = isObject(lane.benchmark_comparison) ? lane.benchmark_comparison : {}
      return {
        id: str(lane.sleeve_id) ?? key,
        label: str(lane.label) ?? titleCaseToken(key),
        role: key.includes("benchmark") ? "benchmark" : "candidate",
        ret: num(lane.summary.net_total_compounded_return_pct),
        sharpe: num(lane.summary.sharpe_ratio),
        calmar: num(lane.summary.calmar_ratio),
        maxDD: num(lane.summary.max_drawdown_pct),
        trades: num(lane.summary.trade_count),
        sharpeDelta: num(benchmarkComparison.sharpe_delta),
        calmarDelta: num(benchmarkComparison.calmar_delta),
        drawdownImprovementPct: num(benchmarkComparison.drawdown_improvement_pct),
        passes: key.includes("benchmark")
          ? 0
          : [
              (num(benchmarkComparison.sharpe_delta) ?? -1) > 0,
              (num(benchmarkComparison.calmar_delta) ?? -1) > 0,
              (num(benchmarkComparison.drawdown_improvement_pct) ?? -1) > 0,
            ].filter(Boolean).length,
        gates: key.includes("benchmark") ? 0 : 3,
        winner: selectedConfigId != null && selectedConfigId === (str(lane.sleeve_id) ?? key),
        rejected: false,
        plateau: "N/A",
        provisional: false,
        note: str(arr<string>(lane.notes)[0]),
        eras: [],
      }
    })
    .filter(Boolean) as JsonObject[]
}

function buildCryptoComparisonRejectRules(report: JsonObject): JsonObject[] {
  const candidates = buildCryptoComparisonCandidates(report, null).filter(candidate => candidate.role !== "benchmark")
  if (!candidates.length) return []
  return [
    {
      label: "Sharpe delta vs benchmark > 0",
      cleared: candidates.filter(c => (num(c.sharpeDelta) ?? -Infinity) > 0.0).length,
      total: candidates.length,
    },
    {
      label: "Calmar delta vs benchmark > 0",
      cleared: candidates.filter(c => (num(c.calmarDelta) ?? -Infinity) > 0.0).length,
      total: candidates.length,
    },
    {
      label: "Max drawdown improved vs benchmark",
      cleared: candidates.filter(c => (num(c.drawdownImprovementPct) ?? -Infinity) > 0.0).length,
      total: candidates.length,
    },
  ]
}

function buildRunInterpretation(kind: "stock" | "crypto_probe" | "crypto_compare", bundle: JsonObject, selectedConfigId: string | null): string {
  if (kind === "stock") {
    return selectedConfigId
      ? `Frozen reference selected ${selectedConfigId} as the current stock-side winner against SPY.`
      : "Frozen reference completed without a selected winner."
  }
  if (kind === "crypto_probe") {
    return bundle.sweep_truncated
      ? "This sweep is still partial, so the current leaders are informative but not yet promotable."
      : `Neighborhood probe confirmed a real local plateau around ${selectedConfigId ?? "the selected BTC tactical candidate"}.`
  }
  return `Fixed comparison evaluates managed BTC sleeves against the same HODL control with ${selectedConfigId ?? "the selected"} candidate on top.`
}

function stageLabelForManifest(manifest: JsonObject | null): string {
  if (!manifest) return "BENCHED"
  return "PROMOTED"
}

function eligibilityForManifest(manifest: JsonObject | null): string {
  if (!manifest) return "BENCH_ONLY"
  return isObject(manifest.broker) && manifest.broker.paper_only ? "PAPER" : "LIVE_ELIGIBLE"
}

function buildLifecycle(
  currentStage: string,
  benchRunAt: string | null,
  manifest: JsonObject | null,
  blockedDetail: string | null = null,
): JsonObject {
  const stages: JsonObject[] = [
    {
      stage: "IDEATED",
      at: null,
      actor: "research",
      title: "Strategy idea captured",
      detail: "Idea and hypothesis are present in the published bench contract.",
      status: "DONE",
      artifact: null,
    },
    {
      stage: "SPEC",
      at: null,
      actor: "bench",
      title: "Bench spec written",
      detail: "Spec is checked in and published with the run artifacts.",
      status: "DONE",
      artifact: manifest ? { label: manifest.source?.source_spec_path ?? "bench spec", kind: "spec" } : null,
    },
    {
      stage: "BENCHED",
      at: benchRunAt,
      actor: "bench",
      title: "Bench run completed",
      detail: "The current published result bundle is the source of truth for this strategy.",
      status: currentStage === "BENCHED" ? "ACTIVE" : "DONE",
      artifact: manifest ? { label: manifest.source?.source_result_bundle_path ?? "bench run", kind: "run" } : null,
    },
    {
      stage: "CONFIRMED",
      at: null,
      actor: "governance",
      title: "Frozen confirmation",
      detail: blockedDetail ?? "Promotion requires passing the published confirmation and governance gates.",
      status: currentStage === "BENCHED" ? "BLOCKED" : manifest ? "DONE" : "FUTURE",
      artifact: null,
    },
    {
      stage: "PROMOTED",
      at: str(manifest?.generated_at),
      actor: "operator",
      title: "Execution manifest published",
      detail: manifest ? "Manifest is checked in and available to the runtime." : "No execution manifest has been promoted yet.",
      status: manifest ? "DONE" : "FUTURE",
      artifact: manifest ? { label: str(manifest.manifest_id) ?? "execution manifest", kind: "manifest" } : null,
    },
    {
      stage: "PAPER",
      at: str(manifest?.generated_at),
      actor: isObject(manifest?.broker) ? str(manifest?.broker?.broker_adapter) : null,
      title: "Paper execution",
      detail: manifest ? "Current manifest is configured for paper/runtime execution." : "Paper execution not yet enabled.",
      status: manifest ? "ACTIVE" : "FUTURE",
      artifact: null,
    },
    {
      stage: "LIVE_ELIGIBLE",
      at: null,
      actor: null,
      title: "Live eligible",
      detail: "Reserved for a later governance unlock beyond paper/runtime proof.",
      status: "FUTURE",
      artifact: null,
    },
    {
      stage: "LIVE",
      at: null,
      actor: null,
      title: "Earning live capital",
      detail: "Reserved for later live-capital promotion.",
      status: "FUTURE",
      artifact: null,
    },
  ]

  return {
    currentStage,
    blockedAt: currentStage === "BENCHED" ? "CONFIRMED" : null,
    stages,
    events: stages,
  }
}

function buildStockPassport(
  manifest: JsonObject,
  spec: JsonObject | null,
  report: JsonObject | null,
  runtimeActiveStrategy: JsonObject | null,
  runId: string | null,
): JsonObject | null {
  const selected = isObject(report?.selected_result) ? report?.selected_result : runtimeActiveStrategy?.record?.performance_summary
  if (!selected) return null

  const benchmarkRet = num(selected.benchmark_return_pct)
  const totalRet = num(selected.total_return_pct)
  const sharpe = num(selected.sharpe_ratio)
  const calmar = num(selected.calmar_ratio)
  const maxDD = num(selected.max_drawdown_pct)
  const trades = num(selected.total_trades)
  const days = num(selected.evaluated_trading_days)
  const reportEraRows = arr<JsonObject>(report?.era_results).map(era => {
    const verdict = str(era.row?.verdict)
    return {
      label: str(era.label) ?? str(era.era_id) ?? "Era",
      sharpe: num(era.row?.sharpe_ratio),
      ret: num(era.row?.total_return_pct),
      pass: verdict === "PASS" ? true : verdict ? false : null,
      verdict,
      verdict_reason: str(era.row?.verdict_reason),
      total_trades: num(era.row?.total_trades),
      evaluated_trading_days: num(era.row?.evaluated_trading_days),
    }
  })
  const eras = reportEraRows.length
    ? reportEraRows
    : arr<JsonObject>(spec?.dataset?.eras).map(era => ({
        label: str(era.label) ?? str(era.era_id) ?? "Era",
        sharpe: null,
        ret: null,
        pass: null,
        verdict: null,
        verdict_reason: null,
        total_trades: null,
        evaluated_trading_days: null,
      }))
  const finiteEraSharpes = eras
    .map(era => num(era.sharpe))
    .filter((value): value is number => value != null)
  const minEraSharpe = finiteEraSharpes.length ? Math.min(...finiteEraSharpes) : null
  const rejectRules = buildStockRejectRules(spec, arr<JsonObject>(report?.leaderboard ?? report?.candidate_rows ?? []))
  const gates: JsonObject[] = [
    {
      label: "Manifest provenance",
      status: "PASS",
      detail: "Checked-in execution manifest exists for this stock sleeve.",
    },
    {
      label: "Benchmark comparison",
      status: (num(selected.excess_return_pct) ?? -Infinity) > 0 ? "PASS" : "WARN",
      detail: benchmarkRet != null && totalRet != null
        ? `${totalRet.toFixed(2)}% vs ${benchmarkRet.toFixed(2)}% benchmark return.`
        : "Benchmark-relative comparison is partially populated.",
    },
    {
      label: "Era robustness",
      status: minEraSharpe == null ? "WARN" : minEraSharpe >= 1 ? "PASS" : minEraSharpe >= 0 ? "WARN" : "FAIL",
      detail: minEraSharpe != null
        ? `Minimum promoted-era Sharpe ${minEraSharpe.toFixed(2)}.`
        : "Promoted era metrics are not populated yet.",
    },
    ...rejectRules.map(rule => ({
      label: str(rule.label) ?? "Gate",
      status: rule.cleared === rule.total ? "PASS" : rule.cleared > 0 ? "WARN" : "FAIL",
      detail: `${rule.cleared}/${rule.total} variants cleared this published rule.`,
    })),
  ]

  return {
    id: str(manifest.strategy_id) ?? str(manifest.manifest_id) ?? "stock-passport",
    bench_id: str(manifest.source?.bench_id) ?? str(report?.bench_id) ?? null,
    run_id: runId,
    source_type: "manifest",
    name: str(manifest.title) ?? str(spec?.title) ?? "Strategy Passport",
    variant: str(manifest.deployment_config_id) ?? str(runtimeActiveStrategy?.record?.variant_id) ?? "selected",
    sleeve: "STOCKS",
    benchmark: str(manifest.benchmark_symbol) ?? str(spec?.dataset?.benchmark_symbol) ?? "SPY",
    summary:
      str(runtimeActiveStrategy?.record?.description) ??
      str(arr<string>(report?.notes)[0]) ??
      str(spec?.hypothesis) ??
      "Promoted stock sleeve.",
    manifest: {
      provenance: "CHECKED_IN",
      ref: str(manifest.manifest_id) ?? str(manifest.title),
      stage: stageLabelForManifest(manifest),
      eligibility: eligibilityForManifest(manifest),
      paperDays: null,
      paperTarget: null,
      runtimeContract: str(manifest.runtime_contract),
      cadence: str(manifest.cadence),
      broker: manifest.broker ?? null,
    },
    metrics: {
      totalReturn: totalRet,
      benchReturn: benchmarkRet,
      excess: num(selected.excess_return_pct),
      sharpe,
      benchSharpe: null,
      sharpeDelta: null,
      calmar,
      benchCalmar: null,
      calmarDelta: null,
      maxDD: maxDD != null ? -Math.abs(maxDD) : null,
      benchMaxDD: null,
      ddDelta: null,
      trades,
      days,
      profitFactor: num(selected.profit_factor),
      winRate: num(selected.win_rate_pct),
    },
    eras,
    minEraSharpe,
    assumptions: {
      commissionBps: num(spec?.cost_model?.fee_bps_round_trip),
      slippageBps: num(spec?.cost_model?.slippage_bps_one_way),
      fillModel: str(spec?.run?.fill_model),
      capitalBase: num(spec?.run?.capital_base_usd),
      provider: str(spec?.dataset?.provider),
      venue: str(spec?.dataset?.venue),
      timeframe: str(spec?.dataset?.target_timeframe),
    },
    gates,
    lifecycle: buildLifecycle("PAPER", str(manifest.generated_at) ?? null, manifest),
  }
}

function buildCryptoManagedPassport(
  manifest: JsonObject,
  spec: JsonObject | null,
  report: JsonObject,
  runId: string | null,
): JsonObject {
  const selectedId = str(manifest.deployment_config_id) ?? str(report?.result_bundle?.selected_config_id)
  const lane = COMPARISON_REPORT_KEYS
    .map(key => report[key])
    .find(item => isObject(item) && (str(item.sleeve_id) === selectedId || str(item.label) === selectedId))

  const benchmark =
    isObject(report?.benchmark?.summary) ? report.benchmark
    : isObject(report?.benchmark_baseline?.summary) ? report.benchmark_baseline
    : null

  const benchmarkSummary = benchmark?.summary ?? {}
  const laneSummary = lane?.summary ?? {}
  const comparison = lane?.benchmark_comparison ?? {}
  const eraRows = arr<JsonObject>(lane?.era_results).map(era => ({
    label: str(era.label) ?? str(era.era_id) ?? "Era",
    sharpe: num(era.summary?.sharpe_ratio),
    ret: num(era.summary?.net_total_compounded_return_pct),
    pass: str(era.verdict) === "PASS"
      ? true
      : str(era.verdict)
        ? false
        : (num(era.summary?.sharpe_ratio) ?? -Infinity) >= 0.5,
    verdict: str(era.verdict),
    verdict_reason: str(era.verdict_reason),
    total_trades: num(era.summary?.trade_count),
    evaluated_trading_days: num(era.evaluated_trading_days),
  }))
  const minEraSharpe = eraRows.length
    ? Math.min(...eraRows.map(era => era.sharpe ?? Infinity).filter(value => Number.isFinite(value)))
    : null

  const gates: JsonObject[] = [
    {
      label: "Manifest provenance",
      status: "PASS",
      detail: "Checked-in execution manifest exists for this crypto sleeve.",
    },
    {
      label: "Sharpe vs benchmark",
      status: (num(comparison.sharpe_delta) ?? -Infinity) > 0 ? "PASS" : "WARN",
      detail: num(comparison.sharpe_delta) != null
        ? `${Number(comparison.sharpe_delta).toFixed(3)} delta versus HODL.`
        : "Sharpe delta is not populated.",
    },
    {
      label: "Calmar vs benchmark",
      status: (num(comparison.calmar_delta) ?? -Infinity) > 0 ? "PASS" : "WARN",
      detail: num(comparison.calmar_delta) != null
        ? `${Number(comparison.calmar_delta).toFixed(3)} delta versus HODL.`
        : "Calmar delta is not populated.",
    },
    {
      label: "Drawdown improvement",
      status: (num(comparison.drawdown_improvement_pct) ?? -Infinity) > 0 ? "PASS" : "WARN",
      detail: num(comparison.drawdown_improvement_pct) != null
        ? `${Number(comparison.drawdown_improvement_pct).toFixed(2)}% shallower max drawdown than HODL.`
        : "Drawdown comparison is not populated.",
    },
    {
      label: "Era robustness",
      status: minEraSharpe == null ? "WARN" : minEraSharpe >= 0.5 ? "PASS" : "WARN",
      detail: minEraSharpe != null
        ? `Minimum promoted-era Sharpe ${minEraSharpe.toFixed(2)}.`
        : "Promoted era metrics are not populated yet.",
    },
  ]

  return {
    id: str(manifest.strategy_id) ?? str(manifest.manifest_id) ?? "crypto-managed-passport",
    bench_id: str(manifest.source?.bench_id) ?? str(report?.bench_id) ?? null,
    run_id: runId,
    source_type: "manifest",
    name: str(manifest.title) ?? str(spec?.title) ?? "Crypto Managed Exposure",
    variant: selectedId ?? "selected",
    sleeve: "CRYPTO",
    benchmark: str(manifest.benchmark_symbol) ?? "BTC/USD",
    summary:
      str(manifest.source?.rationale) ??
      str(arr<string>(lane?.notes)[0]) ??
      str(spec?.hypothesis) ??
      "Managed BTC exposure sleeve.",
    manifest: {
      provenance: "CHECKED_IN",
      ref: str(manifest.manifest_id) ?? str(manifest.title),
      stage: stageLabelForManifest(manifest),
      eligibility: eligibilityForManifest(manifest),
      paperDays: null,
      paperTarget: null,
      runtimeContract: str(manifest.runtime_contract),
      cadence: str(manifest.cadence),
      broker: manifest.broker ?? null,
    },
    metrics: {
      totalReturn: num(laneSummary.net_total_compounded_return_pct),
      benchReturn: num(benchmarkSummary.net_total_compounded_return_pct),
      excess: num(comparison.excess_return_pct),
      sharpe: num(laneSummary.sharpe_ratio),
      benchSharpe: num(benchmarkSummary.sharpe_ratio),
      sharpeDelta: num(comparison.sharpe_delta),
      calmar: num(laneSummary.calmar_ratio),
      benchCalmar: num(benchmarkSummary.calmar_ratio),
      calmarDelta: num(comparison.calmar_delta),
      maxDD: num(laneSummary.max_drawdown_pct) != null ? -Math.abs(Number(laneSummary.max_drawdown_pct)) : null,
      benchMaxDD: num(benchmarkSummary.max_drawdown_pct) != null ? -Math.abs(Number(benchmarkSummary.max_drawdown_pct)) : null,
      ddDelta: num(comparison.drawdown_improvement_pct),
      trades: num(laneSummary.trade_count),
      days: num(report?.daily_bar_count),
      profitFactor: null,
      winRate: num(laneSummary.net_win_rate_pct),
    },
    eras: eraRows.length
      ? eraRows
      : arr<JsonObject>(spec?.dataset?.eras).map(era => ({
          label: str(era.label) ?? str(era.era_id) ?? "Era",
          sharpe: null,
          ret: null,
          pass: null,
        })),
    minEraSharpe,
    assumptions: {
      commissionBps: num(spec?.cost_model?.fee_bps_round_trip),
      slippageBps: num(spec?.cost_model?.slippage_bps_one_way),
      fillModel: str(spec?.run?.fill_model),
      capitalBase: num(spec?.run?.capital_base_usd),
      provider: str(spec?.dataset?.provider),
      venue: str(spec?.dataset?.venue),
      timeframe: str(spec?.dataset?.target_timeframe),
    },
    gates,
    lifecycle: buildLifecycle("PAPER", str(manifest.generated_at) ?? null, manifest),
  }
}

function buildCryptoBenchOnlyPassport(spec: JsonObject | null, report: JsonObject, runId: string | null): JsonObject | null {
  const selected = isObject(report?.selected_result) ? report.selected_result : null
  if (!selected) return null
  const metric = selected.metric_snapshot ?? {}
  const benchmark = inferBenchmarkSummary(report, spec)
  const eraRows = arr<JsonObject>(report?.era_results).map(era => ({
    label: str(era.label) ?? str(era.era_id) ?? "Era",
    sharpe: num(era.summary?.sharpe_ratio),
    ret: num(era.summary?.net_total_compounded_return_pct),
    pass: str(era.verdict) === "PASS"
      ? true
      : str(era.verdict)
        ? false
        : (num(era.summary?.sharpe_ratio) ?? -Infinity) >= 0.5,
    verdict: str(era.verdict),
    verdict_reason: str(era.verdict_reason),
    total_trades: num(era.summary?.trade_count),
    evaluated_trading_days: num(era.evaluated_trading_days),
  }))
  const minEraSharpe = eraRows.length
    ? Math.min(...eraRows.map(era => era.sharpe ?? Infinity).filter(value => Number.isFinite(value)))
    : null
  const benchmarkComparison = selected.benchmark_comparison ?? {}
  const gates = [
    {
      label: "Hard reject rules",
      status: selected.passes_hard_reject_rules ? "PASS" : "FAIL",
      detail: selected.passes_hard_reject_rules
        ? "Selected candidate clears the published hard reject rules."
        : "Selected candidate failed at least one published hard reject rule.",
    },
    {
      label: "Plateau check",
      status: selected.plateau_passed ? "PASS" : "WARN",
      detail: selected.plateau_passed
        ? "Neighborhood check found enough strong adjacent candidates."
        : "Neighborhood support is weak or incomplete.",
    },
    {
      label: "Era robustness",
      status: (minEraSharpe ?? -Infinity) >= 0.5 ? "PASS" : "WARN",
      detail: minEraSharpe != null
        ? `Minimum era Sharpe ${minEraSharpe.toFixed(2)}.`
        : "Era robustness is not fully populated.",
    },
    {
      label: "Benchmark comparison",
      status: (num(benchmarkComparison.sharpe_delta) ?? -Infinity) > 0 && (num(benchmarkComparison.excess_return_pct) ?? -Infinity) > 0
        ? "PASS"
        : "FAIL",
      detail:
        num(benchmarkComparison.excess_return_pct) != null || num(benchmarkComparison.sharpe_delta) != null
          ? `Return delta ${Number(benchmarkComparison.excess_return_pct ?? 0).toFixed(1)}%, Sharpe delta ${Number(benchmarkComparison.sharpe_delta ?? 0).toFixed(3)}.`
          : "Benchmark-relative comparison is not populated.",
    },
  ]

  return {
    id: str(selected.config_id) ?? str(report?.bench_id) ?? "crypto-bench-only-passport",
    bench_id: str(report?.bench_id) ?? null,
    run_id: runId,
    source_type: "bench_only",
    name: str(report?.title) ?? str(spec?.title) ?? "Crypto Bench Candidate",
    variant: str(selected.config_id) ?? "selected",
    sleeve: "CRYPTO",
    benchmark: benchmark.label,
    summary: str(report?.hypothesis) ?? "Bench-only tactical crypto candidate.",
    manifest: {
      provenance: "BENCH_ONLY",
      ref: str(report?.bench_id) ?? "bench-only",
      stage: "STRONG_NOT_PROMOTED",
      eligibility: "BENCH_ONLY",
      paperDays: null,
      paperTarget: null,
      runtimeContract: null,
      cadence: null,
      broker: null,
    },
    metrics: {
      totalReturn: num(metric.net_total_compounded_return_pct),
      benchReturn: benchmark.ret,
      excess: num(benchmarkComparison.excess_return_pct),
      sharpe: num(metric.sharpe_ratio),
      benchSharpe: benchmark.sharpe,
      sharpeDelta: num(benchmarkComparison.sharpe_delta),
      calmar: num(metric.calmar_ratio) ?? num(metric.calmar),
      benchCalmar: benchmark.calmar,
      calmarDelta: num(benchmarkComparison.calmar_delta),
      maxDD: num(metric.max_drawdown_pct) != null ? -Math.abs(Number(metric.max_drawdown_pct)) : null,
      benchMaxDD: benchmark.maxDD != null ? -Math.abs(Number(benchmark.maxDD)) : null,
      ddDelta: num(benchmarkComparison.drawdown_improvement_pct),
      trades: num(metric.total_trades) ?? num(metric.trade_count),
      days: inferTradingDays(
        report?.daily_bar_count,
        report?.spec_summary?.date_window?.start_date,
        report?.spec_summary?.date_window?.end_date,
      ),
      profitFactor: null,
      winRate: num(metric.win_rate_pct),
    },
    eras: eraRows,
    minEraSharpe,
    assumptions: {
      commissionBps: num(spec?.cost_model?.fee_bps_round_trip),
      slippageBps: num(spec?.cost_model?.slippage_bps_one_way),
      fillModel: str(spec?.run?.fill_model),
      capitalBase: num(spec?.run?.capital_base_usd),
      provider: str(spec?.dataset?.provider),
      venue: str(spec?.dataset?.venue),
      timeframe: str(spec?.dataset?.target_timeframe),
    },
    gates,
    lifecycle: buildLifecycle(
      "BENCHED",
      str(report?.generated_at),
      null,
      "Still blocked on stronger benchmark-relative proof before promotion."
    ),
  }
}

function buildLifecycleEntries(passports: JsonObject[]): JsonObject[] {
  return passports.map(passport => ({
    id: str(passport.id),
    bench_id: str(passport.bench_id),
    run_id: str(passport.run_id),
    name: str(passport.name),
    sleeve: str(passport.sleeve),
    variant: str(passport.variant),
    lifecycle: passport.lifecycle ?? null,
  }))
}

function buildPlateauPrimer(report: JsonObject | null): JsonObject | null {
  if (!report || !Array.isArray(report.variants) || !report.variants.length) return null

  const xKey = "fast_ema_bars"
  const yKey = "slow_ema_bars"
  const variants = arr<JsonObject>(report.variants)
  const grouped = new Map<string, JsonObject>()

  for (const variant of variants) {
    const params = isObject(variant.params) ? variant.params : {}
    const x = num(params[xKey])
    const y = num(params[yKey])
    if (x == null || y == null) continue
    const key = `${x}::${y}`
    const currentMetric = num(variant.metric_snapshot?.median_era_sharpe)
    const existing = grouped.get(key)
    const existingMetric = num(existing?.metric_snapshot?.median_era_sharpe)
    if (!existing || (currentMetric ?? -Infinity) > (existingMetric ?? -Infinity)) {
      grouped.set(key, variant)
    }
  }

  const xValues = Array.from(new Set(Array.from(grouped.values()).map(v => Number(v.params?.[xKey])))).sort((a, b) => a - b)
  const yValues = Array.from(new Set(Array.from(grouped.values()).map(v => Number(v.params?.[yKey])))).sort((a, b) => a - b)

  const gridCells = Array.from(grouped.values()).map(variant => {
    const metric = variant.metric_snapshot ?? {}
    const eraResults = arr<JsonObject>(variant.era_results)
    return {
      i: xValues.indexOf(Number(variant.params?.[xKey])),
      j: yValues.indexOf(Number(variant.params?.[yKey])),
      [xKey]: Number(variant.params?.[xKey]),
      [yKey]: Number(variant.params?.[yKey]),
      sharpe: num(metric.median_era_sharpe),
      calmar: num(metric.calmar_ratio) ?? num(metric.calmar),
      pf: num(metric.profit_factor),
      rejected: !variant.passes_hard_reject_rules,
      trades: num(metric.total_trades),
      winRate: num(metric.win_rate_pct),
      maxDD: num(metric.max_drawdown_pct),
      eraRobustness: eraResults.filter(era => (num(era.summary?.sharpe_ratio) ?? -Infinity) >= 0.5).length,
      winner: !!variant.selected,
      plateau: !!variant.plateau_passed,
      luckyPeak: false,
      neighbors: [] as Array<{ i: number; j: number; sharpe: number | null }>,
      nbMean: null as number | null,
      nbMin: null as number | null,
      nbMax: null as number | null,
      nbSpread: null as number | null,
    }
  })

  const getCell = (i: number, j: number) => gridCells.find(cell => cell.i === i && cell.j === j) ?? null
  for (const cell of gridCells) {
    const neighbors: Array<{ i: number; j: number; sharpe: number | null }> = []
    for (let di = -1; di <= 1; di += 1) {
      for (let dj = -1; dj <= 1; dj += 1) {
        if (di === 0 && dj === 0) continue
        const neighbor = getCell(cell.i + di, cell.j + dj)
        if (neighbor && !neighbor.rejected) {
          neighbors.push({ i: neighbor.i, j: neighbor.j, sharpe: neighbor.sharpe })
        }
      }
    }
    const sharpeVals = neighbors.map(neighbor => neighbor.sharpe).filter((value): value is number => value != null)
    cell.neighbors = neighbors
    cell.nbMean = sharpeVals.length ? Number((sharpeVals.reduce((sum, value) => sum + value, 0) / sharpeVals.length).toFixed(4)) : null
    cell.nbMin = sharpeVals.length ? Math.min(...sharpeVals) : null
    cell.nbMax = sharpeVals.length ? Math.max(...sharpeVals) : null
    cell.nbSpread = sharpeVals.length ? Number((Math.max(...sharpeVals) - Math.min(...sharpeVals)).toFixed(4)) : null
  }

  const winner = gridCells.find(cell => cell.winner) ?? null
  const sortedBySharpe = [...gridCells]
    .filter(cell => cell.sharpe != null)
    .sort((a, b) => Number(b.sharpe) - Number(a.sharpe))
  const lucky = sortedBySharpe.find(cell => !cell.winner && !cell.plateau) ?? null
  if (lucky) lucky.luckyPeak = true

  return {
    source: {
      bench_id: str(report.bench_id),
      generated_at: str(report.generated_at),
    },
    axes: {
      x: {
        parameter: xKey,
        label: "Fast EMA bars",
        values: xValues,
      },
      y: {
        parameter: yKey,
        label: "Slow EMA bars",
        values: yValues,
      },
    },
    cells: gridCells,
    winner,
    lucky,
    stats: {
      plateauCount: gridCells.filter(cell => cell.plateau).length,
      totalEval: gridCells.filter(cell => !cell.rejected).length,
      totalCells: gridCells.length,
      plateauCut: winner?.sharpe != null ? Number((winner.sharpe * 0.85).toFixed(4)) : null,
      winnerSharpe: winner?.sharpe ?? null,
    },
  }
}

async function readRunArtifacts(benchId: string, runId: string): Promise<JsonObject | null> {
  const dir = path.join(RUNS_DIR, benchId, runId)
  const [bundle, spec] = await Promise.all([
    readJson<JsonObject>(path.join("data", "bench", "runs", benchId, runId, "bench_run_bundle.json")),
    readJson<JsonObject>(path.join("data", "bench", "runs", benchId, runId, "bench_spec.snapshot.json")),
  ])
  const [leaderboard, report] = await Promise.all([
    readFirstJson<JsonObject>(
      path.join("data", "bench", "runs", benchId, runId, "crypto_bench_leaderboard.json"),
      path.join("data", "bench", "runs", benchId, runId, "stock_bench_leaderboard.json"),
    ),
    readFirstJson<JsonObject>(
      path.join("data", "bench", "runs", benchId, runId, "crypto_sleeve_comparison_report.json"),
      path.join("data", "bench", "runs", benchId, runId, "stock_bench_report.json"),
      path.join("data", "bench", "runs", benchId, runId, "crypto_bench_report.json"),
    ),
  ])
  if (!bundle || !spec) return null
  return { dir, bundle, spec, leaderboard, report }
}

function normalizeRunDetail(raw: JsonObject): JsonObject {
  const { bundle, spec, leaderboard, report } = raw
  if (report && Array.isArray(report.variants)) {
    return {
      id: `${bundle.bench_id}/${bundle.run_id}`,
      benchmarkName: inferBenchmarkSummary(report, spec).label,
      benchmark: inferBenchmarkSummary(report, spec),
      interpretation: buildRunInterpretation("crypto_probe", bundle, str(bundle.selected_config_id)),
      candidates: buildCryptoProbeCandidates(report),
      rejectRules: buildCryptoProbeRejectRules(spec, report),
      truncated: !!bundle.sweep_truncated,
    }
  }

  if (report && (isObject(report.benchmark) || isObject(report.benchmark_baseline))) {
    return {
      id: `${bundle.bench_id}/${bundle.run_id}`,
      benchmarkName: inferBenchmarkSummary(report, spec).label,
      benchmark: inferBenchmarkSummary(report, spec),
      interpretation: buildRunInterpretation("crypto_compare", bundle, str(bundle.selected_config_id)),
      candidates: buildCryptoComparisonCandidates(report, str(bundle.selected_config_id)),
      rejectRules: buildCryptoComparisonRejectRules(report),
      truncated: !!bundle.sweep_truncated,
    }
  }

  return {
    id: `${bundle.bench_id}/${bundle.run_id}`,
    benchmarkName: inferBenchmarkSummary(report, spec).label,
    benchmark: inferBenchmarkSummary(report, spec),
    interpretation: buildRunInterpretation("stock", bundle, str(bundle.selected_config_id)),
    candidates: buildStockRunCandidates(arr<JsonObject>(leaderboard), str(report?.selected_variant_id) ?? str(bundle.selected_config_id)),
    rejectRules: buildStockRejectRules(spec, arr<JsonObject>(leaderboard)),
    truncated: !!bundle.sweep_truncated,
  }
}

function pickLeaderboardTop(rawRuns: JsonObject[]): JsonObject[] {
  const stockLike = rawRuns.find(raw => raw.bundle?.bench_id === "q076b_regime_aware_momentum_frozen_reference")
  if (stockLike && Array.isArray(stockLike.leaderboard)) {
    return arr<JsonObject>(stockLike.leaderboard).slice(0, 6).map((entry, idx) => ({
      rank: idx + 1,
      id: str(entry.variant_id) ?? `variant-${idx + 1}`,
      primary: num(entry.calmar_ratio),
      ret: num(entry.total_return_pct),
      sharpe: num(entry.sharpe_ratio),
      minEra: null,
      trades: num(entry.total_trades),
      pass: str(entry.verdict) === "PASS",
      winner: str(entry.variant_id) === str(stockLike.bundle?.selected_config_id),
    }))
  }
  return []
}

export async function loadBenchIndexWithViresContracts(): Promise<JsonObject | null> {
  const index = await readJson<JsonObject>("data/bench/index.json")
  if (!index) return null

  const [runtimeActiveStrategy, runtimeExecutionManifest, runtimeSessionContext] = await Promise.all([
    readJson<JsonObject>("data/bench/runtime/active_strategy.json"),
    readJson<JsonObject>("data/bench/runtime/execution_manifest.json"),
    readJson<JsonObject>("data/bench/runtime/session_context.json"),
  ])

  const runEntries = arr<JsonObject>(index.runs)
  const specs = arr<JsonObject>(index.specs)
  const manifests = arr<JsonObject>(index.manifests)
  const specByBenchId = new Map(specs.map(spec => [str(spec.bench_id) ?? "", spec]))

  const rawRuns = (
    await Promise.all(
      runEntries.map(async entry => {
        const benchId = str(entry.bench_id)
        const runId = str(entry.run_id)
        if (!benchId || !runId) return null
        return readRunArtifacts(benchId, runId)
      }),
    )
  ).filter(Boolean) as JsonObject[]

  const normalizedRuns = runEntries.map(entry => {
    const benchId = str(entry.bench_id)
    const runId = str(entry.run_id)
    const spec = specByBenchId.get(benchId ?? "") ?? {}
    return {
      ...entry,
      id: benchId && runId ? `${benchId}/${runId}` : benchId ?? runId ?? "run",
      winner: str(entry.selected_config_id),
      role: humanizeRole(entry),
      hypothesis: str(spec.hypothesis),
      generated: str(entry.generated_at),
      detail_key: benchId && runId ? `${benchId}/${runId}` : null,
    }
  })

  const runDetails = Object.fromEntries(
    rawRuns.map(raw => [
      `${raw.bundle.bench_id}/${raw.bundle.run_id}`,
      normalizeRunDetail(raw),
    ]),
  )

  const passports: JsonObject[] = []
  const stockManifest = manifests.find(manifest => str(manifest.bench_id) === "q076b_regime_aware_momentum_frozen_reference")
  const stockRaw = rawRuns.find(raw => str(raw.bundle?.bench_id) === "q076b_regime_aware_momentum_frozen_reference")
  if (stockManifest && stockRaw) {
    const stockPassport = buildStockPassport(
      stockManifest,
      stockRaw.spec,
      stockRaw.report,
      runtimeActiveStrategy,
      str(stockRaw.bundle?.run_id),
    )
    if (stockPassport) passports.push(stockPassport)
  }

  for (const manifest of manifests.filter(manifest => str(manifest.sleeve) === "CRYPTO")) {
    const benchId = str(manifest.bench_id)
    const matchingRun = rawRuns
      .filter(raw => str(raw.bundle?.bench_id) === benchId)
      .sort((a, b) => parseDate(b.bundle?.generated_at) - parseDate(a.bundle?.generated_at))[0]
    if (!matchingRun || !matchingRun.report) continue
    const passport = buildCryptoManagedPassport(
      manifest,
      matchingRun.spec,
      matchingRun.report,
      str(matchingRun.bundle?.run_id),
    )
    passports.push(passport)
  }

  const probeRaw = rawRuns
    .filter(raw => str(raw.bundle?.bench_id) === "q090b_btc_4h_tsmom_neighborhood_probe")
    .sort((a, b) => parseDate(b.bundle?.generated_at) - parseDate(a.bundle?.generated_at))[0]
  if (probeRaw?.report) {
    const benchOnlyPassport = buildCryptoBenchOnlyPassport(
      probeRaw.spec,
      probeRaw.report,
      str(probeRaw.bundle?.run_id),
    )
    if (benchOnlyPassport) passports.push(benchOnlyPassport)
  }

  const plateauPrimer = buildPlateauPrimer(probeRaw?.report ?? null)
  const lifecycles = buildLifecycleEntries(passports)

  return {
    ...index,
    runs: normalizedRuns,
    passports,
    lifecycles,
    run_details: runDetails,
    leaderboard_top: pickLeaderboardTop(rawRuns),
    plateau_primer: plateauPrimer,
    runtime: {
      active_strategy: runtimeActiveStrategy,
      execution_manifest: runtimeExecutionManifest,
      session_context: runtimeSessionContext,
    },
  }
}

export async function loadBenchRunDetail(benchId: string, runId: string): Promise<JsonObject | null> {
  const raw = await readRunArtifacts(benchId, runId)
  if (!raw) return null
  const benchIndex = await loadBenchIndexWithViresContracts()
  const matchingPassport = arr<JsonObject>(benchIndex?.passports).find(passport =>
    str(passport.bench_id) === benchId && str(passport.run_id) === runId
  ) ?? null
  return {
    bundle: raw.bundle,
    spec: raw.spec,
    leaderboard: raw.leaderboard,
    report: raw.report,
    normalized_detail: normalizeRunDetail(raw),
    passport: matchingPassport,
    lifecycle: matchingPassport?.lifecycle ?? null,
    plateau_primer:
      benchId === "q090b_btc_4h_tsmom_neighborhood_probe"
        ? (benchIndex?.plateau_primer ?? null)
        : null,
  }
}

export async function loadPlateauPrimerData(): Promise<JsonObject | null> {
  const bench = await loadBenchIndexWithViresContracts()
  return isObject(bench?.plateau_primer) ? bench.plateau_primer : null
}
