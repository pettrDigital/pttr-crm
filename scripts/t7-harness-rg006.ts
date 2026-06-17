/**
 * T7 Harness — scores ai-classify-validate.ts classifier against RG006 ground truth.
 * Standalone script. Does NOT modify the classifier, the live app, or Firestore.
 * Reads from BQ staging table t7_ground_truth_rg006 (694 rows, normalised labels).
 *
 * Scores ONLY judgement rows (is_determined=false, n=493).
 * Determined rows (Job Complete, Job Pending) reported separately.
 * Objective override: if AroFlo job_status=Completed, determined label wins.
 *
 * Scoring carve-out: for completed=true rows, stage was handed to the model
 * (prompt rule #1), so stage accuracy excludes them. Sub-status accuracy uses
 * the RAW model prediction (before objective override) to measure within-Booked
 * discrimination (Quote Only vs Job Complete vs Booking Cancelled vs Unable to Complete).
 *
 * Usage:
 *   npx tsx scripts/t7-harness-rg006.ts          # new input (shared module)
 *   npx tsx scripts/t7-harness-rg006.ts --old     # old input (6 first-only queries)
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

// Flatten BQ value wrappers ({value: "..."} for TIMESTAMP, Big.js for NUMERIC)
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

const BOOKED_SUBS = new Set(['Job Pending', 'Job Complete', 'Booking Cancelled', 'Quote Only', 'Unable to Complete Job - Out of Scope'])

interface GTRow {
  wc_lead_id: number
  opportunity_id: string
  gt_normalised: string
  is_determined: boolean
  jobnumber: string | null
  contact_name: string | null
}

// Normalised assembly output — both old and new pipelines produce this shape
interface AssemblyEntry {
  prompt: string
  completed: boolean | null
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

// ─── STEP 2a: OLD ASSEMBLY (6 first-only queries, baseline) ─────────────
async function assembleContentOld(oppIds: string[]): Promise<Map<string, AssemblyEntry>> {
  const map = new Map<string, AssemblyEntry>()
  if (oppIds.length === 0) return map

  for (let i = 0; i < oppIds.length; i += 200) {
    const batch = oppIds.slice(i, i + 200)

    const [factRows] = await bq.query({
      query: `SELECT le.opportunity_id, le.lead_type, le.channel, le.source, le.service,
                le.answered, le.captured, le.is_after_hours, le.booking_status,
                le.completed, le.job_count, le.is_existing_customer,
                le.contact_name, le.phone, le.suburb,
                o.matched_phones, o.wc_lead_id, o.opportunity_timestamp
              FROM \`pttr-taskdata.ds_crm.vw_lead_enriched\` le
              JOIN \`pttr-taskdata.ds_crm.opportunities\` o ON le.opportunity_id = o.opportunity_id
              WHERE le.opportunity_id IN UNNEST(@ids)`,
      params: { ids: batch },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctxMap = new Map<string, any>()
    for (const row of factRows) {
      const r = flattenRow(row)
      ctxMap.set(r.opportunity_id, {
        opportunity_id: r.opportunity_id,
        lead_type: r.lead_type, channel: r.channel, source: r.source,
        service: r.service, answered: r.answered, captured: r.captured,
        is_after_hours: r.is_after_hours, duration_sec: null,
        booking_status: r.booking_status, completed: r.completed,
        job_count: r.job_count, is_existing_customer: r.is_existing_customer,
        contact_name: r.contact_name, phone: r.phone, suburb: r.suburb,
        transcript: null, transcript_source: null, form_body: null,
        ohq_content: null, job_description: null, labour_note: null, task_notes: null,
      })
    }

    // 8x8 transcripts
    const [txRows] = await bq.query({
      query: `SELECT o.opportunity_id, ct.full_transcript,
                CASE WHEN rc.talk_time IS NOT NULL AND REGEXP_CONTAINS(rc.talk_time, r'^\\d{2}:\\d{2}:\\d{2}$')
                  THEN CAST(SPLIT(rc.talk_time, ':')[OFFSET(0)] AS INT64) * 3600
                     + CAST(SPLIT(rc.talk_time, ':')[OFFSET(1)] AS INT64) * 60
                     + CAST(SPLIT(rc.talk_time, ':')[OFFSET(2)] AS INT64)
                  ELSE NULL END AS duration_sec
              FROM \`pttr-taskdata.ds_crm.opportunities\` o
              JOIN \`pttr-taskdata.ds_crm.raw_calls\` rc ON rc.norm_caller_phone = o.phone
                AND rc.start_time BETWEEN TIMESTAMP_SUB(o.opportunity_timestamp, INTERVAL 30 SECOND)
                  AND TIMESTAMP_ADD(o.opportunity_timestamp, INTERVAL 30 SECOND)
              LEFT JOIN \`pttr-taskdata.ds_crm.call_transcripts\` ct ON rc.call_id = ct.call_id
              WHERE o.opportunity_id IN UNNEST(@ids)
              QUALIFY ROW_NUMBER() OVER (PARTITION BY o.opportunity_id ORDER BY rc.start_time) = 1`,
      params: { ids: batch },
    })
    for (const row of txRows.map(flattenRow)) {
      const ctx = ctxMap.get(row.opportunity_id)
      if (ctx) {
        if (row.full_transcript) { ctx.transcript = row.full_transcript; ctx.transcript_source = '8x8' }
        ctx.duration_sec = row.duration_sec
      }
    }

    // WC transcripts (fallback)
    const [wcRows] = await bq.query({
      query: `SELECT o.opportunity_id, ale.call_transcription, ale.call_duration_seconds
              FROM \`pttr-taskdata.ds_crm.opportunities\` o
              JOIN \`pttr-taskdata.gd_WhatConverts.all_leads_enriched\` ale ON o.wc_lead_id = ale.lead_id
              WHERE o.opportunity_id IN UNNEST(@ids) AND ale.call_transcription IS NOT NULL`,
      params: { ids: batch },
    })
    for (const row of wcRows.map(flattenRow)) {
      const ctx = ctxMap.get(row.opportunity_id)
      if (ctx && !ctx.transcript) {
        ctx.transcript = row.call_transcription; ctx.transcript_source = 'whatconverts'
        if (!ctx.duration_sec) ctx.duration_sec = row.call_duration_seconds
      }
    }

    // Form bodies
    const [formRows] = await bq.query({
      query: `SELECT o.opportunity_id, COALESCE(e.body_text, e.body_preview) AS form_body
              FROM \`pttr-taskdata.ds_crm.opportunities\` o
              JOIN \`pttr-taskdata.ds_crm.vw_leads_unified\` lu ON lu.phone = o.phone AND lu.source_type = 'email'
                AND lu.lead_timestamp BETWEEN TIMESTAMP_SUB(o.opportunity_timestamp, INTERVAL 300 SECOND)
                  AND TIMESTAMP_ADD(o.opportunity_timestamp, INTERVAL 2592000 SECOND)
              JOIN \`pttr-taskdata.ds_crm.raw_emails_received\` e ON CONCAT('email-', e.message_id) = lu.lead_id
              WHERE o.opportunity_id IN UNNEST(@ids)
              QUALIFY ROW_NUMBER() OVER (PARTITION BY o.opportunity_id ORDER BY lu.lead_timestamp) = 1`,
      params: { ids: batch },
    })
    for (const row of formRows.map(flattenRow)) { const ctx = ctxMap.get(row.opportunity_id); if (ctx) ctx.form_body = row.form_body }

    // OHQ content
    const [ohqRows] = await bq.query({
      query: `SELECT o.opportunity_id, e.body_preview AS ohq_content
              FROM \`pttr-taskdata.ds_crm.opportunities\` o
              JOIN \`pttr-taskdata.ds_crm.raw_emails_received\` e ON LOWER(e.from_email) LIKE '%myreceptionist%'
                AND (e.body_preview LIKE CONCAT('%', o.phone, '%')
                  OR REPLACE(e.body_preview, ' ', '') LIKE CONCAT('%', REPLACE(o.phone, '+61', '0'), '%'))
                AND TIMESTAMP(e.received_at) BETWEEN TIMESTAMP_SUB(o.opportunity_timestamp, INTERVAL 1800 SECOND)
                  AND TIMESTAMP_ADD(o.opportunity_timestamp, INTERVAL 1800 SECOND)
              WHERE o.opportunity_id IN UNNEST(@ids)
              QUALIFY ROW_NUMBER() OVER (PARTITION BY o.opportunity_id ORDER BY e.received_at) = 1`,
      params: { ids: batch },
    })
    for (const row of ohqRows.map(flattenRow)) { const ctx = ctxMap.get(row.opportunity_id); if (ctx) ctx.ohq_content = row.ohq_content }

    // Job description + notes
    const [jobRows] = await bq.query({
      query: `SELECT o.opportunity_id, td.description AS job_description, ln.labour_note, tn.task_notes
              FROM \`pttr-taskdata.ds_crm.opportunities\` o
              JOIN \`pttr-taskdata.ds_aroflo.tasks_deduped\` td ON CAST(o.jobnumber AS STRING) = td.jobnumber
              LEFT JOIN (
                SELECT task_jobnumber AS jobnumber,
                  ARRAY_AGG(note ORDER BY workdate DESC LIMIT 1)[OFFSET(0)] AS labour_note
                FROM (SELECT task_jobnumber, note, workdate,
                    ROW_NUMBER() OVER (PARTITION BY task_jobnumber, lineid ORDER BY workdate DESC) AS rn
                  FROM \`pttr-taskdata.ds_aroflo.tasklabours_raw\`
                  WHERE note IS NOT NULL AND TRIM(note) != '' AND (deleted IS NULL OR deleted != 'true')
                ) WHERE rn = 1 GROUP BY task_jobnumber
              ) ln ON td.jobnumber = ln.jobnumber
              LEFT JOIN (
                SELECT jobnumber,
                  STRING_AGG(CONCAT(COALESCE(dateposted, ''), ': ', COALESCE(note_clean, '')), '\\n' ORDER BY dateposted DESC LIMIT 3) AS task_notes
                FROM \`pttr-taskdata.ds_aroflo.task_notes_deduped\` GROUP BY jobnumber
              ) tn ON td.jobnumber = tn.jobnumber
              WHERE o.opportunity_id IN UNNEST(@ids) AND o.jobnumber IS NOT NULL`,
      params: { ids: batch },
    })
    for (const row of jobRows.map(flattenRow)) {
      const ctx = ctxMap.get(row.opportunity_id)
      if (ctx) { ctx.job_description = row.job_description; ctx.labour_note = row.labour_note; ctx.task_notes = row.task_notes }
    }

    // Build prompts using old format
    for (const [oppId, ctx] of ctxMap) {
      const parts: string[] = []
      parts.push(`OBJECTIVE FACTS:`)
      parts.push(`- Lead type: ${ctx.lead_type}, Channel: ${ctx.channel}, Source: ${ctx.source}`)
      parts.push(`- Service: ${ctx.service}`)
      parts.push(`- Answered: ${ctx.answered}, Captured (>=20s): ${ctx.captured}`)
      parts.push(`- After hours: ${ctx.is_after_hours}`)
      if (ctx.duration_sec != null) parts.push(`- Call duration: ${ctx.duration_sec}s`)
      parts.push(`- Booking status: ${ctx.booking_status}, Completed: ${ctx.completed}, Job count: ${ctx.job_count}`)
      parts.push(`- Existing customer: ${ctx.is_existing_customer}`)
      if (ctx.contact_name) parts.push(`- Contact: ${ctx.contact_name}`)
      if (ctx.suburb) parts.push(`- Suburb: ${ctx.suburb}`)
      if (ctx.transcript) {
        parts.push(`\nCALL TRANSCRIPT (via ${ctx.transcript_source}):`)
        parts.push(ctx.transcript.length > 4000 ? ctx.transcript.slice(0, 4000) + '...[truncated]' : ctx.transcript)
      }
      if (ctx.form_body) { parts.push(`\nFORM SUBMISSION:`); parts.push(ctx.form_body.length > 2000 ? ctx.form_body.slice(0, 2000) + '...[truncated]' : ctx.form_body) }
      if (ctx.ohq_content) { parts.push(`\nANSWERING SERVICE (OfficeHQ):`); parts.push(ctx.ohq_content.length > 1500 ? ctx.ohq_content.slice(0, 1500) + '...[truncated]' : ctx.ohq_content) }
      if (ctx.job_description) { parts.push(`\nJOB DESCRIPTION:`); parts.push(ctx.job_description.length > 1500 ? ctx.job_description.slice(0, 1500) + '...[truncated]' : ctx.job_description) }
      if (ctx.labour_note) { parts.push(`\nTECH LABOUR NOTE:`); parts.push(ctx.labour_note.slice(0, 1000)) }
      if (ctx.task_notes) { parts.push(`\nTASK NOTES (latest):`); parts.push(ctx.task_notes.slice(0, 1000)) }
      map.set(oppId, { prompt: parts.join('\n'), completed: ctx.completed })
    }
  }
  return map
}

// ─── STEP 2b: NEW ASSEMBLY (shared module: full timeline) ───────────────
async function assembleContentNew(oppIds: string[]): Promise<Map<string, AssemblyEntry>> {
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

// ─── STEP 3: CLASSIFY ──────────────────────────────────────────────────
const SYSTEM_PROMPT = `You classify trade services leads (plumbing/electrical, Sydney AU). Return valid JSON only.

TASK 1 — DISPOSITION: Pick ONE sub_status from this CLOSED list. The funnel stage is DERIVED automatically — do NOT pick stage.

Sub-statuses (grouped by derived stage):
NOT CAPTURED: "Dropped Call", "Unanswered Call", "Unable to Classify"
NOT QUOTABLE: "Outside Service Area", "Service Not Provided", "Strata Issue", "Spam", "Customer Inquiry Only", "Wrong Number / Contact Details", "Technical Error", "Not Job Related", "Vodafone Orphan"
PENDING: "Pending"
NOT BOOKED: "Customer Unresponsive", "Booked Elsewhere", "Tenant / Strata Referral", "Price / Minimum Call Out", "Capacity / Scheduling", "Wanted Quote Over Phone", "Customer Resolved", "PETTR Did Not Respond", "Other"
BOOKED: "Job Pending", "Job Complete", "Booking Cancelled", "Quote Only", "Unable to Complete Job - Out of Scope"

DISPOSITION RULES:
1. If booking_status="Booked" or completed=true → stage IS Booked. Pick the right Booked sub_status.
2. If answered=false → "Unanswered Call". If answered=true but duration <20s → "Dropped Call".
3. "Spam" = unsolicited marketing/telemarketing. Calls about cleaning/employment/office-space are "Not Job Related". Calls from existing customers about their in-progress job are "Customer Inquiry Only".
4. "Service Not Provided" = enquiry for something PETTR does not do (not plumbing/electrical — e.g. TV repair, locksmith, solar, appliance installation). "Outside Service Area" = geographic — caller is outside the Sydney service area.
5. If there is NO content (no transcript, no form, no notes, no OHQ) to make a qualitative judgment, set abstained=true.

CONFIDENCE CALIBRATION:
- 0.9+ ONLY when: unambiguous content, single clear signal, no conflicting info.
- 0.7-0.89: content supports verdict but minor ambiguity exists.
- 0.5-0.69: thin content, multiple plausible verdicts.
- <0.5: very thin content, guessing. Consider abstaining.
- ONLY objective facts, NO content → max 0.6 confidence.

Return ONLY this JSON:
{"sub_status":"...","confidence":0.XX,"reasoning":"one sentence","source_quote":"key phrase or null","suggest_csr_review":false,"suggest_account":false,"abstained":false}`

async function classifyLead(openai: OpenAI, prompt: string) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', temperature: 0.1, max_tokens: 300,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    })
    const raw = response.choices[0]?.message?.content?.trim() || '{}'
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
    const parsed = JSON.parse(cleaned)
    return {
      sub_status: parsed.sub_status || 'Unknown',
      stage: SUB_STATUS_TO_STAGE[parsed.sub_status] || 'Unknown',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      reasoning: parsed.reasoning || '',
      source_quote: parsed.source_quote || '',
      abstained: !!parsed.abstained,
    }
  } catch (e) {
    return { sub_status: 'ERROR', stage: 'ERROR', confidence: 0, reasoning: `API error: ${(e as Error).message}`, source_quote: '', abstained: true }
  }
}

// ─── STEP 4: SCORE + REPORT ─────────────────────────────────────────────
async function main() {
  const useOldInput = process.argv.includes('--old')
  const bookedOnly = process.argv.includes('--booked-only')
  const inputLabel = useOldInput ? 'OLD (6 first-only queries)' : 'NEW (shared module — full timeline)'

  console.log('Loading ground truth from BQ...')
  let gt = await loadGroundTruth()
  console.log(`  ${gt.length} rows, ${gt.filter(g => !g.is_determined).length} judgement, ${gt.filter(g => g.is_determined).length} determined`)

  // Filter to Booked-GT subset if requested
  if (bookedOnly) {
    gt = gt.filter(g => SUB_STATUS_TO_STAGE[g.gt_normalised] === 'Booked')
    console.log(`  --booked-only: filtered to ${gt.length} rows with gt_stage=Booked`)
  }

  const oppIds = [...new Set(gt.map(g => g.opportunity_id))]
  console.log(`Assembling content — ${inputLabel}...`)
  const content = useOldInput ? await assembleContentOld(oppIds) : await assembleContentNew(oppIds)
  console.log(`  Content for ${content.size} opps`)

  // Only score judgement rows
  const judgementGt = gt.filter(g => !g.is_determined && content.has(g.opportunity_id))
  const determinedGt = gt.filter(g => g.is_determined && content.has(g.opportunity_id))
  console.log(`  Scoring ${judgementGt.length} judgement rows (${determinedGt.length} determined excluded)`)

  const apiKey = getSecret('openai-api-key')
  const openai = new OpenAI({ apiKey })

  // ─── Classify judgement rows ──────────────────────────────────
  interface Result {
    opp: string; jobnumber: string | null; contact_name: string | null
    gt_sub: string; gt_stage: string
    raw_ai_sub: string   // model's actual prediction (before objective override)
    ai_sub: string       // after objective override
    ai_stage: string
    confidence: number; reasoning: string; source_quote: string; abstained: boolean
    completed: boolean   // whether completed=true was in the model's input
  }
  const results: Result[] = []
  const CONCURRENCY = 5
  let processed = 0

  for (let i = 0; i < judgementGt.length; i += CONCURRENCY) {
    const batch = judgementGt.slice(i, i + CONCURRENCY)
    const promises = batch.map(async (g) => {
      const entry = content.get(g.opportunity_id)!
      const ai = await classifyLead(openai, entry.prompt)
      processed++
      if (processed % 50 === 0) console.log(`  ${processed}/${judgementGt.length}...`)

      const rawAiSub = ai.sub_status

      // Objective override: if AroFlo completed, determined label wins
      let finalAiSub = ai.sub_status
      if (entry.completed === true && ai.sub_status !== 'Job Complete' && ai.sub_status !== 'Job Pending') {
        finalAiSub = 'Job Complete'
      }

      return {
        opp: g.opportunity_id, jobnumber: g.jobnumber, contact_name: g.contact_name,
        gt_sub: g.gt_normalised,
        raw_ai_sub: rawAiSub,
        ai_sub: finalAiSub, ai_stage: SUB_STATUS_TO_STAGE[finalAiSub] || 'Unknown',
        confidence: ai.confidence, reasoning: ai.reasoning,
        source_quote: ai.source_quote || '',
        abstained: ai.abstained,
        gt_stage: SUB_STATUS_TO_STAGE[g.gt_normalised] || 'Unknown',
        completed: entry.completed === true,
      }
    })
    results.push(...await Promise.all(promises))
  }

  // ─── REPORT ─────────────────────────────────────────────────────
  const classified = results.filter(r => !r.abstained)
  const abstainedResults = results.filter(r => r.abstained)

  // Scoring carve-out: for completed=true rows, use raw_ai_sub for sub-status,
  // exclude from stage scoring. For all others, use ai_sub (with override).
  const completedClassified = classified.filter(r => r.completed)
  const nonCompletedClassified = classified.filter(r => !r.completed)

  console.log('\n' + '='.repeat(70))
  console.log(`  T7 HARNESS — RG006 (${inputLabel})`)
  console.log('='.repeat(70))
  console.log(`\n  Total judgement rows:  ${results.length}`)
  console.log(`  Classified:           ${classified.length}`)
  console.log(`  Abstained:            ${abstainedResults.length}`)
  console.log(`  Completed=true rows:  ${completedClassified.length} (excluded from stage accuracy)`)

  // ─── Per-sub-status accuracy ─────────────────────────────────
  // For sub-status scoring: completed rows use raw_ai_sub, others use ai_sub
  function scoredSub(r: Result): string {
    return r.completed ? r.raw_ai_sub : r.ai_sub
  }

  console.log(`\n${'='.repeat(70)}`)
  console.log('  PER-SUB-STATUS ACCURACY (human × T7)')
  console.log('='.repeat(70))

  const gtSubs = [...new Set(classified.map(r => r.gt_sub))].sort()
  for (const gtSub of gtSubs) {
    const inClass = classified.filter(r => r.gt_sub === gtSub)
    const correct = inClass.filter(r => scoredSub(r) === gtSub).length
    const n = inClass.length
    const abstainedInClass = results.filter(r => r.gt_sub === gtSub && r.abstained).length

    console.log(`\n  ${gtSub} (n=${n}, abstained=${abstainedInClass}):`)
    console.log(`    Correct: ${correct}/${n} (${n > 0 ? (correct/n*100).toFixed(0) : 0}%)`)

    const misses = inClass.filter(r => scoredSub(r) !== gtSub)
    if (misses.length > 0) {
      const missCounts: Record<string, number> = {}
      for (const m of misses) { missCounts[scoredSub(m)] = (missCounts[scoredSub(m)] || 0) + 1 }
      const sorted = Object.entries(missCounts).sort((a, b) => b[1] - a[1])
      for (const [aiSub, cnt] of sorted) {
        console.log(`    → ${aiSub}: ${cnt}`)
      }
    }
  }

  // ─── Stage-level accuracy (excluding completed=true rows) ────
  console.log(`\n${'='.repeat(70)}`)
  console.log('  STAGE-LEVEL ACCURACY (completed=true excluded)')
  console.log('='.repeat(70))
  const stageCorrect = nonCompletedClassified.filter(r => r.gt_stage === r.ai_stage).length
  console.log(`\n  Overall stage match: ${stageCorrect}/${nonCompletedClassified.length} (${(stageCorrect/nonCompletedClassified.length*100).toFixed(1)}%)`)

  const gtStages = [...new Set(nonCompletedClassified.map(r => r.gt_stage))].sort()
  for (const stage of gtStages) {
    const inStage = nonCompletedClassified.filter(r => r.gt_stage === stage)
    const correct = inStage.filter(r => r.ai_stage === stage).length
    console.log(`  ${stage.padEnd(20)} ${correct}/${inStage.length} (${(correct/inStage.length*100).toFixed(0)}%)`)
  }

  // ─── Within-Booked sub-status accuracy (completed=true only) ─
  if (completedClassified.length > 0) {
    console.log(`\n${'='.repeat(70)}`)
    console.log('  WITHIN-BOOKED SUB-STATUS (completed=true rows, raw model output)')
    console.log('='.repeat(70))
    const bookedGtSubs = [...new Set(completedClassified.map(r => r.gt_sub))].sort()
    const bookedCorrect = completedClassified.filter(r => r.raw_ai_sub === r.gt_sub).length
    console.log(`\n  Overall within-Booked match: ${bookedCorrect}/${completedClassified.length} (${(bookedCorrect/completedClassified.length*100).toFixed(1)}%)`)
    for (const gtSub of bookedGtSubs) {
      const inClass = completedClassified.filter(r => r.gt_sub === gtSub)
      const correct = inClass.filter(r => r.raw_ai_sub === gtSub).length
      console.log(`  ${gtSub.padEnd(40)} ${correct}/${inClass.length} (${(correct/inClass.length*100).toFixed(0)}%)`)
    }
  }

  // ─── Thin classes ────────────────────────────────────────────
  console.log(`\n${'='.repeat(70)}`)
  console.log('  THIN CLASSES (n < 20)')
  console.log('='.repeat(70))
  for (const gtSub of gtSubs) {
    const total = results.filter(r => r.gt_sub === gtSub).length
    if (total < 20) {
      const inClass = classified.filter(r => r.gt_sub === gtSub)
      const correct = inClass.filter(r => scoredSub(r) === gtSub).length
      const abstainedInClass = results.filter(r => r.gt_sub === gtSub && r.abstained).length
      console.log(`  ${gtSub}: n=${total} classified=${inClass.length} correct=${correct} abstained=${abstainedInClass}`)
    }
  }

  // ─── CSV PERSISTENCE ─────────────────────────────────────────
  const csvDir = path.join(__dirname, '..', 'docs', 'harness_runs')
  fs.mkdirSync(csvDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const suffix = bookedOnly ? '_booked' : ''
  const inputTag = useOldInput ? 'old' : 'new'
  const csvPath = path.join(csvDir, `t7_rg006_${inputTag}${suffix}_${ts}.csv`)

  const csvHeader = 'opp_id,jobnumber,contact_name,gt_sub,gt_stage,ai_sub,ai_stage,completed,abstained,confidence,reasoning,source_quote'
  const csvRows = results.map(r => {
    const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`
    return [
      r.opp, r.jobnumber || '', esc(r.contact_name || ''),
      esc(r.gt_sub), esc(r.gt_stage),
      esc(scoredSub(r)), esc(SUB_STATUS_TO_STAGE[scoredSub(r)] || 'Unknown'),
      r.completed, r.abstained, r.confidence,
      esc(r.reasoning), esc(r.source_quote),
    ].join(',')
  })
  fs.writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n'))
  console.log(`\n  CSV saved: ${csvPath}`)

  console.log(`\nDone.`)
}

main().catch(console.error)
