/**
 * AI Lead Classifier — Validation Pass v2
 *
 * Compares AI classification + task-value extraction against ground truth.
 * Does NOT write to Firestore. Read-only measurement.
 *
 * Fixes from v1:
 * - AI classifies SUB-STATUS only; stage derived by roll-up (same as UI)
 * - Ground truth filtered: excludes BQ funnel stages (Captured, Paid Job, etc.)
 * - Calibration prompt rewritten for confidence discrimination
 * - Task-value: collected amount only, not sum of labour + invoice notes
 *
 * Usage: npx tsx scripts/ai-classify-validate.ts
 */

import 'dotenv/config'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { BigQuery } from '@google-cloud/bigquery'
import OpenAI from 'openai'
import * as fs from 'fs'
import { execSync } from 'child_process'

// ─── INIT ──────────────────────────────────────────────────────────────────

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
const db = getFirestore()
const bq = new BigQuery({ projectId: 'pttr-taskdata' })

function getSecret(name: string): string {
  return execSync(
    `gcloud secrets versions access latest --secret=${name} --project=pttr-taskdata`,
    { encoding: 'utf-8' }
  ).trim()
}

// ─── TAXONOMY — single source of truth ─────────────────────────────────────

// Sub-status → stage roll-up (same logic as UI getAutoPlacement / TAXONOMY)
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

const ALL_SUB_STATUSES = Object.keys(SUB_STATUS_TO_STAGE)

// BQ funnel stages that are OBJECTIVE (rule-derived, not qualitative classification)
const BQ_FUNNEL_STAGES = new Set(['Captured', 'Paid Job', 'Job Complete', 'Pending'])

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface HumanOverride {
  opportunity_id: string
  stage: string
  sub_status: string
  updated_by?: string
  is_account?: boolean
}

interface LeadContext {
  opportunity_id: string
  lead_type: string
  channel: string
  source: string
  service: string
  answered: boolean | null
  captured: boolean | null
  is_after_hours: boolean
  duration_sec: number | null
  booking_status: string
  completed: boolean | null
  job_count: number
  is_existing_customer: boolean
  contact_name: string | null
  phone: string | null
  suburb: string | null
  transcript: string | null
  transcript_source: string | null
  form_body: string | null
  ohq_content: string | null
  job_description: string | null
  labour_note: string | null
  task_notes: string | null
}

interface AIResult {
  sub_status: string
  stage: string  // derived from sub_status roll-up
  confidence: number
  reasoning: string
  source_quote: string | null
  suggest_csr_review: boolean
  suggest_account: boolean
  abstained: boolean
  value_amount: number | null
  value_is_ex_gst: boolean
  value_confidence: number
  value_source_quote: string | null
}

// ─── STEP 1: READ HUMAN GROUND TRUTH ───────────────────────────────────────

async function readGroundTruth(): Promise<HumanOverride[]> {
  const snapshot = await db.collection('crm_lead_overrides').get()
  const overrides: HumanOverride[] = []
  for (const doc of snapshot.docs) {
    const d = doc.data()
    if (!d.stage) continue
    if (d.updated_by?.startsWith('auto_rule:')) continue
    if (d.updated_by?.startsWith('auto:')) continue
    overrides.push({
      opportunity_id: doc.id,
      stage: d.stage,
      sub_status: d.sub_status || d.stage,
      updated_by: d.updated_by,
      is_account: d.is_account || false,
    })
  }
  return overrides
}

// ─── STEP 2: ASSEMBLE CONTENT FROM BQ ──────────────────────────────────────

