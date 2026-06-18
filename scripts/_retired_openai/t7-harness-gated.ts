/**
 * T7 Gated Harness — determined-stage gate for Booked subset.
 *
 * Gate logic (before any model call):
 *   1. Determined-complete: tasks_complete.job_status='Completed' OR (Archived + invoiced>0)
 *      → auto-assign "Job Complete", skip T7.
 *   2. Has JN but NOT determined-complete → stage is Booked (hard constraint).
 *      T7 may ONLY return: Job Pending, Booking Cancelled, Quote Only, Out of Scope.
 *   3. Edge cases:
 *      - Archived + no invoice + Account terms → tag account_billing_review, exclude from T7.
 *      - GT=Booked with NO JN (G- opps) → tag ungated_no_jn, exclude from gate.
 *
 * Prompt for gated-Booked rows uses a constrained system prompt with 4 allowed sub-statuses
 * and explicit definitions. Model output is validated — anything outside the set is logged as
 * gate_violation.
 *
 * Usage: npx tsx scripts/t7-harness-gated.ts --booked-only
 */

import 'dotenv/config'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { BigQuery } from '@google-cloud/bigquery'
import OpenAI from 'openai'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import type { QueryFn } from '../src/lib/interactions/types'
import { resolveAnchors, assembleTouches } from '../src/lib/interactions/resolve'
import { buildClassifierInputFromTimeline, formatClassifierPrompt } from '../src/lib/interactions/classify'

require('dotenv').config({ path: '.env.local' })

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    }),
  })
}
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

function getSecret(name: string): string {
  return execSync(
    `gcloud secrets versions access latest --secret=${name} --project=pttr-taskdata`,
    { encoding: 'utf-8' }
  ).trim()
}

// ─── TAXONOMY ─────────────────────────────────────────────────────────────
const SUB_STATUS_TO_STAGE: Record<string, string> = {
  'Dropped Call': 'Not Captured',
  'Unanswered Call': 'Not Captured',
  'Unable to Classify': 'Not Captured',
  'Outside Service Area': 'Not Quotable',
  'Service Not Provided': 'Not Quotable',
  'Strata Issue': 'Not Quotable',
  'Spam': 'Not Quotable',
  'Customer Inquiry Only': 'Not Quotable',
  'Wrong Number / Contact Details': 'Not Quotable',
  'Technical Error': 'Not Quotable',
  'Not Job Related': 'Not Quotable',
  'Vodafone Orphan': 'Not Quotable',
  'Pending': 'Pending',
  'Customer Unresponsive': 'Not Booked',
  'Booked Elsewhere': 'Not Booked',
  'Tenant / Strata Referral': 'Not Booked',
  'Price / Minimum Call Out': 'Not Booked',
  'Capacity / Scheduling': 'Not Booked',
  'Wanted Quote Over Phone': 'Not Booked',
  'Customer Resolved': 'Not Booked',
  'PETTR Did Not Respond': 'Not Booked',
  'Other': 'Not Booked',
  'Job Pending': 'Booked',
  'Job Complete': 'Booked',
  'Booking Cancelled': 'Booked',
  'Quote Only': 'Booked',
  'Unable to Complete Job - Out of Scope': 'Booked',
}

// The ONLY sub-statuses T7 is allowed to return when stage is gated to Booked
const GATED_BOOKED_SUBS = new Set([
  'Job Pending',
  'Booking Cancelled',
  'Quote Only',
  'Unable to Complete Job - Out of Scope',
])

// ─── TYPES ────────────────────────────────────────────────────────────────
interface GTRow {
  wc_lead_id: number
  opportunity_id: string
  gt_normalised: string
  is_determined: boolean
  jobnumber: string | null
  contact_name: string | null
}

interface JobCompletionInfo {
  jobnumber: string
  job_status: string        // from tasks_complete: 'Completed' | 'Archived' | 'Open'
  invoiced_total_ex: number | null
  payment_terms: string | null  // e.g. '30 Days', 'COD', etc.
}

