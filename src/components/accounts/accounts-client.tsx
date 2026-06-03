'use client'

import { useState } from 'react'
import { AccountsTable } from './accounts-table'
import { AccountDetailSheet } from './account-detail-sheet'
import type { Account } from '@/types/database'

export function AccountsClient({ accounts }: { accounts: Account[] }) {
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)

  return (
    <>
      <AccountsTable accounts={accounts} onSelectAccount={setSelectedAccount} />
      <AccountDetailSheet
        account={selectedAccount}
        open={!!selectedAccount}
        onOpenChange={(open) => { if (!open) setSelectedAccount(null) }}
      />
    </>
  )
}
