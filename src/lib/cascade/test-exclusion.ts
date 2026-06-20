/**
 * Test/internal lead exclusion — canonical list of excluded identities.
 *
 * Address-level exclusion (not domain-level). Each entry is a specific
 * email address, phone, or WC lead ID confirmed as internal test traffic.
 * Domain-level wildcards are not used — future staff or agency contacts
 * on shared domains must not be silently excluded.
 *
 * Sources:
 *   - is_test_lead flag on all_leads_enriched (WC-maintained)
 *   - test_wc_leads table (manually curated WC lead IDs)
 *   - test_numbers table (manually curated phone numbers)
 *   - explicit email addresses below (confirmed internal, per lifetime audit)
 */

/**
 * Explicit internal email addresses. Address-level, not domain-level.
 * Confirmed via lifetime audit: 101 leads across all 4 domains, zero
 * real customer enquiries, zero converters.
 */
export const INTERNAL_EMAIL_ADDRESSES: readonly string[] = [
  'alexm@mrwasher.com.au',
  'fergusg@mrwasher.com.au',
  'francesb@mrwasher.com.au',
  'gordo@mrwasher.com.au',
  'matt@quinnmarketing.com.au',
]

/**
 * Build the SQL WHERE clause fragment for test exclusion.
 * Combines: is_test_lead flag, test_wc_leads table, test_numbers table,
 * and the explicit email address list.
 *
 * @param aleAlias - alias for all_leads_enriched (e.g. 'ale')
 * @param ds - dataset prefix for test tables (e.g. 'pttr-taskdata.ds_crm')
 * @returns SQL boolean expression — TRUE means the lead IS excluded
 */
export function testExclusionWhereClause(aleAlias: string, ds: string): string {
  const emailList = INTERNAL_EMAIL_ADDRESSES
    .map(e => `'${e}'`)
    .join(', ')

  return `(
    ${aleAlias}.is_test_lead = TRUE
    OR ${aleAlias}.lead_id IN (SELECT wc_lead_id FROM \`${ds}.test_wc_leads\`)
    OR ${aleAlias}.norm_contact_phone IN (SELECT phone_e164 FROM \`${ds}.test_numbers\`)
    OR ${aleAlias}.norm_phone IN (SELECT phone_e164 FROM \`${ds}.test_numbers\`)
    OR LOWER(COALESCE(${aleAlias}.contact_email_address, '')) IN (${emailList})
  )`
}