type GateDisposition =
  | 'determined_complete'      // auto Job Complete, skip T7
  | 'gated_booked'            // has JN, not complete → T7 with constrained prompt
  | 'account_billing_review'  // Archived + no invoice + Account terms
  | 'ungated_no_jn'           // G- opp, no JN → excluded from gate
  | 'ungated_open'            // JN exists but job is Open (not yet Booked in AroFlo)

interface AssemblyEntry {
  prompt: string
  completed: boolean | null
}

interface Result {
  opp: string; jobnumber: string | null; contact_name: string | null
  gt_sub: string; gt_stage: string
  gate_disposition: GateDisposition
  ai_sub: string; ai_stage: string
  confidence: number; reasoning: string; source_quote: string
  abstained: boolean
  gate_violation: boolean  // T7 returned something outside allowed set
}

// ─── STEP 1: LOAD GROUND TRUTH ──────────────────────────────────────────
async function loadGroundTruth(): Promise<GTRow[]> {
  const [rows] = await bq.query({
    query: `SELECT gt.wc_lead_id, gt.opportunity_id, gt.gt_normalised, gt.is_determined,
              CAST(o.jobnumber AS STRING) AS jobnumber, le.contact_name
            FROM \`pttr-taskdata.ds_crm.t7_ground_truth_rg006\` gt
            LEFT JOIN \`pttr-taskdata.ds_crm.opportunities\` o ON gt.opportunity_id = o.opportunity_id
            LEFT JOIN \`pttr-taskdata.ds_crm.vw_lead_enriched\` le ON gt.opportunity_id = le.opportunity_id`,
    location: 'US',
  })
  return (rows as any[]).map(flattenRow) as GTRow[]
}

// ─── STEP 2: LOAD JOB COMPLETION INFO ───────────────────────────────────
async function loadJobCompletionInfo(jobnumbers: string[]): Promise<Map<string, JobCompletionInfo>> {
  if (jobnumbers.length === 0) return new Map()

  const [rows] = await bq.query({
    query: `SELECT
              tc.jobnumber,
              tc.job_status,
              ji.invoiced_total_ex,
              tc.payment_terms
            FROM \`pttr-taskdata.ds_aroflo.tasks_complete\` tc
            LEFT JOIN \`pttr-taskdata.ds_aroflo.vw_job_invoiced\` ji ON CAST(tc.jobnumber AS STRING) = ji.jobnumber
            WHERE CAST(tc.jobnumber AS STRING) IN UNNEST(@jns)`,
    params: { jns: jobnumbers },
    types: { jns: ['STRING'] },
    location: 'US',
  })

  const map = new Map<string, JobCompletionInfo>()
  for (const row of (rows as any[]).map(flattenRow)) {
    map.set(String(row.jobnumber), {
      jobnumber: String(row.jobnumber),
      job_status: row.job_status || 'Unknown',
      invoiced_total_ex: row.invoiced_total_ex,
      payment_terms: row.payment_terms || null,
    })
  }
  return map
}

// ─── STEP 3: GATE LOGIC ─────────────────────────────────────────────────
function computeGateDisposition(
  gt: GTRow,
  jobInfo: JobCompletionInfo | undefined
): GateDisposition {
  // No job number → ungated (G- opps)
  if (!gt.jobnumber) return 'ungated_no_jn'

  // No job info found in tasks_complete (shouldn't happen but defensive)
  if (!jobInfo) return 'gated_booked'

  // Determined-complete: job_status='Completed' OR (Archived + invoiced > 0)
  const isCompleted = jobInfo.job_status === 'Completed'
  const isArchivedInvoiced = jobInfo.job_status === 'Archived' &&
    jobInfo.invoiced_total_ex != null && jobInfo.invoiced_total_ex > 0
  if (isCompleted || isArchivedInvoiced) return 'determined_complete'

  // Edge case: Archived + no invoice + Account terms → flag for review
  const isArchived = jobInfo.job_status === 'Archived'
  const noInvoice = jobInfo.invoiced_total_ex == null || jobInfo.invoiced_total_ex <= 0
  const isAccountTerms = jobInfo.payment_terms != null &&
    jobInfo.payment_terms !== 'COD' &&
    jobInfo.payment_terms !== '' &&
    jobInfo.payment_terms.toLowerCase().includes('day')
  if (isArchived && noInvoice && isAccountTerms) return 'account_billing_review'

  // Job is Open (not yet reached Booked in AroFlo lifecycle)
  if (jobInfo.job_status === 'Open') return 'ungated_open'

  // Default: has JN, not complete → gated to Booked
  return 'gated_booked'
}

