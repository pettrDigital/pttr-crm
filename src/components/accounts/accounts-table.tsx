'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/shared/data-table'
import { ClientCategoryBadge } from '@/components/shared/status-badge'
import { Input } from '@/components/ui/input'
import { useState, useMemo } from 'react'
import { formatPhone, formatCurrency, formatDate } from '@/lib/format'
import type { Account } from '@/types/database'

const columns: ColumnDef<Account, unknown>[] = [
  { accessorKey: 'rank', header: 'Rank', cell: ({ row }) => row.original.rank ?? '—' },
  { accessorKey: 'account_name', header: 'Account name' },
  { accessorKey: 'phone', header: 'Phone', cell: ({ row }) => formatPhone(row.original.phone) },
  { accessorKey: 'email', header: 'Email', cell: ({ row }) => row.original.email ?? '—' },
  { accessorKey: 'locations_count', header: 'Locations' },
  { accessorKey: 'open_jobs', header: 'Open jobs' },
  { accessorKey: 'jobs_l12m', header: 'Jobs L12M' },
  { accessorKey: 'revenue_l12m', header: 'Revenue L12M', cell: ({ row }) => formatCurrency(row.original.revenue_l12m) },
  { accessorKey: 'total_jobs', header: 'Total Jobs' },
  { accessorKey: 'total_revenue', header: 'Total Revenue', cell: ({ row }) => formatCurrency(row.original.total_revenue) },
  {
    accessorKey: 'last_activity',
    header: 'Last activity',
    cell: ({ row }) => formatDate(row.original.last_activity),
  },
]

interface AccountsTableProps {
  accounts: Account[]
  onSelectAccount: (account: Account) => void
}

export function AccountsTable({ accounts, onSelectAccount }: AccountsTableProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return accounts
    const term = search.toLowerCase()
    return accounts.filter((a) =>
      a.account_name?.toLowerCase().includes(term) ||
      a.address_suburb?.toLowerCase().includes(term) ||
      a.phone?.includes(term)
    )
  }, [accounts, search])

  const filterControls = (
    <div className="flex items-center gap-4">
      <Input
        placeholder="Search accounts..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
    </div>
  )

  return (
    <DataTable
      columns={columns}
      data={filtered}
      onRowClick={onSelectAccount}
      filterControls={filterControls}
    />
  )
}
