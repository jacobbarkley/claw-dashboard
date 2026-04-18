import { loadBenchRunDetail } from "@/lib/vires-bench"
import { ViresRunDetailView, type RunDetail } from "@/components/vires/run-detail-view"

export const metadata = {
  title: "Vires Capital — Bench Run",
}

export default async function RunDetailPage({ params }: { params: Promise<{ bench_id: string; run_id: string }> }) {
  const { bench_id, run_id } = await params
  const benchId = decodeURIComponent(bench_id)
  const runId = decodeURIComponent(run_id)

  if (benchId.includes("/") || benchId.includes("..") || runId.includes("/") || runId.includes("..")) {
    return <ViresRunDetailView detail={null} />
  }

  const detail = (await loadBenchRunDetail(benchId, runId)) as RunDetail | null
  return <ViresRunDetailView detail={detail} />
}
