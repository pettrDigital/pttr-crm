import { getAccounts } from '@/lib/bigquery/queries'
import { AccountsClient } from '@/components/accounts/accounts-client'
import type { Account } from '@/types/database'

export default async function AccountsPage() {
  const raw = await getAccounts()
  const accounts: Account[] = JSON.parse(JSON.stringify(raw))

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
      <AccountsClient accounts={accounts} />
    </div>
  )
}
