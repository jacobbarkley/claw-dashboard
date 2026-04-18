import { redirect } from "next/navigation"

// Landing route is now Vires — the daily hub. Ops (/dashboard) is still
// reachable from the top nav but is no longer the default.
export default function Home() {
  redirect("/vires")
}
