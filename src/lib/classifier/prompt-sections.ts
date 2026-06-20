/**
 * Prompt-section generators — render the allowed-output blocks for T7.2
 * system prompts from the canonical taxonomy.
 *
 * Pure functions, no I/O. The ordering matches the validated 89.1% model's
 * prompt exactly — do NOT re-order without re-validating.
 */

import { TAXONOMY } from './taxonomy'
import type { Leaf } from './taxonomy'

// ─── ORDERING (matches the validated prompt; do NOT alphabetise) ─────────

// Booked prompt order (1-indexed in the prompt text)
const BOOKED_ORDER: readonly string[] = [
  'Completed - Invoice Pending',
  'Quote Only',
  'Booking Cancelled',
  'Unable to Complete Job - Out of Scope',
  'Job Pending',
]

// NQ/NB prompt order — two sections, each preserving the validated sequence
const NQ_ORDER: readonly string[] = [
  'Spam',
  'Service Not Provided',
  'Outside Service Area',
  'Common Property Responsibility',
  'Customer Inquiry Only',
  'Wrong Number',
  'Not Job Related',
]

const NB_ORDER: readonly string[] = [
  'Customer Unresponsive',
  'Tenant / Strata Referral',
  'Price / Minimum Call Out',
  'Capacity / Scheduling',
  'Wanted Quote Over Phone',
  'Customer Resolved',
  'Booked Elsewhere',
  'No Follow-Up Recorded',
  'Other',
]

function lookupLeaf(name: string): Leaf {
  const leaf = TAXONOMY.find(l => l.name === name)
  if (!leaf) throw new Error(`prompt-sections: leaf "${name}" not found in TAXONOMY`)
  return leaf
}

/**
 * Build the allowed-output enumeration for the BOOKED system prompt.
 * Format: numbered list, each entry is  N. "name" — definition
 * Matches the shape the validated model saw.
 */
export function buildBookedAllowedSection(): string {
  return BOOKED_ORDER.map((name, i) => {
    const leaf = lookupLeaf(name)
    return `${i + 1}. "${leaf.name}" — ${leaf.definition}`
  }).join('\n\n')
}

/**
 * Build the allowed-output enumeration for the NQ/NB system prompt.
 * Format: two headed sections (NOT QUOTABLE / NOT BOOKED), each entry is
 *   - "name" — definition
 * Matches the shape the validated model saw.
 */
export function buildNqNbAllowedSection(): string {
  const nqLines = NQ_ORDER.map(name => {
    const leaf = lookupLeaf(name)
    return `- "${leaf.name}" — ${leaf.definition}`
  }).join('\n')

  const nbLines = NB_ORDER.map(name => {
    const leaf = lookupLeaf(name)
    return `- "${leaf.name}" — ${leaf.definition}`
  }).join('\n')

  return `NOT QUOTABLE (the enquiry itself is not actionable):\n${nqLines}\n\nNOT BOOKED (the enquiry was real and quotable, but didn't convert to a booking):\n${nbLines}`
}
