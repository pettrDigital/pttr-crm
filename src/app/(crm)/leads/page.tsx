import { getLeads } from '@/lib/bigquery/queries'
import { LeadsClient } from '@/components/leads/leads-client'
import type { Lead } from '@/types/database'

export default async function LeadsPage() {
  const raw = await getLeads()
  const leads: Lead[] = JSON.parse(JSON.stringify(raw))

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
      <LeadsClient leads={leads} />
    </div>
  )
}
