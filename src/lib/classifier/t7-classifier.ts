/**
 * T7.2 Classifier — picks funnel sub-status within the gate-fixed stage.
 *
 * Reads: lead_timeline (touches + gate_stage), vw_lead_enriched (facts),
 *        AroFlo job content (description, labour notes, task notes).
 * Writes: nothing (classification result returned, not persisted here).
 *
 * Engine: CC-as-classifier (Claude Code reads timelines directly).
 *         Production engine TBD (step 7/8, not this build step).
 *
 * The gate (gate_stage on lead_timeline / lead_gate table) has ALREADY fixed
 * the stage. T7.2 picks ONLY from the allowed sub-status set for that stage.
 * It never overrides a determined stage.
 *
 * Input is RAW EVIDENCE only — no human work-product.
 */

// ─── TAXONOMY (per t7_taxonomy_spec.md §7) ──────────────────────────────

export const SUB_STATUS_TO_STAGE: Record<string, string> = {
  // Not Captured (determined, no T7)
  'Dropped Call': 'Not Captured',
  'Unanswered Call': 'Not Captured',
  'Technical Error': 'Not Captured',

  // Unable to Classify (determined, no T7)
  'Unable to Classify': 'Unable to Classify',

  // Not Quotable (T7 judgement)
  'Spam': 'Not Quotable',
  'Service Not Provided': 'Not Quotable',
  'Outside Service Area': 'Not Quotable',
  'Strata Issue': 'Not Quotable',
  'Customer Inquiry Only': 'Not Quotable',
  'Wrong Number / Contact Details': 'Not Quotable',
  'Not Job Related': 'Not Quotable',
  'Vodafone Orphan': 'Not Quotable',

  // Not Booked (T7 judgement, no JN)
  'Customer Unresponsive': 'Not Booked',
  'Booked Elsewhere': 'Not Booked',
  'Tenant / Strata Referral': 'Not Booked',
  'Price / Minimum Call Out': 'Not Booked',
  'Capacity / Scheduling': 'Not Booked',
  'Wanted Quote Over Phone': 'Not Booked',
  'Customer Resolved': 'Not Booked',
  'PETTR Did Not Respond': 'Not Booked',
  'Other': 'Not Booked',

  // Booked (fence: JN exists)
  'Completed and Invoiced': 'Booked',      // determined: invoiced > 0
  'Completed - Invoice Pending': 'Booked', // T7 judgement
  'Job Pending': 'Booked',
  'Booking Cancelled': 'Booked',
  'Quote Only': 'Booked',
  'Unable to Complete Job - Out of Scope': 'Booked',
}

// ─── ALLOWED SETS (per gate_stage) ──────────────────────────────────────

export const BOOKED_ALLOWED = [
  'Completed - Invoice Pending',
  'Quote Only',
  'Booking Cancelled',
  'Unable to Complete Job - Out of Scope',
  'Job Pending',
] as const

export const NQ_NB_ALLOWED = [
  // Not Quotable
  'Spam',
  'Service Not Provided',
  'Outside Service Area',
  'Strata Issue',
  'Customer Inquiry Only',
  'Wrong Number / Contact Details',
  'Not Job Related',
  // Not Booked
  'Customer Unresponsive',
  'Booked Elsewhere',
  'Tenant / Strata Referral',
  'Price / Minimum Call Out',
  'Capacity / Scheduling',
  'Wanted Quote Over Phone',
  'Customer Resolved',
  'PETTR Did Not Respond',
  'Other',
] as const

// ─── SYSTEM PROMPTS ─────────────────────────────────────────────────────

export const BOOKED_SYSTEM_PROMPT = `You classify the WITHIN-BOOKED outcome of a trade services lead (plumbing/electrical, Sydney AU). The stage IS Booked — a job was created. Your task is to pick the correct sub-status. Return valid JSON only.

Pick ONE sub_status from this CLOSED set (no other values are valid):

1. "Completed - Invoice Pending" — Job attended, work done, money collected per tech notes (labour note mentions $X+gst card/eft/cash, task notes show work completed) — but no processed invoice in AroFlo yet. The work WAS done and paid for.

2. "Quote Only" — We attended site and provided a quote, but the customer did not proceed with the work. Signals: labour note says "quote only", "not going ahead", "getting other quotes", "waste of time", "close off", or $0 collected. Distinct from Completed-Invoice Pending where money was collected.

3. "Booking Cancelled" — Booking was cancelled for ANY reason BEFORE we attended or quoted. Customer cancelled via call/SMS, went with a competitor, was unresponsive to confirm, job resolved itself, or scheduling fell through. Includes "went elsewhere with a JN" pattern.

4. "Unable to Complete Job - Out of Scope" — We attended site but couldn't provide the service. Requires different trade, structural issue, manufacturer issue, no RPZ valve, roofing work, needs strata plumbers, etc.

5. "Job Pending" — Job is booked/scheduled but not yet attended. No site visit, no quote, no outcome yet. Use ONLY when no content indicates an outcome has occurred.

DECISION RULES:
- If labour note mentions money collected ($X+gst card/eft/cash/banked) AND work described → "Completed - Invoice Pending"
- If labour/task notes say "quote only", "not going ahead", "didn't proceed", "getting other quotes" → "Quote Only"
- If customer cancelled/went elsewhere BEFORE any site visit → "Booking Cancelled"
- If tech notes describe attending site but work was impossible/out of scope → "Unable to Complete Job - Out of Scope"
- If job is Archived + $0 invoiced + NO notes showing work/collection → lean "Quote Only" or "Booking Cancelled" (NOT Job Pending — Archived means it's done, not pending)
- If genuinely no outcome signal → "Job Pending" (the default for Open-status jobs with no notes)

Return ONLY this JSON:
{"sub_status":"...","confidence":0.XX,"reasoning":"one sentence","source_quote":"key phrase or null"}`

