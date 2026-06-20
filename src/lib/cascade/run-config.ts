/**
 * Cascade run configuration — scope + mode lock.
 *
 * Every cascade run is defined by (scope, mode). Invalid combinations
 * are rejected at start. No scope or mode is defined inline in run-cascade.ts.
 */

// ─── TYPES ──────────────────────────────────────────────────────────────

export type Scope =
  | 'historical_pre_dec2025'
  | 'live_post_dec2025'
  | 'reconciliation_1215'
  | 'custom'

export type Mode =
  | 'deterministic'
  | 'full'
  | 'full_recon'
  | 'explicit'

export interface RunConfig {
  scope: Scope
  mode: Mode
  steps: StepFlags
}

export interface StepFlags {
  tiers: boolean      // T1-T4
  gate: boolean
  t7_match: boolean   // T7.1
  orphan: boolean     // Step 6.5
  t7_classify: boolean // T7.2
  footing: boolean    // Step 9.5
}

// ─── ERA BOUNDARY ───────────────────────────────────────────────────────
// opportunity_timestamp_sydney = first-touch time per ct.min_ts in build_opportunities.sql; this is the pre-Dec / post-Dec era boundary.
export const PRE_DEC_BOUNDARY = '2025-12-01T00:00:00'

// ─── VALID COMBINATIONS ─────────────────────────────────────────────────

const VALID_CONFIGS: Record<string, StepFlags> = {
  'historical_pre_dec2025:deterministic': {
    tiers: true, gate: true, t7_match: false, orphan: true,
    t7_classify: false, footing: false,
  },
  'live_post_dec2025:full': {
    tiers: true, gate: true, t7_match: true, orphan: true,
    t7_classify: true, footing: false,
  },
  'reconciliation_1215:full_recon': {
    tiers: true, gate: true, t7_match: true, orphan: true,
    t7_classify: true, footing: true,
  },
}

// ─── REJECTION MESSAGES ─────────────────────────────────────────────────

const REJECTIONS: Record<string, string> = {
  'historical_pre_dec2025:full':
    'REJECTED: pre-Dec has no AI-input (no transcripts/forms before Dec 2025). Use mode=deterministic.',
  'historical_pre_dec2025:full_recon':
    'REJECTED: pre-Dec has no AI-input. Use mode=deterministic.',
  'historical_pre_dec2025:explicit':
    'REJECTED: pre-Dec has no AI-input. Use mode=deterministic.',
  'live_post_dec2025:deterministic':
    'REJECTED: post-Dec must use full pipeline; deterministic-only on this scope orphans real conversions.',
  'live_post_dec2025:full_recon':
    'REJECTED: full_recon mode is only for reconciliation_1215 scope.',
  'live_post_dec2025:explicit':
    'REJECTED: explicit mode is only for custom scope.',
  'reconciliation_1215:deterministic':
    'REJECTED: reconciliation_1215 requires full_recon mode.',
  'reconciliation_1215:full':
    'REJECTED: reconciliation_1215 requires full_recon mode (includes footing check).',
  'reconciliation_1215:explicit':
    'REJECTED: reconciliation_1215 requires full_recon mode.',
}

// ─── RESOLVE ────────────────────────────────────────────────────────────

/**
 * Resolve a (scope, mode) pair into a validated RunConfig.
 * Throws on invalid combinations.
 */
export function resolveRunConfig(scope: Scope, mode: Mode): RunConfig {
  // Custom scope with explicit mode is allowed — steps provided externally
  if (scope === 'custom' && mode === 'explicit') {
    return {
      scope, mode,
      steps: {
        tiers: true, gate: true, t7_match: false, orphan: false,
        t7_classify: false, footing: false,
      },
    }
  }

  const key = `${scope}:${mode}`
  const steps = VALID_CONFIGS[key]
  if (!steps) {
    const rejection = REJECTIONS[key]
    if (rejection) throw new Error(rejection)
    throw new Error(`REJECTED: invalid scope+mode combination: ${scope} + ${mode}`)
  }

  return { scope, mode, steps }
}

/**
 * Build the population WHERE clause for the scope.
 * Returns a SQL fragment for filtering opportunities.
 */
export function scopeWhereClause(scope: Scope, ds: string): string {
  switch (scope) {
    case 'historical_pre_dec2025':
      return `o.opportunity_timestamp_sydney < '${PRE_DEC_BOUNDARY}'`
    case 'live_post_dec2025':
      return `o.opportunity_timestamp_sydney >= '${PRE_DEC_BOUNDARY}'`
    case 'reconciliation_1215':
      // Reconciliation population is all leads in the WC CSV manifest
      // (1,215 total). The join is handled by wc-mapping.ts, not a WHERE clause.
      // Return TRUE to include all — the manifest join constrains the population.
      return 'TRUE'
    case 'custom':
      return 'TRUE'
    default:
      throw new Error(`Unknown scope: ${scope}`)
  }
}

/**
 * Log the run start banner.
 */
export function logRunStart(config: RunConfig, populationCount: number): void {
  console.log(`SCOPE: ${config.scope} | MODE: ${config.mode} | population_count: ${populationCount} | source: run-config.ts`)
  if (config.scope === 'reconciliation_1215' && populationCount !== 1215) {
    throw new Error(
      `HALT: reconciliation_1215 population_count must be 1215, got ${populationCount}. ` +
      `Population mismatch — check the WC CSV manifest.`
    )
  }
}
