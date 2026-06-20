import { describe, it, expect } from 'vitest'
import { mapCsvLeadsToOpportunities } from './wc-mapping'
import type { CsvLead, Opportunity } from './wc-mapping'

describe('mapCsvLeadsToOpportunities', () => {
  const opps: Opportunity[] = [
    { opportunity_id: 'OPP-1', wc_lead_id: 100, wc_leads: [100], phone: '+61400000001' },
    { opportunity_id: 'OPP-2', wc_lead_id: 200, wc_leads: [200, 201], phone: '+61400000002' },
    { opportunity_id: 'OPP-3', wc_lead_id: 300, wc_leads: [300], phone: '+61400000003' },
  ]

  it('matches by primary wc_lead_id', () => {
    const csv: CsvLead[] = [{ lead_id: 100, phone_e164: null }]
    const result = mapCsvLeadsToOpportunities(csv, opps)
    expect(result.leads[0]).toEqual({ csv_lead_id: 100, opp_id: 'OPP-1', match_method: 'primary' })
    expect(result.trail.primary_hits).toBe(1)
  })

  it('matches by array membership when primary does not match', () => {
    // lead_id 201 is NOT a primary wc_lead_id, but IS in OPP-2's wc_leads array
    const csv: CsvLead[] = [{ lead_id: 201, phone_e164: null }]
    const result = mapCsvLeadsToOpportunities(csv, opps)
    expect(result.leads[0]).toEqual({ csv_lead_id: 201, opp_id: 'OPP-2', match_method: 'array' })
    expect(result.trail.array_hits).toBe(1)
    expect(result.trail.primary_hits).toBe(0)
  })

  it('matches by phone when neither primary nor array match', () => {
    const csv: CsvLead[] = [{ lead_id: 999, phone_e164: '+61400000003' }]
    const result = mapCsvLeadsToOpportunities(csv, opps)
    expect(result.leads[0]).toEqual({ csv_lead_id: 999, opp_id: 'OPP-3', match_method: 'phone' })
    expect(result.trail.phone_hits).toBe(1)
  })

  it('reports unmapped when no method matches', () => {
    const csv: CsvLead[] = [{ lead_id: 888, phone_e164: '+61499999999' }]
    const result = mapCsvLeadsToOpportunities(csv, opps)
    expect(result.leads[0]).toEqual({ csv_lead_id: 888, opp_id: null, match_method: 'unmapped' })
    expect(result.trail.unmapped).toBe(1)
  })

  it('prefers primary over array', () => {
    // lead_id 200 matches BOTH primary (OPP-2) and array (OPP-2) — should be primary
    const csv: CsvLead[] = [{ lead_id: 200, phone_e164: null }]
    const result = mapCsvLeadsToOpportunities(csv, opps)
    expect(result.leads[0].match_method).toBe('primary')
  })

  it('trail totals sum correctly', () => {
    const csv: CsvLead[] = [
      { lead_id: 100, phone_e164: null },  // primary
      { lead_id: 201, phone_e164: null },  // array
      { lead_id: 999, phone_e164: '+61400000003' }, // phone
      { lead_id: 888, phone_e164: null },  // unmapped
    ]
    const result = mapCsvLeadsToOpportunities(csv, opps)
    const t = result.trail
    expect(t.primary_hits + t.array_hits + t.phone_hits + t.unmapped).toBe(t.total)
    expect(t.total).toBe(4)
  })
})
