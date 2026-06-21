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

// ─── TAXONOMY (imported from canonical source — do NOT define leaves here) ──
import {
  SUB_STATUS_TO_STAGE,
  BOOKED_ALLOWED,
  NQ_NB_ALLOWED,
  assertValidLeaf,
} from './taxonomy'

// Re-export so existing consumers don't break
export { SUB_STATUS_TO_STAGE, BOOKED_ALLOWED, NQ_NB_ALLOWED, assertValidLeaf }

// CU/NFUR deterministic pre-pass: when NO logged outbound (Outbound Call /
// Outbound Email) exists in the timeline, CU is structurally impossible —
// you can't call a customer "unresponsive" if you never visibly contacted them.
// Remove CU from the allowed set and force NFUR as the disposition default.
// OHQ/answering-service pager handoffs do NOT count as logged outbound (per
// cd144fb) — the tech-mobile follow-up channel is untracked.
//
// Detection: query lead_timeline for interaction_type IN ('Outbound Call',
// 'Outbound Email'). 0-duration/unanswered outbound calls STILL count
// (visible attempt = CU-eligible). Only complete absence = force NFUR.
export const NQ_NB_ALLOWED_NO_OUTBOUND = NQ_NB_ALLOWED.filter(
  s => s !== 'Customer Unresponsive'
)

// ─── SYSTEM PROMPTS ─────────────────────────────────────────────────────
// Allowed-output blocks are GENERATED from taxonomy.ts via prompt-sections.ts.
// Everything else (role text, decision rules, heuristics, output schema) is
// hand-maintained here. Do NOT hand-edit the allowed-output enumeration —
// change taxonomy.ts instead.

import { buildBookedAllowedSection, buildNqNbAllowedSection } from './prompt-sections'

export const BOOKED_SYSTEM_PROMPT = `You classify the WITHIN-BOOKED outcome of a trade services lead (plumbing/electrical, Sydney AU). The stage IS Booked — a job was created. Your task is to pick the correct sub-status. Return valid JSON only.

Pick ONE sub_status from this CLOSED set (no other values are valid):

${buildBookedAllowedSection()}

DECISION RULES:
- If labour note mentions money collected ($X+gst card/eft/cash/banked) AND work described → "Completed - Invoice Pending"
- If labour/task notes say "quote only", "not going ahead", "didn't proceed", "getting other quotes" → "Quote Only"
- If customer cancelled/went elsewhere BEFORE any site visit → "Booking Cancelled"
- If tech notes describe attending site but work was impossible/out of scope → "Unable to Complete Job - Out of Scope"
- If job is Archived + $0 invoiced + NO labour/task note showing work done or money collected → MUST be "Quote Only" or "Booking Cancelled" (NOT Job Pending). Archived means the job lifecycle is OVER — it cannot be pending. "Job Pending" is ONLY for jobs that appear genuinely still scheduled/open (not Archived, not Completed).
- If genuinely no outcome signal AND the job status is Open/not-yet-attended → "Job Pending"
- CRITICAL: a Booked-stage job that is Archived with $0 and no work note is a lead that DIDN'T PROCEED. Default to "Quote Only" if a site visit occurred (any labour note exists), or "Booking Cancelled" if no visit evidence. Never "Job Pending" for an Archived job.

RATIONALE QUALITY:
- Your reasoning MUST reference specific content from the TECH LABOUR NOTE or TASK NOTES when available. Do not use generic boilerplate like "Attended site and provided quote. Customer did not proceed."
- Good: "Job archived $0, labour note says: quoted $2,400+gst for switchboard upgrade, customer decided not to proceed."
- Good: "Archived with $0 invoiced, no labour note available — deterministic Quote Only based on Archived status with site visit evidence."
- Bad: "Attended site and provided quote. Customer did not proceed with work."

Return ONLY this JSON:
{"sub_status":"...","confidence":0.XX,"reasoning":"one sentence","source_quote":"key phrase or null"}`