async function assembleContent(oppIds: string[]): Promise<Map<string, LeadContext>> {
  const map = new Map<string, LeadContext>()
  if (oppIds.length === 0) return map

  for (let i = 0; i < oppIds.length; i += 200) {
    const batch = oppIds.slice(i, i + 200)

    const [factRows] = await bq.query({
      query: `
        SELECT
          le.opportunity_id, le.lead_type, le.channel, le.source, le.service,
          le.answered, le.captured, le.is_after_hours, le.booking_status,
          le.completed, le.job_count, le.is_existing_customer,
          le.contact_name, le.phone, le.suburb,
          o.matched_phones, o.wc_lead_id, o.opportunity_timestamp
        FROM \`pttr-taskdata.ds_crm.vw_lead_enriched\` le
        JOIN \`pttr-taskdata.ds_crm.opportunities\` o ON le.opportunity_id = o.opportunity_id
        WHERE le.opportunity_id IN UNNEST(@ids)
      `,
      params: { ids: batch },
    })
    for (const row of factRows) {
      map.set(row.opportunity_id, {
        opportunity_id: row.opportunity_id,
        lead_type: row.lead_type, channel: row.channel, source: row.source,
        service: row.service, answered: row.answered, captured: row.captured,
        is_after_hours: row.is_after_hours, duration_sec: null,
        booking_status: row.booking_status, completed: row.completed,
        job_count: row.job_count, is_existing_customer: row.is_existing_customer,
        contact_name: row.contact_name, phone: row.phone, suburb: row.suburb,
        transcript: null, transcript_source: null, form_body: null,
        ohq_content: null, job_description: null, labour_note: null, task_notes: null,
      })
    }

    // 8x8 transcripts
    const [txRows] = await bq.query({
      query: `
        SELECT o.opportunity_id, ct.full_transcript,
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
        QUALIFY ROW_NUMBER() OVER (PARTITION BY o.opportunity_id ORDER BY rc.start_time) = 1
      `, params: { ids: batch },
    })
    for (const row of txRows) {
      const ctx = map.get(row.opportunity_id)
      if (ctx) {
        if (row.full_transcript) { ctx.transcript = row.full_transcript; ctx.transcript_source = '8x8' }
        ctx.duration_sec = row.duration_sec
      }
    }

    // WC transcripts (fallback)
    const [wcRows] = await bq.query({
      query: `
        SELECT o.opportunity_id, ale.call_transcription, ale.call_duration_seconds
        FROM \`pttr-taskdata.ds_crm.opportunities\` o
        JOIN \`pttr-taskdata.gd_WhatConverts.all_leads_enriched\` ale ON o.wc_lead_id = ale.lead_id
        WHERE o.opportunity_id IN UNNEST(@ids) AND ale.call_transcription IS NOT NULL
      `, params: { ids: batch },
    })
    for (const row of wcRows) {
      const ctx = map.get(row.opportunity_id)
      if (ctx && !ctx.transcript) {
        ctx.transcript = row.call_transcription; ctx.transcript_source = 'whatconverts'
        if (!ctx.duration_sec) ctx.duration_sec = row.call_duration_seconds
      }
    }

    // Form bodies
    const [formRows] = await bq.query({
      query: `
        SELECT o.opportunity_id, COALESCE(e.body_text, e.body_preview) AS form_body
        FROM \`pttr-taskdata.ds_crm.opportunities\` o
        JOIN \`pttr-taskdata.ds_crm.vw_leads_unified\` lu ON lu.phone = o.phone AND lu.source_type = 'email'
          AND lu.lead_timestamp BETWEEN TIMESTAMP_SUB(o.opportunity_timestamp, INTERVAL 300 SECOND)
            AND TIMESTAMP_ADD(o.opportunity_timestamp, INTERVAL 2592000 SECOND)
        JOIN \`pttr-taskdata.ds_crm.raw_emails_received\` e ON CONCAT('email-', e.message_id) = lu.lead_id
        WHERE o.opportunity_id IN UNNEST(@ids)
        QUALIFY ROW_NUMBER() OVER (PARTITION BY o.opportunity_id ORDER BY lu.lead_timestamp) = 1
      `, params: { ids: batch },
    })
    for (const row of formRows) { const ctx = map.get(row.opportunity_id); if (ctx) ctx.form_body = row.form_body }

    // OHQ content
    const [ohqRows] = await bq.query({
      query: `
        SELECT o.opportunity_id, e.body_preview AS ohq_content
        FROM \`pttr-taskdata.ds_crm.opportunities\` o
        JOIN \`pttr-taskdata.ds_crm.raw_emails_received\` e ON LOWER(e.from_email) LIKE '%myreceptionist%'
          AND (e.body_preview LIKE CONCAT('%', o.phone, '%')
            OR REPLACE(e.body_preview, ' ', '') LIKE CONCAT('%', REPLACE(o.phone, '+61', '0'), '%'))
          AND TIMESTAMP(e.received_at) BETWEEN TIMESTAMP_SUB(o.opportunity_timestamp, INTERVAL 1800 SECOND)
            AND TIMESTAMP_ADD(o.opportunity_timestamp, INTERVAL 1800 SECOND)
        WHERE o.opportunity_id IN UNNEST(@ids)
        QUALIFY ROW_NUMBER() OVER (PARTITION BY o.opportunity_id ORDER BY e.received_at) = 1
      `, params: { ids: batch },
    })
    for (const row of ohqRows) { const ctx = map.get(row.opportunity_id); if (ctx) ctx.ohq_content = row.ohq_content }

    // Job description + notes
    const [jobRows] = await bq.query({
      query: `
        SELECT o.opportunity_id, td.description AS job_description, ln.labour_note, tn.task_notes
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
        WHERE o.opportunity_id IN UNNEST(@ids) AND o.jobnumber IS NOT NULL
      `, params: { ids: batch },
    })
    for (const row of jobRows) {
      const ctx = map.get(row.opportunity_id)
      if (ctx) { ctx.job_description = row.job_description; ctx.labour_note = row.labour_note; ctx.task_notes = row.task_notes }
    }
  }
  return map
}

