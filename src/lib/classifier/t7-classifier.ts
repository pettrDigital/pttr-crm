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
  'Unanswered Call': 'Not Captured',
  'Dropped Call': 'Not Captured',
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
  'No Follow-Up Recorded': 'Not Booked',
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
  'No Follow-Up Recorded',
  'Other',
] as const

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
) as unknown as readonly string[]

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
- If job is Archived + $0 invoiced + NO labour/task note showing work done or money collected → MUST be "Quote Only" or "Booking Cancelled" (NOT Job Pending). Archived means the job lifecycle is OVER — it cannot be pending. "Job Pending" is ONLY for jobs that appear genuinely still scheduled/open (not Archived, not Completed).
- If genuinely no outcome signal AND the job status is Open/not-yet-attended → "Job Pending"
- CRITICAL: a Booked-stage job that is Archived with $0 and no work note is a lead that DIDN'T PROCEED. Default to "Quote Only" if a site visit occurred (any labour note exists), or "Booking Cancelled" if no visit evidence. Never "Job Pending" for an Archived job.

Return ONLY this JSON:
{"sub_status":"...","confidence":0.XX,"reasoning":"one sentence","source_quote":"key phrase or null"}`

export const NQ_NB_SYSTEM_PROMPT = `You classify trade services leads (plumbing/electrical, Sydney AU). The stage is NOT yet determined — you pick the sub_status, which determines the stage. Return valid JSON only.

Pick ONE sub_status from this CLOSED set. The funnel stage is DERIVED from your choice.

NOT QUOTABLE (the enquiry itself is not actionable):
- "Spam" — Unsolicited inbound: marketing, telemarketing, sales pitches, AND job-seekers/apprentice enquiries. Includes cleaning-service pitches, employment agencies, office-space offers, any external party trying to SELL TO PETTR OR seeking employment/apprenticeships/work placement. Also includes callers from outside Australia (geographic spam). The caller is not a customer seeking plumbing/electrical service.
- "Service Not Provided" — A genuine customer enquiry for something PETTR does not do (not plumbing or electrical). E.g. TV repair, locksmith, solar, appliance installation, air conditioning, roofing, gas fitting. The caller wants to buy, but we don't sell it.
- "Outside Service Area" — Geographic: caller is within Australia but outside the Sydney/Greater Sydney service area. The service is something we do, but not where they are.
- "Strata Issue" — The issue itself is a strata/body corporate responsibility, not a direct-to-homeowner job. The caller needs to go through their strata, and PETTR cannot take the job directly. Distinct from Tenant/Strata Referral (below) where the caller HAS a real plumbing/electrical problem but needs strata approval.
- "Customer Inquiry Only" — An existing customer calling about an in-progress or recently completed job — not a new lead. Status check, warranty question, complaint about existing work, scheduling an already-booked return visit.
- "Wrong Number / Contact Details" — Wrong number, disconnected, fax line, or invalid contact details. The lead cannot be reached or was never intended for PETTR.
- "Not Job Related" — An INTERNAL/OPERATIONAL call ONLY: known staff member or DID marked [INTERNAL] discussing scheduling, inventory, HR, etc. NOT external callers of any kind — external sales pitches, job seekers, and apprentice enquiries are all "Spam" (unsolicited inbound). "Not Job Related" is reserved exclusively for identified internal staff communications.

