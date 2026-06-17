/**
 * Dump literal classifier-input strings for two opps (one Customer Unresponsive,
 * one Quote Only) to prove the new shared-module pipeline produces richer input
 * than the old 6-first-only-query assembly.
 *
 * Usage: npx tsx scripts/t7-dump-input.ts
 */

import 'dotenv/config'
import { BigQuery } from '@google-cloud/bigquery'

import type { QueryFn } from '../src/lib/interactions/types'
import { resolveAnchors, assembleTouches } from '../src/lib/interactions/resolve'
import { buildClassifierInputFromTimeline, formatClassifierPrompt } from '../src/lib/interactions/classify'

require('dotenv').config({ path: '.env.local' })

const bq = new BigQuery({ projectId: 'pttr-taskdata' })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenValue(v: any): unknown {
  if (v == null || typeof v !== 'object') return v
  if ('value' in v && Object.keys(v).length === 1) return v.value
  if ('s' in v && 'e' in v && 'c' in v && typeof v.toNumber === 'function') return v.toNumber()
  return v
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenRow(row: any): any {
  if (row == null || typeof row !== 'object') return row
  if (Array.isArray(row)) return row.map(flattenRow)
  const plain = flattenValue(row)
  if (plain !== row) return plain
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[k] = flattenValue(v)
  return out
}

const queryFn: QueryFn = async <T>(sql: string, params?: Record<string, unknown>, types?: Record<string, unknown>): Promise<T[]> => {
  const [rows] = await bq.query({ query: sql, params, types, location: 'US' })
  return rows.map(flattenRow) as T[]
}

async function dumpOpp(oppId: string, label: string) {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`  ${label}: ${oppId}`)
  console.log('='.repeat(70))

  const result = await buildClassifierInputFromTimeline(queryFn, oppId)
  if (!result) { console.log('  NO CLASSIFIER INPUT (facts missing)'); return }
  const ci = result.input

  console.log(`  Touches: ${ci.touches.length}`)
  const withContent = ci.touches.filter(e => e.full_content)
  console.log(`  Touches with content: ${withContent.length}/${ci.touches.length}`)
  for (const e of ci.touches) {
    const src = e.content_source || 'none'
    const len = e.full_content ? e.full_content.length : 0
    console.log(`    [${e.interaction_datetime}] ${e.interaction_type} content_source=${src} content_len=${len}`)
  }
  console.log(`  Gate: ${result.gate_stage}`)

  const prompt = formatClassifierPrompt(ci)
  console.log(`\n  PROMPT STATS:`)
  console.log(`    Total chars: ${prompt.length}`)
  console.log(`    Touch count: ${ci.touches.length}`)
  console.log(`    Has job_description: ${!!ci.job_description}`)
  console.log(`    Has labour_note: ${!!ci.labour_note}`)
  console.log(`    Has task_notes: ${!!ci.task_notes}`)

  // Check for SMS/email/OHQ touches
  const hasSMS = ci.touches.some(t => t.content_source === 'sms')
  const hasEmail = ci.touches.some(t => t.content_source === 'email')
  const hasOHQ = ci.touches.some(t => t.content_source === 'ohq')
  const hasTranscript = ci.touches.some(t => t.content_source === '8x8' || t.content_source === 'whatconverts')
  console.log(`    Has SMS: ${hasSMS}`)
  console.log(`    Has email: ${hasEmail}`)
  console.log(`    Has OHQ: ${hasOHQ}`)
  console.log(`    Has transcript: ${hasTranscript}`)

  console.log(`\n  ─── LITERAL PROMPT ───`)
  console.log(prompt)
  console.log(`  ─── END PROMPT ───`)
}

async function main() {
  // Pick one Customer Unresponsive and one Quote Only from the GT
  const [cuRows] = await bq.query({
    query: `SELECT opportunity_id FROM \`pttr-taskdata.ds_crm.t7_ground_truth_rg006\`
            WHERE gt_normalised = 'Customer Unresponsive' AND is_determined = FALSE
            ORDER BY opportunity_id LIMIT 5`,
    location: 'US',
  })
  const [qoRows] = await bq.query({
    query: `SELECT opportunity_id FROM \`pttr-taskdata.ds_crm.t7_ground_truth_rg006\`
            WHERE gt_normalised = 'Quote Only' AND is_determined = FALSE
            ORDER BY opportunity_id LIMIT 5`,
    location: 'US',
  })

  // Pick the first one that assembles successfully
  if (cuRows.length > 0) await dumpOpp(cuRows[0].opportunity_id, 'CUSTOMER UNRESPONSIVE (GT)')
  if (qoRows.length > 0) await dumpOpp(qoRows[0].opportunity_id, 'QUOTE ONLY (GT)')
}

main().catch(console.error)
