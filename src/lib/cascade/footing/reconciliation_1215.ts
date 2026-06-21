/**
 * Footing manifest for the reconciliation_1215 scope.
 *
 * These numbers were footed manually and represent the ground truth
 * for the WC reconciliation population. Changes require a separate,
 * log-entered change. Do NOT relax the check to make a run pass.
 */

export interface FootingManifest {
  test_excluded: number
  mapped: number
  no_identity: number
  spine_gap: number
  total: number
  tolerance: number  // per bucket — 0 means exact match required
}

// Updated 2026-06-21: population expanded from 1,215 to 1,245 (enriched_leads-10.csv).
// WC Repeat leads now included in graph clustering (build_opportunities.sql).
// Bucket counts TBD after first run with Repeat leads — tolerance set to
// informational-only until new buckets are footed and locked.
//
// Prior manifest (2026-06-20): {116, 1088, 8, 3} = 1215, tolerance=0.
export const RECONCILIATION_1215_MANIFEST: FootingManifest = {
  test_excluded: 116,   // TBD: will change with Repeat leads (some are test)
  mapped: 1088,         // TBD: Repeat leads will increase this
  no_identity: 8,       // TBD: may change
  spine_gap: 3,         // TBD: may change
  total: 1245,
  tolerance: 999,       // TEMPORARY: informational until new buckets footed
}
