import { loadBenchIndexWithViresContracts } from "@/lib/vires-bench"
import { ViresPassportView, type Passport } from "@/components/vires/passport-view"

export const metadata = {
  title: "Vires Capital — Strategy Passport",
}

// Lookup a passport by the id Codex's bench index assigns
// (buildStockPassport / buildCryptoManagedPassport return a stable id
// derived from strategy_id or manifest_id).
async function findPassport(id: string): Promise<Passport | null> {
  const index = await loadBenchIndexWithViresContracts()
  if (!index || !Array.isArray(index.passports)) return null
  const passports = index.passports as Passport[]
  return passports.find(p => p.id === id) ?? null
}

export default async function PassportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const passport = await findPassport(decodeURIComponent(id))
  return <ViresPassportView passport={passport} />
}
