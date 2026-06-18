/**
 * T7 Blind Re-validation — 97 opps from enriched_leads-10.csv
 * Uses buildClassifierInputFromTimeline (commit 6b4e559)
 * Gate-determined opps: auto-classified, T7 skipped
 * Judgement opps: T7 runs with constrained prompt
 */
import 'dotenv/config'
import { BigQuery } from '@google-cloud/bigquery'
import OpenAI from 'openai'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import { buildClassifierInputFromTimeline, formatClassifierPrompt } from '../src/lib/interactions/classify'
import { resolveGate, applyPaymentRegex, applyKeywordRules, validateClassification } from '../src/lib/classifier/t7-classifier'

function getSecret(name: string): string {
  return execSync(
    `gcloud secrets versions access latest --secret=${name} --project=pttr-taskdata`,
    { encoding: 'utf-8' }
  ).trim()
}

require('dotenv').config({ path: '.env.local' })

const bq = new BigQuery({ projectId: 'pttr-taskdata' })

function flattenValue(v: any): unknown {
  if (v == null || typeof v !== 'object') return v
  if ('value' in v && Object.keys(v).length === 1) return v.value
  if ('s' in v && 'e' in v && 'c' in v && typeof v.toNumber === 'function') return v.toNumber()
  return v
}
function flattenRow(row: any): any {
  if (row == null || typeof row !== 'object') return row
  if (Array.isArray(row)) return row.map(flattenRow)
  const plain = flattenValue(row)
  if (plain !== row) return plain
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[k] = flattenValue(v)
  return out
}

const queryFn = async <T>(sql: string, params?: Record<string, unknown>, types?: Record<string, any>): Promise<T[]> => {
  const [rows] = await bq.query({ query: sql, params, types, location: 'US' })
  return rows.map(flattenRow) as T[]
}

const openai = new OpenAI({ apiKey: getSecret('openai-api-key') })

interface AnswerKeyEntry {
  wc_lead_id: number
  opportunity_id: string
  opp_type: string
  gate_stage: string
  ground_truth_status: string | null
  ground_truth_jn: string | null
  ground_truth_source: string
  invoiced_ex: number
  wc_class: string
  wc_class_source: string
  wc_quotable: string | null
  wc_job_number: string | null
  correction: string | null
}

interface T7Result {
  wc_lead_id: number
  opportunity_id: string
  gate_stage: string
  gate_determined: boolean
  t7_sub_status: string | null
  t7_confidence: number | null
  t7_reasoning: string | null
  t7_source_quote: string | null
  t7_method: string  // 'gate' | 'payment_regex' | 'keyword' | 'ai' | 'skipped'
  ground_truth_status: string | null
  wc_class: string
  match: boolean | null  // null if ground truth is null (NQ/NB — graded manually)
  prompt_length: number | null
  touch_count: number
  content_touches: number
}

async function runT7(entry: AnswerKeyEntry): Promise<T7Result> {
  const { opportunity_id, gate_stage } = entry

  // Step 1: Build input from materialised lead_timeline
  const result = await buildClassifierInputFromTimeline(queryFn, opportunity_id)
  if (!result) {
    return {
      wc_lead_id: entry.wc_lead_id, opportunity_id, gate_stage,
      gate_determined: true, t7_sub_status: 'ERROR:no_input', t7_confidence: null,
      t7_reasoning: 'buildClassifierInputFromTimeline returned null', t7_source_quote: null,
      t7_method: 'skipped', ground_truth_status: entry.ground_truth_status,
      wc_class: entry.wc_class, match: null, prompt_length: null,
      touch_count: 0, content_touches: 0,
    }
  }

  const ci = result.input
  const touches = ci.touches
  const contentTouches = touches.filter(t => t.full_content).length
  const actualGate = result.gate_stage || gate_stage

  // Step 2: Resolve gate
  const gateResult = resolveGate(actualGate)

  if (gateResult.determined) {
    // Gate-determined — T7 does not run
    return {
      wc_lead_id: entry.wc_lead_id, opportunity_id, gate_stage: actualGate,
      gate_determined: true, t7_sub_status: gateResult.determined.sub_status,
      t7_confidence: 1.0, t7_reasoning: gateResult.determined.reasoning,
      t7_source_quote: null, t7_method: 'gate',
      ground_truth_status: entry.ground_truth_status, wc_class: entry.wc_class,
      match: entry.ground_truth_status ? gateResult.determined.sub_status === entry.ground_truth_status : null,
      prompt_length: null, touch_count: touches.length, content_touches: contentTouches,
    }
  }

  // Step 3: Judgement — try payment regex first (for completed_zero)
  if (actualGate === 'judgement:Booked:completed_zero') {
    const paymentResult = applyPaymentRegex(ci.labour_note, ci.task_notes)
    if (paymentResult) {
      return {
        wc_lead_id: entry.wc_lead_id, opportunity_id, gate_stage: actualGate,
        gate_determined: false, t7_sub_status: paymentResult.sub_status,
        t7_confidence: paymentResult.confidence, t7_reasoning: paymentResult.reasoning,
        t7_source_quote: paymentResult.source_quote, t7_method: 'payment_regex',
        ground_truth_status: entry.ground_truth_status, wc_class: entry.wc_class,
        match: entry.ground_truth_status ? paymentResult.sub_status === entry.ground_truth_status : null,
        prompt_length: null, touch_count: touches.length, content_touches: contentTouches,
      }
    }
  }

  // Step 4: Format prompt and call AI
  const prompt = formatClassifierPrompt(ci)
  const systemPrompt = gateResult.systemPrompt!
  const allowedSet = gateResult.allowedSet!

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    })

    const text = response.choices[0]?.message?.content || ''
    let parsed: any = {}
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch { parsed = { sub_status: 'PARSE_ERROR', confidence: 0, reasoning: text } }

    const validation = validateClassification(parsed.sub_status || 'PARSE_ERROR', allowedSet)

    return {
      wc_lead_id: entry.wc_lead_id, opportunity_id, gate_stage: actualGate,
      gate_determined: false, t7_sub_status: validation.sub_status,
      t7_confidence: parsed.confidence || null,
      t7_reasoning: parsed.reasoning || null,
      t7_source_quote: parsed.source_quote || null,
      t7_method: 'ai',
      ground_truth_status: entry.ground_truth_status, wc_class: entry.wc_class,
      match: entry.ground_truth_status ? validation.sub_status === entry.ground_truth_status : null,
      prompt_length: prompt.length, touch_count: touches.length, content_touches: contentTouches,
    }
  } catch (e) {
    return {
      wc_lead_id: entry.wc_lead_id, opportunity_id, gate_stage: actualGate,
      gate_determined: false, t7_sub_status: 'API_ERROR',
      t7_confidence: null, t7_reasoning: (e as Error).message,
      t7_source_quote: null, t7_method: 'ai',
      ground_truth_status: entry.ground_truth_status, wc_class: entry.wc_class,
      match: null, prompt_length: prompt.length, touch_count: touches.length, content_touches: contentTouches,
    }
  }
}