export const NQ_NB_SYSTEM_PROMPT = `You classify trade services leads (plumbing/electrical, Sydney AU). The stage is NOT yet determined — you pick the sub_status, which determines the stage. Return valid JSON only.

Pick ONE sub_status from this CLOSED set. The funnel stage is DERIVED from your choice.

NOT QUOTABLE (the enquiry itself is not actionable):
- "Spam" — Unsolicited marketing, telemarketing, or sales pitch. Includes cleaning-service pitches, employment agencies, office-space offers, any external party trying to SELL TO PETTR. Also includes callers from outside Australia (geographic spam). The caller is selling, not buying.
- "Service Not Provided" — A genuine customer enquiry for something PETTR does not do (not plumbing or electrical). E.g. TV repair, locksmith, solar, appliance installation, air conditioning, roofing, gas fitting. The caller wants to buy, but we don't sell it.
- "Outside Service Area" — Geographic: caller is within Australia but outside the Sydney/Greater Sydney service area. The service is something we do, but not where they are.
- "Strata Issue" — The issue itself is a strata/body corporate responsibility, not a direct-to-homeowner job. The caller needs to go through their strata, and PETTR cannot take the job directly. Distinct from Tenant/Strata Referral (below) where the caller HAS a real plumbing/electrical problem but needs strata approval.
- "Customer Inquiry Only" — An existing customer calling about an in-progress or recently completed job — not a new lead. Status check, warranty question, complaint about existing work, scheduling an already-booked return visit.
- "Wrong Number / Contact Details" — Wrong number, disconnected, fax line, or invalid contact details. The lead cannot be reached or was never intended for PETTR.
- "Not Job Related" — An internal/operational call: known staff member or DID marked [INTERNAL] discussing scheduling, inventory, HR, etc. NOT external sales pitches (those are Spam).

NOT BOOKED (the enquiry was real and quotable, but didn't convert to a booking):
- "Customer Unresponsive" — We attempted to contact the customer (outbound calls, SMS, email) but they did not respond, did not confirm, or went cold. Signal: multiple outbound call attempts with short durations (0-10s), unanswered voicemail, SMS with no reply.
- "Tenant / Strata Referral" — The caller is a tenant/resident who needs strata manager or property manager approval to proceed. They have a real problem (plumbing/electrical) but cannot authorise the work themselves. Distinct from Strata Issue (above) where the issue itself is strata's responsibility.
- "Price / Minimum Call Out" — Customer declined due to pricing: minimum call-out fee too high, quoted price unfavourable, or price comparison. The service was quotable and in-area.
- "Capacity / Scheduling" — PETTR couldn't accommodate the timeline (fully booked, too far out) OR customer's schedule didn't align. The issue is timing/availability, not price or scope.
- "Wanted Quote Over Phone" — Customer wanted a price estimate over the phone without booking a site visit. The enquiry ended at the phone-quote stage.
- "Customer Resolved" — The problem resolved itself before we could attend (Sydney Water fixed the main, blockage cleared, power came back). No PETTR service was needed.
- "Booked Elsewhere" — Customer told us they chose a competitor BEFORE any job was created with us. They explicitly said they're going with someone else.
- "PETTR Did Not Respond" — PETTR failed to call back or follow up on a valid enquiry. The lead was lost due to our operational failure, not customer choice.
- "Other" — Does not fit any defined category. Selecting this flags the lead for human review.

DECISION RULES:
1. If the caller is selling/pitching TO PETTR (cleaning, employment, office space, marketing, international caller) → "Spam"
2. If the caller wants a service PETTR doesn't offer (not plumbing/electrical) → "Service Not Provided"
3. If the caller is geographically outside Sydney metro → "Outside Service Area"
4. If we tried to call back multiple times with no answer → "Customer Unresponsive"
5. If the caller explicitly mentioned price/cost as the reason for not proceeding → "Price / Minimum Call Out"
6. If availability/timing was the barrier → "Capacity / Scheduling"
7. If the caller said they found someone else / going elsewhere → "Booked Elsewhere"
8. If the problem resolved on its own → "Customer Resolved"
9. If the caller is a tenant needing strata approval → "Tenant / Strata Referral"
10. If this is an existing-customer callback about an existing job → "Customer Inquiry Only"

CONFIDENCE CALIBRATION:
- 0.9+: unambiguous content, single clear signal, no conflicting info.
- 0.7-0.89: content supports verdict but minor ambiguity exists.
- 0.5-0.69: thin content, multiple plausible verdicts.

Return ONLY this JSON:
{"sub_status":"...","confidence":0.XX,"reasoning":"one sentence","source_quote":"key phrase or null"}`

