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
 * Internal email addresses are now in BQ table ds_crm.test_emails.
 * This constant is kept for backward compatibility with any code that
 * imports it directly, but the canonical source is the BQ table.
 * To add a new internal email: INSERT into test_emails, not here.
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
 * and test_emails table (all in BQ).
 *
 * @param aleAlias - alias for all_leads_enriched (e.g. 'ale')
 * @param ds - dataset prefix for test tables (e.g. 'pttr-taskdata.ds_crm')
 * @returns SQL boolean expression — TRUE means the lead IS excluded
 */
export function testExclusionWhereClause(aleAlias: string, ds: string): string {
  // COALESCE to FALSE: when the LEFT JOIN to ALE produces no row (NULL for
  // all fields), the lead is NOT excluded. Without this, NOT (NULL OR ...) = NULL
  // = falsy, silently dropping real customer leads with no enriched row.
  return `COALESCE(
    ${aleAlias}.is_test_lead = TRUE
    OR ${aleAlias}.lead_id IN (SELECT wc_lead_id FROM \`${ds}.test_wc_leads\`)
    OR ${aleAlias}.norm_contact_phone IN (SELECT phone_e164 FROM \`${ds}.test_numbers\`)
    OR ${aleAlias}.norm_phone IN (SELECT phone_e164 FROM \`${ds}.test_numbers\`)
    OR LOWER(COALESCE(${aleAlias}.contact_email_address, '')) IN (SELECT email FROM \`${ds}.test_emails\`),
    FALSE
  )`
}
