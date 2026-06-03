'use client'

import { useState } from 'react'
import { ContactsTable } from './contacts-table'
import { ContactDetailSheet } from './contact-detail-sheet'
import type { Contact } from '@/types/database'

export function ContactsClient({ contacts }: { contacts: Contact[] }) {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)

  return (
    <>
      <ContactsTable contacts={contacts} onSelectContact={setSelectedContact} />
      <ContactDetailSheet
        contact={selectedContact}
        open={!!selectedContact}
        onOpenChange={(open) => { if (!open) setSelectedContact(null) }}
      />
    </>
  )
}
