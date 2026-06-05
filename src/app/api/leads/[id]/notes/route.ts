import { NextRequest } from 'next/server'
import { verifyAuth } from '@/lib/auth/verify-token'
import { adminDb } from '@/lib/firebase/admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const { id: opportunityId } = await params

  try {
    const snap = await adminDb.collection('crm_notes')
      .where('opportunity_id', '==', opportunityId)
      .orderBy('created_at', 'desc')
      .get()
    const notes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    return Response.json(notes)
  } catch (error) {
    console.error('Notes read error:', error)
    return Response.json([])
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const { id: opportunityId } = await params

  try {
    const { note_text } = await request.json()
    if (!note_text?.trim()) {
      return Response.json({ error: 'note_text required' }, { status: 400 })
    }

    await adminDb.collection('crm_notes').add({
      opportunity_id: opportunityId,
      lead_id: null,
      account_id: null,
      note_text: note_text.trim(),
      created_by: 'admin',
      created_at: new Date(),
    })

    return Response.json({ ok: true })
  } catch (error) {
    console.error('Note save error:', error)
    return Response.json({ error: 'Failed to save note' }, { status: 500 })
  }
}
