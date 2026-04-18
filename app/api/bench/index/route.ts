import { promises as fs } from "fs"
import path from "path"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Reads data/bench/index.json plus the auxiliary artifacts the bench dashboard
// renders alongside it (comparisons, full execution manifests, runtime
// artifacts). Mirrors the server-side loader in app/bench/page.tsx so the
// in-app refresh button surfaces the same data the initial render does.
async function readJson(filename: string) {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), filename), "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function readBenchIndex() {
  const index = await readJson("data/bench/index.json")
  if (!index) return null

  const comparisons: unknown[] = []
  try {
    const compDir = path.join(process.cwd(), "data/bench/comparisons")
    const files = await fs.readdir(compDir)
    for (const f of files.filter(f => f.endsWith(".json"))) {
      const data = await readJson(`data/bench/comparisons/${f}`)
      if (data) comparisons.push(data)
    }
  } catch { /* no comparisons dir */ }

  const manifests: unknown[] = []
  try {
    const manifestsDir = path.join(process.cwd(), "data/bench/manifests")
    const files = await fs.readdir(manifestsDir)
    for (const f of files.filter(f => f.endsWith(".execution_manifest.json"))) {
      const data = await readJson(`data/bench/manifests/${f}`)
      if (data) manifests.push(data)
    }
  } catch { /* no manifests dir */ }

  const runtimeActiveStrategy = await readJson("data/bench/runtime/active_strategy.json")
  const runtimeExecutionManifest = await readJson("data/bench/runtime/execution_manifest.json")
  const runtimeSessionContext = await readJson("data/bench/runtime/session_context.json")

  return {
    ...index,
    comparisons,
    manifests,
    runtime: {
      active_strategy: runtimeActiveStrategy,
      execution_manifest: runtimeExecutionManifest,
      session_context: runtimeSessionContext,
    },
  }
}

export async function GET() {
  const index = await readBenchIndex()
  if (!index) {
    return NextResponse.json(
      { error: "No bench index — run scripts/pull-bench-data.py or wait for Codex publication" },
      { status: 404 }
    )
  }
  return NextResponse.json(index)
}
