'use client'

import { useState } from 'react'
import { LeadsTable } from './leads-table'
import { LeadDetailModal } from './lead-detail-modal'
import type { Lead } from '@/types/database'

export function LeadsClient({ leads }: { leads: Lead[] }) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  return (
    <>
      <LeadsTable leads={leads} onViewLead={setSelectedLead} />
      <LeadDetailModal
        lead={selectedLead}
        open={!!selectedLead}
        onOpenChange={(open) => { if (!open) setSelectedLead(null) }}
      />
    </>
  )
}