NOT BOOKED (the enquiry was real and quotable, but didn't convert to a booking):
- "Customer Unresponsive" — We attempted to contact the customer and they did not respond. REQUIRES POSITIVE EVIDENCE: at least one VISIBLE, TRACKABLE outbound follow-up (call, SMS, or email) MUST appear in the timeline. Signal: outbound calls with short durations (0-10s = unanswered), voicemail left, SMS sent with no reply. If NO trackable outbound follow-up is visible in the timeline, use "No Follow-Up Recorded" instead. IMPORTANT: an after-hours OHQ/answering-service handoff does NOT qualify as visible outbound — the tech-mobile follow-up channel is untracked. OHQ leads with no trackable outbound → "No Follow-Up Recorded".
- "Tenant / Strata Referral" — The caller is a tenant/resident who needs strata manager or property manager approval to proceed. They have a real problem (plumbing/electrical) but cannot authorise the work themselves. Distinct from Strata Issue (above) where the issue itself is strata's responsibility.
- "Price / Minimum Call Out" — Customer declined due to pricing: minimum call-out fee too high, quoted price unfavourable, or price comparison. The service was quotable and in-area.
- "Capacity / Scheduling" — PETTR couldn't accommodate the timeline (fully booked, too far out) OR customer's schedule didn't align. The issue is timing/availability, not price or scope.
- "Wanted Quote Over Phone" — Customer wanted a price estimate over the phone without booking a site visit. The enquiry ended at the phone-quote stage.
- "Customer Resolved" — The problem resolved on its own OR the customer fixed/handled it themselves, BEFORE any PETTR booking or site visit. Examples: Sydney Water fixed the main, blockage cleared, power came back, customer replaced a part themselves. No PETTR service was provided or needed.
- "Booked Elsewhere" — Customer told us they chose a competitor BEFORE any job was created with us. They explicitly said they're going with someone else.
- "No Follow-Up Recorded" — A valid enquiry where NO TRACKABLE outbound follow-up is visible in the timeline AND no positive evidence of customer choice (not gone-cold-after-contact, not declined-on-price). Describes the DATA STATE, not a cause. Do NOT assert operational failure from absence — it may be a data gap. Use when: no outbound calls/SMS/emails visible after the initial inbound touch. INCLUDES: after-hours OHQ/answering-service leads where the follow-up path is an untracked tech mobile — we cannot see whether contact was made, so the data state is "no follow-up recorded."
- "Other" — Does not fit any defined category. Selecting this flags the lead for human review.

DECISION RULES (apply in order — REASON-GIVEN beats STATUS-INFERRED):

LAYER 1 — NOT-QUOTABLE FILTER (apply first, these exit early):
1. If the caller is selling/pitching TO PETTR, or seeking employment/apprenticeship/work placement → "Spam"
2. If the caller wants a service PETTR doesn't offer (not plumbing/electrical) → "Service Not Provided"
3. If the caller is geographically outside Sydney metro → "Outside Service Area"
9. If the caller is a tenant needing strata approval → "Tenant / Strata Referral"
10. If this is an existing-customer callback about an existing job → "Customer Inquiry Only"

LAYER 2 — REASON-GIVEN (customer stated WHY they didn't book — this OVERRIDES follow-up disposition):
5. PRICE PRIORITY: If the customer EXPLICITLY balked at price/cost/minimum-charge as the reason for not proceeding → "Price / Minimum Call Out". Requires EXPLICIT evidence: customer said the price is "too high", "too expensive", "higher than my budget", "more than I expected", "got it done cheaper elsewhere", or declined after hearing the call-out fee. A customer who merely ASKS "how much" or hears the price WITHOUT expressing that price is the barrier is NOT Price — they may proceed, or decline for other reasons. Price must be the STATED barrier, not just mentioned.
6. QUOTE PRIORITY: If the customer's primary intent was a price/quote request AND they ended the interaction without booking BECAUSE they wanted pricing first → "Wanted Quote Over Phone". Signals: "can I get a quote", "just after a price", "ring around and get prices", "how much would it cost" where the call ends at the quoting stage with no booking made. Requires the customer to have SOUGHT pricing as the primary purpose, not just asked about cost mid-conversation. Overrides CU/NFUR — a quote-seeker who didn't book is "Wanted Quote", not "Unresponsive".
7. If availability/timing was the barrier → "Capacity / Scheduling"
8. If the caller said they found someone else / going elsewhere → "Booked Elsewhere"
8a. If the problem resolved on its own → "Customer Resolved"

LAYER 3 — FOLLOW-UP DISPOSITION (only when NO explicit reason was given):
4. If TRACKABLE outbound follow-up IS visible (calls/SMS/email sent — NOT an OHQ handoff) but customer didn't respond → "Customer Unresponsive"
4a. If NO trackable outbound follow-up is visible in the timeline (including after-hours OHQ leads where follow-up goes to untracked tech mobile) → "No Follow-Up Recorded" (not Customer Unresponsive)

GENERAL PRINCIPLE: When the customer's STATED REASON for not booking is visible in the content (price, wanted-quote-only, timing, went-elsewhere, resolved), classify by REASON. CU and NFUR are RESIDUAL dispositions — use them ONLY when no explicit reason is present in the content.

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
export function resolveNqNbAllowedSet(
  has_logged_outbound: boolean
): readonly string[] {
  return has_logged_outbound ? NQ_NB_ALLOWED : NQ_NB_ALLOWED_NO_OUTBOUND
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