// ─── STEP 4: ASSEMBLY (new input, shared module) ────────────────────────
async function assembleContent(oppIds: string[]): Promise<Map<string, AssemblyEntry>> {
  const map = new Map<string, AssemblyEntry>()
  const ASSEMBLY_CONCURRENCY = 10
  let assembled = 0

  for (let i = 0; i < oppIds.length; i += ASSEMBLY_CONCURRENCY) {
    const batch = oppIds.slice(i, i + ASSEMBLY_CONCURRENCY)
    const promises = batch.map(async (oppId) => {
      try {
        const result = await buildClassifierInputFromTimeline(queryFn, oppId)
        if (!result) return
        const ci = result.input

        const prompt = formatClassifierPrompt(ci)
        map.set(oppId, { prompt, completed: ci.facts.completed })
      } catch (e) {
        console.error(`  Error assembling ${oppId}: ${(e as Error).message}`)
      }
    })
    await Promise.all(promises)
    assembled += batch.length
    if (assembled % 100 === 0 || assembled === oppIds.length) console.log(`  Assembled ${assembled}/${oppIds.length}...`)
  }
  return map
}

// ─── STEP 5: CONSTRAINED BOOKED PROMPT ──────────────────────────────────
const BOOKED_SYSTEM_PROMPT = `You classify the WITHIN-BOOKED outcome of a trade services lead (plumbing/electrical, Sydney AU). The stage IS Booked — a job was created. Your task is to pick the correct sub-status. Return valid JSON only.

Pick ONE sub_status from this CLOSED set (no other values are valid):
- "Job Pending" — booked, not yet attended / still outstanding
- "Booking Cancelled" — booking was cancelled BEFORE we provided a quote or attended site
- "Quote Only" — we attended and provided a quote, but the customer did not proceed with the work
- "Unable to Complete Job - Out of Scope" — we attended but couldn't provide the service (out of scope, requires different trade, structural issue)

DECISION RULES:
1. If there is evidence we attended site and gave a price/quote but the customer declined → "Quote Only"
2. If tech notes say "quote only", "didn't proceed", "not going ahead", "waste of time", "customer getting other quotes" → "Quote Only"
3. If the booking was cancelled/rescheduled-then-lost before any site visit or quote → "Booking Cancelled"
4. If customer cancelled via call/SMS, or went with another provider, or was unresponsive and booking lapsed → "Booking Cancelled"
5. If we attended but the work was outside our capability (roofing, manufacturer issue, no RPZ, etc.) → "Unable to Complete Job - Out of Scope"
6. If none of the above apply and the job appears to be pending/scheduled → "Job Pending"

CONFIDENCE CALIBRATION:
- 0.9+: clear signal in notes/transcript (e.g. "quote only not going ahead")
- 0.7-0.89: probable but notes are ambiguous
- 0.5-0.69: thin content, could be multiple outcomes
- If NO content at all (no transcript, no notes, no emails) → "Job Pending" with confidence 0.5

Return ONLY this JSON:
{"sub_status":"...","confidence":0.XX,"reasoning":"one sentence","source_quote":"key phrase or null"}`

