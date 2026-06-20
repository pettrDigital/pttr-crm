import { describe, it, expect } from 'vitest'
import { validateT72Rationale, validateT71Rationale } from './rationale'

const validT72 = {
  lead_id: '12345',
  gate_stage: 'NQ/NB' as const,
  allowed_set: ['Spam', 'Service Not Provided', 'No Follow-Up Recorded'],
  pre_pass: {
    has_outbound: false,
    has_internal_touch: false,
    cu_excluded: true,
    njr_excluded: true,
  },
  timeline_summary: 'Single inbound call, 45s, after hours. No outbound follow-up visible.',
  decisive_signals: ['No trackable outbound', 'After-hours OHQ handoff'],
  chosen: 'No Follow-Up Recorded',
  confidence: 0.85,
  rejected_alternatives: [
    { leaf: 'Customer Unresponsive', reason: 'CU excluded by pre-pass (no outbound)' },
  ],
  reasoning: 'After-hours call with OHQ handoff. No visible outbound follow-up in the timeline. CU excluded by pre-pass. NFUR is the data-state disposition.',
}

const validT71 = {
  lead_id: '67890',
  candidate_count: 3,
  candidates_considered: [
    { jobnumber: '141144', client: 'Liz Manfredini', days_from_lead: 31, signals_matched: ['phone_match', 'name_match'] },
    { jobnumber: '141200', client: 'L Manfredini', days_from_lead: 45, signals_matched: ['suburb_match'] },
  ],
  chosen_jobnumber: '141144',
  confidence: 0.92,
  match_signals: ['phone_match', 'name_match', 'problem_match'],
  reasoning: 'Phone match + name match + problem description aligns. Closest candidate at 31 days forward.',
}

describe('validateT72Rationale', () => {
  it('accepts a valid rationale', () => {
    expect(() => validateT72Rationale(validT72)).not.toThrow()
  })

  it('returns the validated object', () => {
    const result = validateT72Rationale(validT72)
    expect(result.chosen).toBe('No Follow-Up Recorded')
  })

  it('rejects null', () => {
    expect(() => validateT72Rationale(null)).toThrow('not an object')
  })

  it('rejects missing required field', () => {
    const { chosen, ...rest } = validT72
    expect(() => validateT72Rationale(rest)).toThrow('missing required field "chosen"')
  })

  it('rejects invalid gate_stage', () => {
    expect(() => validateT72Rationale({ ...validT72, gate_stage: 'Unknown' }))
      .toThrow('gate_stage must be')
  })

  it('rejects confidence out of range', () => {
    expect(() => validateT72Rationale({ ...validT72, confidence: 1.5 }))
      .toThrow('confidence must be 0.0–1.0')
  })

  it('rejects non-boolean pre_pass fields', () => {
    expect(() => validateT72Rationale({
      ...validT72,
      pre_pass: { ...validT72.pre_pass, cu_excluded: 'yes' },
    })).toThrow('pre_pass.cu_excluded must be boolean')
  })

  it('rejects malformed rejected_alternative', () => {
    expect(() => validateT72Rationale({
      ...validT72,
      rejected_alternatives: [{ leaf: 123, reason: 'bad' }],
    })).toThrow('rejected_alternative.leaf must be a string')
  })
})

describe('validateT71Rationale', () => {
  it('accepts a valid rationale', () => {
    expect(() => validateT71Rationale(validT71)).not.toThrow()
  })

  it('returns the validated object', () => {
    const result = validateT71Rationale(validT71)
    expect(result.chosen_jobnumber).toBe('141144')
  })

  it('rejects missing required field', () => {
    const { candidate_count, ...rest } = validT71
    expect(() => validateT71Rationale(rest)).toThrow('missing required field "candidate_count"')
  })

  it('rejects malformed candidate entry', () => {
    expect(() => validateT71Rationale({
      ...validT71,
      candidates_considered: [{ jobnumber: 123 }],
    })).toThrow('candidate.jobnumber must be a string')
  })

  it('rejects confidence out of range', () => {
    expect(() => validateT71Rationale({ ...validT71, confidence: -0.1 }))
      .toThrow('confidence must be 0.0–1.0')
  })
})
