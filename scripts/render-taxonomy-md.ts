/**
 * Render the S4.4 taxonomy block for PETTR_CRM_DATA_SPEC.md from the
 * canonical taxonomy source (src/lib/classifier/taxonomy.ts).
 *
 * Usage: npx tsx scripts/render-taxonomy-md.ts
 *
 * Output goes to stdout. Paste into the spec between TAXONOMY:BEGIN/END markers.
 */

import { TAXONOMY } from '../src/lib/classifier/taxonomy'
import type { Stage } from '../src/lib/classifier/taxonomy'

const STAGE_ORDER: Stage[] = [
  'Not Captured',
  'Unable to Classify',
  'Not Quotable',
  'Not Booked',
  'Booked',
  'Pending',
]

function sourcesLabel(sources: readonly string[]): string {
  if (sources.includes('gate') && sources.includes('t7')) return 'gate + T7 judgement'
  if (sources.includes('gate')) return 'determined'
  if (sources.includes('t7')) return 'T7 judgement'
  if (sources.includes('manual')) return 'manual-only'
  return sources.join(', ')
}

console.log('<!-- TAXONOMY:BEGIN (generated from src/lib/classifier/taxonomy.ts — run scripts/render-taxonomy-md.ts; do not hand-edit) -->')
console.log('')

for (const stage of STAGE_ORDER) {
  const leaves = TAXONOMY.filter(l => l.stage === stage)
  if (leaves.length === 0) continue

  console.log(`- **${stage}**`)
  for (const leaf of leaves) {
    console.log(`  - **${leaf.name}** (${sourcesLabel(leaf.sources)}): ${leaf.definition}`)
  }
}

console.log('')
console.log('<!-- TAXONOMY:END -->')
