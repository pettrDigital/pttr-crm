import { describe, it, expect } from 'vitest'
import { runFootingCheck } from './check'
import type { ObservedCounts } from './check'

describe('runFootingCheck', () => {
  // Manifest updated 2026-06-21: total=1245, tolerance=999 (temporary
  // until first run with Repeat leads establishes new bucket counts).
  // When new buckets are footed and tolerance reset to 0, update these
  // tests to assert halts on mismatches again.
  const exactCounts: ObservedCounts = {
    test_excluded: 116,
    mapped: 1088,
    no_identity: 8,
    spine_gap: 3,
    total: 1245,
  }

  it('passes when observed matches manifest exactly', () => {
    expect(() => runFootingCheck('reconciliation_1215', exactCounts)).not.toThrow()
  })

  it('returns true when a manifest was checked', () => {
    expect(runFootingCheck('reconciliation_1215', exactCounts)).toBe(true)
  })

  it('does not halt on bucket mismatch while tolerance=999 (temporary)', () => {
    const bad = { ...exactCounts, mapped: 1087 }
    // With tolerance=999, this should NOT halt — it's informational
    expect(() => runFootingCheck('reconciliation_1215', bad)).not.toThrow()
  })

  it('does not halt on total mismatch while tolerance=999 (temporary)', () => {
    const bad = { ...exactCounts, total: 1214 }
    // With tolerance=999, this should NOT halt
    expect(() => runFootingCheck('reconciliation_1215', bad)).not.toThrow()
  })

  it('does not halt for scopes without a manifest', () => {
    expect(() => runFootingCheck('live_post_dec2025', exactCounts)).not.toThrow()
  })

  it('returns false for informational-only (no manifest)', () => {
    expect(runFootingCheck('live_post_dec2025', exactCounts)).toBe(false)
  })

  it('does not halt for historical_pre_dec2025', () => {
    expect(() => runFootingCheck('historical_pre_dec2025', exactCounts)).not.toThrow()
  })
})