// Unconstrained prompt for ungated rows (same as main harness)
const FULL_SYSTEM_PROMPT = `You classify trade services leads (plumbing/electrical, Sydney AU). Return valid JSON only.

TASK 1 — DISPOSITION: Pick ONE sub_status from this CLOSED list. The funnel stage is DERIVED automatically — do NOT pick stage.

Sub-statuses (grouped by derived stage):
NOT CAPTURED: "Dropped Call", "Unanswered Call", "Unable to Classify"
NOT QUOTABLE: "Outside Service Area", "Service Not Provided", "Strata Issue", "Spam", "Customer Inquiry Only", "Wrong Number / Contact Details", "Technical Error", "Not Job Related", "Vodafone Orphan"
PENDING: "Pending"
NOT BOOKED: "Customer Unresponsive", "Tenant / Strata Referral", "Price / Minimum Call Out", "Capacity / Scheduling", "Wanted Quote Over Phone", "Customer Resolved", "PETTR Did Not Respond", "Other"
BOOKED: "Job Pending", "Job Complete", "Booking Cancelled", "Quote Only", "Unable to Complete Job - Out of Scope"

DISPOSITION RULES:
1. If booking_status="Booked" or completed=true → stage IS Booked. Pick the right Booked sub_status.
2. If answered=false → "Unanswered Call". If answered=true but duration <20s → "Dropped Call".
3. "Spam" = unsolicited marketing/telemarketing. Calls about cleaning/employment/office-space are "Not Job Related". Calls from existing customers about their in-progress job are "Customer Inquiry Only".
4. "Service Not Provided" = enquiry for something PETTR does not do (not plumbing/electrical). "Outside Service Area" = geographic — caller is outside the Sydney service area.
5. If there is NO content (no transcript, no form, no notes, no OHQ) to make a qualitative judgment, set abstained=true.

CONFIDENCE CALIBRATION:
- 0.9+ ONLY when: unambiguous content, single clear signal, no conflicting info.
- 0.7-0.89: content supports verdict but minor ambiguity exists.
- 0.5-0.69: thin content, multiple plausible verdicts.
- <0.5: very thin content, guessing. Consider abstaining.
- ONLY objective facts, NO content → max 0.6 confidence.

Return ONLY this JSON:
{"sub_status":"...","confidence":0.XX,"reasoning":"one sentence","source_quote":"key phrase or null","suggest_csr_review":false,"suggest_account":false,"abstained":false}`

async function classifyBooked(openai: OpenAI, prompt: string): Promise<{
  sub_status: string; confidence: number; reasoning: string; source_quote: string; gate_violation: boolean
}> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', temperature: 0.1, max_tokens: 300,
      messages: [
        { role: 'system', content: BOOKED_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    })
    const raw = response.choices[0]?.message?.content?.trim() || '{}'
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
    const parsed = JSON.parse(cleaned)

    const sub = parsed.sub_status || 'Unknown'
    const gate_violation = !GATED_BOOKED_SUBS.has(sub)

    return {
      sub_status: gate_violation ? `VIOLATION:${sub}` : sub,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      reasoning: parsed.reasoning || '',
      source_quote: parsed.source_quote || '',
      gate_violation,
    }
  } catch (e) {
    return { sub_status: 'ERROR', confidence: 0, reasoning: `API error: ${(e as Error).message}`, source_quote: '', gate_violation: true }
  }
}