export const NQ_NB_SYSTEM_PROMPT = `You classify trade services leads (plumbing/electrical, Sydney AU). The stage is NOT yet determined — you pick the sub_status, which determines the stage. Return valid JSON only.

Pick ONE sub_status from this CLOSED set. The funnel stage is DERIVED from your choice.

${buildNqNbAllowedSection()}

IMPORTANT — CLASSIFY BY CONTENT FIRST, NOT BY OUTBOUND STATUS:
Read the timeline content BEFORE checking has_outbound. If any conversation happened — whether inbound, outbound, or via an after-hours answering service (OHQ) — classify by what was discussed. An OHQ call where the operator discussed the problem with the customer IS a substantive interaction. has_outbound only matters when there is NO substantive content to classify.

DECISION RULES (apply in order — first match wins):

1. "Spam" — caller is selling/pitching TO PETTR, or seeking employment/apprenticeship/work placement.
2. "Service Not Provided" — customer wants a service PETTR doesn't offer. Includes: solar, aircon/HVAC, appliances (fridge, oven repair, dishwasher repair, washing machine), TV repair, locksmith, auto electrician, gas fitting, data/internet cabling, EV charger servicing, handyman work, white goods. Also applies when staff says "we don't do that" or "we don't service that."
3. "Outside Service Area" — caller is geographically outside Sydney/Greater Sydney metro.
4. "Wrong Number" — caller explicitly indicates they called the wrong number, or content clearly shows the call was not intended for PETTR. Do NOT use for garbled/short/disconnected calls.
5. "Customer Inquiry Only" — existing customer calling about an existing job (status check, warranty, callback about prior work).
6. "Tenant / Strata Referral" — caller is a tenant told to contact their agent/owner/strata/housing commission.
7. "Common Property Responsibility" — issue is strata/body corporate responsibility, not direct-to-homeowner.
8. "Price / Minimum Call Out" — pricing was discussed and is the reason the customer did not proceed. Includes: customer asks about call-out fee or minimum charge, reacts negatively to quoted pricing, says it is too expensive, questions website pricing vs quoted pricing, says they will get other quotes, expresses frustration about not receiving pricing information. Applies whether pricing was discussed inbound or outbound, including after-hours OHQ calls where the customer asks about cost.
9. "Wanted Quote Over Phone" — customer wanted a price, advice, or diagnosis over the phone without booking a site visit.
10. "Capacity / Scheduling" — PETTR had no availability, was booked out, or timing didn't work for the customer.
11. "Booked Elsewhere" — customer explicitly said they found or are going with another provider.
12. "Customer Resolved" — customer's problem was fixed or no longer required before any PETTR booking.
13. "Not Job Related" — identified internal staff communication (requires is_internal_did signal).

LAST RESORT — NFUR and CU (only when rules 1-13 do not apply):
14. "No Follow-Up Recorded" — has_outbound is FALSE, AND no substantive discussion occurred. Use ONLY when the customer made an enquiry (form, OHQ message, brief call) and there is no evidence that PETTR engaged with the customer's problem, pricing, or booking. If an OHQ operator or staff member discussed the problem, pricing, availability, or next steps with the customer — even briefly — that IS engagement. Classify by rules 1-13 instead.
15. "Customer Unresponsive" — has_outbound is TRUE, AND the customer did not meaningfully respond. Outbound calls were unanswered (0s duration, voicemail), or emails/SMS went unreplied. If the customer answered and had a conversation, they were responsive — classify by rules 1-13.
16. "Other" — does not fit any defined category. Flags for human review.

CONFIDENCE CALIBRATION:
- 0.9+: unambiguous content, single clear signal, no conflicting info.
- 0.7-0.89: content supports verdict but minor ambiguity exists.
- 0.5-0.69: thin content, multiple plausible verdicts.

Return ONLY this JSON:
{"sub_status":"...","confidence":0.XX,"reasoning":"one sentence","source_quote":"key phrase or null"}`

// ─── T7-MATCH SYSTEM PROMPT (§5.3) ────────────────────────────────────

