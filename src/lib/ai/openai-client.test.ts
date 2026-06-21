import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateT72Rationale } from '../cascade/rationale'
import { assertValidLeaf, BOOKED_ALLOWED, NQ_NB_ALLOWED } from '../classifier/taxonomy'
import { buildT72SystemPrompt, buildT72UserMessage, buildT71UserMessage } from './prompts'

// ─── FIXTURES ──────────────────────────────────────────────────────

function makeValidNqNbRationale(overrides: Record<string, unknown> = {}) {
  return {
    lead_id: 'G-abc123',
    gate_stage: 'NQ/NB',
    allowed_set: [...NQ_NB_ALLOWED],
    pre_pass: {
      has_outbound: true,
      has_internal_touch: true,
      cu_excluded: false,
      njr_excluded: false,
    },
    timeline_summary: 'Caller asked about solar panel installation, which is not a service PETTR offers.',
    decisive_signals: ['solar panel installation'],
    chosen: 'Service Not Provided',
    confidence: 0.95,
    rejected_alternatives: [{ leaf: 'Spam', reason: 'Genuine customer enquiry, not marketing' }],
    reasoning: 'Customer enquired about solar panels which PETTR does not offer.',
    ...overrides,
  }
}

function makeValidBookedRationale(overrides: Record<string, unknown> = {}) {
  return {
    lead_id: 'J-123456',
    gate_stage: 'Booked',
    allowed_set: [...BOOKED_ALLOWED],
    pre_pass: {
      has_outbound: true,
      has_internal_touch: false,
      cu_excluded: false,
      njr_excluded: true,
    },
    timeline_summary: 'Tech attended site and quoted $850+gst for hot water unit replacement. Customer decided not to proceed.',
    decisive_signals: ['quote only', 'not going ahead'],
    chosen: 'Quote Only',
    confidence: 0.90,
    rejected_alternatives: [
      { leaf: 'Completed - Invoice Pending', reason: 'No payment collected' },
    ],
    reasoning: 'Labour note indicates quote was provided but customer did not proceed.',
    ...overrides,
  }
}

function makeLeadInput(overrides: Record<string, unknown> = {}) {
  return {
    opportunity_id: 'G-abc123',
    wc_lead_id: 12345,
    gate_stage: 'judgement:NQ/NB',
    has_outbound: true,
    has_internal_touch: true,
    contact_name: 'John Smith',
    channel: 'call',
    service: 'plumbing',
    suburb: 'Parramatta',
    full_timeline: '[2026-06-20 10:15:00] Inbound Call | CS Agent | 5m23s\ncustomer reports solar panel issue',
    total_content_chars: 80,
    ...overrides,
  }
}

// ─── T72 RATIONALE VALIDATION ──────────────────────────────────────

describe('T72Rationale validation', () => {
  it('accepts a valid NQ/NB rationale', () => {
    const rationale = makeValidNqNbRationale()
    const result = validateT72Rationale(rationale)
    expect(result.chosen).toBe('Service Not Provided')
    expect(result.confidence).toBe(0.95)
    expect(result.gate_stage).toBe('NQ/NB')
  })

  it('accepts a valid Booked rationale', () => {
    const rationale = makeValidBookedRationale()
    const result = validateT72Rationale(rationale)
    expect(result.chosen).toBe('Quote Only')
    expect(result.gate_stage).toBe('Booked')
  })

  it('rejects rationale with missing required field', () => {
    const rationale = makeValidNqNbRationale()
    delete (rationale as Record<string, unknown>).chosen
    expect(() => validateT72Rationale(rationale)).toThrow('missing required field "chosen"')
  })

  it('rejects rationale with invalid gate_stage', () => {
    const rationale = makeValidNqNbRationale({ gate_stage: 'InvalidStage' })
    expect(() => validateT72Rationale(rationale)).toThrow('gate_stage must be')
  })

  it('rejects rationale with out-of-range confidence', () => {
    const rationale = makeValidNqNbRationale({ confidence: 1.5 })
    expect(() => validateT72Rationale(rationale)).toThrow('confidence must be 0.0–1.0')
  })

  it('rejects rationale with empty chosen string', () => {
    const rationale = makeValidNqNbRationale({ chosen: '' })
    expect(() => validateT72Rationale(rationale)).toThrow('chosen must be a non-empty string')
  })

  it('rejects rationale with non-array allowed_set', () => {
    const rationale = makeValidNqNbRationale({ allowed_set: 'not an array' })
    expect(() => validateT72Rationale(rationale)).toThrow('allowed_set must be an array')
  })

  it('rejects rationale with malformed pre_pass', () => {
    const rationale = makeValidNqNbRationale({
      pre_pass: { has_outbound: 'yes', has_internal_touch: true, cu_excluded: false, njr_excluded: false },
    })
    expect(() => validateT72Rationale(rationale)).toThrow('pre_pass.has_outbound must be boolean')
  })

  it('rejects rationale with malformed rejected_alternative entry', () => {
    const rationale = makeValidNqNbRationale({
      rejected_alternatives: [{ leaf: 123, reason: 'bad' }],
    })
    expect(() => validateT72Rationale(rationale)).toThrow('rejected_alternative.leaf must be a string')
  })
})

