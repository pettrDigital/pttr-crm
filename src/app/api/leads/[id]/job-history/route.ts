import { getJobHistory } from '@/lib/bigquery/queries'
import { NextRequest } from 'next/server'
import { verifyAuth } from '@/lib/auth/verify-token'
import { adminDb } from '@/lib/firebase/admin'
import { query } from '@/lib/bigquery/client'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const { id } = await params

  if (!id) {
    return Response.json([])
  }

  try {
    const rows = await getJobHistory(id)

    // Check for manual job link in Firestore
    const doc = await adminDb.collection('crm_lead_overrides').doc(id).get()
    const manualJn = doc.exists ? doc.data()?.manual_job_number : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (manualJn && !rows.some((r: any) => r.jobnumber === manualJn)) {
      // Fetch the manual job and prepend it
      const manualRows = await query(`
        SELECT tc.jobnumber, tc.requested_date, td.duedate AS due_date, tc.task_type, tc.display_status,
          ji.invoiced_total_ex AS task_invoices_total_ex, tc.client_name, 'completed' AS job_source,
          COALESCE(NULLIF(tc.location, ''), NULLIF(tc.address, '')) AS job_address,
          tc.address_suburb AS job_suburb,
          td.description,
          SAFE_CAST(td.quote_totalex AS NUMERIC) AS quote_totalex,
          cf.primary_work_type,
          CAST(NULL AS STRING) AS task_notes
        FROM \`pttr-taskdata.ds_aroflo.tasks_complete\` tc
        LEFT JOIN \`pttr-taskdata.ds_aroflo.tasks_deduped\` td ON tc.jobnumber = td.jobnumber
        LEFT JOIN \`pttr-taskdata.ds_aroflo.vw_job_invoiced\` ji ON tc.jobnumber = ji.jobnumber
        LEFT JOIN \`pttr-taskdata.ds_aroflo.task_customfields_deduped\` cf ON tc.jobnumber = cf.jobnumber
        WHERE tc.jobnumber = @jobnumber
      `, { jobnumber: manualJn })

      if (manualRows.length > 0) {
        // Mark as manually linked
        const manualJob = { ...manualRows[0] as Record<string, unknown>, manual_link: true }
        return Response.json([manualJob, ...rows])
      }
    }

    // Merge job value overrides from Firestore
    const allRows = rows as Record<string, unknown>[]
    const jobNumbers = [...new Set(allRows.map(r => r.jobnumber as string).filter(Boolean))]
    if (jobNumbers.length > 0) {
      const refs = jobNumbers.map(jn => adminDb.collection('crm_job_value_overrides').doc(jn))
      const docs = await adminDb.getAll(...refs)
      for (const doc of docs) {
        if (doc.exists) {
          const override = doc.data()!.job_value_override as number
          const row = allRows.find(r => r.jobnumber === doc.id)
          if (row) row.task_invoices_total_ex = override
        }
      }
    }

    return Response.json(allRows)
  } catch (error) {
    console.error('Job history error:', error)
    return Response.json([])
  }
}
