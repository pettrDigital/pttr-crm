// Shared interaction assembly — used by UI timeline route and classifier scripts.
// Framework-agnostic: receives an injected query function, optional Firestore.

import type { QueryFn, Anchors, ResolveOpts, InteractionRow } from './types'
import { buildTouchesSQL } from './sql'

const DEFAULT_DS = 'pttr-taskdata.ds_crm'

/**
 * Resolve the anchor identities for an opportunity (phones, emails, WC IDs, job numbers).
 * When includeManualLinks=false (classifier mode), skips Firestore enrichment to avoid circularity.
 */
export async function resolveAnchors(
  queryFn: QueryFn,
  opportunityId: string,
  opts?: ResolveOpts,
): Promise<Anchors | null> {
  const ds = opts?.dataset || DEFAULT_DS

  const [opp] = await queryFn<Record<string, unknown>>(`
    SELECT matched_phones, matched_emails, wc_lead_id, opportunity_timestamp,
      CASE WHEN wc_lead_id IS NOT NULL THEN [wc_lead_id] ELSE [] END AS all_wc_lead_ids,
      all_jobnumbers
    FROM \`${ds}.opportunities\`
    WHERE opportunity_id = @opportunityId
  `, { opportunityId })

  if (!opp) return null

  const phones = (opp.matched_phones as string || '').split(',').map(p => p.trim()).filter(Boolean)
  const emails = (opp.matched_emails as string || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  const wcLeadIds: number[] = [...((opp.all_wc_lead_ids as number[]) || [])].filter(Boolean)
  let allJobnumbers = opp.all_jobnumbers as string || ''

  // Enrich from Firestore (manual links, linked_jobs) — only when includeManualLinks !== false
  if (opts?.includeManualLinks !== false && opts?.firestoreDb) {
    try {
      const overrideDoc = await opts.firestoreDb.collection('crm_lead_overrides').doc(opportunityId).get()
      if (overrideDoc.exists) {
        const data = overrideDoc.data()!
        const manualWc = data.manual_wc_lead_id
        if (manualWc != null && !wcLeadIds.includes(manualWc)) wcLeadIds.push(manualWc)
        const extraJns = [data.manual_job_number as string, ...(data.linked_jobs as string[] || [])].filter(Boolean)
        if (extraJns.length > 0) {
          const existing = new Set(allJobnumbers.split(',').map(s => s.trim()).filter(Boolean))
          for (const jn of extraJns) existing.add(jn)
          allJobnumbers = [...existing].join(',')
        }
      }
    } catch {} // non-fatal
  }

  return {
    phones,
    emails,
    wcLeadIds,
    allJobnumbers,
    oppTimestamp: String(opp.opportunity_timestamp),
    wcLeadId: wcLeadIds.length > 0 ? wcLeadIds[0] : (opp.wc_lead_id as number | null),
  }
}

/**
 * Assemble all interaction touches for an opportunity using the 8-source SQL.
 * Returns rows sorted by interaction_datetime DESC (most recent first).
 */
export async function assembleTouches(
  queryFn: QueryFn,
  anchors: Anchors,
  opts?: { dataset?: string },
): Promise<InteractionRow[]> {
  const ds = opts?.dataset || DEFAULT_DS
  const sql = buildTouchesSQL(ds)

  const rows = await queryFn<InteractionRow>(sql, {
    wcLeadIds: anchors.wcLeadIds.length > 0 ? anchors.wcLeadIds : [],
    phones: anchors.phones,
    emails: anchors.emails.length > 0 ? anchors.emails : [],
    oppTimestamp: anchors.oppTimestamp,
    allJobnumbers: anchors.allJobnumbers || '',
  }, {
    wcLeadIds: ['INT64'],
    phones: ['STRING'],
    emails: ['STRING'],
  })

  return rows
}
