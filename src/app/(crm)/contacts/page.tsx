import { getContacts } from '@/lib/bigquery/queries'
import { ContactsClient } from '@/components/contacts/contacts-client'
import type { Contact } from '@/types/database'

export default async function ContactsPage() {
  const raw = await getContacts()
  const contacts: Contact[] = JSON.parse(JSON.stringify(raw))

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
      <ContactsClient contacts={contacts} />
    </div>
  )
}
