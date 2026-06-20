/**
 * CANONICAL TAXONOMY — the ONLY place leaf strings, stages, allowed-sets,
 * and definitions are defined. Every consumer imports from here.
 *
 * Do NOT define leaf strings anywhere else. Do NOT hand-maintain derived
 * exports — they are generated from TAXONOMY.
 *
 * To add/rename/remove a leaf: edit TAXONOMY below, then run
 *   scripts/render-taxonomy-md.ts
 * to regenerate the S4.4 block in the spec.
 */

// ─── TYPES ──────────────────────────────────────────────────────────────

export type Stage =
  | 'Not Captured'
  | 'Unable to Classify'
  | 'Not Quotable'
  | 'Not Booked'
  | 'Booked'
  | 'Pending'

export type EmitSource = 'gate' | 't7' | 'manual'

export interface Leaf {
  name: string
  stage: Stage
  sources: EmitSource[]
  t7Set: 'BOOKED' | 'NQ_NB' | null
  definition: string
}

// ─── THE LOCKED LIST ────────────────────────────────────────────────────

export const TAXONOMY: readonly Leaf[] = [
  // ── Not Captured (determined) ──
  {
    name: 'Unanswered Call',
    stage: 'Not Captured',
    sources: ['gate'],
    t7Set: null,
    definition: 'Call was not answered; no other readable content. Determined from the CDR, not from transcript absence.',
  },
  {
    name: 'Dropped Call',
    stage: 'Not Captured',
    sources: ['gate'],
    t7Set: null,
    definition: 'Call was answered, then the line failed mid-exchange (reception failure); sole touch on the lead.',
  },

  // ── Unable to Classify (determined) ──
  {
    name: 'Unable to Classify',
    stage: 'Unable to Classify',
    sources: ['gate'],
    t7Set: null,
    definition: 'A touch exists but there is zero readable content. Excluded from funnel denominators.',
  },

  // ── Not Quotable (T7 judgement) ──
  {
    name: 'Spam',
    stage: 'Not Quotable',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "Spam" (t7-classifier.ts)
    definition: 'Unsolicited inbound that is not a customer seeking plumbing/electrical service. Includes: marketing/telemarketing/sales pitches, cleaning-service pitches, employment agencies, office-space offers, any external party trying to SELL TO PETTR. Also includes job-seekers and apprentice enquiries (people seeking employment/work placement/apprenticeships — they are not customers). Also includes callers from outside Australia (geographic spam).',
  },
  {
    name: 'Service Not Provided',
    stage: 'Not Quotable',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "Service Not Provided" (t7-classifier.ts)
    definition: 'A genuine customer enquiry for something PETTR does not do (not plumbing or electrical). E.g. TV repair, locksmith, solar, appliance installation, air conditioning, roofing, gas fitting. The caller wants to buy, but we don\'t sell it.',
  },
  {
    name: 'Outside Service Area',
    stage: 'Not Quotable',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "Outside Service Area" (t7-classifier.ts)
    definition: 'Geographic: caller is within Australia but outside the Sydney/Greater Sydney service area. The service is something we do, but not where they are.',
  },
  {
    name: 'Common Property Responsibility',
    stage: 'Not Quotable',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "Strata Issue" (t7-classifier.ts) — renamed, definition verbatim
    definition: 'The issue itself is a strata/body corporate responsibility, not a direct-to-homeowner job. The caller needs to go through their strata, and PETTR cannot take the job directly. Distinct from Tenant/Strata Referral (below) where the caller HAS a real plumbing/electrical problem but needs strata approval.',
  },
  {
    name: 'Customer Inquiry Only',
    stage: 'Not Quotable',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "Customer Inquiry Only" (t7-classifier.ts)
    definition: 'An existing customer calling about an in-progress or recently completed job — not a new lead. Status check, warranty question, complaint about existing work, scheduling an already-booked return visit.',
  },
  {
    name: 'Wrong Number',
    stage: 'Not Quotable',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "Wrong Number / Contact Details" (t7-classifier.ts) — renamed, definition verbatim
    definition: 'Wrong number, disconnected, fax line, or invalid contact details. The lead cannot be reached or was never intended for PETTR.',
  },
  {
    name: 'Not Job Related',
    stage: 'Not Quotable',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "Not Job Related" (t7-classifier.ts)
    definition: 'An INTERNAL/OPERATIONAL call ONLY: known staff member or DID marked [INTERNAL] discussing scheduling, inventory, HR, etc. NOT external callers of any kind — external sales pitches, job seekers, and apprentice enquiries are all "Spam" (unsolicited inbound). "Not Job Related" is reserved exclusively for identified internal staff communications.',
  },

  // ── Not Booked (T7 judgement, no JN) ──
  {
    name: 'Customer Unresponsive',
    stage: 'Not Booked',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "Customer Unresponsive" (t7-classifier.ts)
    definition: 'We attempted to contact the customer and they did not respond. REQUIRES POSITIVE EVIDENCE: at least one VISIBLE, TRACKABLE outbound follow-up (call, SMS, or email) MUST appear in the timeline. Signal: outbound calls with short durations (0-10s = unanswered), voicemail left, SMS sent with no reply. If NO trackable outbound follow-up is visible in the timeline, use "No Follow-Up Recorded" instead. IMPORTANT: an after-hours OHQ/answering-service handoff does NOT qualify as visible outbound — the tech-mobile follow-up channel is untracked. OHQ leads with no trackable outbound → "No Follow-Up Recorded".',
  },
  {
    name: 'No Follow-Up Recorded',
    stage: 'Not Booked',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "No Follow-Up Recorded" (t7-classifier.ts)
    definition: 'A valid enquiry where NO TRACKABLE outbound follow-up is visible in the timeline AND no positive evidence of customer choice (not gone-cold-after-contact, not declined-on-price). Describes the DATA STATE, not a cause. Do NOT assert operational failure from absence — it may be a data gap. Use when: no outbound calls/SMS/emails visible after the initial inbound touch. INCLUDES: after-hours OHQ/answering-service leads where the follow-up path is an untracked tech mobile — we cannot see whether contact was made, so the data state is "no follow-up recorded."',
  },
  {
    name: 'Tenant / Strata Referral',
    stage: 'Not Booked',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "Tenant / Strata Referral" (t7-classifier.ts)
    definition: 'The caller is a tenant/resident who needs strata manager or property manager approval to proceed. They have a real problem (plumbing/electrical) but cannot authorise the work themselves. Distinct from Common Property Responsibility (above) where the issue itself is strata\'s responsibility.',
  },
  {
    name: 'Price / Minimum Call Out',
    stage: 'Not Booked',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "Price / Minimum Call Out" (t7-classifier.ts)
    definition: 'Customer declined due to pricing: minimum call-out fee too high, quoted price unfavourable, or price comparison. The service was quotable and in-area.',
  },
  {
    name: 'Capacity / Scheduling',
    stage: 'Not Booked',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "Capacity / Scheduling" (t7-classifier.ts)
    definition: 'PETTR couldn\'t accommodate the timeline (fully booked, too far out) OR customer\'s schedule didn\'t align. The issue is timing/availability, not price or scope.',
  },
  {
    name: 'Wanted Quote Over Phone',
    stage: 'Not Booked',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "Wanted Quote Over Phone" (t7-classifier.ts)
    definition: 'Customer wanted a price estimate over the phone without booking a site visit. The enquiry ended at the phone-quote stage.',
  },
  {
    name: 'Customer Resolved',
    stage: 'Not Booked',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "Customer Resolved" (t7-classifier.ts)
    definition: 'The problem resolved on its own OR the customer fixed/handled it themselves, BEFORE any PETTR booking or site visit. Examples: Sydney Water fixed the main, blockage cleared, power came back, customer replaced a part themselves. No PETTR service was provided or needed.',
  },
  {
    name: 'Booked Elsewhere',
    stage: 'Not Booked',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "Booked Elsewhere" (t7-classifier.ts)
    definition: 'Customer told us they chose a competitor BEFORE any job was created with us. They explicitly said they\'re going with someone else.',
  },
  {
    name: 'Other',
    stage: 'Not Booked',
    sources: ['t7'],
    t7Set: 'NQ_NB',
    // Source: NQ_NB_SYSTEM_PROMPT line "Other" (t7-classifier.ts)
    definition: 'Does not fit any defined category. Selecting this flags the lead for human review.',
  },

  // ── Booked (mix of determined + judgement) ──
  {
    name: 'Completed and Invoiced',
    stage: 'Booked',
    sources: ['gate'],
    t7Set: null,
    definition: 'Job linked (JN) with invoiced_total_ex > 0.',
  },
  {
    name: 'Account Billing Review',
    stage: 'Booked',
    sources: ['gate'],
    t7Set: null,
    definition: 'Account/strata job archived at $0 invoiced. Billed via the Account arrangement, not the COD invoice flow, so $0 does not indicate cancellation — flag for Account billing check.',
  },
  {
    name: 'Completed - Invoice Pending',
    stage: 'Booked',
    sources: ['gate', 't7'],
    t7Set: 'BOOKED',
    // Source: BOOKED_SYSTEM_PROMPT line 1 "Completed - Invoice Pending" (t7-classifier.ts)
    definition: 'Job attended, work done, money collected per tech notes (labour note mentions $X+gst card/eft/cash, task notes show work completed) — but no processed invoice in AroFlo yet. The work WAS done and paid for.',
  },
  {
    name: 'Quote Only',
    stage: 'Booked',
    sources: ['gate', 't7'],
    t7Set: 'BOOKED',
    // Source: BOOKED_SYSTEM_PROMPT line 2 "Quote Only" (t7-classifier.ts)
    definition: 'We attended site and provided a quote, but the customer did not proceed with the work. Signals: labour note says "quote only", "not going ahead", "getting other quotes", "waste of time", "close off", or $0 collected. Distinct from Completed-Invoice Pending where money was collected.',
  },
  {
    name: 'Booking Cancelled',
    stage: 'Booked',
    sources: ['gate', 't7'],
    t7Set: 'BOOKED',
    // Source: BOOKED_SYSTEM_PROMPT line 3 "Booking Cancelled" (t7-classifier.ts)
    definition: 'Booking was cancelled for ANY reason BEFORE we attended or quoted. Customer cancelled via call/SMS, went with a competitor, was unresponsive to confirm, job resolved itself, or scheduling fell through. Includes "went elsewhere with a JN" pattern.',
  },
  {
    name: 'Job Pending',
    stage: 'Booked',
    sources: ['gate', 't7'],
    t7Set: 'BOOKED',
    // Source: BOOKED_SYSTEM_PROMPT line 5 "Job Pending" (t7-classifier.ts)
    definition: 'Job is booked/scheduled but not yet attended. No site visit, no quote, no outcome yet. Use ONLY when no content indicates an outcome has occurred.',
  },
  {
    name: 'Unable to Complete Job - Out of Scope',
    stage: 'Booked',
    sources: ['t7'],
    t7Set: 'BOOKED',
    // Source: BOOKED_SYSTEM_PROMPT line 4 "Unable to Complete Job - Out of Scope" (t7-classifier.ts)
    definition: 'We attended site but couldn\'t provide the service. Requires different trade, structural issue, manufacturer issue, no RPZ valve, roofing work, needs strata plumbers, etc.',
  },

  // ── Pending (manual-only) ──
  {
    name: 'Pending',
    stage: 'Pending',
    sources: ['manual'],
    t7Set: null,
    definition: 'A person has marked this lead as awaiting follow-up (records pending_since). Never AI-assigned.',
  },
] as const

