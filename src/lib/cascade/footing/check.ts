/**
 * Footing check — Step 9.5 in the cascade.
 *
 * For scopes WITH a manifest: observed ≠ expected by ANY bucket → HALT.
 * For scopes WITHOUT a manifest: log observed counts as informational.
 */

import type { Scope } from '../run-config'
import { RECONCILIATION_1215_MANIFEST } from './reconciliation_1215'
import type { FootingManifest } from './reconciliation_1215'

export interface ObservedCounts {
  test_excluded: number
  mapped: number
  no_identity: number
  spine_gap: number
  total: number
}

function getManifest(scope: Scope): FootingManifest | null {
  switch (scope) {
    case 'reconciliation_1215': return RECONCILIATION_1215_MANIFEST
    case 'historical_pre_dec2025': return null
    case 'live_post_dec2025': return null
    case 'custom': return null
    default: return null
  }
}

/**
 * Run the footing check. Throws on manifest violation.
 * Returns true if a manifest was checked, false if informational only.
 */
export function runFootingCheck(scope: Scope, observed: ObservedCounts): boolean {
  const manifest = getManifest(scope)

  if (!manifest) {
    console.log(`STEP 9.5: FOOTING CHECK — no manifest for scope=${scope} (informational only)`)
    console.log(`  observed: test_excluded=${observed.test_excluded}, mapped=${observed.mapped}, no_identity=${observed.no_identity}, spine_gap=${observed.spine_gap}, total=${observed.total}`)
    return false
  }

  console.log(`STEP 9.5: FOOTING CHECK — manifest for scope=${scope}, tolerance=${manifest.tolerance}`)

  const diffs: string[] = []
  const buckets: (keyof ObservedCounts)[] = ['test_excluded', 'mapped', 'no_identity', 'spine_gap', 'total']

  for (const bucket of buckets) {
    const expected = manifest[bucket]
    const actual = observed[bucket]
    const diff = Math.abs(actual - expected)
    if (diff > manifest.tolerance) {
      diffs.push(`  ${bucket}: expected=${expected}, observed=${actual}, diff=${actual - expected}`)
    }
  }

  if (diffs.length > 0) {
    const table = diffs.join('\n')
    throw new Error(
      `HALT: Footing check FAILED for scope=${scope}.\n` +
      `Bucket differences (tolerance=${manifest.tolerance}):\n${table}\n` +
      `Readout will NOT run. Fix the population or update the manifest ` +
      `(requires a separate, log-entered change).`
    )
  }

  console.log(`  PASS: all buckets match manifest (total=${observed.total})`)
  return true
}
