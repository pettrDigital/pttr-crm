import { getLeads } from '@/lib/bigquery/queries'
import { verifyAuth } from '@/lib/auth/verify-token'
import { adminDb } from '@/lib/firebase/admin'
import { query } from '@/lib/bigquery/client'

export async function GET(request: Request) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const leads = await getLeads()

  // Batch-fetch overrides for all opportunity_ids on this page
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = (leads as any[]).map((l) => l.lead_id as string).filter(Boolean)

  if (ids.length === 0) return Response.json(leads)

  // Firestore getAll supports up to 500 doc refs per call
  const overrideMap: Record<string, Record<string, unknown>> = {}
  const batchSize = 500
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)
    const refs = batch.map(id => adminDb.collection('crm_lead_overrides').doc(id))
    const docs = await adminDb.getAll(...refs)
    for (const doc of docs) {
      if (doc.exists) {
        overrideMap[doc.id] = doc.data()!
      }
    }
  }

  // Auto-classify after-hours gap calls (<20s) that have no override yet.
  // These have no content at any source — nothing to review. Write to Firestore
  // so they clear needs-review. ≥20s gap calls stay unclassified (needs-review)
  // as an answering-service performance signal.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoClassifyBatch: { id: string; data: Record<string, unknown> }[] = []
  for (const lead of leads as any[]) {
    if (
      lead.is_after_hours_gap &&
      !lead.captured &&
      !overrideMap[lead.lead_id as string]
    ) {
      const data = {
        opportunity_id: lead.lead_id,
        stage: 'Not Captured',
        sub_status: 'Dropped Call',
        loss_reason: null,
        note: 'Auto-classified: after-hours gap call <20s, no content at any source',
        exclude_from_analysis: false,
        updated_by: 'auto_rule:ah_gap_short',
        updated_at: new Date(),
      }
      autoClassifyBatch.push({ id: lead.lead_id as string, data })
      overrideMap[lead.lead_id as string] = data
    }
  }
  // Fire-and-forget batch write (don't block response)
  if (autoClassifyBatch.length > 0) {
    const batch = adminDb.batch()
    for (const { id, data } of autoClassifyBatch) {
      batch.set(adminDb.collection('crm_lead_overrides').doc(id), data)
    }
    batch.commit().catch(err => console.error('Auto-classify batch write failed:', err))
  }

  // Resolve manual job links: batch-fetch job details for any overrides with manual_job_number
  const manualJobNumbers = [...new Set(
    Object.values(overrideMap)
      .map(ov => ov.manual_job_number as string)
      .filter(Boolean)
  )]
  const manualJobMap: Record<string, Record<string, unknown>> = {}
  if (manualJobNumbers.length > 0) {
    const jobRows = await query(`
      SELECT jobnumber, client_name, task_type, status, job_status, display_status,
        SAFE_CAST(task_invoices_total_ex AS FLOAT64) AS job_value, customer_type
      FROM \`pttr-taskdata.ds_aroflo.tasks_complete\`
      WHERE jobnumber IN UNNEST(@jobnumbers)
    `, { jobnumbers: manualJobNumbers })
    for (const row of jobRows) {
      manualJobMap[(row as Record<string, unknown>).jobnumber as string] = row as Record<string, unknown>
    }
  }

  // Merge: override wins for stage/sub_status UNLESS objective facts override.
  // Objective auto-classify beats "Unable to Classify": if BQ says Booked/Completed,
  // the human verdict doesn't hold — the lead auto-flips and exclude_from_analysis clears.
  // Manual job links promote the opportunity to Booked/Completed with job value.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged = (leads as any[]).map((lead) => {
    const ov = overrideMap[lead.lead_id as string]
    if (!ov) return { ...lead, is_overridden: false, exclude_from_analysis: false }

    // Manual job link: promote opportunity
    const manualJn = ov.manual_job_number as string | undefined
    const manualJob = manualJn ? manualJobMap[manualJn] : null
    let jobOverrides = {}
    if (manualJob && !lead.all_jobnumbers) {
      const isCompleted = manualJob.status === 'Archived'
        && manualJob.job_status === 'Completed'
        && (manualJob.job_value as number) > 0
      jobOverrides = {
        booking_status: 'Booked',
        completed: isCompleted || lead.completed,
        job_value: (manualJob.job_value as number) || lead.job_value,
        all_jobnumbers: manualJn,
        job_count: 1,
        funnel_stage: isCompleted ? 'Paid Job' : 'Booked',
        manual_job_number: manualJn,
      }
    } else if (manualJn) {
      // Job already auto-linked — just pass through the manual_job_number for the UI
      jobOverrides = { manual_job_number: manualJn }
    }

    // Profile override
    const profileOverride = ov.profile_override as string | undefined
    const profileFields = profileOverride ? {
      profile: profileOverride === 'PTTR' ? 'Plumber to the Rescue' : profileOverride === 'ETTR' ? 'Electrician to the Rescue' : lead.profile,
      service: profileOverride || lead.service,
      profile_override: profileOverride,
    } : {}

    // Pending metadata
    const pendingFields = ov.pending_since ? {
      pending_since: typeof ov.pending_since === 'object' && '_seconds' in (ov.pending_since as object)
        ? new Date((ov.pending_since as { _seconds: number })._seconds * 1000).toISOString()
        : String(ov.pending_since),
    } : {}

    // Auto-translate "CSR Failure" on read (catches legacy values not yet migrated)
    let subStatus = ov.sub_status as string
    let lossReason = ov.loss_reason as string | null
    let requiresCsrReview = ov.requires_csr_review as boolean || false
    if (subStatus === 'CSR Failure' || lossReason === 'CSR Failure') {
      subStatus = subStatus === 'CSR Failure' ? 'Lost / Unresponsive' : subStatus
      lossReason = lossReason === 'CSR Failure' ? 'Lost / Unresponsive' : lossReason
      requiresCsrReview = true
    }

    // Objective facts win: if BQ says Booked or Paid Job, ignore the classification override
    const objectiveWins = lead.booking_status === 'Booked' || lead.completed === true
    if (objectiveWins && (subStatus === 'Unable to Classify' || subStatus === 'Pending')) {
      return { ...lead, ...jobOverrides, ...profileFields, is_overridden: false, exclude_from_analysis: false }
    }

    return {
      ...lead,
      ...jobOverrides,
      ...profileFields,
      ...pendingFields,
      funnel_stage: (jobOverrides as Record<string, unknown>).funnel_stage || ov.stage as string || lead.funnel_stage,
      sub_status: subStatus,
      loss_reason: lossReason || null,
      is_overridden: true,
      exclude_from_analysis: ov.exclude_from_analysis || false,
      requires_csr_review: requiresCsrReview,
    }
  })

  return Response.json(merged)
}
