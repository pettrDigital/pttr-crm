import { getAccountLocations } from '@/lib/bigquery/queries'
import { verifyAuth } from '@/lib/auth/verify-token'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const { id } = await params
  const locations = await getAccountLocations(id)
  return Response.json(locations)
}
