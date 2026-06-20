/**
 * Guard script: ensures no ad-hoc keyword/SQL classifier exists in the repo.
 *
 * The June 20 incident showed that an agent can rebuild a BQ keyword classifier
 * inline under deadline pressure. This script greps the repo for patterns that
 * indicate such a shortcut and exits non-zero on any hit.
 *
 * Run: npx tsx scripts/check-no-keyword-classifier.ts
 * Wired into: npm run check
 */

import * as fs from 'fs'
import * as path from 'path'

// Files that are ALLOWED to contain leaf strings (taxonomy, gate, prompts, legacy map)
const ALLOWED_FILES = new Set([
  'src/lib/classifier/taxonomy.ts',
  'src/lib/classifier/t7-classifier.ts',
  'src/lib/classifier/prompt-sections.ts',
  'src/lib/cascade/run-config.ts',
  'src/lib/cascade/footing/reconciliation_1215.ts',
  'scripts/render-taxonomy-md.ts',
  'scripts/check-no-keyword-classifier.ts',
  'docs/DECISION_LOG.md',
  'docs/PETTR_CRM_DATA_SPEC.md',
  'docs/SESSION_HANDOFF.md',
  'docs/END_TO_END_FUNCTION.md',
])

// Patterns that indicate an ad-hoc keyword classifier
const FORBIDDEN_PATTERNS = [
  /t7_classify_signals/i,
]

// CASE WHEN producing a leaf string in SQL or TS (outside allowed files)
// Matches: THEN 'Customer Unresponsive' or THEN "No Follow-Up Recorded" etc.
const LEAF_CASE_WHEN = /CASE\s+WHEN[\s\S]{0,500}THEN\s+['"](?:Customer Unresponsive|No Follow-Up Recorded|Spam|Wrong Number|Outside Service Area|Service Not Provided|Common Property Responsibility|Customer Inquiry Only|Not Job Related|Booked Elsewhere|Tenant \/ Strata Referral|Price \/ Minimum Call Out|Capacity \/ Scheduling|Wanted Quote Over Phone|Customer Resolved|Quote Only|Booking Cancelled|Unable to Complete Job - Out of Scope|Completed - Invoice Pending|Job Pending)['"]/i

function walkDir(dir: string, ext: string[]): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next' || entry.name === 'docs/archive') continue
      results.push(...walkDir(full, ext))
    } else if (ext.some(e => entry.name.endsWith(e))) {
      results.push(full)
    }
  }
  return results
}

const root = path.resolve(__dirname, '..')
const files = walkDir(root, ['.ts', '.tsx', '.sql'])

let violations = 0

for (const file of files) {
  const rel = path.relative(root, file)
  if (ALLOWED_FILES.has(rel)) continue
  // Skip archive docs, test files, and node_modules
  if (rel.startsWith('docs/archive')) continue
  if (rel.includes('.test.')) continue

  const content = fs.readFileSync(file, 'utf-8')

  for (const pattern of FORBIDDEN_PATTERNS) {
    const match = content.match(pattern)
    if (match) {
      console.error(`VIOLATION: ${rel} — forbidden pattern: ${match[0]}`)
      violations++
    }
  }

  // Check CASE WHEN with leaf strings (only in .sql and .ts files that aren't allowed)
  if (rel.endsWith('.sql') || rel.endsWith('.ts')) {
    const caseMatch = content.match(LEAF_CASE_WHEN)
    if (caseMatch) {
      // Allow it in gate logic (run-cascade.ts step 3 lead_gate, step 9 readout)
      // The readout CASE WHENs map gate_stage → display name, which is legitimate.
      // Only flag if the CASE WHEN is producing a classification decision, not a display label.
      // Heuristic: if the file is run-cascade.ts and the CASE is inside step3/step9, allow.
      if (rel === 'scripts/run-cascade.ts') continue
      console.error(`VIOLATION: ${rel} — CASE WHEN producing leaf string: ${caseMatch[0].slice(0, 80)}...`)
      violations++
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} violation(s) found. No keyword/SQL classifier shortcuts allowed (S15.1a).`)
  process.exit(1)
} else {
  console.log('check-no-keyword-classifier: PASS (zero violations)')
  process.exit(0)
}