// ─── TAXONOMY VALIDATION ───────────────────────────────────────────

describe('assertValidLeaf', () => {
  it('accepts canonical NQ/NB leaves', () => {
    expect(() => assertValidLeaf('Spam')).not.toThrow()
    expect(() => assertValidLeaf('Service Not Provided')).not.toThrow()
    expect(() => assertValidLeaf('Customer Unresponsive')).not.toThrow()
    expect(() => assertValidLeaf('No Follow-Up Recorded')).not.toThrow()
  })

  it('accepts canonical Booked leaves', () => {
    expect(() => assertValidLeaf('Completed - Invoice Pending')).not.toThrow()
    expect(() => assertValidLeaf('Quote Only')).not.toThrow()
    expect(() => assertValidLeaf('Booking Cancelled')).not.toThrow()
  })

  it('rejects off-taxonomy values', () => {
    expect(() => assertValidLeaf('Made Up Status')).toThrow()
  })
})

// ─── ALLOWED-SET ENFORCEMENT ───────────────────────────────────────

describe('allowed-set checks', () => {
  it('NQ/NB without outbound excludes Customer Unresponsive', () => {
    const noOutbound = NQ_NB_ALLOWED.filter(s => s !== 'Customer Unresponsive')
    expect(noOutbound).not.toContain('Customer Unresponsive')
    expect(noOutbound).toContain('No Follow-Up Recorded')
  })

  it('NQ/NB without internal touch excludes Not Job Related', () => {
    const noInternal = NQ_NB_ALLOWED.filter(s => s !== 'Not Job Related')
    expect(noInternal).not.toContain('Not Job Related')
    expect(noInternal).toContain('Spam')
  })

  it('chosen outside allowed_set is detectable', () => {
    const rationale = makeValidNqNbRationale({ chosen: 'Completed - Invoice Pending' })
    const validated = validateT72Rationale(rationale)
    // Validation passes shape check, but chosen is not in NQ/NB allowed set
    expect(NQ_NB_ALLOWED.includes(validated.chosen)).toBe(false)
  })
})

// ─── BOOKED LABOUR-NOTE VERBATIM CHECK ─────────────────────────────

describe('Booked labour-note verbatim check', () => {
  const labourNote = 'Attended site, quoted $850+gst for hot water replacement. Customer not proceeding.'

  it('passes when timeline_summary contains verbatim substring', () => {
    const rationale = makeValidBookedRationale({
      timeline_summary: `Tech attended and noted: "quoted $850+gst for hot water replacement" — customer declined.`,
    })
    // Check 12-char substring exists in timeline_summary
    const searchIn = [rationale.timeline_summary, ...rationale.decisive_signals].join(' ')
    let found = false
    for (let i = 0; i <= labourNote.length - 12; i++) {
      if (searchIn.includes(labourNote.substring(i, i + 12))) {
        found = true
        break
      }
    }
    expect(found).toBe(true)
  })

  it('fails when timeline_summary has no verbatim content from note', () => {
    const rationale = makeValidBookedRationale({
      timeline_summary: 'A generic summary with no specific content from the labour note.',
      decisive_signals: ['generic signal'],
    })
    const searchIn = [rationale.timeline_summary, ...rationale.decisive_signals].join(' ')
    let found = false
    for (let i = 0; i <= labourNote.length - 12; i++) {
      if (searchIn.includes(labourNote.substring(i, i + 12))) {
        found = true
        break
      }
    }
    expect(found).toBe(false)
  })
})

// ─── PROMPT ASSEMBLY ───────────────────────────────────────────────

