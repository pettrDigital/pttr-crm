import { describe, it, expect } from 'vitest'
import { selectClosestCandidate } from './orphan-detect'
import type { OrphanCandidate } from './orphan-detect'

describe('selectClosestCandidate', () => {
  it('returns null for empty candidates', () => {
    expect(selectClosestCandidate([])).toBeNull()
  })

  it('selects by date proximity, NOT by invoice amount', () => {
    // The June 20 bug: sorted by invoiced_ex desc, picked the $8,855 job
    // at 31 days instead of the $0 job at 1 day.
    const candidates: OrphanCandidate[] = [
      { jobnumber: 'A', days_from_lead: 1, invoiced_ex: 0, match_type: 'content_match' },
      { jobnumber: 'B', days_from_lead: 30, invoiced_ex: 8855, match_type: 'content_match' },
    ]
    const result = selectClosestCandidate(candidates)!
    expect(result.jobnumber).toBe('A')
    expect(result.days_from_lead).toBe(1)
  })

  it('handles backward (negative) days correctly', () => {
    const candidates: OrphanCandidate[] = [
      { jobnumber: 'X', days_from_lead: -5, invoiced_ex: 100, match_type: 'content_match' },
      { jobnumber: 'Y', days_from_lead: 10, invoiced_ex: 5000, match_type: 'phone_window' },
    ]
    const result = selectClosestCandidate(candidates)!
    expect(result.jobnumber).toBe('X')  // ABS(-5) = 5 < ABS(10) = 10
  })

  it('tie-breaks by jobnumber (deterministic)', () => {
    const candidates: OrphanCandidate[] = [
      { jobnumber: 'B', days_from_lead: 5, invoiced_ex: 100, match_type: 'content_match' },
      { jobnumber: 'A', days_from_lead: 5, invoiced_ex: 200, match_type: 'content_match' },
    ]
    const result = selectClosestCandidate(candidates)!
    expect(result.jobnumber).toBe('A')  // same distance, earlier jobnumber wins
  })

  it('FAILS if patched to sort by invoiced_ex desc', () => {
    // This test documents the anti-pattern. If someone patches the selector
    // to prefer higher invoice amounts, the closest-date candidate loses.
    const candidates: OrphanCandidate[] = [
      { jobnumber: 'A', days_from_lead: 1, invoiced_ex: 0, match_type: 'content_match' },
      { jobnumber: 'B', days_from_lead: 30, invoiced_ex: 8855, match_type: 'content_match' },
    ]
    // Correct behaviour: A wins (closest date)
    const result = selectClosestCandidate(candidates)!
    expect(result.jobnumber).toBe('A')
    // If patched to sort by invoiced_ex desc, B would win — which is WRONG
    expect(result.jobnumber).not.toBe('B')
  })
})
