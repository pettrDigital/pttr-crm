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
    expect(config.steps.footing).toBe(false)
  })

  it('accepts live_post_dec2025 + full', () => {
    const config = resolveRunConfig('live_post_dec2025', 'full')
    expect(config.steps.t7_match).toBe(true)
    expect(config.steps.t7_classify).toBe(true)
    expect(config.steps.footing).toBe(false)
  })

  it('accepts reconciliation_1215 + full_recon', () => {
    const config = resolveRunConfig('reconciliation_1215', 'full_recon')
    expect(config.steps.footing).toBe(true)
  })

  it('rejects historical_pre_dec2025 + full', () => {
    expect(() => resolveRunConfig('historical_pre_dec2025', 'full'))
      .toThrow('pre-Dec has no AI-input')
  })

  it('rejects live_post_dec2025 + deterministic', () => {
    expect(() => resolveRunConfig('live_post_dec2025', 'deterministic'))
      .toThrow('post-Dec must use full pipeline')
  })

  it('rejects reconciliation_1215 + full (must be full_recon)', () => {
    expect(() => resolveRunConfig('reconciliation_1215', 'full'))
      .toThrow('requires full_recon mode')
  })

  it('rejects reconciliation_1215 + deterministic', () => {
    expect(() => resolveRunConfig('reconciliation_1215', 'deterministic'))
      .toThrow('requires full_recon mode')
  })
})

describe('logRunStart', () => {
  it('halts if reconciliation_1215 population is not 1215', () => {
    const config = resolveRunConfig('reconciliation_1215', 'full_recon')
    expect(() => logRunStart(config, 1200))
      .toThrow('population_count must be 1215, got 1200')
  })

  it('passes if reconciliation_1215 population is exactly 1215', () => {
    const config = resolveRunConfig('reconciliation_1215', 'full_recon')
    expect(() => logRunStart(config, 1215)).not.toThrow()
  })

  it('does not halt for other scopes regardless of count', () => {
    const config = resolveRunConfig('live_post_dec2025', 'full')
    expect(() => logRunStart(config, 42)).not.toThrow()
  })
})
