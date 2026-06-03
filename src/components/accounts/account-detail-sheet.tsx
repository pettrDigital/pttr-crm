'use client'

import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ClientCategoryBadge } from '@/components/shared/status-badge'
import { addAccountNote } from '@/lib/firebase/firestore'
import { formatPhone, formatCurrency, formatDate } from '@/lib/format'
import { authFetch } from '@/lib/auth/auth-fetch'
import type { Account, Location } from '@/types/database'

interface AccountDetailSheetProps {
  account: Account | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AccountDetailSheet({ account, open, onOpenChange }: AccountDetailSheetProps) {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!account || !open) {
      setLocations([])
      return
    }

    async function fetchDetails() {
      setLoading(true)
      const res = await authFetch(`/api/accounts/${account!.account_id}/locations`)
      const data = await res.json()
      setLocations(data)
      setLoading(false)
    }

    fetchDetails()
  }, [account, open])

  if (!account) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[520px] overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            {account.account_name}
            <ClientCategoryBadge category={account.client_category} />
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4 px-4">
          {/* Header info */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Rank:</span> #{account.rank}</div>
            <div><span className="text-muted-foreground">ABN:</span> {account.abn || '—'}</div>
            <div><span className="text-muted-foreground">Phone:</span> {formatPhone(account.phone)}</div>
            <div><span className="text-muted-foreground">Fax:</span> {formatPhone(account.fax)}</div>
            <div className="col-span-2"><span className="text-muted-foreground">Email:</span> {account.email || '—'}</div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Address:</span>{' '}
              {[account.address_addressline1, account.address_addressline2, account.address_suburb, account.address_state, account.address_postcode].filter(Boolean).join(', ') || '—'}
            </div>
            <div><span className="text-muted-foreground">Client since:</span> {formatDate(account.datecreated)}</div>
          </div>

          <Separator />

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Contacts', value: account.contacts_count },
              { label: 'Locations', value: account.locations_count },
              { label: 'Open Jobs', value: account.open_jobs },
              { label: 'Total Jobs', value: account.total_jobs },
              { label: 'Revenue L12M', value: formatCurrency(account.revenue_l12m) },
              { label: 'Total Revenue', value: formatCurrency(account.total_revenue) },
            ].map((stat) => (
              <div key={stat.label} className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">{stat.label}</div>
                <div className="text-lg font-semibold">{stat.value}</div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Tabs */}
          <Tabs defaultValue="locations">
            <TabsList>
              <TabsTrigger value="locations">Locations</TabsTrigger>
            </TabsList>
            <TabsContent value="locations">
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : locations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No locations.</p>
              ) : (
                <div className="rounded-md border mt-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-2 py-1.5 text-left font-medium">Rank</th>
                        <th className="px-2 py-1.5 text-left font-medium">Location</th>
                        <th className="px-2 py-1.5 text-left font-medium">Contact</th>
                        <th className="px-2 py-1.5 text-left font-medium">Phone</th>
                        <th className="px-2 py-1.5 text-right font-medium">Jobs</th>
                        <th className="px-2 py-1.5 text-right font-medium">Revenue</th>
                        <th className="px-2 py-1.5 text-right font-medium">Open</th>
                        <th className="px-2 py-1.5 text-left font-medium">Last Job</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locations.map((loc) => (
                        <tr key={loc.location_id} className="border-b last:border-0">
                          <td className="px-2 py-1.5">{loc.location_rank}</td>
                          <td className="px-2 py-1.5">{loc.full_address || loc.location_name}</td>
                          <td className="px-2 py-1.5">{loc.site_contact || '—'}</td>
                          <td className="px-2 py-1.5">{formatPhone(loc.site_phone)}</td>
                          <td className="px-2 py-1.5 text-right">{loc.jobs_total}</td>
                          <td className="px-2 py-1.5 text-right">{formatCurrency(loc.revenue_total)}</td>
                          <td className="px-2 py-1.5 text-right">{loc.open_jobs}</td>
                          <td className="px-2 py-1.5">
                            {formatDate(loc.last_job_date)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Notes */}
          {account.notes && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</h3>
                <p className="text-sm whitespace-pre-wrap">{account.notes}</p>
              </section>
            </>
          )}

          {/* Add note */}
          <Separator />
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Add Note</h3>
            <div className="flex gap-2">
              <Textarea
                placeholder="Write a note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="flex-1"
                rows={2}
              />
              <Button
                size="sm"
                disabled={!noteText.trim() || saving}
                onClick={async () => {
                  setSaving(true)
                  await addAccountNote(account.account_id, noteText.trim(), 'admin')
                  setNoteText('')
                  setSaving(false)
                }}
              >
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