// ─── DERIVED EXPORTS (generated from TAXONOMY — do NOT hand-maintain) ───

/** name -> stage mapping */
export const SUB_STATUS_TO_STAGE: Record<string, string> = Object.fromEntries(
  TAXONOMY.map(l => [l.name, l.stage])
)

/** Allowed sub-statuses for T7.2 Booked judgement */
export const BOOKED_ALLOWED: readonly string[] = TAXONOMY
  .filter(l => l.t7Set === 'BOOKED')
  .map(l => l.name)

/** Allowed sub-statuses for T7.2 NQ/NB judgement */
export const NQ_NB_ALLOWED: readonly string[] = TAXONOMY
  .filter(l => l.t7Set === 'NQ_NB')
  .map(l => l.name)

/** Set of all canonical leaf names */
export const ALL_LEAVES: ReadonlySet<string> = new Set(TAXONOMY.map(l => l.name))

/** Returns true if the name is a canonical leaf */
export function isValidLeaf(name: string): boolean {
  return ALL_LEAVES.has(name)
}

/** Throws if the name is not a canonical leaf (after legacy migration) */
export function assertValidLeaf(name: string): string {
  const migrated = migrateLegacyLeaf(name)
  if (ALL_LEAVES.has(migrated)) return migrated
  throw new Error(`Off-taxonomy sub_status: "${name}" (migrated: "${migrated}"). Not in ALL_LEAVES.`)
}

