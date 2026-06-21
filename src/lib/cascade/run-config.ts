/**
 * Cascade run configuration — scope + mode lock.
 *
 * Every cascade run is defined by (scope, mode). Invalid combinations
 * are rejected at start. No scope or mode is defined inline in run-cascade.ts.
 *
 * Reconciliation is a SEPARATE script (run-reconciliation.ts) — it does
 * not use this config. The cascade runs on production populations only.
 */

// ─── TYPES ──────────────────────────────────────────────────────────────

export type Scope =
  | 'historical_pre_dec2025'
  | 'live_post_dec2025'
  | 'custom'

export type Mode =
  | 'deterministic'
  | 'full'

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
}

// ─── ERA BOUNDARY ───────────────────────────────────────────────────────
// opportunity_timestamp_sydney = first-touch time per ct.min_ts in build_opportunities.sql; this is the pre-Dec / post-Dec era boundary.
export const PRE_DEC_BOUNDARY = '2025-12-01T00:00:00'

// ─── VALID COMBINATIONS ─────────────────────────────────────────────────

const VALID_CONFIGS: Record<string, StepFlags> = {
  'historical_pre_dec2025:deterministic': {
    tiers: true, gate: true, t7_match: false, orphan: true,
    t7_classify: false,
  },
  'live_post_dec2025:full': {
    tiers: true, gate: true, t7_match: true, orphan: true,
    t7_classify: true,
  },
}

// ─── REJECTION MESSAGES ─────────────────────────────────────────────────

const REJECTIONS: Record<string, string> = {
  'historical_pre_dec2025:full':
    'REJECTED: pre-Dec has no AI-input (no transcripts/forms before Dec 2025). Use mode=deterministic.',
  'live_post_dec2025:deterministic':
    'REJECTED: post-Dec must use full pipeline; deterministic-only on this scope orphans real conversions.',
}

// ─── RESOLVE ────────────────────────────────────────────────────────────

/**
 * Resolve a (scope, mode) pair into a validated RunConfig.
 * Throws on invalid combinations.
 */
export function resolveRunConfig(scope: Scope, mode: Mode): RunConfig {
  // Custom scope — steps provided externally
  if (scope === 'custom') {
    return {
      scope, mode,
      steps: {
        tiers: true, gate: true, t7_match: false, orphan: false,
        t7_classify: false,
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
}
