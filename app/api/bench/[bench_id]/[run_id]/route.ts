import { promises as fs } from "fs"
import path from "path"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Reads the three working-set artifacts for one (bench_id, run_id) and merges
// them into a single response so the client gets one round trip.
//
// Note: crypto_bench_report.json is intentionally omitted — that file embeds the
// full leaderboard + era_results and runs to 170MB+ in real sweeps. When the
// candidate detail drawer needs era_results, we'll add a separate endpoint
// keyed on (bench_id, run_id, config_id) that slices the report.

async function readJson(p: string) {
  try {
    const raw = await fs.readFile(p, "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bench_id: string; run_id: string }> }
) {
  const { bench_id, run_id } = await params

  // Sanitize — these come from URL, must not escape data/bench/runs/
  if (bench_id.includes("/") || bench_id.includes("..") || run_id.includes("/") || run_id.includes("..")) {
    return NextResponse.json({ error: "Invalid bench_id or run_id" }, { status: 400 })
  }

  const dir = path.join(process.cwd(), "data/bench/runs", bench_id, run_id)

  const [bundle, spec, leaderboard] = await Promise.all([
    readJson(path.join(dir, "bench_run_bundle.json")),
    readJson(path.join(dir, "bench_spec.snapshot.json")),
    readJson(path.join(dir, "crypto_bench_leaderboard.json")),
  ])

  if (!bundle || !spec || !leaderboard) {
    return NextResponse.json(
      { error: "Run artifacts not found", bench_id, run_id },
      { status: 404 }
    )
  }

  return NextResponse.json({ bundle, spec, leaderboard })
}
