/**
 * CSV→opportunity mapping — 3-way join (S15.5).
 *
 * Three methods in priority order:
 *   1. Primary wc_lead_id match
 *   2. wc_leads array membership
 *   3. Phone E.164 fallback
 * Dedup to one opp per CSV lead. Priority 1 > 2 > 3.
 *
 * Every consumer that needs CSV→opp mapping imports this function.
 * No inline reimplementations.
 */

export type MatchMethod = 'primary' | 'array' | 'phone' | 'unmapped'

export interface MappedLead {
  csv_lead_id: number
  opp_id: string | null
  match_method: MatchMethod
}

export interface MappingTrail {
  primary_hits: number
  array_hits: number
  phone_hits: number
  unmapped: number
  total: number
}

export interface MappingResult {
  leads: MappedLead[]
  trail: MappingTrail
}

export interface CsvLead {
  lead_id: number
  phone_e164: string | null
}

export interface Opportunity {
  opportunity_id: string
  wc_lead_id: number | null
  wc_leads: number[]     // array of all WC lead IDs in the cluster
  phone: string | null   // E.164 normalised
}

/**
 * Map CSV leads to opportunities using the 3-way join.
 * Returns one MappedLead per CSV lead (deduped, priority-ordered).
 */
export function mapCsvLeadsToOpportunities(
  csvLeads: CsvLead[],
  opportunities: Opportunity[]
): MappingResult {
  // Build indexes
  const byPrimaryWcId = new Map<number, string>()
  const byArrayWcId = new Map<number, string>()
  const byPhone = new Map<string, string>()

  for (const opp of opportunities) {
    // Index 1: primary wc_lead_id
    if (opp.wc_lead_id != null) {
      byPrimaryWcId.set(opp.wc_lead_id, opp.opportunity_id)
    }
    // Index 2: wc_leads array
    if (opp.wc_leads) {
      for (const wid of opp.wc_leads) {
        if (!byArrayWcId.has(wid)) {
          byArrayWcId.set(wid, opp.opportunity_id)
        }
      }
    }
    // Index 3: phone
    if (opp.phone) {
      if (!byPhone.has(opp.phone)) {
        byPhone.set(opp.phone, opp.opportunity_id)
      }
    }
  }

  const trail: MappingTrail = {
    primary_hits: 0, array_hits: 0, phone_hits: 0, unmapped: 0, total: csvLeads.length,
  }

  const leads: MappedLead[] = csvLeads.map(csv => {
    // Priority 1: primary wc_lead_id
    const primary = byPrimaryWcId.get(csv.lead_id)
    if (primary) {
      trail.primary_hits++
      return { csv_lead_id: csv.lead_id, opp_id: primary, match_method: 'primary' as const }
    }

    // Priority 2: array membership
    const array = byArrayWcId.get(csv.lead_id)
    if (array) {
      trail.array_hits++
      return { csv_lead_id: csv.lead_id, opp_id: array, match_method: 'array' as const }
    }

    // Priority 3: phone fallback
    if (csv.phone_e164) {
      const phone = byPhone.get(csv.phone_e164)
      if (phone) {
        trail.phone_hits++
        return { csv_lead_id: csv.lead_id, opp_id: phone, match_method: 'phone' as const }
      }
    }

    trail.unmapped++
    return { csv_lead_id: csv.lead_id, opp_id: null, match_method: 'unmapped' as const }
  })

  return { leads, trail }
}
