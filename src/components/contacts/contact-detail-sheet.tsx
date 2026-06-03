'use client'

import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPhone, formatCurrency, formatDate } from '@/lib/format'
import type { Contact, LeadInteraction } from '@/types/database'

interface ContactDetailSheetProps {
  contact: Contact | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ContactDetailSheet({ contact, open, onOpenChange }: ContactDetailSheetProps) {
  const [timeline, setTimeline] = useState<LeadInteraction[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!contact || !open) {
      setTimeline([])
      return
    }

    async function fetchTimeline() {
      setLoading(true)
      const res = await fetch(`/api/contacts/${contact!.contact_id}/timeline`)
      const data = await res.json()
      setTimeline(data)
      setLoading(false)
    }

    fetchTimeline()
  }, [contact, open])

  if (!contact) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{contact.contact_name}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4 px-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Phone:</span> {formatPhone(contact.phone)}</div>
            <div><span className="text-muted-foreground">Mobile:</span> {formatPhone(contact.mobile)}</div>
            <div className="col-span-2"><span className="text-muted-foreground">Email:</span> {contact.email || '—'}</div>
            <div><span className="text-muted-foreground">Suburb:</span> {contact.suburb || '—'}</div>
            <div><span className="text-muted-foreground">Account:</span> {contact.account_name || '—'}</div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md border p-2">
              <div className="text-xs text-muted-foreground">Jobs L12M</div>
              <div className="text-lg font-semibold">{contact.jobs_l12m}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-xs text-muted-foreground">Revenue L12M</div>
              <div className="text-lg font-semibold">{formatCurrency(contact.revenue_l12m)}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-xs text-muted-foreground">Open Jobs</div>
              <div className="text-lg font-semibold">{contact.open_jobs}</div>
            </div>
          </div>

          <Separator />

          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Timeline
            </h3>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">No timeline events.</p>
            ) : (
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-2 py-1.5 text-left font-medium">Date</th>
                      <th className="px-2 py-1.5 text-left font-medium">Type</th>
                      <th className="px-2 py-1.5 text-left font-medium">Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeline.map((event, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {formatDate(event.interaction_date)}
                        </td>
                        <td className="px-2 py-1.5">{event.interaction_type}</td>
                        <td className="px-2 py-1.5">{event.interaction_summary || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
