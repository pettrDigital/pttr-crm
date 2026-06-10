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
      COALESCE(ji.invoiced_total_ex, 0) AS job_value,
      tc.address_suburb AS suburb,
      tc.address,
      cf.primary_work_type
    FROM \`${DS}.tasks_complete\` tc
    LEFT JOIN \`pttr-taskdata.ds_aroflo.vw_job_invoiced\` ji ON tc.jobnumber = ji.jobnumber
    LEFT JOIN \`pttr-taskdata.ds_aroflo.task_customfields_deduped\` cf ON tc.jobnumber = cf.jobnumber
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

  // Validate exists and fetch account info
  const rows = await query(`
    SELECT tc.jobnumber, tc.customer_type, tc.client_name, td.client_clientid
    FROM \`${DS}.tasks_complete\` tc
    LEFT JOIN \`pttr-taskdata.ds_aroflo.tasks_deduped\` td ON tc.jobnumber = td.jobnumber
    WHERE tc.jobnumber = @jobnumber
  `, { jobnumber })
  if (!rows.length) {
    return Response.json({ error: 'Job not found' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job = rows[0] as any

  // Merge into existing override doc (don't overwrite classification fields)
  const overrideData: Record<string, unknown> = {
    manual_job_number: jobnumber,
    manual_job_linked_at: new Date(),
    manual_job_linked_by: 'admin',
  }

  // Auto-flag as Account when linked job is account-type
  if (job.customer_type === 'Account') {
    overrideData.is_account = true
    overrideData.account_id = job.client_clientid || null
    overrideData.account_name = job.client_name || null
    overrideData.exclude_from_analysis = true
    overrideData.account_flagged_by = 'auto:job_link'
    overrideData.account_flagged_at = new Date()
  }

  await adminDb.collection('crm_lead_overrides').doc(opportunityId).set(
    overrideData, { merge: true }
  )

  return Response.json({ ok: true, jobnumber, is_account: job.customer_type === 'Account' })
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
