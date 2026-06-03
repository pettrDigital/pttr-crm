import { getLeadDetail } from '@/lib/bigquery/queries'
import { verifyAuth } from '@/lib/auth/verify-token'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const { id } = await params
  try {
    const rows = await getLeadDetail(id)
    const data = JSON.parse(JSON.stringify(rows))
    return Response.json(data)
  } catch (error) {
    console.error('Lead detail error:', error)
    return Response.json([])
  }
}