describe('buildT72SystemPrompt', () => {
  it('appends T72Rationale output schema to base prompt', () => {
    const basePrompt = 'You classify trade services leads.'
    const result = buildT72SystemPrompt(
      basePrompt,
      [...NQ_NB_ALLOWED],
      { has_outbound: true, has_internal_touch: true, cu_excluded: false, njr_excluded: false },
      'NQ/NB',
    )
    expect(result).toContain('You classify trade services leads.')
    expect(result).toContain('OUTPUT FORMAT OVERRIDE')
    expect(result).toContain('"lead_id"')
    expect(result).toContain('"gate_stage": "NQ/NB"')
    expect(result).toContain('"allowed_set"')
    expect(result).toContain('"timeline_summary"')
    expect(result).toContain('"decisive_signals"')
    expect(result).toContain('"chosen"')
    expect(result).toContain('"rejected_alternatives"')
  })

  it('sets gate_stage to Booked for booked prompts', () => {
    const result = buildT72SystemPrompt(
      'Base prompt.',
      [...BOOKED_ALLOWED],
      { has_outbound: true, has_internal_touch: false, cu_excluded: false, njr_excluded: true },
      'Booked',
    )
    expect(result).toContain('"gate_stage": "Booked"')
  })

  it('includes pre_pass facts in the prompt', () => {
    const result = buildT72SystemPrompt(
      'Base prompt.',
      [...NQ_NB_ALLOWED],
      { has_outbound: false, has_internal_touch: true, cu_excluded: true, njr_excluded: false },
      'NQ/NB',
    )
    expect(result).toContain('"cu_excluded":true')
  })
})

describe('buildT72UserMessage', () => {
  it('assembles lead data into structured message', () => {
    const lead = makeLeadInput()
    const result = buildT72UserMessage(lead as Parameters<typeof buildT72UserMessage>[0])
    expect(result).toContain('=== PRE-PASS FACTS ===')
    expect(result).toContain('has_outbound: true')
    expect(result).toContain('=== LEAD ===')
    expect(result).toContain('opportunity_id: G-abc123')
    expect(result).toContain('contact: John Smith')
    expect(result).toContain('=== TIMELINE ===')
    expect(result).toContain('solar panel issue')
  })

  it('handles null contact_name', () => {
    const lead = makeLeadInput({ contact_name: null })
    const result = buildT72UserMessage(lead as Parameters<typeof buildT72UserMessage>[0])
    expect(result).toContain('contact: Unknown')
  })

  it('sets gate_stage to Booked:completed_zero for booked leads', () => {
    const lead = makeLeadInput({ gate_stage: 'judgement:Booked:completed_zero' })
    const result = buildT72UserMessage(lead as Parameters<typeof buildT72UserMessage>[0])
    expect(result).toContain('gate_stage: Booked:completed_zero')
  })
})

describe('buildT71UserMessage', () => {
  it('assembles lead + candidates into structured message', () => {
    const candidates = [
      {
        jobnumber: '123456',
        client_name: 'John Smith',
        customer_type: 'COD',
        job_description: 'Hot water unit repair',
        days_fwd: 2,
        candidate_rank: 1,
        phone_match: true,
        email_match: false,
        name_match: true,
        content_match: false,
        suburb_match: true,
      },
    ]
    const result = buildT71UserMessage('G-abc123', 'hot water not working', 'John Smith', candidates)
    expect(result).toContain('=== LEAD ===')
    expect(result).toContain('opportunity_id: G-abc123')
    expect(result).toContain('contact_name: John Smith')
    expect(result).toContain('hot water not working')
    expect(result).toContain('=== 1 CANDIDATE JOBS ===')
    expect(result).toContain('jobnumber: 123456')
    expect(result).toContain('PHONE_MATCH: true')
    expect(result).toContain('NAME_MATCH: true')
    expect(result).toContain('SUBURB_MATCH: true')
  })

  it('handles multiple candidates', () => {
    const candidates = [
      {
        jobnumber: '111111', client_name: 'A', customer_type: 'COD',
        job_description: 'Job 1', days_fwd: 1, candidate_rank: 1,
        phone_match: false, email_match: false, name_match: false,
        content_match: false, suburb_match: false,
      },
      {
        jobnumber: '222222', client_name: 'B', customer_type: 'Account',
        job_description: 'Job 2', days_fwd: 5, candidate_rank: 2,
        phone_match: true, email_match: true, name_match: false,
        content_match: false, suburb_match: false,
      },
    ]
    const result = buildT71UserMessage('G-xyz', null, null, candidates)
    expect(result).toContain('=== 2 CANDIDATE JOBS ===')
    expect(result).toContain('CANDIDATE 1')
    expect(result).toContain('CANDIDATE 2')
    expect(result).toContain('contact_name: Unknown')
    expect(result).toContain('lead_content: (no content)')
  })
})

// ─── JSON SCHEMA SHAPE ─────────────────────────────────────────────