export const MATCH_SYSTEM_PROMPT = `You match trade service leads (plumbing/electrical, Sydney AU) to candidate jobs. You receive a LEAD (the customer's enquiry) and up to 15 CANDIDATE JOBS.

Each candidate has pre-computed PHONE_MATCH and EMAIL_MATCH signals. These are AUTHORITATIVE — computed deterministically from normalised phone/email comparison. Do NOT re-derive phone or email matches yourself. Trust the pre-computed values. PHONE_MATCH and EMAIL_MATCH, when true, each count as one corroborating signal toward the match bar — combine with the fuzzy dimensions when counting.

Each candidate is annotated with DAYS_FROM_LEAD (0 = same day, 1 = next day, etc.). When choosing among candidates that pass the match bar, closer-in-time is stronger evidence — a job 2 days after the lead is far more likely the correct match than one 28 days after. Factor proximity into confidence and into the multi-candidate tiebreak.

Your task: evaluate each candidate on FOUR fuzzy dimensions:
1. NAME — does the lead's caller name match the candidate's client or contact name? Reversed names count (e.g. "Janet Howse" = "Howse Janet"). Abbreviated first names without a surname do NOT count as a name match without a corroborating signal — "Ben" alone matching "Ben Dermody" is not sufficient (the "two Steves in Eastwood" trap).
2. ADDRESS — does a street address mentioned in the lead appear in the candidate's description or notes?
3. SUBURB — does the lead's location match the candidate's suburb or address locality?
4. PROBLEM — does the lead's reported issue match the candidate's work description? There are TWO levels of problem match:
   - VERBATIM PROBLEM FINGERPRINT: the lead's problem text and the candidate's work description share distinctive actual text — a specific multi-clause fault list, a unique combination of issues, or phrasing that would NOT plausibly coincide on an unrelated job. Example: "LED lights not working, replace drivers. Garden lights not working, external wall lights not working. Light switch covers need replacing" appearing substantially word-for-word on both sides. A verbatim fingerprint is a STRONG signal (see match bar below).
   - SEMANTIC PROBLEM MATCH: the lead and candidate describe the same type of problem in different words ("no hot water" matches "hot water unit failed"; "leaking shower" matches "shower taps dripping"). This is an ORDINARY signal — it counts as one signal but requires a second distinct signal to satisfy the bar.
   - Generic or short problem phrases ("blocked toilet", "no power", "leaking tap") do NOT qualify as verbatim fingerprints even if textually identical — they are too common to be distinctive. These count as semantic matches only.

Pick the ONE candidate that best matches the lead, or ABSTAIN if none qualifies.

MATCH BAR (apply strictly):
- COD job: >=2 distinct corroborating signals (from the six: name, address, suburb, phone, email, problem), at least one being problem-match. EXCEPTION: a verbatim problem fingerprint (distinctive text overlap, not generic/short) is strong enough to satisfy the COD bar on its own, or to serve as a qualifying signal alongside a weak name (e.g. first-name-only).
- Account job: >=1 HARD identity signal (name, phone, or email matching a PERSON named in the description — NOT the strata/property management company name) AND problem-match AND a location signal (address or suburb). Suburb + problem alone without a person-identity signal = ABSTAIN. The verbatim problem exception does NOT relax the Account bar's person-identity requirement.
- PROBLEM-MISMATCH VETO: if the lead's reported problem clearly contradicts the candidate's work description, disqualify that candidate regardless of how many other signals match. Same person, different problem = different event.
- MULTI-CANDIDATE: if two or more candidates score within 0.1 confidence of each other, ABSTAIN — the match is ambiguous.
- CONFIDENCE THRESHOLD: confidence must be >= 0.8 for a match. Below 0.8 = ABSTAIN.
- FORWARD-ONLY: candidates are already filtered to jobs dated 0 to +30 days after the lead (enforced in candidate generation).

Return ONLY this JSON:
{"jobnumber":"XXXXXX","confidence":0.XX,"evidence":"one sentence citing the matching signals","corroboration":"name+problem|phone+suburb+problem|verbatim_problem|etc","abstain":false}

OR if no match qualifies:
{"jobnumber":null,"confidence":0,"evidence":"reason for abstaining","corroboration":"","abstain":true}`

// ─── GATE CONSTRAINT LOGIC ──────────────────────────────────────────────

