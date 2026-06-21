/**
 * Prompt assembly for OpenAI GPT-4.1 classification engine.
 *
 * Extends the validated system prompts (BOOKED/NQ_NB/MATCH) with
 * T72Rationale output schema instructions. The base decision rules,
 * taxonomy sections, and confidence calibration remain unchanged.
 *
 * The base prompts ask for a simple 4-field JSON. The wrapper appends
 * instructions to emit the full T72Rationale shape instead, so
 * validateVerdict and validateT72Rationale pass without modification.
 */

// ─── T7.2 CLASSIFY PROMPT WRAPPERS ────────────────────────────────

/**
 * Wrap a base system prompt (BOOKED or NQ/NB) with T72Rationale output
 * schema instructions. The base prompt's "Return ONLY this JSON" block
 * is superseded by the richer schema below.
 */
export function buildT72SystemPrompt(
  basePrompt: string,
  allowedSet: readonly string[],
  prePassFacts: {
    has_outbound: boolean
    has_internal_touch: boolean
    cu_excluded: boolean
    njr_excluded: boolean
  },
  gateStage: 'NQ/NB' | 'Booked' = allowedSet.length <= 5 ? 'Booked' : 'NQ/NB',
): string {
  return `${basePrompt}

IMPORTANT — OUTPUT FORMAT OVERRIDE:
Instead of the simple JSON above, you MUST return the following FULL rationale JSON.
All fields are required. Do not omit any field.

{
  "lead_id": "<the opportunity_id from the lead>",
  "gate_stage": "${gateStage}",
  "allowed_set": ${JSON.stringify(allowedSet)},
  "pre_pass": ${JSON.stringify(prePassFacts)},
  "timeline_summary": "<2-3 sentence summary of the lead's journey. For Booked leads, MUST include verbatim text from the TECH LABOUR NOTE if one exists.>",
  "decisive_signals": ["<key phrase 1 from the timeline that drove your decision>", "<key phrase 2>"],
  "chosen": "<your chosen sub_status — MUST be one of the allowed_set values>",
  "confidence": 0.XX,
  "rejected_alternatives": [{"leaf": "<another sub_status you considered>", "reason": "<why you rejected it>"}],
  "reasoning": "<one sentence explaining why you chose this sub_status>"
}

RULES FOR THIS OUTPUT:
- "chosen" MUST be exactly one of the values in "allowed_set". No other values are valid.
- "lead_id" MUST be the opportunity_id provided in the lead data.
- "gate_stage" MUST be exactly "NQ/NB" or "Booked".
- "confidence" MUST be a number between 0.0 and 1.0.
- "timeline_summary" MUST be a non-empty string. For Booked leads with a TECH LABOUR NOTE, include at least 12 characters of verbatim text from that note.
- "decisive_signals" MUST contain at least one signal from the timeline.
- "rejected_alternatives" MUST contain at least one alternative you considered.
- "reasoning" MUST be a non-empty string.`
}

/**
 * Build the user message for T7.2 classification.
 * Extracts the prompt assembly logic from classifyLead() in run-cascade.ts.
 */
export function buildT72UserMessage(lead: {
  opportunity_id: string
  wc_lead_id: number
  gate_stage: string
  has_outbound: boolean
  has_internal_touch: boolean
  contact_name: string | null
  channel: string
  service: string
  suburb: string | null
  full_timeline: string
}): string {
  const isBooked = lead.gate_stage === 'judgement:Booked:completed_zero'
  return [
    '=== PRE-PASS FACTS ===',
    `has_outbound: ${lead.has_outbound}`,
    `has_internal_touch: ${lead.has_internal_touch}`,
    `gate_stage: ${isBooked ? 'Booked:completed_zero' : 'NQ/NB'}`,
    '',
    '=== LEAD ===',
    `opportunity_id: ${lead.opportunity_id}`,
    `wc_lead_id: ${lead.wc_lead_id}`,
    `contact: ${lead.contact_name || 'Unknown'}`,
    `channel: ${lead.channel}`,
    `service: ${lead.service}`,
    `suburb: ${lead.suburb || 'Unknown'}`,
    '',
    '=== TIMELINE ===',
    lead.full_timeline,
  ].join('\n')
}

// ─── T7.1 MATCH PROMPT WRAPPERS ───────────────────────────────────

/**
 * Build the user message for T7.1 matching.
 * Groups candidates for a single lead into a structured prompt.
 */
export function buildT71UserMessage(
  leadOppId: string,
  leadContent: string | null,
  contactName: string | null,
  candidates: Array<{
    jobnumber: string
    client_name: string
    customer_type: string
    job_description: string
    days_fwd: number
    candidate_rank: number
    phone_match: boolean
    email_match: boolean
    name_match: boolean
    content_match: boolean
    suburb_match: boolean
  }>,
): string {
  const candidateLines = candidates.map((c, i) => [
    `--- CANDIDATE ${i + 1} ---`,
    `jobnumber: ${c.jobnumber}`,
    `client_name: ${c.client_name}`,
    `customer_type: ${c.customer_type}`,
    `days_from_lead: ${c.days_fwd}`,
    `PHONE_MATCH: ${c.phone_match}`,
    `EMAIL_MATCH: ${c.email_match}`,
    `NAME_MATCH: ${c.name_match}`,
    `SUBURB_MATCH: ${c.suburb_match}`,
    `job_description: ${c.job_description}`,
  ].join('\n')).join('\n\n')

  return [
    '=== LEAD ===',
    `opportunity_id: ${leadOppId}`,
    `contact_name: ${contactName || 'Unknown'}`,
    `lead_content: ${leadContent || '(no content)'}`,
    '',
    `=== ${candidates.length} CANDIDATE JOBS ===`,
    candidateLines,
  ].join('\n')
}