async function classifyUngated(openai: OpenAI, prompt: string): Promise<{
  sub_status: string; confidence: number; reasoning: string; source_quote: string; abstained: boolean
}> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', temperature: 0.1, max_tokens: 300,
      messages: [
        { role: 'system', content: FULL_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    })
    const raw = response.choices[0]?.message?.content?.trim() || '{}'
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
    const parsed = JSON.parse(cleaned)
    return {
      sub_status: parsed.sub_status || 'Unknown',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      reasoning: parsed.reasoning || '',
      source_quote: parsed.source_quote || '',
      abstained: !!parsed.abstained,
    }
  } catch (e) {
    return { sub_status: 'ERROR', confidence: 0, reasoning: `API error: ${(e as Error).message}`, source_quote: '', abstained: true }
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────
async function main() {
  const bookedOnly = process.argv.includes('--booked-only')

  console.log('Loading ground truth from BQ...')
  let gt = await loadGroundTruth()
  console.log(`  ${gt.length} rows, ${gt.filter(g => !g.is_determined).length} judgement, ${gt.filter(g => g.is_determined).length} determined`)

  if (bookedOnly) {
    gt = gt.filter(g => SUB_STATUS_TO_STAGE[g.gt_normalised] === 'Booked')
    console.log(`  --booked-only: filtered to ${gt.length} rows with gt_stage=Booked`)
  }

  // Only judgement rows
  const judgementGt = gt.filter(g => !g.is_determined)
  console.log(`  Judgement rows to process: ${judgementGt.length}`)

  // Load job completion info for all JNs
  const jns = judgementGt.map(g => g.jobnumber).filter(Boolean) as string[]
  console.log(`Loading job completion info for ${jns.length} jobs...`)
  const jobInfoMap = await loadJobCompletionInfo(jns)
  console.log(`  Found info for ${jobInfoMap.size} jobs`)

  // Compute gate dispositions
  const gateMap = new Map<string, GateDisposition>()
  for (const g of judgementGt) {
    const jobInfo = g.jobnumber ? jobInfoMap.get(g.jobnumber) : undefined
    gateMap.set(g.opportunity_id, computeGateDisposition(g, jobInfo))
  }

  // Report gate distribution
  const dispositionCounts: Record<string, number> = {}
  for (const d of gateMap.values()) dispositionCounts[d] = (dispositionCounts[d] || 0) + 1
  console.log('\n  Gate distribution:')
  for (const [d, c] of Object.entries(dispositionCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${d.padEnd(28)} ${c}`)
  }

  // Assemble content for rows that need T7 (not determined_complete, not account_billing_review)
  const needsT7 = judgementGt.filter(g => {
    const d = gateMap.get(g.opportunity_id)!
    return d === 'gated_booked' || d === 'ungated_no_jn' || d === 'ungated_open'
  })
  const needsT7Ids = [...new Set(needsT7.map(g => g.opportunity_id))]
  console.log(`\nAssembling content for ${needsT7Ids.length} rows needing T7...`)
  const content = await assembleContent(needsT7Ids)
  console.log(`  Content for ${content.size} opps`)

  const apiKey = getSecret('openai-api-key')
  const openai = new OpenAI({ apiKey })

  // ─── Classify ──────────────────────────────────────────────────
  const results: Result[] = []
  const CONCURRENCY = 5
  let processed = 0

  for (let i = 0; i < judgementGt.length; i += CONCURRENCY) {
    const batch = judgementGt.slice(i, i + CONCURRENCY)
    const promises = batch.map(async (g) => {
      const disposition = gateMap.get(g.opportunity_id)!
      processed++
      if (processed % 20 === 0) console.log(`  ${processed}/${judgementGt.length}...`)

      // ─── DETERMINED COMPLETE: auto-assign, no T7 call ───
      if (disposition === 'determined_complete') {
        return {
          opp: g.opportunity_id, jobnumber: g.jobnumber, contact_name: g.contact_name,
          gt_sub: g.gt_normalised, gt_stage: 'Booked',
          gate_disposition: disposition,
          ai_sub: 'Job Complete', ai_stage: 'Booked',
          confidence: 1.0, reasoning: 'Determined: job_status=Completed or Archived+invoiced',
          source_quote: '', abstained: false, gate_violation: false,
        } as Result
      }

      // ─── ACCOUNT BILLING REVIEW: flag, no T7 call ───
      if (disposition === 'account_billing_review') {
        return {
          opp: g.opportunity_id, jobnumber: g.jobnumber, contact_name: g.contact_name,
          gt_sub: g.gt_normalised, gt_stage: 'Booked',
          gate_disposition: disposition,
          ai_sub: 'account_billing_review', ai_stage: 'Booked',
          confidence: 0, reasoning: 'Flagged: Archived + no invoice + Account terms',
          source_quote: '', abstained: false, gate_violation: false,
        } as Result
      }

      // ─── NEEDS T7 ───
      const entry = content.get(g.opportunity_id)
      if (!entry) {
        return {
          opp: g.opportunity_id, jobnumber: g.jobnumber, contact_name: g.contact_name,
          gt_sub: g.gt_normalised, gt_stage: SUB_STATUS_TO_STAGE[g.gt_normalised] || 'Unknown',
          gate_disposition: disposition,
          ai_sub: 'NO_CONTENT', ai_stage: 'Unknown',
          confidence: 0, reasoning: 'No content assembled',
          source_quote: '', abstained: true, gate_violation: false,
        } as Result
      }

      // ─── GATED BOOKED: constrained prompt, validate output ───
      if (disposition === 'gated_booked') {
        const ai = await classifyBooked(openai, entry.prompt)
        return {
          opp: g.opportunity_id, jobnumber: g.jobnumber, contact_name: g.contact_name,
          gt_sub: g.gt_normalised, gt_stage: 'Booked',
          gate_disposition: disposition,
          ai_sub: ai.sub_status, ai_stage: 'Booked',
          confidence: ai.confidence, reasoning: ai.reasoning,
          source_quote: ai.source_quote, abstained: false,
          gate_violation: ai.gate_violation,
        } as Result
      }

      // ─── UNGATED (no JN, or Open job): full prompt ───
      const ai = await classifyUngated(openai, entry.prompt)
      return {
        opp: g.opportunity_id, jobnumber: g.jobnumber, contact_name: g.contact_name,
        gt_sub: g.gt_normalised, gt_stage: SUB_STATUS_TO_STAGE[g.gt_normalised] || 'Unknown',
        gate_disposition: disposition,
        ai_sub: ai.sub_status, ai_stage: SUB_STATUS_TO_STAGE[ai.sub_status] || 'Unknown',
        confidence: ai.confidence, reasoning: ai.reasoning,
        source_quote: ai.source_quote, abstained: ai.abstained,
        gate_violation: false,
      } as Result
    })
    results.push(...await Promise.all(promises))
  }

  // ─── REPORT ─────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70))
  console.log('  T7 GATED HARNESS — BOOKED SUBSET')
  console.log('='.repeat(70))
  console.log(`\n  Total rows:           ${results.length}`)
  console.log(`  Determined complete:  ${results.filter(r => r.gate_disposition === 'determined_complete').length}`)
  console.log(`  Gated Booked (T7):    ${results.filter(r => r.gate_disposition === 'gated_booked').length}`)
  console.log(`  Account review:       ${results.filter(r => r.gate_disposition === 'account_billing_review').length}`)
  console.log(`  Ungated no JN:        ${results.filter(r => r.gate_disposition === 'ungated_no_jn').length}`)
  console.log(`  Ungated open:         ${results.filter(r => r.gate_disposition === 'ungated_open').length}`)
  console.log(`  Gate violations:      ${results.filter(r => r.gate_violation).length}`)

  // Stage accuracy: all rows should be Booked (since gt_stage=Booked for all)
  const nonDetermined = results.filter(r => r.gate_disposition !== 'determined_complete' && r.gate_disposition !== 'account_billing_review')
  const stageCorrect = nonDetermined.filter(r => r.ai_stage === 'Booked').length
  console.log(`\n  Stage accuracy (non-determined): ${stageCorrect}/${nonDetermined.length} (${(stageCorrect/nonDetermined.length*100).toFixed(1)}%)`)

  // Structural violations: any row with JN that left Booked
  const structuralViolations = results.filter(r => r.jobnumber && r.ai_stage !== 'Booked' && r.gate_disposition !== 'account_billing_review')
  console.log(`  Structural violations (JN + left Booked): ${structuralViolations.length}`)
  if (structuralViolations.length > 0) {
    for (const r of structuralViolations) {
      console.log(`    JN ${r.jobnumber} | ${r.contact_name} | T7: ${r.ai_sub} (${r.ai_stage})`)
    }
  }

  // Sub-status accuracy for gated rows
  const gatedRows = results.filter(r => r.gate_disposition === 'gated_booked')
  console.log(`\n${'='.repeat(70)}`)
  console.log('  WITHIN-BOOKED SUB-STATUS (gated rows)')
  console.log('='.repeat(70))
  const gatedCorrect = gatedRows.filter(r => r.ai_sub === r.gt_sub).length
  console.log(`\n  Overall: ${gatedCorrect}/${gatedRows.length} (${(gatedCorrect/gatedRows.length*100).toFixed(1)}%)`)

  const gatedGtSubs = [...new Set(gatedRows.map(r => r.gt_sub))].sort()
  for (const gtSub of gatedGtSubs) {
    const inClass = gatedRows.filter(r => r.gt_sub === gtSub)
    const correct = inClass.filter(r => r.ai_sub === gtSub).length
    console.log(`\n  ${gtSub} (n=${inClass.length}):`)
    console.log(`    Correct: ${correct}/${inClass.length} (${(correct/inClass.length*100).toFixed(0)}%)`)
    const misses = inClass.filter(r => r.ai_sub !== gtSub)
    if (misses.length > 0) {
      const missCounts: Record<string, number> = {}
      for (const m of misses) { missCounts[m.ai_sub] = (missCounts[m.ai_sub] || 0) + 1 }
      for (const [aiSub, cnt] of Object.entries(missCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`    → ${aiSub}: ${cnt}`)
      }
    }
  }

  // Determined-complete accuracy
  const detRows = results.filter(r => r.gate_disposition === 'determined_complete')
  if (detRows.length > 0) {
    console.log(`\n${'='.repeat(70)}`)
    console.log('  DETERMINED COMPLETE (auto Job Complete)')
    console.log('='.repeat(70))
    const detCorrect = detRows.filter(r => r.gt_sub === 'Job Complete' || r.gt_sub === 'Job Pending').length
    const detQuoteOnly = detRows.filter(r => r.gt_sub === 'Quote Only').length
    const detBookingCancelled = detRows.filter(r => r.gt_sub === 'Booking Cancelled').length
    const detOOS = detRows.filter(r => r.gt_sub === 'Unable to Complete Job - Out of Scope').length
    console.log(`\n  Total auto-completed: ${detRows.length}`)
    console.log(`  GT=Job Complete/Pending (correct): ${detCorrect}`)
    console.log(`  GT=Quote Only (wrong — should have gone to T7): ${detQuoteOnly}`)
    console.log(`  GT=Booking Cancelled (wrong): ${detBookingCancelled}`)
    console.log(`  GT=Out of Scope (wrong): ${detOOS}`)
  }

  // ─── The 5 structural violations from pre-gate run ───
  const watchList = ['J-142383', 'J-142025', 'J-141059', 'J-142487', 'J-142260']
  console.log(`\n${'='.repeat(70)}`)
  console.log('  WATCH LIST (5 prior structural violations)')
  console.log('='.repeat(70))
  for (const oppId of watchList) {
    const r = results.find(x => x.opp === oppId)
    if (r) {
      console.log(`\n  ${oppId} | JN ${r.jobnumber} | ${r.contact_name}`)
      console.log(`    Gate: ${r.gate_disposition}`)
      console.log(`    Human: ${r.gt_sub}`)
      console.log(`    T7: ${r.ai_sub} (stage: ${r.ai_stage})`)
      console.log(`    Confidence: ${r.confidence} | Violation: ${r.gate_violation}`)
      console.log(`    Reasoning: ${r.reasoning}`)
    }
  }

  // ─── CSV PERSISTENCE ─────────────────────────────────────────
  const csvDir = path.join(__dirname, '..', 'docs', 'harness_runs')
  fs.mkdirSync(csvDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const csvPath = path.join(csvDir, `t7_rg006_gated_booked_${ts}.csv`)

  const csvHeader = 'opp_id,jobnumber,contact_name,gt_sub,gt_stage,gate_disposition,ai_sub,ai_stage,confidence,reasoning,source_quote,gate_violation,abstained'
  const csvRows = results.map(r => {
    const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`
    return [
      r.opp, r.jobnumber || '', esc(r.contact_name || ''),
      esc(r.gt_sub), esc(r.gt_stage), r.gate_disposition,
      esc(r.ai_sub), esc(r.ai_stage), r.confidence,
      esc(r.reasoning), esc(r.source_quote),
      r.gate_violation, r.abstained,
    ].join(',')
  })
  fs.writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n'))
  console.log(`\n  CSV saved: ${csvPath}`)

  console.log(`\nDone.`)
}

main().catch(console.error)