describe('JSON schemas for structured outputs', () => {
  // Import inline to avoid triggering Secret Manager during test load
  it('T72 schema has all required fields', async () => {
    const { T72_RATIONALE_JSON_SCHEMA } = await import('./openai-client')
    expect(T72_RATIONALE_JSON_SCHEMA.type).toBe('object')
    expect(T72_RATIONALE_JSON_SCHEMA.required).toContain('lead_id')
    expect(T72_RATIONALE_JSON_SCHEMA.required).toContain('gate_stage')
    expect(T72_RATIONALE_JSON_SCHEMA.required).toContain('allowed_set')
    expect(T72_RATIONALE_JSON_SCHEMA.required).toContain('pre_pass')
    expect(T72_RATIONALE_JSON_SCHEMA.required).toContain('timeline_summary')
    expect(T72_RATIONALE_JSON_SCHEMA.required).toContain('decisive_signals')
    expect(T72_RATIONALE_JSON_SCHEMA.required).toContain('chosen')
    expect(T72_RATIONALE_JSON_SCHEMA.required).toContain('confidence')
    expect(T72_RATIONALE_JSON_SCHEMA.required).toContain('rejected_alternatives')
    expect(T72_RATIONALE_JSON_SCHEMA.required).toContain('reasoning')
    expect(T72_RATIONALE_JSON_SCHEMA.additionalProperties).toBe(false)
  })

  it('T71 schema has all required fields', async () => {
    const { T71_MATCH_JSON_SCHEMA } = await import('./openai-client')
    expect(T71_MATCH_JSON_SCHEMA.type).toBe('object')
    expect(T71_MATCH_JSON_SCHEMA.required).toContain('jobnumber')
    expect(T71_MATCH_JSON_SCHEMA.required).toContain('confidence')
    expect(T71_MATCH_JSON_SCHEMA.required).toContain('evidence')
    expect(T71_MATCH_JSON_SCHEMA.required).toContain('corroboration')
    expect(T71_MATCH_JSON_SCHEMA.required).toContain('abstain')
    expect(T71_MATCH_JSON_SCHEMA.additionalProperties).toBe(false)
  })

  it('T72 pre_pass sub-schema matches interface', async () => {
    const { T72_RATIONALE_JSON_SCHEMA } = await import('./openai-client')
    const prePass = T72_RATIONALE_JSON_SCHEMA.properties.pre_pass
    expect(prePass.required).toEqual(['has_outbound', 'has_internal_touch', 'cu_excluded', 'njr_excluded'])
    expect(prePass.additionalProperties).toBe(false)
  })

  it('T72 rejected_alternatives items schema is correct', async () => {
    const { T72_RATIONALE_JSON_SCHEMA } = await import('./openai-client')
    const items = T72_RATIONALE_JSON_SCHEMA.properties.rejected_alternatives.items
    expect(items.required).toEqual(['leaf', 'reason'])
    expect(items.additionalProperties).toBe(false)
  })
})

// ─── ROUND-TRIP: SCHEMA → VALIDATE ─────────────────────────────────
// Simulates what happens when OpenAI returns a valid response:
// the JSON conforms to the schema, then passes validateT72Rationale.

describe('round-trip: mock OpenAI response → validation', () => {
  it('valid NQ/NB response passes all checks', () => {
    const mockResponse = makeValidNqNbRationale()
    const validated = validateT72Rationale(mockResponse)
    assertValidLeaf(validated.chosen)
    expect(NQ_NB_ALLOWED.includes(validated.chosen)).toBe(true)
  })

  it('valid Booked response passes all checks', () => {
    const mockResponse = makeValidBookedRationale()
    const validated = validateT72Rationale(mockResponse)
    assertValidLeaf(validated.chosen)
    expect(BOOKED_ALLOWED.includes(validated.chosen)).toBe(true)
  })

  it('NQ/NB response with CU when no outbound is caught by allowed-set check', () => {
    const noOutboundAllowed = NQ_NB_ALLOWED.filter(s => s !== 'Customer Unresponsive')
    const mockResponse = makeValidNqNbRationale({
      chosen: 'Customer Unresponsive',
      pre_pass: { has_outbound: false, has_internal_touch: true, cu_excluded: true, njr_excluded: false },
    })
    const validated = validateT72Rationale(mockResponse)
    // Shape is valid, but chosen is NOT in the constrained allowed_set
    expect(noOutboundAllowed.includes(validated.chosen)).toBe(false)
  })

  it('Booked response with NQ/NB leaf is caught by allowed-set check', () => {
    const mockResponse = makeValidBookedRationale({ chosen: 'Spam' })
    const validated = validateT72Rationale(mockResponse)
    expect(BOOKED_ALLOWED.includes(validated.chosen)).toBe(false)
  })
})
