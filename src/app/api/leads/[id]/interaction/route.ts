import { getCallDetail, getEmailDetail } from '@/lib/bigquery/queries'
import { NextRequest } from 'next/server'
import { verifyAuth } from '@/lib/auth/verify-token'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const { id } = await params
  const { searchParams } = request.nextUrl
  const type = searchParams.get('type')
  const datetime = searchParams.get('datetime')

  if (!type || !datetime) {
    return Response.json(
      { error: 'Missing required query params: type, datetime' },
      { status: 400 }
    )
  }

  if (type !== 'call' && type !== 'email') {
    return Response.json(
      { error: 'type must be "call" or "email"' },
      { status: 400 }
    )
  }

  const leadId = Number(id)
  if (isNaN(leadId)) {
    return Response.json({ error: 'Invalid lead ID' }, { status: 400 })
  }

  console.log(`[interaction] lead_id=${leadId} type=${type} datetime=${datetime}`)

  try {
    const rows = type === 'call'
      ? await getCallDetail(leadId, datetime)
      : await getEmailDetail(leadId, datetime)

    const data = rows.length > 0
      ? JSON.parse(JSON.stringify(rows[0]))
      : null

    return Response.json(data)
  } catch (error) {
    console.error('Interaction detail error:', error)
    return Response.json({ error: 'Failed to fetch interaction detail' }, { status: 500 })
  }
}
