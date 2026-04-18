import { loadPlateauPrimerData } from "@/lib/vires-bench"
import { ViresPlateauView, type PlateauPayload } from "@/components/vires/plateau-view"

export const metadata = {
  title: "Vires Capital — Plateau Primer",
}

export default async function ViresPlateauPage() {
  const payload = (await loadPlateauPrimerData()) as PlateauPayload | null
  return <ViresPlateauView plateau={payload} />
}
