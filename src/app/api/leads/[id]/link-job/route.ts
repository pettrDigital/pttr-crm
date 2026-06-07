import { NextRequest } from 'next/server'
import { verifyAuth } from '@/lib/auth/verify-token'
import { adminDb } from '@/lib/firebase/admin'
import { query } from '@/lib/bigquery/client'

const DS = 'pttr-taskdata.ds_aroflo'

// GET: validate a jobnumber — returns job details or 404
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  await params // consume params (not used for GET, but required by Next.js)

  const jobnumber = request.nextUrl.searchParams.get('jobnumber')?.replace(/^[#jJnN\s]+/, '').trim()
  if (!jobnumber || !/^\d{4,7}$/.test(jobnumber)) {
    return Response.json({ error: 'Invalid job number' }, { status: 400 })
  }

  const rows = await query(`
    SELECT tc.jobnumber, tc.client_name, tc.task_type, tc.status, tc.job_status,
      tc.requested_date, tc.display_status, tc.customer_type,
      SAFE_CAST(tc.task_invoices_total_ex AS FLOAT64) AS job_value,
      tc.address_suburb AS suburb,
      tc.address
    FROM \`${DS}.tasks_complete\` tc
    WHERE tc.jobnumber = @jobnumber
  `, { jobnumber })

  if (!rows.length) {
    return Response.json({ error: 'Job not found' }, { status: 404 })
  }

  return Response.json(rows[0])
}

// POST: save the manual job link
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const { id: opportunityId } = await params

  const body = await request.json()
  const jobnumber = body.jobnumber?.replace(/^[#jJnN\s]+/, '').trim()
  if (!jobnumber || !/^\d{4,7}$/.test(jobnumber)) {
    return Response.json({ error: 'Invalid job number' }, { status: 400 })
  }

  // Validate exists
  const rows = await query(`
    SELECT jobnumber FROM \`${DS}.tasks_complete\` WHERE jobnumber = @jobnumber
  `, { jobnumber })
  if (!rows.length) {
    return Response.json({ error: 'Job not found' }, { status: 404 })
  }

  // Merge into existing override doc (don't overwrite classification fields)
  await adminDb.collection('crm_lead_overrides').doc(opportunityId).set({
    manual_job_number: jobnumber,
    manual_job_linked_at: new Date(),
    manual_job_linked_by: 'admin',
  }, { merge: true })

  return Response.json({ ok: true, jobnumber })
}

// DELETE: remove the manual job link
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const { id: opportunityId } = await params
  const { FieldValue } = await import('firebase-admin/firestore')

  await adminDb.collection('crm_lead_overrides').doc(opportunityId).update({
    manual_job_number: FieldValue.delete(),
    manual_job_linked_at: FieldValue.delete(),
    manual_job_linked_by: FieldValue.delete(),
  })

  return Response.json({ ok: true })
}
