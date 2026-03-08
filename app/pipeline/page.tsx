import { PipelineFlow } from "@/components/pipeline-flow"
import { Nav } from "@/components/nav"

export default function PipelinePage() {
  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      <Nav active="pipeline" />
      <div className="flex-1 relative overflow-hidden">
        <PipelineFlow />
      </div>
    </div>
  )
}
