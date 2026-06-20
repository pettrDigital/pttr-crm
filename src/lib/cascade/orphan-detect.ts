/**
 * Orphan detection — Step 6.5 in the cascade.
 *
 * Finds conversion-orphans: leads with real AroFlo jobs that the
 * deterministic linker failed to connect. Two scans:
 *   A. Content-match: lead's full name in a job description (different
 *      client phone), 0–100 days forward AND backward.
 *   B. Phone-window: lead's phone matches a job's client phone, 31–100
 *      days forward (beyond the 30-day clustering window).
 *
 * Runs in BOTH deterministic and full modes — it's facts, not AI.
 *
 * NOTE: The orphan step's catch rate is naturally lower pre-December 2025
 * because lead-side content (transcripts, form bodies) is thinner. WC
 * transcripts started ~Nov 2025; 8x8 recordings ~April 2026. Lower catch
 * pre-Dec is expected, not a bug.
 *
 * SELECTION RULE: When multiple candidate jobs match the same lead, select
 * by ABS(date_diff) ASC — date proximity to the lead. NOT by invoiced_ex,
 * NOT by jobnumber, NOT by any monetary field. This was the June 20 bug
 * where sorting by invoice amount attributed leads to the wrong job,
 * overstating linker-miss by $7,097.
 */

export interface OrphanCandidate {
  jobnumber: string
  days_from_lead: number  // signed: positive = forward, negative = backward
  invoiced_ex: number
  match_type: 'content_match' | 'phone_window'
}

export interface OrphanResult {
  lead_id: string
  matched_jobnumber: string
  days_from_lead: number
  invoiced_ex: number
  match_type: 'content_match' | 'phone_window'
}

/**
 * Select the closest candidate by date proximity to the lead.
 * Uses ABS(days_from_lead) ASC. NOT invoiced_ex.
 *
 * Returns null if candidates is empty.
 */
export function selectClosestCandidate(
  candidates: OrphanCandidate[]
): OrphanCandidate | null {
  if (candidates.length === 0) return null

  return candidates.reduce((best, c) => {
    const bestDist = Math.abs(best.days_from_lead)
    const cDist = Math.abs(c.days_from_lead)
    if (cDist < bestDist) return c
    // Tie-break: earliest jobnumber (deterministic, not monetary)
    if (cDist === bestDist && c.jobnumber < best.jobnumber) return c
    return best
  })
}
