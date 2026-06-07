import { NextRequest } from 'next/server'
import { verifyAuth } from '@/lib/auth/verify-token'
import { adminDb } from '@/lib/firebase/admin'

// One-time migration: CSR Failure → Lost / Unresponsive + requires_csr_review
// GET to preview, POST to execute
export async function GET(request: NextRequest) {
  try { await verifyAuth(request) } catch (e) { return e as Response }

  const snapshot = await adminDb.collection('crm_lead_overrides')
    .where('sub_status', '==', 'CSR Failure')
    .get()

  const snapshot2 = await adminDb.collection('crm_lead_overrides')
    .where('loss_reason', '==', 'CSR Failure')
    .get()

  // Dedupe by doc ID
  const docs = new Map<string, FirebaseFirestore.DocumentSnapshot>()
  for (const doc of [...snapshot.docs, ...snapshot2.docs]) {
    docs.set(doc.id, doc)
  }

  const results = Array.from(docs.values()).map(doc => ({
    opportunity_id: doc.id,
    sub_status: doc.data()?.sub_status,
    loss_reason: doc.data()?.loss_reason,
  }))

  return Response.json({ count: results.length, preview: results })
}

export async function POST(request: NextRequest) {
  try { await verifyAuth(request) } catch (e) { return e as Response }

  const snapshot = await adminDb.collection('crm_lead_overrides')
    .where('sub_status', '==', 'CSR Failure')
    .get()

  const snapshot2 = await adminDb.collection('crm_lead_overrides')
    .where('loss_reason', '==', 'CSR Failure')
    .get()

  const docs = new Map<string, FirebaseFirestore.DocumentSnapshot>()
  for (const doc of [...snapshot.docs, ...snapshot2.docs]) {
    docs.set(doc.id, doc)
  }

  let migrated = 0
  const batch = adminDb.batch()

  for (const [id, doc] of docs) {
    const data = doc.data() || {}
    const updates: Record<string, unknown> = {
      requires_csr_review: true,
      migrated_from_csr_failure: true,
      migrated_at: new Date(),
      original_sub_status: data.sub_status,
      original_loss_reason: data.loss_reason,
    }

    if (data.sub_status === 'CSR Failure') {
      updates.sub_status = 'Lost / Unresponsive'
    }
    if (data.loss_reason === 'CSR Failure') {
      updates.loss_reason = 'Lost / Unresponsive'
    }

    batch.update(adminDb.collection('crm_lead_overrides').doc(id), updates)
    migrated++
  }

  if (migrated > 0) {
    await batch.commit()
  }

  return Response.json({ migrated, message: `Migrated ${migrated} leads from CSR Failure` })
}