export type GateStage =
  | 'determined:Completed and Invoiced'
  | 'determined:account_billing_review'
  | 'determined:Booking Cancelled'
  | 'determined:Job Pending'
  | 'determined:Not Captured / Unanswered Call'
  | 'determined:Not Captured / Dropped Call'
  | 'determined:Unable to Classify'
  | 'judgement:Booked'
  | 'judgement:Booked:completed_zero'
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
        sub_status: 'Account Billing Review',
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
  // Archived + $0 → Booking Cancelled (determined by job_status)
  if (gate_stage === 'determined:Booking Cancelled') {
    return {
      determined: {
        opportunity_id: '',
        gate_stage: gate_stage as GateStage,
        sub_status: 'Booking Cancelled',
        stage: 'Booked',
        confidence: 1.0,
        reasoning: 'Determined: job_status=Archived + $0 invoiced → never completed/attended',
        source_quote: '',
        is_determined: true,
      },
      allowedSet: null,
      systemPrompt: null,
    }
  }
  // Open + $0 → Job Pending (determined by job_status)
  if (gate_stage === 'determined:Job Pending') {
    return {
      determined: {
        opportunity_id: '',
        gate_stage: gate_stage as GateStage,
        sub_status: 'Job Pending',
        stage: 'Booked',
        confidence: 1.0,
        reasoning: 'Determined: job_status=Open + $0 invoiced → still scheduled',
        source_quote: '',
        is_determined: true,
      },
      allowedSet: null,
      systemPrompt: null,
    }
  }
  // Unanswered Call: no live human connection (unanswered, IVR-only, ring-out)
  if (gate_stage === 'determined:Not Captured / Unanswered Call') {
    return {
      determined: {
        opportunity_id: '',
        gate_stage: gate_stage as GateStage,
        sub_status: 'Unanswered Call',
        stage: 'Not Captured',
        confidence: 1.0,
        reasoning: 'Determined: no live human connection on any call (IVR/greeting-only or unanswered)',
        source_quote: '',
        is_determined: true,
      },
      allowedSet: null,
      systemPrompt: null,
    }
  }
  // Dropped Call: live connection made but line failed (reception-failure language)
  if (gate_stage === 'determined:Not Captured / Dropped Call') {
    return {
      determined: {
        opportunity_id: '',
        gate_stage: gate_stage as GateStage,
        sub_status: 'Dropped Call',
        stage: 'Not Captured',
        confidence: 1.0,
        reasoning: 'Determined: live connection but line failed (reception-failure language, no substantive exchange)',
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
  // Completed + $0: payment-regex pre-pass, then T7 for residual.
  // The caller should run applyPaymentRegex() on job notes BEFORE calling T7.
  // If the regex resolves it, the caller uses the determined result.
  // If not, T7 runs with the constrained Booked set.
  if (gate_stage === 'judgement:Booked:completed_zero') {
    return {
      determined: null,
      allowedSet: BOOKED_ALLOWED,
      systemPrompt: BOOKED_SYSTEM_PROMPT,
    }
  }
  if (gate_stage === 'judgement:NQ/NB') {
    return {
      determined: null,
      // CU/NFUR pre-pass: caller passes has_logged_outbound; if FALSE,
      // use NQ_NB_ALLOWED_NO_OUTBOUND (CU removed). Default to full set.
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
 * Resolve the NQ/NB allowed set based on the CU/NFUR pre-pass.
 * Call BEFORE T7 runs. The has_logged_outbound fact determines whether
 * Customer Unresponsive is structurally available.
 *
 * @param has_logged_outbound - TRUE if lead_timeline has ≥1 row with
 *   interaction_type IN ('Outbound Call', 'Outbound Email').
 *   OHQ/Answering Service does NOT count. 0-duration outbound calls DO count.
 */
/**
 * Resolve the NQ/NB allowed set based on deterministic pre-pass facts.
 *
 * @param has_logged_outbound - FALSE removes CU (can't be unresponsive without outbound)
 * @param has_internal_touch - FALSE removes NJR (external callers are never internal ops)
 */
export function resolveNqNbAllowedSet(
  has_logged_outbound: boolean,
  has_internal_touch: boolean = true  // default TRUE to preserve existing behaviour
): readonly string[] {
  let set: string[] = [...(has_logged_outbound ? NQ_NB_ALLOWED : NQ_NB_ALLOWED_NO_OUTBOUND)]
  if (!has_internal_touch) {
    set = set.filter(s => s !== 'Not Job Related')
  }
  return set
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

// ─── KEYWORD PRE-PASS ───────────────────────────────────────────────────

export interface KeywordRule {
  term: string
  our_category: string
  ferg_category: string | null
  match_type: 'phrase' | 'word' | 'contains'
  confidence: 'high' | 'low'
}

export interface KeywordMatch {
  rule: KeywordRule
  matched_in: string  // which field matched (e.g. 'interaction_summary', 'form_content')
}

// Price-keyword routing: the keyword flags "declined on price"; the gate's
// allowed-set check picks the stage. When "Price / Minimum Call Out" fires
// but the lead is in the Booked set (JN exists), it routes to "Quote Only"
// (a quote was given, declined on price). When the lead is in the NQ/NB set
// (no JN), it stays as "Price / Minimum Call Out" (balked pre-quote).
const PRICE_TO_BOOKED_REMAP: Record<string, string> = {
  'Price / Minimum Call Out': 'Quote Only',
}

/**
 * Run keyword rules against a lead's content as a cheap deterministic pre-pass.
 * Returns the best match (highest confidence, longest term), or null.
 *
 * High-confidence matches auto-classify (skip AI).
 * Low-confidence matches flag for AI confirmation (AI still runs, but the keyword
 * match is passed as a hint).
 *
 * Only matches active rules within the gate's allowed set (including price
 * keywords that remap to a Booked-allowed sub-status via PRICE_TO_BOOKED_REMAP).
 */
export function applyKeywordRules(
  content: string,
  rules: KeywordRule[],
  allowedSet: readonly string[]
): KeywordMatch | null {
  if (!content || rules.length === 0) return null

  const lowerContent = content.toLowerCase()
  let bestMatch: KeywordMatch | null = null
  let bestScore = -1  // prefer: high > low confidence, longer term > shorter

  for (const rule of rules) {
    // Check if the category is directly in the allowed set
    let effectiveCategory = rule.our_category
    if (!allowedSet.includes(effectiveCategory)) {
      // Check if it can remap for this allowed set (e.g. price → Quote Only for Booked)
      const remapped = PRICE_TO_BOOKED_REMAP[effectiveCategory]
      if (remapped && allowedSet.includes(remapped)) {
        effectiveCategory = remapped
      } else {
        continue  // not allowed in this set, skip
      }
    }

    const term = rule.term.toLowerCase()
    let matched = false

    if (rule.match_type === 'phrase') {
      matched = lowerContent.includes(term)
    } else if (rule.match_type === 'word') {
      // Word boundary: term surrounded by non-alphanumeric or start/end
      const re = new RegExp(`(?:^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`)
      matched = re.test(lowerContent)
    } else {
      // contains — simple substring
      matched = lowerContent.includes(term)
    }

    if (matched) {
      const score = (rule.confidence === 'high' ? 1000 : 0) + term.length
      if (score > bestScore) {
        bestScore = score
        // Return the effective (possibly remapped) category
        bestMatch = {
          rule: { ...rule, our_category: effectiveCategory },
          matched_in: 'content',
        }
      }
    }
  }

  return bestMatch
}

// ─── PAYMENT-REGEX PRE-PASS (Completed + $0 split) ────────────────────
// For judgement:Booked:completed_zero — run BEFORE T7 to resolve
// Invoice Pending (money collected) vs Quote Only (didn't proceed).
// Returns a determined result if the regex matches, null otherwise.

const PAYMENT_PATTERN = /\$\d+[\d,.]*\s*(?:\+\s*gst|plus\s*gst)|(?:collected|banked|paid|eft|card|cash)\s*[\$\d]/i
const NOT_PROCEEDING_PATTERN = /(?:quote\s+only|not\s+going\s+ahead|too\s+expensive|declined|won'?t\s+proceed|didn'?t\s+proceed|not\s+proceed|getting\s+other\s+quotes|close\s+off|waste\s+of\s+time)/i

export interface PaymentRegexResult {
  sub_status: string
  confidence: number
  reasoning: string
  source_quote: string
}

/**
 * Payment-regex pre-pass for Completed + $0 jobs.
 * Checks labour notes and task notes for payment or not-proceeding signals.
 *
 * @param labourNote - tech labour note text (may be null)
 * @param taskNotes - task notes text (may be null)
 * @param creditNoteCount - from vw_job_invoiced; >0 is a neutral hint passed to T7
 * @returns determined result if regex matches, null if T7 should decide
 */
export function applyPaymentRegex(
  labourNote: string | null,
  taskNotes: string | null,
  creditNoteCount: number = 0
): PaymentRegexResult | null {
  const combined = [labourNote, taskNotes].filter(Boolean).join('\n')
  if (!combined) return null

  // Check not-proceeding FIRST (more specific — avoids false Invoice Pending
  // when notes say "quoted $500 but customer declined")
  const notProceedingMatch = combined.match(NOT_PROCEEDING_PATTERN)
  if (notProceedingMatch) {
    return {
      sub_status: 'Quote Only',
      confidence: 0.9,
      reasoning: `Payment-regex: not-proceeding pattern matched in notes`,
      source_quote: notProceedingMatch[0],
    }
  }

  // Check payment pattern
  const paymentMatch = combined.match(PAYMENT_PATTERN)
  if (paymentMatch) {
    return {
      sub_status: 'Completed - Invoice Pending',
      confidence: 0.85,
      reasoning: `Payment-regex: payment/collection pattern matched in notes`,
      source_quote: paymentMatch[0],
    }
  }

  // Neither matched — T7 decides. If credit_note_count > 0, the caller
  // should pass that as a neutral hint in the prompt context, NOT as a
  // gate signal.
  return null
}