// ─── LEGACY MIGRATION (on-read, same pattern as S4.8) ──────────────────

/** Maps retired/renamed leaf strings to their canonical replacement */
export const LEGACY_MAP: Record<string, string> = {
  // S4.8 legacy values
  'Lost / Unresponsive': 'Customer Unresponsive',
  'CSR Failure': 'Customer Unresponsive',
  // Removed leaves
  'PETTR Did Not Respond': 'No Follow-Up Recorded',
  'Vodafone Orphan': 'No Follow-Up Recorded',
  // Renamed leaves
  'Strata Issue': 'Common Property Responsibility',
  'Wrong Number / Contact Details': 'Wrong Number',
  'Job Complete': 'Completed and Invoiced',
  // Spacing variants
  'Completed-Invoice Pending': 'Completed - Invoice Pending',
  'Unable to Complete-Out of Scope': 'Unable to Complete Job - Out of Scope',
}

/**
 * Migrate a legacy sub_status string to its canonical form.
 * Returns the input unchanged if it's already canonical or unknown.
 * Unknown strings are NOT mapped — they pass through so assertValidLeaf
 * can reject them.
 */
export function migrateLegacyLeaf(name: string): string {
  return LEGACY_MAP[name] ?? name
}

// ─── HOLDS (not auto-mapped — report count, do not resolve) ─────────────
// 'Technical Error': removed without a destination. If found in Firestore, report count.
// 'Pending Classification': placeholder from first run, not a leaf. Leads need T7.2 re-run.
