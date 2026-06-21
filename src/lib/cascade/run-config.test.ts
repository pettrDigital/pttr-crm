import { describe, it, expect } from 'vitest'
import { resolveRunConfig, logRunStart } from './run-config'

describe('resolveRunConfig', () => {
  it('accepts historical_pre_dec2025 + deterministic', () => {
    const config = resolveRunConfig('historical_pre_dec2025', 'deterministic')
    expect(config.scope).toBe('historical_pre_dec2025')
    expect(config.mode).toBe('deterministic')
    expect(config.steps.tiers).toBe(true)
    expect(config.steps.gate).toBe(true)
    expect(config.steps.t7_match).toBe(false)
    expect(config.steps.orphan).toBe(true)
    expect(config.steps.t7_classify).toBe(false)
  })

  it('accepts live_post_dec2025 + full', () => {
    const config = resolveRunConfig('live_post_dec2025', 'full')
    expect(config.steps.t7_match).toBe(true)
    expect(config.steps.t7_classify).toBe(true)
  })

  it('rejects historical_pre_dec2025 + full', () => {
    expect(() => resolveRunConfig('historical_pre_dec2025', 'full'))
      .toThrow('pre-Dec has no AI-input')
  })

  it('rejects live_post_dec2025 + deterministic', () => {
    expect(() => resolveRunConfig('live_post_dec2025', 'deterministic'))
      .toThrow('post-Dec must use full pipeline')
  })

  it('accepts custom scope', () => {
    const config = resolveRunConfig('custom', 'full')
    expect(config.scope).toBe('custom')
    expect(config.steps.t7_match).toBe(false)
  })
})

describe('logRunStart', () => {
  it('logs without halting for any scope', () => {
    const config = resolveRunConfig('live_post_dec2025', 'full')
    expect(() => logRunStart(config, 42)).not.toThrow()
  })
})
