import { loadCampaignsIndex } from "@/lib/vires-campaigns.server"
import { ViresCampaignsIndex } from "@/components/vires/campaigns-index"

export const metadata = {
  title: "Vires Capital — Campaigns",
}

export default async function ViresCampaignsIndexPage() {
  const data = await loadCampaignsIndex()
  return <ViresCampaignsIndex data={data} />
}
