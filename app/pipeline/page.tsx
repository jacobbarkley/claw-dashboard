import { PipelineFlow } from "@/components/pipeline-flow"
import { Nav } from "@/components/nav"

export default function PipelinePage() {
  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      <Nav active="pipeline" />
      <div className="flex-1 min-h-0">
        <PipelineFlow />
      </div>
    </div>
  )
}
