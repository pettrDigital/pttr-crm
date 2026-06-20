import { describe, it, expect } from 'vitest'
import { runFootingCheck } from './check'
import type { ObservedCounts } from './check'

describe('runFootingCheck', () => {
  const exactCounts: ObservedCounts = {
    test_excluded: 116,
    mapped: 1088,
    no_identity: 8,
    spine_gap: 3,
    total: 1215,
  }

  it('passes when observed matches manifest exactly', () => {
    expect(() => runFootingCheck('reconciliation_1215', exactCounts)).not.toThrow()
  })

  it('returns true when a manifest was checked', () => {
    expect(runFootingCheck('reconciliation_1215', exactCounts)).toBe(true)
  })

  it('HALTS when any bucket differs', () => {
    const bad = { ...exactCounts, mapped: 1087 }
    expect(() => runFootingCheck('reconciliation_1215', bad))
      .toThrow('HALT: Footing check FAILED')
  })

  it('HALTS when total differs even if buckets look ok', () => {
    const bad = { ...exactCounts, total: 1214 }
    expect(() => runFootingCheck('reconciliation_1215', bad))
      .toThrow('HALT: Footing check FAILED')
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