// ─── STEP 3: AI CLASSIFICATION ─────────────────────────────────────────────

function buildPrompt(ctx: LeadContext): string {
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
  if (ctx.form_body) {
    parts.push(`\nFORM SUBMISSION:`)
    parts.push(ctx.form_body.length > 2000 ? ctx.form_body.slice(0, 2000) + '...[truncated]' : ctx.form_body)
  }
  if (ctx.ohq_content) {
    parts.push(`\nANSWERING SERVICE (OfficeHQ):`)
    parts.push(ctx.ohq_content.length > 1500 ? ctx.ohq_content.slice(0, 1500) + '...[truncated]' : ctx.ohq_content)
  }
  if (ctx.job_description) {
    parts.push(`\nJOB DESCRIPTION:`)
    parts.push(ctx.job_description.length > 1500 ? ctx.job_description.slice(0, 1500) + '...[truncated]' : ctx.job_description)
  }
  if (ctx.labour_note) { parts.push(`\nTECH LABOUR NOTE:`); parts.push(ctx.labour_note.slice(0, 1000)) }
  if (ctx.task_notes) { parts.push(`\nTASK NOTES (latest):`); parts.push(ctx.task_notes.slice(0, 1000)) }
  return parts.join('\n')
}

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
4. If there is NO content (no transcript, no form, no notes, no OHQ) to make a qualitative judgment, set abstained=true.

CONFIDENCE CALIBRATION — this is critical:
- 0.9+ ONLY when: unambiguous content, single clear signal, no conflicting info. Example: transcript clearly says "we don't service that area" → Outside Service Area 0.95.
- 0.7-0.89: content supports the verdict but minor ambiguity exists (e.g. short call, partial transcript, caller intent partially unclear).
- 0.5-0.69: thin content, multiple plausible verdicts, judgment call.
- <0.5: very thin content, guessing more than classifying. Consider abstaining.
- If you have ONLY objective facts (answered, duration) but NO content → max 0.6 confidence.
- If content is rich and unambiguous → 0.9+. Rich but some ambiguity → 0.75-0.85.

TASK 2 — TASK VALUE: Extract the COLLECTED/PAID dollar amount (ex-GST) from notes.
- Take the COLLECTED/PAID amount, NOT quotes. "quoted $2485+gst ... collected $705+gst" → 705.
- If both a labour "$X+gst" AND "INV $Y incl GST" appear, they are usually the SAME job from different sources. Take ONLY the labour-note collected amount (the keyword-anchored one: collected/paid/banked). Do NOT sum them.
- "$X+gst" or "$X plus gst" = already ex-GST, use as-is. "incl GST" = divide by 1.1.
- Handle space-broken: "$13 84" = $1384. Minimum $50.
- null if no dollar amount mentioned.

