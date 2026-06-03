import { getJobHistory } from '@/lib/bigquery/queries'
import { NextRequest } from 'next/server'
import { verifyAuth } from '@/lib/auth/verify-token'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  await params
  const { searchParams } = request.nextUrl
  const phone = searchParams.get('phone') || ''
  const email = searchParams.get('email') || ''

  if (!phone && !email) {
    return Response.json([])
  }

  try {
    const rows = await getJobHistory(phone, email)
    return Response.json(rows)
  } catch (error) {
    console.error('Job history error:', error)
    return Response.json([])
  }
}
