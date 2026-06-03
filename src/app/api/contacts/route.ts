import { getContacts } from '@/lib/bigquery/queries'
import { verifyAuth } from '@/lib/auth/verify-token'

export async function GET(request: Request) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const contacts = await getContacts()
  return Response.json(contacts)
}
