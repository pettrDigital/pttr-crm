/**
 * Structured rationale types for T7.1 (match) and T7.2 (classify).
 *
 * These are written ATOMICALLY with the staging row — same write, same
 * transaction. The rationale is a JSON string in the `rationale` column
 * of crm_auto_classifications. Not free-form.
 *
 * If the model emits something that doesn't fit the shape, the function
 * halts on that lead — do not silently coerce.
 *
 * Audit query:
 *   SELECT JSON_EXTRACT(rationale, '$.chosen'), JSON_EXTRACT(rationale, '$.confidence'),
 *     JSON_EXTRACT(rationale, '$.reasoning')
 *   FROM crm_auto_classifications WHERE run_id = ?
 */

// ─── T7.2 CLASSIFY RATIONALE ───────────────────────────────────────────

export interface T72RejectedAlternative {
  leaf: string
  reason: string
}

export interface T72PrePass {
  has_outbound: boolean
  has_internal_touch: boolean
  cu_excluded: boolean
  njr_excluded: boolean
}

export interface T72Rationale {
  lead_id: string
  gate_stage: 'NQ/NB' | 'Booked'
  allowed_set: string[]
  pre_pass: T72PrePass
  timeline_summary: string
  decisive_signals: string[]
  chosen: string
  confidence: number
  rejected_alternatives: T72RejectedAlternative[]
  reasoning: string
}

// ─── T7.1 MATCH RATIONALE ──────────────────────────────────────────────

export interface T71CandidateConsidered {
  jobnumber: string
  client: string
  days_from_lead: number
  signals_matched: string[]
}

export interface T71Rationale {
  lead_id: string
  candidate_count: number
  candidates_considered: T71CandidateConsidered[]
  chosen_jobnumber: string
  confidence: number
  match_signals: string[]
  reasoning: string
}

// ─── VALIDATORS ─────────────────────────────────────────────────────────

/**
 * Validate a T7.2 rationale object. Throws on any structural violation.
 * Does NOT validate sub_status against taxonomy — that's assertValidLeaf's job.
 */
export function validateT72Rationale(r: unknown): T72Rationale {
  if (!r || typeof r !== 'object') throw new Error('HALT: T7.2 rationale is not an object')
  const obj = r as Record<string, unknown>

  const required: (keyof T72Rationale)[] = [
    'lead_id', 'gate_stage', 'allowed_set', 'pre_pass',
    'timeline_summary', 'decisive_signals', 'chosen',
    'confidence', 'rejected_alternatives', 'reasoning',
  ]
  for (const key of required) {
    if (!(key in obj)) throw new Error(`HALT: T7.2 rationale missing required field "${key}"`)
  }

  if (obj.gate_stage !== 'NQ/NB' && obj.gate_stage !== 'Booked') {
    throw new Error(`HALT: T7.2 rationale gate_stage must be "NQ/NB" or "Booked", got "${obj.gate_stage}"`)
  }
  if (!Array.isArray(obj.allowed_set)) throw new Error('HALT: T7.2 rationale allowed_set must be an array')
  if (!Array.isArray(obj.decisive_signals)) throw new Error('HALT: T7.2 rationale decisive_signals must be an array')
  if (!Array.isArray(obj.rejected_alternatives)) throw new Error('HALT: T7.2 rationale rejected_alternatives must be an array')
  if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 1) {
    throw new Error(`HALT: T7.2 rationale confidence must be 0.0–1.0, got ${obj.confidence}`)
  }
  if (typeof obj.chosen !== 'string' || !obj.chosen) throw new Error('HALT: T7.2 rationale chosen must be a non-empty string')
  if (typeof obj.reasoning !== 'string' || !obj.reasoning) throw new Error('HALT: T7.2 rationale reasoning must be a non-empty string')
  if (typeof obj.timeline_summary !== 'string') throw new Error('HALT: T7.2 rationale timeline_summary must be a string')

  // Validate pre_pass shape
  const pp = obj.pre_pass as Record<string, unknown>
  if (!pp || typeof pp !== 'object') throw new Error('HALT: T7.2 rationale pre_pass must be an object')
  for (const k of ['has_outbound', 'has_internal_touch', 'cu_excluded', 'njr_excluded']) {
    if (typeof pp[k] !== 'boolean') throw new Error(`HALT: T7.2 rationale pre_pass.${k} must be boolean`)
  }

  // Validate rejected_alternatives entries
  for (const alt of obj.rejected_alternatives as unknown[]) {
    const a = alt as Record<string, unknown>
    if (!a || typeof a !== 'object') throw new Error('HALT: T7.2 rationale rejected_alternative entry must be an object')
    if (typeof a.leaf !== 'string') throw new Error('HALT: T7.2 rationale rejected_alternative.leaf must be a string')
    if (typeof a.reason !== 'string') throw new Error('HALT: T7.2 rationale rejected_alternative.reason must be a string')
  }

  return obj as unknown as T72Rationale
}

/**
 * Validate a T7.1 rationale object. Throws on any structural violation.
 */
export function validateT71Rationale(r: unknown): T71Rationale {
  if (!r || typeof r !== 'object') throw new Error('HALT: T7.1 rationale is not an object')
  const obj = r as Record<string, unknown>

  const required: (keyof T71Rationale)[] = [
    'lead_id', 'candidate_count', 'candidates_considered',
    'chosen_jobnumber', 'confidence', 'match_signals', 'reasoning',
  ]
  for (const key of required) {
    if (!(key in obj)) throw new Error(`HALT: T7.1 rationale missing required field "${key}"`)
  }

  if (!Array.isArray(obj.candidates_considered)) throw new Error('HALT: T7.1 rationale candidates_considered must be an array')
  if (!Array.isArray(obj.match_signals)) throw new Error('HALT: T7.1 rationale match_signals must be an array')
  if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 1) {
    throw new Error(`HALT: T7.1 rationale confidence must be 0.0–1.0, got ${obj.confidence}`)
  }
  if (typeof obj.reasoning !== 'string' || !obj.reasoning) throw new Error('HALT: T7.1 rationale reasoning must be a non-empty string')

  // Validate candidate entries
  for (const cand of obj.candidates_considered as unknown[]) {
    const c = cand as Record<string, unknown>
    if (!c || typeof c !== 'object') throw new Error('HALT: T7.1 candidate entry must be an object')
    if (typeof c.jobnumber !== 'string') throw new Error('HALT: T7.1 candidate.jobnumber must be a string')
    if (typeof c.client !== 'string') throw new Error('HALT: T7.1 candidate.client must be a string')
    if (typeof c.days_from_lead !== 'number') throw new Error('HALT: T7.1 candidate.days_from_lead must be a number')
    if (!Array.isArray(c.signals_matched)) throw new Error('HALT: T7.1 candidate.signals_matched must be an array')
  }

  return obj as unknown as T71Rationale
}