Return ONLY this JSON:
{"sub_status":"...","confidence":0.XX,"reasoning":"one sentence","source_quote":"key phrase or null","suggest_csr_review":false,"suggest_account":false,"abstained":false,"value_amount":null,"value_confidence":0.0,"value_source_quote":null}`

async function classifyLead(openai: OpenAI, ctx: LeadContext): Promise<AIResult> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.1,
      max_tokens: 350,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(ctx) },
      ],
    })

    const raw = response.choices[0]?.message?.content?.trim() || '{}'
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
    const parsed = JSON.parse(cleaned)

    const subStatus = parsed.sub_status || 'Unknown'
    const derivedStage = SUB_STATUS_TO_STAGE[subStatus] || 'Unknown'
    const subValid = subStatus in SUB_STATUS_TO_STAGE

    // Normalize value to ex-GST
    let valueAmount = parsed.value_amount != null ? Number(parsed.value_amount) : null
    if (valueAmount != null && valueAmount < 50) valueAmount = null

    return {
      sub_status: subValid ? subStatus : subStatus,
      stage: derivedStage,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      reasoning: parsed.reasoning || '',
      source_quote: parsed.source_quote || null,
      suggest_csr_review: !!parsed.suggest_csr_review,
      suggest_account: !!parsed.suggest_account,
      abstained: !!parsed.abstained,
      value_amount: valueAmount,
      value_is_ex_gst: true,
      value_confidence: typeof parsed.value_confidence === 'number' ? parsed.value_confidence : 0,
      value_source_quote: parsed.value_source_quote || null,
    }
  } catch (e) {
    return {
      sub_status: 'ERROR', stage: 'ERROR', confidence: 0,
      reasoning: `API error: ${(e as Error).message}`, source_quote: null,
      suggest_csr_review: false, suggest_account: false, abstained: true,
      value_amount: null, value_is_ex_gst: true, value_confidence: 0, value_source_quote: null,
    }
  }
}

// ─── STEP 4: COMPARE AND REPORT ────────────────────────────────────────────

interface CompareResult {
  opportunity_id: string
  human_stage: string
  human_sub: string
  ai_stage: string
  ai_sub: string
  confidence: number
  reasoning: string
  source_quote: string | null
  stage_match: boolean
  sub_match: boolean
  abstained: boolean
  has_content: boolean
  excluded_reason: string | null  // why excluded from accuracy calc
  value_amount: number | null
  value_confidence: number
  value_source_quote: string | null
}

function generateReport(results: CompareResult[]) {
  const total = results.length
  const excluded = results.filter(r => r.excluded_reason)
  const included = results.filter(r => !r.excluded_reason)
  const abstained = included.filter(r => r.abstained)
  const classified = included.filter(r => !r.abstained)

  console.log('\n' + '='.repeat(65))
  console.log('  AI CLASSIFIER VALIDATION REPORT (v2)')
  console.log('='.repeat(65) + '\n')

  console.log(`GROUND TRUTH:`)
  console.log(`  Total human-classified:     ${total}`)
  console.log(`  Excluded (BQ funnel stage): ${excluded.filter(r => r.excluded_reason === 'bq_funnel_stage').length}`)
  console.log(`  Excluded (account):         ${excluded.filter(r => r.excluded_reason === 'account').length}`)
  console.log(`  Valid for comparison:        ${included.length}`)
  console.log(`  AI classified:              ${classified.length}`)
  console.log(`  AI abstained:               ${abstained.length}`)

  if (classified.length === 0) { console.log('\nNo classified leads to compare.'); return }

  // Sub-status accuracy (primary metric)
  const subMatch = classified.filter(r => r.sub_match).length
  const stageMatch = classified.filter(r => r.stage_match).length
  console.log(`\nACCURACY (n=${classified.length}):`)
  console.log(`  Sub-status match: ${subMatch}/${classified.length} (${(subMatch / classified.length * 100).toFixed(1)}%)`)
  console.log(`  Stage match:      ${stageMatch}/${classified.length} (${(stageMatch / classified.length * 100).toFixed(1)}%)`)

  // Per derived-stage accuracy
  console.log(`\nPER-STAGE ACCURACY (human stage):`)
  const stages = [...new Set(classified.map(r => r.human_stage))].sort()
  for (const stage of stages) {
    const inStage = classified.filter(r => r.human_stage === stage)
    const correct = inStage.filter(r => r.stage_match).length
    const subCorrect = inStage.filter(r => r.sub_match).length
    console.log(`  ${stage.padEnd(20)} n=${String(inStage.length).padStart(4)}  stage=${(correct / inStage.length * 100).toFixed(0).padStart(3)}%  sub=${(subCorrect / inStage.length * 100).toFixed(0).padStart(3)}%`)
  }

  // Calibration
  console.log(`\nCALIBRATION (confidence vs actual sub-status accuracy):`)
  const buckets = [
    { label: '< 0.50', min: 0, max: 0.5 },
    { label: '0.50-0.69', min: 0.5, max: 0.7 },
    { label: '0.70-0.79', min: 0.7, max: 0.8 },
    { label: '0.80-0.89', min: 0.8, max: 0.9 },
    { label: '0.90-1.00', min: 0.9, max: 1.01 },
  ]
  for (const b of buckets) {
    const inBucket = classified.filter(r => r.confidence >= b.min && r.confidence < b.max)
    if (inBucket.length === 0) { console.log(`  ${b.label.padEnd(10)}: (none)`); continue }
    const subAcc = inBucket.filter(r => r.sub_match).length / inBucket.length
    const stgAcc = inBucket.filter(r => r.stage_match).length / inBucket.length
    console.log(`  ${b.label.padEnd(10)}: n=${String(inBucket.length).padStart(4)}  sub_acc=${(subAcc * 100).toFixed(0).padStart(3)}%  stage_acc=${(stgAcc * 100).toFixed(0).padStart(3)}%`)
  }

  // Disagreements
  const disagreements = classified.filter(r => !r.sub_match)
    .sort((a, b) => b.confidence - a.confidence)
  console.log(`\nDISAGREEMENTS: ${disagreements.length}/${classified.length} (${(disagreements.length / classified.length * 100).toFixed(1)}%)`)

  // Flag where AI is arguably more correct
  const aiArgBetter: CompareResult[] = []
  for (const d of disagreements) {
    // Cases where human said Spam but AI said something more specific
    if (d.human_sub === 'Spam' && ['Not Job Related', 'Customer Inquiry Only', 'Outside Service Area', 'Service Not Provided'].includes(d.ai_sub)) {
      aiArgBetter.push(d)
    }
  }
  if (aiArgBetter.length > 0) {
    console.log(`\n  AI ARGUABLY MORE CORRECT (${aiArgBetter.length}):`)
    for (const d of aiArgBetter.slice(0, 10)) {
      console.log(`    ${d.opportunity_id}: Human="${d.human_sub}" AI="${d.ai_sub}" (${d.confidence.toFixed(2)})`)
      if (d.source_quote) console.log(`      "${d.source_quote.slice(0, 80)}"`)
    }
  }

  console.log(`\nTOP 15 HIGH-CONFIDENCE DISAGREEMENTS:`)
  for (const d of disagreements.filter(d => !aiArgBetter.includes(d)).slice(0, 15)) {
    console.log(`  ${d.opportunity_id}`)
    console.log(`    Human: ${d.human_stage} / ${d.human_sub}`)
    console.log(`    AI:    ${d.ai_stage} / ${d.ai_sub} (conf=${d.confidence.toFixed(2)})`)
    console.log(`    Why:   ${d.reasoning}`)
    if (d.source_quote) console.log(`    Quote: "${d.source_quote.slice(0, 100)}"`)
    console.log()
  }

  // Confusion matrix (stage level)
  console.log(`STAGE CONFUSION MATRIX (rows=human, cols=AI):`)
  const allStages = [...new Set([...classified.map(r => r.human_stage), ...classified.map(r => r.ai_stage)])].sort()
  const header = ''.padEnd(16) + allStages.map(s => s.slice(0, 12).padStart(13)).join('')
  console.log(`  ${header}`)
  for (const human of allStages) {
    const row = allStages.map(ai => {
      const count = classified.filter(r => r.human_stage === human && r.ai_stage === ai).length
      return String(count).padStart(13)
    }).join('')
    console.log(`  ${human.padEnd(16)}${row}`)
  }
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('Reading ground truth from Firestore...')
  const groundTruth = await readGroundTruth()
  console.log(`  Found ${groundTruth.length} human-classified leads`)

  const oppIds = groundTruth.map(g => g.opportunity_id)

  console.log('Assembling content from BigQuery...')
  const content = await assembleContent(oppIds)
  console.log(`  Content assembled for ${content.size} leads`)

  const validLeads = groundTruth.filter(g => content.has(g.opportunity_id))
  console.log(`  ${validLeads.length} leads with BQ data (${groundTruth.length - validLeads.length} missing)`)

  const withAnyContent = validLeads.filter(g => {
    const c = content.get(g.opportunity_id)!
    return c.transcript || c.form_body || c.ohq_content || c.job_description || c.labour_note
  })
  console.log(`  ${withAnyContent.length} with any content`)

  // Init OpenAI
  const apiKey = getSecret('openai-api-key')
  const openai = new OpenAI({ apiKey })
  console.log('\nRunning AI classification...')

  const results: CompareResult[] = []
  const CONCURRENCY = 5
  let processed = 0

  for (let i = 0; i < validLeads.length; i += CONCURRENCY) {
    const batch = validLeads.slice(i, i + CONCURRENCY)
    const promises = batch.map(async (gt) => {
      const ctx = content.get(gt.opportunity_id)!
      const ai = await classifyLead(openai, ctx)
      processed++
      if (processed % 50 === 0) console.log(`  ${processed}/${validLeads.length}...`)

      // Determine if this lead should be excluded from accuracy comparison
      let excludedReason: string | null = null
      if (BQ_FUNNEL_STAGES.has(gt.stage)) excludedReason = 'bq_funnel_stage'
      else if (gt.is_account) excludedReason = 'account'

      // Derive human stage from human sub_status (for consistent comparison)
      const humanDerivedStage = SUB_STATUS_TO_STAGE[gt.sub_status] || gt.stage

      return {
        opportunity_id: gt.opportunity_id,
        human_stage: humanDerivedStage,
        human_sub: gt.sub_status,
        ai_stage: ai.stage,
        ai_sub: ai.sub_status,
        confidence: ai.confidence,
        reasoning: ai.reasoning,
        source_quote: ai.source_quote,
        stage_match: humanDerivedStage === ai.stage,
        sub_match: gt.sub_status === ai.sub_status,
        abstained: ai.abstained,
        has_content: !!(ctx.transcript || ctx.form_body || ctx.ohq_content || ctx.job_description || ctx.labour_note),
        excluded_reason: excludedReason,
        value_amount: ai.value_amount,
        value_confidence: ai.value_confidence,
        value_source_quote: ai.value_source_quote,
      }
    })
    results.push(...await Promise.all(promises))
  }

  // Disposition report
  generateReport(results)

  // ─── TASK VALUE VALIDATION ──────────────────────────────────────────────
  console.log('\n' + '='.repeat(65))
  console.log('  TASK VALUE EXTRACTION VALIDATION (v2)')
  console.log('='.repeat(65) + '\n')

  const [invoicedRows] = await bq.query({
    query: `
      SELECT o.opportunity_id, o.jobnumber,
        COALESCE(ji.invoiced_total_ex, 0) AS invoiced_ex,
        le.revenue_source, le.estimated_sales
      FROM \`pttr-taskdata.ds_crm.opportunities\` o
      JOIN \`pttr-taskdata.ds_aroflo.tasks_complete\` tc ON CAST(o.jobnumber AS STRING) = tc.jobnumber
      LEFT JOIN \`pttr-taskdata.ds_aroflo.vw_job_invoiced\` ji ON tc.jobnumber = ji.jobnumber
      JOIN \`pttr-taskdata.ds_crm.vw_lead_enriched\` le ON o.opportunity_id = le.opportunity_id
      WHERE tc.customer_type = 'COD'
        AND COALESCE(ji.invoiced_total_ex, 0) > 0
        AND le.created_at_sydney >= '2025-12-01'
    `,
  })
  const invoicedMap = new Map<string, { invoiced_ex: number; revenue_source: string; regex_estimate: number | null }>()
  for (const row of invoicedRows) {
    invoicedMap.set(row.opportunity_id, {
      invoiced_ex: row.invoiced_ex, revenue_source: row.revenue_source,
      regex_estimate: row.estimated_sales,
    })
  }

  interface ValueCompare {
    opportunity_id: string; invoiced_ex: number
    ai_amount: number | null; ai_confidence: number; ai_quote: string | null
    regex_estimate: number | null; regex_source: string | null
    ai_pct_error: number | null; regex_pct_error: number | null
  }

  const valueResults: ValueCompare[] = []

  // Collect from already-classified results
  for (const r of results) {
    const inv = invoicedMap.get(r.opportunity_id)
    if (!inv) continue
    const aiPctErr = r.value_amount != null ? Math.abs(r.value_amount - inv.invoiced_ex) / inv.invoiced_ex : null
    const regexPctErr = inv.regex_estimate != null ? Math.abs(inv.regex_estimate - inv.invoiced_ex) / inv.invoiced_ex : null
    valueResults.push({
      opportunity_id: r.opportunity_id, invoiced_ex: inv.invoiced_ex,
      ai_amount: r.value_amount, ai_confidence: r.value_confidence, ai_quote: r.value_source_quote,
      regex_estimate: inv.regex_estimate, regex_source: inv.revenue_source,
      ai_pct_error: aiPctErr, regex_pct_error: regexPctErr,
    })
  }

  // Classify additional invoiced jobs not in the disposition set
  const alreadyClassified = new Set(results.map(r => r.opportunity_id))
  const extraJobIds = invoicedRows
    .filter((r: { opportunity_id: string }) => !alreadyClassified.has(r.opportunity_id))
    .map((r: { opportunity_id: string }) => r.opportunity_id)

  if (extraJobIds.length > 0) {
    console.log(`Assembling content for ${extraJobIds.length} additional invoiced jobs...`)
    const extraContent = await assembleContent(extraJobIds)
    for (const [k, v] of extraContent) content.set(k, v)

    const extraToClassify = extraJobIds.filter((id: string) => content.has(id))
    console.log(`Running AI value extraction for ${extraToClassify.length} additional jobs...`)
    let extraProcessed = 0
    for (let i = 0; i < extraToClassify.length; i += CONCURRENCY) {
      const batch = extraToClassify.slice(i, i + CONCURRENCY)
      const promises = batch.map(async (oppId: string) => {
        const ctx = content.get(oppId)!
        const ai = await classifyLead(openai, ctx)
        extraProcessed++
        if (extraProcessed % 50 === 0) console.log(`  ${extraProcessed}/${extraToClassify.length}...`)
        return { opportunity_id: oppId, ai }
      })
      const batchResults = await Promise.all(promises)
      for (const { opportunity_id, ai } of batchResults) {
        const inv = invoicedMap.get(opportunity_id)!
        const aiPctErr = ai.value_amount != null ? Math.abs(ai.value_amount - inv.invoiced_ex) / inv.invoiced_ex : null
        const regexPctErr = inv.regex_estimate != null ? Math.abs(inv.regex_estimate - inv.invoiced_ex) / inv.invoiced_ex : null
        valueResults.push({
          opportunity_id, invoiced_ex: inv.invoiced_ex,
          ai_amount: ai.value_amount, ai_confidence: ai.value_confidence, ai_quote: ai.value_source_quote,
          regex_estimate: inv.regex_estimate, regex_source: inv.revenue_source,
          ai_pct_error: aiPctErr, regex_pct_error: regexPctErr,
        })
      }
    }
  }

  // Value report
  const withAiVal = valueResults.filter(v => v.ai_amount != null)
  const withRegex = valueResults.filter(v => v.regex_estimate != null)
  const bothHave = valueResults.filter(v => v.ai_amount != null && v.regex_estimate != null)

  function pctWithin(items: ValueCompare[], field: 'ai_pct_error' | 'regex_pct_error', threshold: number): string {
    const valid = items.filter(v => v[field] != null)
    if (valid.length === 0) return 'n/a'
    const within = valid.filter(v => v[field]! <= threshold).length
    return `${within}/${valid.length} (${(within / valid.length * 100).toFixed(1)}%)`
  }

  console.log(`COVERAGE:`)
  console.log(`  Total invoiced COD jobs: ${valueResults.length}`)
  console.log(`  AI extracted a value:    ${withAiVal.length} (${(withAiVal.length / valueResults.length * 100).toFixed(1)}%)`)
  console.log(`  Regex extracted a value: ${withRegex.length} (${(withRegex.length / valueResults.length * 100).toFixed(1)}%)`)

  console.log(`\nAI ACCURACY vs invoiced_ex:`)
  console.log(`  Within 1%:  ${pctWithin(withAiVal, 'ai_pct_error', 0.01)}`)
  console.log(`  Within 5%:  ${pctWithin(withAiVal, 'ai_pct_error', 0.05)}`)
  console.log(`  Within 10%: ${pctWithin(withAiVal, 'ai_pct_error', 0.10)}`)

  console.log(`\nREGEX BASELINE vs invoiced_ex:`)
  console.log(`  Within 1%:  ${pctWithin(withRegex, 'regex_pct_error', 0.01)}`)
  console.log(`  Within 5%:  ${pctWithin(withRegex, 'regex_pct_error', 0.05)}`)
  console.log(`  Within 10%: ${pctWithin(withRegex, 'regex_pct_error', 0.10)}`)

  if (bothHave.length > 0) {
    console.log(`\nHEAD-TO-HEAD (${bothHave.length} jobs with both):`)
    console.log(`  AI within 1%:    ${pctWithin(bothHave, 'ai_pct_error', 0.01)}`)
    console.log(`  Regex within 1%: ${pctWithin(bothHave, 'regex_pct_error', 0.01)}`)
  }

  console.log(`\nVALUE CALIBRATION:`)
  const valBuckets = [
    { label: '< 0.70', min: 0, max: 0.7 },
    { label: '0.70-0.89', min: 0.7, max: 0.9 },
    { label: '0.90-1.00', min: 0.9, max: 1.01 },
  ]
  for (const b of valBuckets) {
    const inBucket = withAiVal.filter(v => v.ai_confidence >= b.min && v.ai_confidence < b.max)
    if (inBucket.length === 0) { console.log(`  ${b.label.padEnd(10)}: (none)`); continue }
    const w1 = inBucket.filter(v => v.ai_pct_error! <= 0.01).length
    console.log(`  ${b.label.padEnd(10)}: n=${String(inBucket.length).padStart(4)}  within_1%=${(w1 / inBucket.length * 100).toFixed(0)}%`)
  }

  const worstMisses = withAiVal.filter(v => v.ai_pct_error! > 0.1)
    .sort((a, b) => b.ai_pct_error! - a.ai_pct_error!).slice(0, 10)
  if (worstMisses.length > 0) {
    console.log(`\nWORST AI VALUE MISSES (>10% error):`)
    for (const m of worstMisses) {
      console.log(`  ${m.opportunity_id}: invoiced=$${m.invoiced_ex} AI=$${m.ai_amount} (${(m.ai_pct_error! * 100).toFixed(1)}% err) conf=${m.ai_confidence.toFixed(2)}`)
      if (m.ai_quote) console.log(`    "${m.ai_quote.slice(0, 120)}"`)
    }
  }

  // Save
  const outPath = 'scripts/ai-classify-results-v2.json'
  fs.writeFileSync(outPath, JSON.stringify({ disposition: results, value: valueResults }, null, 2))
  console.log(`\nFull results saved to ${outPath}`)
}

main().catch(console.error)