// ─── GATE CONSTRAINT LOGIC ──────────────────────────────────────────────

export type GateStage =
  | 'determined:Completed and Invoiced'
  | 'determined:account_billing_review'
  | 'determined:Not Captured / Unanswered Call'
  | 'determined:Not Captured / Dropped Call'
  | 'determined:Unable to Classify'
  | 'judgement:Booked'
  | 'judgement:NQ/NB'

export interface ClassificationResult {
  opportunity_id: string
  gate_stage: GateStage
  sub_status: string
  stage: string
  confidence: number
  reasoning: string
  source_quote: string
  is_determined: boolean  // true = gate set it, T7 never ran
}

/**
 * Given a gate_stage, return the classification result if determined,
 * or the allowed sub-status set + system prompt if judgement-needed.
 */
export function resolveGate(gate_stage: string): {
  determined: ClassificationResult | null
  allowedSet: readonly string[] | null
  systemPrompt: string | null
} {
  // Determined stages — T7 does not run
  if (gate_stage === 'determined:Completed and Invoiced') {
    return {
      determined: {
        opportunity_id: '', // filled by caller
        gate_stage: gate_stage as GateStage,
        sub_status: 'Completed and Invoiced',
        stage: 'Booked',
        confidence: 1.0,
        reasoning: 'Determined: invoiced_total_ex > 0',
        source_quote: '',
        is_determined: true,
      },
      allowedSet: null,
      systemPrompt: null,
    }
  }
  if (gate_stage === 'determined:account_billing_review') {
    return {
      determined: {
        opportunity_id: '',
        gate_stage: gate_stage as GateStage,
        sub_status: 'account_billing_review',
        stage: 'Booked',
        confidence: 1.0,
        reasoning: 'Flagged: Archived + $0 + Account terms — manual review',
        source_quote: '',
        is_determined: true,
      },
      allowedSet: null,
      systemPrompt: null,
    }
  }
  if (gate_stage === 'determined:Not Captured / Unanswered Call') {
    return {
      determined: {
        opportunity_id: '',
        gate_stage: gate_stage as GateStage,
        sub_status: 'Unanswered Call',
        stage: 'Not Captured',
        confidence: 1.0,
        reasoning: 'Determined: no answered call, no content',
        source_quote: '',
        is_determined: true,
      },
      allowedSet: null,
      systemPrompt: null,
    }
  }
  if (gate_stage === 'determined:Not Captured / Dropped Call') {
    return {
      determined: {
        opportunity_id: '',
        gate_stage: gate_stage as GateStage,
        sub_status: 'Dropped Call',
        stage: 'Not Captured',
        confidence: 1.0,
        reasoning: 'Determined: answered but <20s, no content',
        source_quote: '',
        is_determined: true,
      },
      allowedSet: null,
      systemPrompt: null,
    }
  }
  if (gate_stage === 'determined:Unable to Classify') {
    return {
      determined: {
        opportunity_id: '',
        gate_stage: gate_stage as GateStage,
        sub_status: 'Unable to Classify',
        stage: 'Unable to Classify',
        confidence: 1.0,
        reasoning: 'Determined: touch exists but zero content',
        source_quote: '',
        is_determined: true,
      },
      allowedSet: null,
      systemPrompt: null,
    }
  }

  // Judgement stages — T7 picks sub-status
  if (gate_stage === 'judgement:Booked') {
    return {
      determined: null,
      allowedSet: BOOKED_ALLOWED,
      systemPrompt: BOOKED_SYSTEM_PROMPT,
    }
  }
  if (gate_stage === 'judgement:NQ/NB') {
    return {
      determined: null,
      allowedSet: NQ_NB_ALLOWED,
      systemPrompt: NQ_NB_SYSTEM_PROMPT,
    }
  }

  // Fallback (should never reach here)
  return {
    determined: {
      opportunity_id: '',
      gate_stage: gate_stage as GateStage,
      sub_status: 'Unable to Classify',
      stage: 'Unable to Classify',
      confidence: 0,
      reasoning: 'Unknown gate_stage: ' + gate_stage,
      source_quote: '',
      is_determined: true,
    },
    allowedSet: null,
    systemPrompt: null,
  }
}

/**
 * Validate that a T7 classification result is within the allowed set.
 * Returns the sub_status if valid, or flags as a gate violation.
 */
export function validateClassification(
  sub_status: string,
  allowedSet: readonly string[]
): { valid: boolean; sub_status: string } {
  if (allowedSet.includes(sub_status)) {
    return { valid: true, sub_status }
  }
  // Gate violation — T7 returned something outside the allowed set
  return { valid: false, sub_status: `VIOLATION:${sub_status}` }
}
