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

// Updated 2026-06-20: test_excluded 109→116, mapped 1095→1088.
// 12 leads (7 net) newly excluded by email-domain and test-list rules that
// were expanded since the original footing: 6× alex m (alexm@mrwasher),
// 2× Fran (francesb@mrwasher), 3× matt@quinnmarketing (test_wc_leads),
// 1× Fergus (fergusg@mrwasher, JN143006 Open/$0 internal test job).
// All genuine internal identities. Zero converters. Total unchanged at 1215.
export const RECONCILIATION_1215_MANIFEST: FootingManifest = {
  test_excluded: 116,
  mapped: 1088,
  no_identity: 8,
  spine_gap: 3,
  total: 1215,
  tolerance: 0,
}
