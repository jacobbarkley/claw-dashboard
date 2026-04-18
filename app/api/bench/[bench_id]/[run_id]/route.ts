import { NextResponse } from "next/server"
import { loadBenchRunDetail } from "@/lib/vires-bench"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bench_id: string; run_id: string }> },
) {
  const { bench_id, run_id } = await params

  if (bench_id.includes("/") || bench_id.includes("..") || run_id.includes("/") || run_id.includes("..")) {
    return NextResponse.json({ error: "Invalid bench_id or run_id" }, { status: 400 })
  }

  const detail = await loadBenchRunDetail(bench_id, run_id)
  if (!detail) {
    return NextResponse.json(
      { error: "Run artifacts not found", bench_id, run_id },
      { status: 404 },
    )
  }

  return NextResponse.json(detail, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  })
}