async function main() {
  // Load answer key
  const keyPath = path.join(__dirname, '../docs/t7_revalidation_answer_key.json')
  const answerKey: AnswerKeyEntry[] = JSON.parse(fs.readFileSync(keyPath, 'utf-8'))
  console.log(`Loaded ${answerKey.length} entries from answer key`)

  const results: T7Result[] = []
  const CONCURRENCY = 5

  for (let i = 0; i < answerKey.length; i += CONCURRENCY) {
    const batch = answerKey.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(batch.map(entry => runT7(entry)))
    results.push(...batchResults)

    const done = Math.min(i + CONCURRENCY, answerKey.length)
    const determined = results.filter(r => r.gate_determined).length
    const ai = results.filter(r => r.t7_method === 'ai').length
    const regex = results.filter(r => r.t7_method === 'payment_regex').length
    console.log(`[${done}/${answerKey.length}] gate:${determined} regex:${regex} ai:${ai}`)
  }

  // Save results
  const outPath = path.join(__dirname, '../docs/t7_revalidation_results.json')
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nSaved ${results.length} results to ${outPath}`)

  // Summary
  const determined = results.filter(r => r.gate_determined)
  const judgement = results.filter(r => !r.gate_determined)
  const aiRuns = results.filter(r => r.t7_method === 'ai')
  const regexRuns = results.filter(r => r.t7_method === 'payment_regex')

  console.log(`\n=== SUMMARY ===`)
  console.log(`Total: ${results.length}`)
  console.log(`Gate-determined: ${determined.length} (${determined.filter(r => r.match === true).length} correct, ${determined.filter(r => r.match === false).length} wrong)`)
  console.log(`Payment-regex: ${regexRuns.length} (${regexRuns.filter(r => r.match === true).length} correct)`)
  console.log(`AI (T7): ${aiRuns.length}`)

  // Gate accuracy
  const gateWithGT = determined.filter(r => r.ground_truth_status !== null)
  console.log(`\nGate accuracy: ${gateWithGT.filter(r => r.match).length}/${gateWithGT.length}`)

  // T7 results by sub_status
  console.log(`\nT7 AI classifications:`)
  const statusCounts: Record<string, number> = {}
  for (const r of aiRuns) {
    const s = r.t7_sub_status || 'null'
    statusCounts[s] = (statusCounts[s] || 0) + 1
  }
  for (const [k, v] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`)
  }

  // T7 vs WC comparison (for NQ/NB where GT is null)
  console.log(`\nT7 vs WC (NQ/NB judgement opps):`)
  const nqnb = aiRuns.filter(r => r.gate_stage === 'judgement:NQ/NB')
  let agree = 0
  for (const r of nqnb) {
    const t7 = r.t7_sub_status || ''
    const wc = r.wc_class || ''
    // Map WC categories to our taxonomy for comparison
    const wcMapped = mapWcToOurs(wc)
    const agrees = t7 === wcMapped
    if (agrees) agree++
    console.log(`  ${r.opportunity_id.slice(0,12)} T7:${t7.padEnd(30)} WC:${wc.padEnd(25)} ${agrees ? '✓' : '✗'}`)
  }
  console.log(`  Agreement: ${agree}/${nqnb.length} (${(agree/nqnb.length*100).toFixed(0)}%)`)
}

function mapWcToOurs(wc: string): string {
  const map: Record<string, string> = {
    'Service Not Offered': 'Service Not Provided',
    'Out of Service Area': 'Outside Service Area',
    'Price too High': 'Price / Minimum Call Out',
    'Dropped Call': 'Dropped Call',  // WC uses same term but may mean different thing
    'Wrong Number': 'Wrong Number / Contact Details',
    'Spam': 'Spam',
    'Other': 'Other',
    'Lost / Unresponsive': 'Customer Unresponsive',
    'Wanted Quote Over Phone': 'Wanted Quote Over Phone',
    'Did Not Proceed': 'Customer Unresponsive',
    'Repeat': 'Customer Inquiry Only',
    'Follow up Required': 'No Follow-Up Recorded',
  }
  return map[wc] || wc
}

main().catch(console.error)
