import { NextRequest } from 'next/server'
import { verifyAuth } from '@/lib/auth/verify-token'
import { adminDb } from '@/lib/firebase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const { id: opportunityId } = await params

  try {
    const body = await request.json()
    const { stage, sub_status, loss_reason, note } = body

    if (!stage || !sub_status) {
      return Response.json({ error: 'stage and sub_status required' }, { status: 400 })
    }

    await adminDb.collection('crm_lead_overrides').doc(opportunityId).set({
      opportunity_id: opportunityId,
      stage,
      sub_status,
      loss_reason: loss_reason || null,
      note: note || null,
      updated_by: 'admin',
      updated_at: new Date(),
    })

    return Response.json({ ok: true })
  } catch (error) {
    console.error('Classification error:', error)
    return Response.json({ error: 'Failed to save classification' }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const { id: opportunityId } = await params

  try {
    const doc = await adminDb.collection('crm_lead_overrides').doc(opportunityId).get()
    if (!doc.exists) return Response.json(null)
    return Response.json(doc.data())
  } catch (error) {
    console.error('Classification read error:', error)
    return Response.json(null)
  }
}
