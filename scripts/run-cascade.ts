/**
 * End-to-end match + classify cascade.
 * Per END_TO_END_FUNCTION.md v2 — runs Steps 0-9 in order.
 *
 * Steps 0-3: calls the orchestrator (sync + build_opportunities +
 *   build_lead_timeline + lead_gate). These are the existing deployed
 *   BQ scripts, run via the Cloud Function or directly.
 *
 * Steps 4-9: pre-passes, T7.1 match, write matches, re-build,
 *   T7.2 classify, write classifications, readout.
 *
 * HOW THE CASCADE RUNS (classification flow):
 *
 *   DEFAULT (end-to-end with OpenAI GPT-4.1):
 *     npx tsx scripts/run-cascade.ts --skip-sync
 *   Steps 0-9: rebuild spine, match, classify (OpenAI inline), write, readout.
 *
 *   MANUAL (--halt-at-seam):
 *     npx tsx scripts/run-cascade.ts --halt-at-seam --step=7
 *   Halts at AI seams for manual classification. Resume with --step=6 or --step=8.
 *
 * Reconciliation (comparing cascade output vs dashboard CSV) is a SEPARATE
 * script: npx tsx scripts/run-reconciliation.ts
 *
 * Usage:
 *   npx tsx scripts/run-cascade.ts [--scope all|30d|90d] [--skip-sync]
 *     [--population P]  (L2 scope: live_post_dec2025|historical_pre_dec2025)
 *     [--mode M]        (L2 mode: full|deterministic)
 *     [--step N]        (run from step N, skip earlier steps)
 *     [--run-id ID]     (required for --step=8 when using --halt-at-seam)
 *     [--dry-run]       (readout only, no writes)
 *     [--halt-at-seam]  (pause at AI seams instead of running OpenAI inline)
 */

import { BigQuery } from '@google-cloud/bigquery'
import * as fs from 'fs'
import * as path from 'path'
import {
  SUB_STATUS_TO_STAGE, assertValidLeaf,
  BOOKED_ALLOWED, NQ_NB_ALLOWED,
} from '../src/lib/classifier/taxonomy'
import {
  BOOKED_SYSTEM_PROMPT, NQ_NB_SYSTEM_PROMPT,
  MATCH_SYSTEM_PROMPT,
  NQ_NB_ALLOWED_NO_OUTBOUND,
} from '../src/lib/classifier/t7-classifier'
import { validateT72Rationale, validateT71Rationale } from '../src/lib/cascade/rationale'
import type { T72Rationale, T71Rationale } from '../src/lib/cascade/rationale'
import {
  callOpenAI,
  getTokenUsage, resetTokenUsage,
  T72_RATIONALE_JSON_SCHEMA,
  T71_MATCH_JSON_SCHEMA,
} from '../src/lib/ai/openai-client'
import {
  buildT72SystemPrompt, buildT72UserMessage,
  buildT71UserMessage,
} from '../src/lib/ai/prompts'
import { resolveRunConfig, scopeWhereClause, logRunStart } from '../src/lib/cascade/run-config'
import type { Scope, Mode, RunConfig } from '../src/lib/cascade/run-config'

// ─── CONFIG ──────────────────────────────────────────────────────────
const PROJECT_ID = 'pttr-taskdata'
const DS = 'pttr-taskdata.ds_crm'
const LOCATION = 'US'

const bigquery = new BigQuery({ projectId: PROJECT_ID })

async function runQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const [rows] = await bigquery.query({ query: sql, location: LOCATION })
  return rows as T[]
}

async function runScript(sql: string): Promise<void> {
  const [job] = await bigquery.createQueryJob({ query: sql, location: LOCATION })
  await job.getQueryResults()
}

// ─── STEP 0: SYNC (calls orchestrator or skips) ─────────────────────
async function step0_sync(skipSync: boolean): Promise<void> {
  if (skipSync) {
    console.log('STEP 0: SYNC — skipped (--skip-sync)')
    return
  }
  console.log('STEP 0: SYNC — triggering orchestrator...')
  console.log('  NOTE: sync runs via the Cloud Function. If you need')
  console.log('  fresh data, trigger the orchestrator separately.')
  console.log('  Proceeding with current data.')
}

// ─── STEP 1: BUILD OPPORTUNITIES ────────────────────────────────────
async function step1_buildOpportunities(): Promise<void> {
  console.log('STEP 1: BUILD_OPPORTUNITIES — running...')
  const sqlPath = path.join(__dirname, '..', 'bigquery', 'build_opportunities.sql')
  const sql = fs.readFileSync(sqlPath, 'utf-8')
  await runScript(sql)
  console.log('STEP 1: BUILD_OPPORTUNITIES — done')
}

// ─── STEP 2: BUILD LEAD TIMELINE ────────────────────────────────────
async function step2_buildLeadTimeline(): Promise<void> {
  console.log('STEP 2: BUILD_LEAD_TIMELINE — running...')
  const sqlPath = path.join(__dirname, '..', 'bigquery', 'build_lead_timeline.sql')
  const sql = fs.readFileSync(sqlPath, 'utf-8')
  await runScript(sql)
  console.log('STEP 2: BUILD_LEAD_TIMELINE — done')
}

// ─── STEP 3: LEAD GATE ──────────────────────────────────────────────
async function step3_leadGate(): Promise<void> {
  console.log('STEP 3: LEAD_GATE — running...')
  await runScript(`
    CREATE OR REPLACE TABLE \`${DS}.lead_gate\` AS
    SELECT DISTINCT opportunity_id, gate_stage
    FROM \`${DS}.lead_timeline\`
    WHERE gate_stage IS NOT NULL
    UNION ALL
    SELECT o.opportunity_id,
      CASE
        WHEN inv.invoiced_total_ex IS NOT NULL THEN 'determined:Completed and Invoiced'
        WHEN act.jobnumber IS NOT NULL AND inv.invoiced_total_ex IS NULL THEN 'determined:account_billing_review'
        WHEN js.job_status = 'Archived' THEN 'determined:Booking Cancelled'
        WHEN js.job_status = 'Open' THEN 'determined:Job Pending'
        WHEN js.job_status = 'Completed' THEN 'judgement:Booked:completed_zero'
        ELSE 'judgement:Booked'
      END AS gate_stage
    FROM \`${DS}.opportunities\` o
    LEFT JOIN \`pttr-taskdata.ds_aroflo.vw_job_invoiced\` inv ON CAST(o.jobnumber AS STRING) = inv.jobnumber AND inv.invoiced_total_ex > 0
    LEFT JOIN (SELECT DISTINCT CAST(jobnumber AS STRING) AS jobnumber FROM \`pttr-taskdata.ds_aroflo.tasks_complete\` WHERE job_status = 'Archived' AND customer_type = 'Account') act ON CAST(o.jobnumber AS STRING) = act.jobnumber
    LEFT JOIN (SELECT CAST(jobnumber AS STRING) AS jobnumber, job_status FROM \`pttr-taskdata.ds_aroflo.tasks_complete\`) js ON CAST(o.jobnumber AS STRING) = js.jobnumber
    WHERE o.opportunity_id NOT IN (SELECT DISTINCT opportunity_id FROM \`${DS}.lead_timeline\`)
  `)
  console.log('STEP 3: LEAD_GATE — done')
}

// ─── STEP 3.5: WRITE DETERMINED CLASSIFICATIONS ───────────────────
// Gate-determined leads (C&I, BC, JP, Unanswered, Dropped, UTC, ABR)
// are written to crm_auto_classifications so every lead has a row in
// one table. action='determined', confidence=1.0, no rationale needed.

const DETERMINED_GATE_MAP: Record<string, { sub_status: string; stage: string; reasoning: string }> = {
  'determined:Completed and Invoiced': {
    sub_status: 'Completed and Invoiced',
    stage: 'Booked',
    reasoning: 'Determined: invoiced_total_ex > 0',
  },
  'determined:account_billing_review': {
    sub_status: 'Account Billing Review',
    stage: 'Booked',
    reasoning: 'Determined: Archived + $0 + Account terms',
  },
  'determined:Booking Cancelled': {
    sub_status: 'Booking Cancelled',
    stage: 'Booked',
    reasoning: 'Determined: job_status=Archived + $0 invoiced',
  },
  'determined:Job Pending': {
    sub_status: 'Job Pending',
    stage: 'Booked',
    reasoning: 'Determined: job_status=Open + $0 invoiced',
  },
  'determined:Not Captured / Unanswered Call': {
    sub_status: 'Unanswered Call',
    stage: 'Not Captured',
    reasoning: 'Determined: no live human connection (CDR)',
  },
  'determined:Not Captured / Dropped Call': {
    sub_status: 'Dropped Call',
    stage: 'Not Captured',
    reasoning: 'Determined: reception failure, no substantive exchange',
  },
  'determined:Unable to Classify': {
    sub_status: 'Unable to Classify',
    stage: 'Unable to Classify',
    reasoning: 'Determined: touch exists but zero readable content',
  },
}

async function step3_5_writeDetermined(scope: string, runId: string, runLabel: string): Promise<number> {
  console.log('STEP 3.5: WRITE DETERMINED — gate-determined leads to crm_auto_classifications...')

  const dateFilter = scope === 'all' ? '' :
    `AND DATE(o.opportunity_timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${scope === '30d' ? 30 : scope === '90d' ? 90 : 100} DAY)`

  const rows = await runQuery<{ opportunity_id: string; wc_lead_id: number; gate_stage: string; wc_leads_json: string }>(`
    SELECT o.opportunity_id, o.wc_lead_id, g.gate_stage,
      TO_JSON_STRING(o.wc_leads) AS wc_leads_json
    FROM \`${DS}.opportunities\` o
    JOIN \`${DS}.lead_gate\` g ON o.opportunity_id = g.opportunity_id
    WHERE g.gate_stage LIKE 'determined:%'
      ${dateFilter}
  `)

  if (rows.length === 0) {
    console.log('  No determined leads found')
    return 0
  }

  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
  const CHUNK = 50
  let written = 0

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const values = chunk.map(r => {
      const mapping = DETERMINED_GATE_MAP[r.gate_stage]
      if (!mapping) return null
      return `STRUCT<opportunity_id STRING, wc_lead_id INT64, wc_leads_json STRING, gate_stage STRING, sub_status STRING, stage STRING, confidence FLOAT64, reasoning STRING, source_quote STRING, rationale STRING, jobnumber STRING, run_id STRING, run_label STRING, has_outbound BOOL, has_internal_touch BOOL, is_auto BOOL, action STRING, created_at TIMESTAMP, updated_at TIMESTAMP>(
        '${r.opportunity_id}', ${r.wc_lead_id || 'NULL'}, '${esc(r.wc_leads_json || '[]')}', '${r.gate_stage}', '${esc(mapping.sub_status)}', '${mapping.stage}', 1.0, '${esc(mapping.reasoning)}', CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), '${runId}', '${esc(runLabel)}', CAST(NULL AS BOOL), CAST(NULL AS BOOL), TRUE, 'determined', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`
    }).filter(Boolean).join(',\n        ')

    if (!values) continue

    await runScript(`
      MERGE \`${DS}.crm_auto_classifications\` T
      USING (SELECT * FROM UNNEST([${values}])) S
      ON T.opportunity_id = S.opportunity_id
        AND COALESCE(T.run_id, '') = COALESCE(S.run_id, '')
      WHEN MATCHED THEN UPDATE SET
        sub_status = S.sub_status, stage = S.stage,
        confidence = S.confidence, reasoning = S.reasoning,
        wc_leads_json = S.wc_leads_json, run_label = S.run_label,
        action = S.action, updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT (opportunity_id, wc_lead_id, wc_leads_json, gate_stage, sub_status, stage, confidence, reasoning, source_quote, rationale, jobnumber, run_id, run_label, has_outbound, has_internal_touch, is_auto, action, created_at, updated_at)
        VALUES (S.opportunity_id, S.wc_lead_id, S.wc_leads_json, S.gate_stage, S.sub_status, S.stage, S.confidence, S.reasoning, S.source_quote, S.rationale, S.jobnumber, S.run_id, S.run_label, S.has_outbound, S.has_internal_touch, S.is_auto, S.action, S.created_at, S.updated_at)
    `)
    written += chunk.length
  }

  console.log(`  Written ${written} determined classifications (action='determined')`)
  return written
}

// ─── STEP 4: PRE-PASSES ────────────────────────────────────────────
interface PrePassResult {
  opportunity_id: string
  gate_stage: string
  has_outbound: boolean
  has_internal_touch: boolean
}

async function step4_prePasses(scope: string): Promise<PrePassResult[]> {
  console.log('STEP 4: PRE-PASSES — computing has_outbound + has_internal_touch...')

  const dateFilter = scope === 'all' ? '' :
    `AND DATE(o.opportunity_timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${scope === '30d' ? 30 : scope === '90d' ? 90 : 100} DAY)`

  const rows = await runQuery<PrePassResult>(`
    SELECT o.opportunity_id, g.gate_stage,
      MAX(CASE WHEN lt.interaction_type IN ('Outbound Call', 'Outbound Email') THEN 1 ELSE 0 END) = 1 AS has_outbound,
      MAX(CASE WHEN lt.is_internal_did = TRUE THEN 1 ELSE 0 END) = 1 AS has_internal_touch
    FROM \`${DS}.opportunities\` o
    JOIN \`${DS}.lead_gate\` g ON o.opportunity_id = g.opportunity_id
    LEFT JOIN \`${DS}.lead_timeline\` lt ON o.opportunity_id = lt.opportunity_id
    WHERE g.gate_stage IN ('judgement:NQ/NB', 'judgement:Booked:completed_zero')
      ${dateFilter}
    GROUP BY o.opportunity_id, g.gate_stage
  `)

  const determined = await runQuery<{ gate_stage: string; cnt: number }>(`
    SELECT gate_stage, COUNT(*) AS cnt
    FROM \`${DS}.lead_gate\` g
    JOIN \`${DS}.opportunities\` o ON g.opportunity_id = o.opportunity_id
    WHERE g.gate_stage LIKE 'determined:%'
      ${dateFilter}
    GROUP BY gate_stage
  `)

  console.log(`STEP 4: PRE-PASSES — ${rows.length} judgement leads need AI`)
  console.log(`  Determined (no AI):`)
  for (const d of determined) {
    console.log(`    ${d.cnt} ${d.gate_stage}`)
  }
  console.log(`  Payment regex: DISABLED (known false-Invoice-Pending bug)`)
  console.log(`  All Booked:completed_zero → T7.2 AI judgement`)

  return rows
}

// ─── STEP 5: T7.1 MATCH (AI SEAM) ──────────────────────────────────
interface T7MatchCandidate {
  opportunity_id: string
  wc_lead_id: number
  contact_name: string | null
  lead_content: string | null
  jobnumber: string
  client_name: string
  customer_type: string
  job_description: string
  days_fwd: number
  candidate_rank: number
  phone_match: boolean
  email_match: boolean
  name_match: boolean
  content_match: boolean
  suburb_match: boolean
}

async function step5_t7Match(scope: string): Promise<{
  eligible: number
  candidates: T7MatchCandidate[]
  needsAI: string  // path to the assembled input file for CC
}> {
  console.log('STEP 5: T7.1 MATCH — generating candidates...')

  // Run candidate gen SQL
  const sqlPath = path.join(__dirname, '..', 'bigquery', 't7_match_candidates.sql')
  const sql = fs.readFileSync(sqlPath, 'utf-8')

  // The candidate SQL uses CREATE TEMP TABLE — run as a script
  // and capture the final SELECT output
  // For now, materialise to a run table
  const runTable = `${DS}.t7_match_run_current`
  const insertSql = sql.replace(
    /^SELECT\n  c\.opportunity_id,/m,
    `INSERT INTO \`${runTable}\`\nSELECT\n  c.opportunity_id,`
  )

  // Create the run table first
  await runScript(`
    CREATE OR REPLACE TABLE \`${runTable}\` (
      opportunity_id STRING, jobnumber STRING, client_name STRING,
      customer_type STRING, job_suburb STRING, job_task_type STRING,
      job_status STRING, job_date DATE, days_fwd INT64, invoiced_ex FLOAT64,
      job_description STRING, trade_bucket STRING, candidate_rank INT64,
      phone_match BOOL, email_match BOOL, name_match BOOL,
      content_match BOOL, suburb_match BOOL
    )
  `)

  // Run candidate gen with INSERT
  await runScript(insertSql)

  // Count eligible leads and signal leads
  const [stats] = await runQuery<{
    total_leads: number
    leads_with_signal: number
    total_candidates: number
  }>(`
    SELECT
      COUNT(DISTINCT opportunity_id) AS total_leads,
      COUNT(DISTINCT CASE WHEN phone_match OR email_match OR name_match
        OR content_match OR suburb_match THEN opportunity_id END) AS leads_with_signal,
      COUNT(*) AS total_candidates
    FROM \`${runTable}\`
  `)

  console.log(`STEP 5: T7.1 MATCH — ${stats.total_leads} eligible leads, ${stats.leads_with_signal} with signals, ${stats.total_candidates} candidates`)

  // Get signal leads with their candidates for CC evaluation
  const candidates = await runQuery<T7MatchCandidate>(`
    SELECT r.opportunity_id, o.wc_lead_id,
      le.contact_name,
      SUBSTR(lt.full_content, 1, 500) AS lead_content,
      r.jobnumber, r.client_name, r.customer_type,
      r.job_description, r.days_fwd, r.candidate_rank,
      r.phone_match, r.email_match, r.name_match,
      r.content_match, r.suburb_match
    FROM \`${runTable}\` r
    JOIN \`${DS}.opportunities\` o ON r.opportunity_id = o.opportunity_id
    LEFT JOIN (SELECT DISTINCT opportunity_id, contact_name FROM \`${DS}.vw_lead_enriched\`) le
      ON r.opportunity_id = le.opportunity_id
    LEFT JOIN (
      SELECT opportunity_id, full_content,
        ROW_NUMBER() OVER (PARTITION BY opportunity_id ORDER BY LENGTH(COALESCE(full_content,'')) DESC) AS rn
      FROM \`${DS}.lead_timeline\` WHERE full_content IS NOT NULL
    ) lt ON r.opportunity_id = lt.opportunity_id AND lt.rn = 1
    WHERE r.phone_match OR r.email_match OR r.name_match OR r.content_match OR r.suburb_match
    ORDER BY r.opportunity_id, r.candidate_rank
  `)

  // Write the AI input to a file for CC to evaluate
  const outPath = path.join(__dirname, '..', 'docs', 't7_match_ai_input.json')
  fs.writeFileSync(outPath, JSON.stringify(candidates, null, 2))

  console.log(`STEP 5: T7.1 MATCH — ${candidates.length} signal-candidate pairs written to ${outPath}`)
  console.log(`  AI SEAM: CC reads ${outPath}, evaluates per MATCH_SYSTEM_PROMPT,`)
  console.log(`  writes verdicts to docs/t7_match_ai_output.json`)
  console.log(`  Then re-invoke with --step 6 to continue.`)

  return { eligible: stats.total_leads, candidates, needsAI: outPath }
}

// ─── STEP 6: WRITE MATCHES + RE-BUILD ──────────────────────────────
async function step6_writeMatches(): Promise<void> {
  console.log('STEP 6: WRITE MATCHES — reading verdicts...')

  const verdictsPath = path.join(__dirname, '..', 'docs', 't7_match_ai_output.json')
  if (!fs.existsSync(verdictsPath)) {
    console.log('  No verdicts file found at', verdictsPath)
    console.log('  If T7.1 had no matches, create an empty array: []')
    console.log('  Skipping to re-build.')
  } else {
    const verdicts = JSON.parse(fs.readFileSync(verdictsPath, 'utf-8'))
    const matches = verdicts.filter((v: any) => !v.abstain && v.confidence >= 0.8)

    if (matches.length > 0) {
      console.log(`  ${matches.length} matches to write`)

      for (const m of matches) {
        console.log(`  MATCH: wc_lead_id=${m.wc_lead_id} → JN ${m.jobnumber} (conf ${m.confidence})`)

        // Resolve: is this an Account or COD job?
        const [job] = await runQuery<{ customer_type: string; client_name: string; invoiced: number }>(`
          SELECT tc.customer_type, tc.client_name,
            COALESCE(inv.invoiced_total_ex, 0) AS invoiced
          FROM \`pttr-taskdata.ds_aroflo.tasks_complete\` tc
          LEFT JOIN \`pttr-taskdata.ds_aroflo.vw_job_invoiced\` inv ON tc.jobnumber = inv.jobnumber
          WHERE tc.jobnumber = '${m.jobnumber}'
        `)

        if (!job) {
          console.log(`    WARNING: JN ${m.jobnumber} not found in AroFlo — skipping`)
          continue
        }

        // Get the opportunity for this lead
        const [opp] = await runQuery<{ opportunity_id: string; phone: string | null; days: number }>(`
          SELECT o.opportunity_id, o.phone,
            DATE_DIFF(tc.requested_date_parsed, DATE(o.opportunity_timestamp), DAY) AS days
          FROM \`${DS}.opportunities\` o
          JOIN \`pttr-taskdata.ds_aroflo.tasks_complete\` tc ON tc.jobnumber = '${m.jobnumber}'
          WHERE o.wc_lead_id = ${m.wc_lead_id}
        `)

        if (!opp) {
          console.log(`    WARNING: no opportunity for wc_lead_id ${m.wc_lead_id} — skipping`)
          continue
        }

        const rationaleStr = (m.rationale || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')

        if (job.customer_type === 'Account') {
          // Account match → crm_account_exclusions
          await runScript(`
            MERGE \`${DS}.crm_account_exclusions\` T
            USING (SELECT '${opp.opportunity_id}' AS opportunity_id,
              '${opp.phone || ''}' AS matched_phone,
              '${m.jobnumber}' AS jobnumber) S
            ON COALESCE(T.matched_phone, '') = COALESCE(S.matched_phone, '')
              AND T.jobnumber = S.jobnumber
            WHEN NOT MATCHED THEN INSERT (
              opportunity_id, is_account, provenance, synced_at, jobnumber,
              matched_phone, account_client, match_tier, invoiced_ex,
              days_lead_to_job, needs_audit, review_recommended, t7_confidence, t7_evidence, rationale
            ) VALUES (
              S.opportunity_id, TRUE, 'auto:t7_match', CURRENT_TIMESTAMP(), S.jobnumber,
              NULLIF(S.matched_phone, ''), '${job.client_name.replace(/'/g, "\\'")}', 'auto:t7_match',
              ${job.invoiced}, ${opp.days}, TRUE, TRUE, ${m.confidence},
              '${(m.evidence || '').replace(/'/g, "\\'")}',
              '${rationaleStr}'
            )
            WHEN MATCHED THEN UPDATE SET
              opportunity_id = S.opportunity_id,
              t7_confidence = ${m.confidence},
              t7_evidence = '${(m.evidence || '').replace(/'/g, "\\'")}',
              rationale = '${rationaleStr}',
              review_recommended = TRUE,
              synced_at = CURRENT_TIMESTAMP()
          `)
          console.log(`    → crm_account_exclusions (Account, ${job.client_name})`)
        } else {
          // COD match → crm_t7_match_queue
          await runScript(`
            MERGE \`${DS}.crm_t7_match_queue\` T
            USING (SELECT ${m.wc_lead_id} AS wc_lead_id,
              '${m.jobnumber}' AS jobnumber) S
            ON T.wc_lead_id = S.wc_lead_id AND T.jobnumber = S.jobnumber
            WHEN NOT MATCHED THEN INSERT (
              opportunity_id, jobnumber, matched_phone, customer_type, client_name,
              match_tier, t7_confidence, t7_evidence, t7_corroboration,
              needs_audit, review_recommended, invoiced_ex, days_lead_to_job,
              wc_lead_id, created_at, rationale
            ) VALUES (
              '${opp.opportunity_id}', S.jobnumber, ${opp.phone ? `'${opp.phone}'` : 'NULL'},
              '${job.customer_type}', '${job.client_name.replace(/'/g, "\\'")}',
              'auto:t7_match', ${m.confidence},
              '${(m.evidence || '').replace(/'/g, "\\'")}',
              '${(m.corroboration || '').replace(/'/g, "\\'")}',
              TRUE, TRUE, ${job.invoiced}, ${opp.days},
              S.wc_lead_id, CURRENT_TIMESTAMP(),
              '${rationaleStr}'
            )
            WHEN MATCHED THEN UPDATE SET
              opportunity_id = '${opp.opportunity_id}',
              t7_confidence = ${m.confidence},
              t7_evidence = '${(m.evidence || '').replace(/'/g, "\\'")}',
              rationale = '${rationaleStr}',
              review_recommended = TRUE
          `)
          console.log(`    → crm_t7_match_queue (COD, ${job.client_name})`)
        }
      }

      console.log(`  ${matches.length} matches written`)
    } else {
      console.log('  No matches above confidence threshold.')
    }
  }

  // RE-BUILD: Steps 1-3 again so gate sees new JNs
  console.log('STEP 6: RE-BUILD — rebuilding opportunities + timeline + gate...')
  await step1_buildOpportunities()
  await step2_buildLeadTimeline()
  await step3_leadGate()
  console.log('STEP 6: RE-BUILD — done')
}

// ─── STEP 7: T7.2 CLASSIFY (AI SEAM) ───────────────────────────────
// T7.2 prompt model only. No keyword/SQL/regex/BQ shortcut. If volume
// requires batching, batch it (S15.1a). Do not invent an alternate classifier.
//
// Materialises the judgement-residual population to a BQ table
// (ds_crm.t7_classify_input) for sub-batch querying by the classifier.
// No JSON file handoff.
async function step7_classify(prePasses: PrePassResult[], config?: RunConfig): Promise<void> {
  console.log('STEP 7: T7.2 CLASSIFY — materialising input to BQ...')

  // Materialise the judgement population AFTER re-build.
  // Pre-pass facts: has_outbound (CU/NFUR gate), has_internal_touch (NJR gate).
  // Job-side content: folded into full_timeline as labelled rows (option (a) — same
  //   narrative shape the validated 89.1% model reads, no prompt template change).
  // Population scoping via scopeWhereClause (era boundary).
  const populationWhere = config ? scopeWhereClause(config.scope, DS) : 'TRUE'
  await runScript(`
    CREATE OR REPLACE TABLE \`${DS}.t7_classify_input\` AS
    SELECT o.opportunity_id, o.wc_lead_id, g.gate_stage,
      COALESCE(ob.has_outbound, FALSE) AS has_outbound,
      COALESCE(ob.has_internal, FALSE) AS has_internal_touch,
      le.contact_name, le.channel, le.service, le.suburb,
      lt_agg.full_timeline, lt_agg.total_content_chars
    FROM \`${DS}.opportunities\` o
    JOIN \`${DS}.lead_gate\` g ON o.opportunity_id = g.opportunity_id
    LEFT JOIN (
      SELECT opportunity_id,
        MAX(CASE WHEN interaction_type IN ('Outbound Call', 'Outbound Email') THEN 1 ELSE 0 END) = 1 AS has_outbound,
        MAX(CASE WHEN is_internal_did = TRUE THEN 1 ELSE 0 END) = 1 AS has_internal
      FROM \`${DS}.lead_timeline\` GROUP BY opportunity_id
    ) ob ON o.opportunity_id = ob.opportunity_id
    LEFT JOIN (SELECT DISTINCT opportunity_id, contact_name, channel, service, suburb
      FROM \`${DS}.vw_lead_enriched\`) le ON o.opportunity_id = le.opportunity_id
    LEFT JOIN (
      SELECT opportunity_id,
        CONCAT(
          STRING_AGG(
            CONCAT('[', CAST(interaction_datetime AS STRING), '] ',
              COALESCE(interaction_type, 'Unknown'),
              COALESCE(CONCAT(' | ', interaction_operator), ''),
              CASE WHEN interaction_duration_seconds IS NOT NULL
                THEN CONCAT(' | ', CAST(CAST(interaction_duration_seconds/60 AS INT64) AS STRING), 'm',
                     CAST(MOD(CAST(interaction_duration_seconds AS INT64), 60) AS STRING), 's') ELSE '' END,
              CASE WHEN full_content IS NOT NULL AND full_content != ''
                THEN CONCAT('\\n', full_content) ELSE ' (no content)' END),
            '\\n---\\n' ORDER BY interaction_datetime
          ),
          CASE WHEN MAX(task_description) IS NOT NULL AND MAX(task_description) != ''
            THEN CONCAT('\\n---\\nJOB DESCRIPTION:\\n', MAX(task_description)) ELSE '' END,
          CASE WHEN MAX(labour_notes) IS NOT NULL AND MAX(labour_notes) != ''
            THEN CONCAT('\\n---\\nTECH LABOUR NOTE:\\n', MAX(labour_notes)) ELSE '' END,
          CASE WHEN MAX(task_notes) IS NOT NULL AND MAX(task_notes) != ''
            THEN CONCAT('\\n---\\nTASK NOTES:\\n', MAX(task_notes)) ELSE '' END
        ) AS full_timeline,
        SUM(LENGTH(COALESCE(full_content, '')))
          + LENGTH(COALESCE(MAX(task_description), ''))
          + LENGTH(COALESCE(MAX(labour_notes), ''))
          + LENGTH(COALESCE(MAX(task_notes), ''))
          AS total_content_chars
      FROM \`${DS}.lead_timeline\` GROUP BY opportunity_id
    ) lt_agg ON o.opportunity_id = lt_agg.opportunity_id
    WHERE g.gate_stage IN ('judgement:NQ/NB', 'judgement:Booked:completed_zero')
      AND o.opportunity_id NOT IN (
        SELECT ac.opportunity_id FROM \`${DS}.crm_auto_classifications\` ac
        WHERE ac.action = 'system_miss'
      )
      AND ${populationWhere}
    ORDER BY o.opportunity_id
  `)

  // Query the materialised table for counts
  const counts = await runQuery<{ gate_stage: string; cnt: number }>(`
    SELECT gate_stage, COUNT(*) AS cnt
    FROM \`${DS}.t7_classify_input\`
    GROUP BY gate_stage
  `)
  const total = counts.reduce((s, r) => s + Number(r.cnt), 0)
  const nqNb = Number(counts.find(r => r.gate_stage === 'judgement:NQ/NB')?.cnt || 0)
  const booked = Number(counts.find(r => r.gate_stage === 'judgement:Booked:completed_zero')?.cnt || 0)

  console.log(`STEP 7 complete. Input materialised to ds_crm.t7_classify_input`)
  console.log(`  (${total} leads: ${nqNb} NQ/NB + ${booked} Booked:completed_zero).`)
  console.log(`  Next: classify sub-batches by querying t7_classify_input directly,`)
  console.log(`  then run --step=8 --run-id=<run_id>.`)
}

// ─── §2: classifyLead — THE ENGINE ──────────────────────────────────
//
// This function IS the T7.2 classification engine.
// Engine: OpenAI GPT-4.1 (gpt-4.1).
// Decision: replaces CC-as-classifier per explicit owner decision (2026-06-21).
//
// THE ENGINE SEAT IS NOT SWAPPABLE WITHOUT EXPLICIT DECISION.
// If a future change wants to replace GPT-4.1 with a different engine,
// that requires:
//   1. A validation run proving the new engine matches quality.
//   2. A decision-log entry documenting the change and validation.
//   3. A code change that names the new engine explicitly here.
// Today the engine is OpenAI GPT-4.1. The code says so plainly.
//
// EXPLICITLY FORBIDDEN at this step (S15.1a):
//   - Python/script/regex/keyword pattern matching to produce classifications
//   - SQL CASE WHEN producing leaf strings
//   - Bulk classification of multiple leads from a single inference
//   - Heuristic "shortcuts" for "obvious" leads (Spam, Wrong Number, etc.)
//   - Any abstraction layer that lets a future agent swap engines
//     without an explicit decision-log entry
// If you find yourself writing code that does any of the above, STOP.

/** The shape Step 7 materialises per lead — matches the BQ query output. */
interface LeadInput {
  opportunity_id: string
  wc_lead_id: number
  gate_stage: string               // 'judgement:NQ/NB' | 'judgement:Booked:completed_zero'
  has_outbound: boolean            // pre-pass fact from lead_timeline
  has_internal_touch: boolean      // pre-pass fact from lead_timeline
  contact_name: string | null
  channel: string
  service: string
  suburb: string | null
  full_timeline: string            // chronological touches + job-side labelled sections
  total_content_chars: number
}

/**
 * Classify a single lead. Called by the Step 7 loop, one lead at a time.
 *
 * Engine: OpenAI GPT-4.1. Sends the system prompt + timeline + pre-pass
 * facts via API, receives structured T72Rationale JSON via structured outputs.
 * Per-lead reasoning — not bulk classification, not pattern matching.
 *
 * @returns Validated T72Rationale with the classification verdict.
 * @throws On any validation failure (off-taxonomy, malformed rationale, cross-check).
 */
async function classifyLead(lead: LeadInput): Promise<T72Rationale> {
  // ── 1. Select the system prompt based on gate_stage ──────────────
  // These are the validated 89.1% prompts, imported verbatim from
  // src/lib/classifier/t7-classifier.ts. No paraphrasing.
  const isBooked = lead.gate_stage === 'judgement:Booked:completed_zero'
  const systemPrompt = isBooked ? BOOKED_SYSTEM_PROMPT : NQ_NB_SYSTEM_PROMPT

  // ── 2. Derive the allowed_set with pre-pass constraints ──────────
  // Start from the canonical set for this gate_stage, then apply
  // deterministic exclusions from pre-pass SQL facts.
  let allowedSet: readonly string[]
  if (isBooked) {
    allowedSet = BOOKED_ALLOWED
    // Booked leads have no CU/NJR pre-pass constraints
  } else {
    // NQ/NB: apply pre-pass constraints
    if (!lead.has_outbound) {
      // No trackable outbound → remove "Customer Unresponsive"
      // (can't call a customer "unresponsive" if you never visibly contacted them)
      allowedSet = NQ_NB_ALLOWED_NO_OUTBOUND
    } else {
      allowedSet = [...NQ_NB_ALLOWED]
    }
    if (!lead.has_internal_touch) {
      // No internal DID touch → remove "Not Job Related"
      // (NJR is reserved for identified internal staff communications)
      allowedSet = allowedSet.filter(s => s !== 'Not Job Related')
    }
  }

  // ── 3. Invoke the engine ─────────────────────────────────────────
  // Engine: OpenAI GPT-4.1. Per-lead reasoning via API call.
  // The system prompt + timeline + pre-pass facts are sent as separate
  // messages. Structured output guarantees the T72Rationale JSON shape.
  const cuExcluded = !isBooked && !lead.has_outbound
  const njrExcluded = !lead.has_internal_touch
  const prePassFacts = {
    has_outbound: lead.has_outbound,
    has_internal_touch: lead.has_internal_touch,
    cu_excluded: cuExcluded,
    njr_excluded: njrExcluded,
  }

  const fullSystemPrompt = buildT72SystemPrompt(systemPrompt, allowedSet, prePassFacts, isBooked ? 'Booked' : 'NQ/NB')
  const userMessage = buildT72UserMessage(lead)

  const raw = await callOpenAI<T72Rationale>(
    fullSystemPrompt,
    userMessage,
    T72_RATIONALE_JSON_SCHEMA as Record<string, unknown>,
  )

  // ── 5. Validate the returned JSON ────────────────────────────────
  const rationale = validateT72Rationale(raw)
  assertValidLeaf(rationale.chosen)

  if (!allowedSet.includes(rationale.chosen)) {
    throw new Error(
      `HALT: classifyLead chose "${rationale.chosen}" not in allowed_set ` +
      `[${allowedSet.join(', ')}] for ${lead.opportunity_id}`
    )
  }

  return rationale
}

/**
 * Validate a single verdict against the classifyLead contract.
 * Called by Step 8 for every verdict in t7_classify_staging.
 */
function validateVerdict(verdict: Record<string, unknown>, lead: LeadInput): T72Rationale {
  const isBooked = lead.gate_stage === 'judgement:Booked:completed_zero'

  // Derive the same allowed_set classifyLead would have used
  let allowedSet: readonly string[]
  if (isBooked) {
    allowedSet = BOOKED_ALLOWED
  } else {
    allowedSet = lead.has_outbound ? [...NQ_NB_ALLOWED] : [...NQ_NB_ALLOWED_NO_OUTBOUND]
    if (!lead.has_internal_touch) {
      allowedSet = allowedSet.filter(s => s !== 'Not Job Related')
    }
  }

  // Parse rationale
  const rationaleRaw = typeof verdict.rationale === 'string'
    ? JSON.parse(verdict.rationale as string)
    : verdict.rationale
  if (!rationaleRaw) {
    throw new Error(`HALT: verdict for ${lead.opportunity_id} missing rationale`)
  }

  // Shape + field presence
  const rationale = validateT72Rationale(rationaleRaw)

  // Off-taxonomy rejection
  assertValidLeaf(rationale.chosen)

  // Cross-check: rationale.chosen must match verdict.sub_status
  if (rationale.chosen !== verdict.sub_status) {
    throw new Error(
      `HALT: rationale.chosen "${rationale.chosen}" !== verdict.sub_status "${verdict.sub_status}" ` +
      `for ${lead.opportunity_id}`
    )
  }

  // Allowed-set check: chosen must be in the constrained set
  if (!allowedSet.includes(rationale.chosen)) {
    throw new Error(
      `HALT: chosen "${rationale.chosen}" not in allowed_set ` +
      `[${allowedSet.join(', ')}] for ${lead.opportunity_id}`
    )
  }

  // Booked labour-note verbatim check: the rationale must reference
  // actual content from this lead's TECH LABOUR NOTE. Extracts the
  // note from full_timeline, then checks that at least one 12+ char
  // substring appears verbatim in timeline_summary or decisive_signals.
  // Ties validation to per-lead source data, not a keyword list.
  if (isBooked && lead.full_timeline) {
    const labourMatch = lead.full_timeline.match(/TECH LABOUR NOTE:\n([\s\S]*?)(?:\n---|\n\nTASK|$)/)
    if (labourMatch) {
      const labourNote = labourMatch[1].trim()
      if (labourNote.length >= 12) {
        const searchIn = [
          rationale.timeline_summary,
          ...rationale.decisive_signals,
        ].join(' ')

        let found = false
        for (let i = 0; i <= labourNote.length - 12; i++) {
          const fragment = labourNote.substring(i, i + 12)
          if (searchIn.includes(fragment)) {
            found = true
            break
          }
        }

        if (!found) {
          throw new Error(
            `HALT: Booked lead ${lead.opportunity_id} rationale does not reference ` +
            `any verbatim content from its TECH LABOUR NOTE. Read the note and ` +
            `include specific content in timeline_summary or decisive_signals. ` +
            `Labour note starts: "${labourNote.slice(0, 80)}..."`
          )
        }
      }
    }
  }

  return rationale
}

// ─── STEP 8: WRITE CLASSIFICATIONS ──────────────────────────────────
// Reads from ds_crm.t7_classify_staging (populated by the classifier
// per sub-batch), validates every row via validateVerdict, batch-MERGEs
// to crm_auto_classifications, then deletes staging rows for the run_id.
async function step8_writeClassifications(runId: string, runLabel: string = ''): Promise<void> {
  console.log(`STEP 8: WRITE CLASSIFICATIONS — run_id=${runId}`)

  // Ensure target table exists
  await runScript(`
    CREATE TABLE IF NOT EXISTS \`${DS}.crm_auto_classifications\` (
      opportunity_id STRING,
      wc_lead_id INT64,
      wc_leads_json STRING,
      gate_stage STRING,
      sub_status STRING,
      stage STRING,
      confidence FLOAT64,
      reasoning STRING,
      source_quote STRING,
      rationale STRING,
      jobnumber STRING,
      run_id STRING,
      run_label STRING,
      has_outbound BOOL,
      has_internal_touch BOOL,
      is_auto BOOL DEFAULT TRUE,
      action STRING DEFAULT 'proposed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
    )
  `)

  // Add columns if they don't exist (migration for existing tables)
  try {
    await runScript(`ALTER TABLE \`${DS}.crm_auto_classifications\` ADD COLUMN IF NOT EXISTS wc_leads_json STRING`)
  } catch { /* already exists */ }
  try {
    await runScript(`ALTER TABLE \`${DS}.crm_auto_classifications\` ADD COLUMN IF NOT EXISTS run_label STRING`)
  } catch { /* column already exists */ }

  // Ensure staging table exists
  await runScript(`
    CREATE TABLE IF NOT EXISTS \`${DS}.t7_classify_staging\` (
      run_id STRING,
      opportunity_id STRING,
      wc_lead_id INT64,
      gate_stage STRING,
      sub_status STRING,
      confidence FLOAT64,
      rationale STRING,
      written_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
    )
  `)

  // Read staging rows for this run_id
  const verdicts = await runQuery<{
    run_id: string
    opportunity_id: string
    wc_lead_id: number
    gate_stage: string
    sub_status: string
    confidence: number
    rationale: string
  }>(`
    SELECT run_id, opportunity_id, wc_lead_id, gate_stage, sub_status,
      confidence, rationale
    FROM \`${DS}.t7_classify_staging\`
    WHERE run_id = '${runId}'
  `)

  if (verdicts.length === 0) {
    console.log(`  No staging rows found for run_id=${runId}`)
    return
  }
  console.log(`  ${verdicts.length} staging rows to validate and write`)

  // Read input leads from BQ (for validateVerdict lookup)
  const inputLeads = await runQuery<LeadInput>(`
    SELECT opportunity_id, wc_lead_id, gate_stage, has_outbound,
      has_internal_touch, contact_name, channel, service, suburb,
      full_timeline, total_content_chars
    FROM \`${DS}.t7_classify_input\`
  `)
  const leadsByOpp = new Map(inputLeads.map(l => [l.opportunity_id, l]))

  // Load wc_leads arrays from opportunities (for wc_leads_json column)
  const oppWcLeads = await runQuery<{ opportunity_id: string; wc_leads_json: string }>(`
    SELECT opportunity_id, TO_JSON_STRING(wc_leads) AS wc_leads_json
    FROM \`${DS}.opportunities\`
  `)
  const wcLeadsByOpp = new Map(oppWcLeads.map(o => [o.opportunity_id, o.wc_leads_json || '[]']))

  // Validate every verdict against the classifyLead contract.
  // Bad verdicts are flagged and skipped — good verdicts are written.
  const validVerdicts: typeof verdicts = []
  const badVerdicts: Array<{ opportunity_id: string; error: string }> = []

  for (const v of verdicts) {
    const lead = leadsByOpp.get(v.opportunity_id)
    try {
      if (lead) {
        validateVerdict(v as Record<string, unknown>, lead)
      } else {
        // Not in input table — basic validation only
        assertValidLeaf(v.sub_status)
        if (v.rationale) {
          const parsed = typeof v.rationale === 'string' ? JSON.parse(v.rationale) : v.rationale
          const validated = validateT72Rationale(parsed)
          if (validated.chosen !== v.sub_status) {
            throw new Error(`rationale.chosen "${validated.chosen}" !== sub_status "${v.sub_status}"`)
          }
        }
      }
      validVerdicts.push(v)
    } catch (e) {
      const errorMsg = (e as Error).message
      badVerdicts.push({ opportunity_id: v.opportunity_id, error: errorMsg })
      console.warn(`  BAD VERDICT: ${v.opportunity_id} — ${errorMsg}`)
    }
  }

  console.log(`  ${validVerdicts.length} passed validation, ${badVerdicts.length} bad verdicts skipped`)

  const esc = (s: string | null | undefined) => s ? s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') : ''

  // Write bad verdicts to crm_auto_classifications with action='bad_verdict'
  // so they're visible for review but not treated as classifications
  if (badVerdicts.length > 0) {
    const badValues = badVerdicts.map(b => {
      const v = verdicts.find(vv => vv.opportunity_id === b.opportunity_id)!
      const wcJson = wcLeadsByOpp.get(v.opportunity_id) || '[]'
      return `STRUCT<opportunity_id STRING, wc_lead_id INT64, wc_leads_json STRING, gate_stage STRING, sub_status STRING, stage STRING, confidence FLOAT64, reasoning STRING, source_quote STRING, rationale STRING, jobnumber STRING, run_id STRING, run_label STRING, has_outbound BOOL, has_internal_touch BOOL, is_auto BOOL, action STRING, created_at TIMESTAMP, updated_at TIMESTAMP>(
        '${v.opportunity_id}', ${v.wc_lead_id || 'NULL'}, '${esc(wcJson)}', '${v.gate_stage}', '${esc(v.sub_status)}', 'Bad Verdict', 0, '${esc(b.error)}', CAST(NULL AS STRING), '${esc(typeof v.rationale === 'object' ? JSON.stringify(v.rationale) : (v.rationale || ''))}', CAST(NULL AS STRING), '${runId}', '${esc(runLabel)}', CAST(NULL AS BOOL), CAST(NULL AS BOOL), TRUE, 'bad_verdict', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`
    }).join(',\n        ')

    await runScript(`
      MERGE \`${DS}.crm_auto_classifications\` T
      USING (SELECT * FROM UNNEST([${badValues}])) S
      ON T.opportunity_id = S.opportunity_id
        AND COALESCE(T.run_id, '') = COALESCE(S.run_id, '')
      WHEN NOT MATCHED THEN INSERT (opportunity_id, wc_lead_id, wc_leads_json, gate_stage, sub_status, stage, confidence, reasoning, source_quote, rationale, jobnumber, run_id, run_label, has_outbound, has_internal_touch, is_auto, action, created_at, updated_at)
        VALUES (S.opportunity_id, S.wc_lead_id, S.wc_leads_json, S.gate_stage, S.sub_status, S.stage, S.confidence, S.reasoning, S.source_quote, S.rationale, S.jobnumber, S.run_id, S.run_label, S.has_outbound, S.has_internal_touch, S.is_auto, S.action, S.created_at, S.updated_at)
      WHEN MATCHED THEN UPDATE SET
        sub_status = S.sub_status, stage = S.stage, confidence = S.confidence,
        reasoning = S.reasoning, rationale = S.rationale,
        wc_leads_json = S.wc_leads_json, run_label = S.run_label,
        action = S.action, updated_at = CURRENT_TIMESTAMP()
    `)
    console.log(`  ${badVerdicts.length} bad verdicts written with action='bad_verdict' for review`)
  }

  // Chunked MERGE of valid verdicts to crm_auto_classifications (50 per batch)
  const CHUNK = 50
  let written = 0
  for (let i = 0; i < validVerdicts.length; i += CHUNK) {
    const chunk = validVerdicts.slice(i, i + CHUNK)
    const values = chunk.map((v) => {
      const stage = v.gate_stage?.includes('Booked') ? 'Booked' :
        (SUB_STATUS_TO_STAGE[v.sub_status] || 'Not Booked')
      const rationaleStr = typeof v.rationale === 'object' ? JSON.stringify(v.rationale) : (v.rationale || '')
      let reasoning = ''
      let sourceQuote: string | null = null
      try {
        const parsed = typeof v.rationale === 'string' ? JSON.parse(v.rationale) : v.rationale
        reasoning = parsed?.reasoning || ''
        sourceQuote = parsed?.source_quote || null
      } catch { /* rationale already validated */ }
      const lead = leadsByOpp.get(v.opportunity_id)
      const wcJson = wcLeadsByOpp.get(v.opportunity_id) || '[]'
      return `STRUCT<opportunity_id STRING, wc_lead_id INT64, wc_leads_json STRING, gate_stage STRING, sub_status STRING, stage STRING, confidence FLOAT64, reasoning STRING, source_quote STRING, rationale STRING, jobnumber STRING, run_id STRING, run_label STRING, has_outbound BOOL, has_internal_touch BOOL, is_auto BOOL, action STRING, created_at TIMESTAMP, updated_at TIMESTAMP>(
        '${v.opportunity_id}', ${v.wc_lead_id || 'NULL'}, '${esc(wcJson)}', '${v.gate_stage}', '${esc(v.sub_status)}', '${stage}', ${v.confidence || 0}, '${esc(reasoning)}', ${sourceQuote ? `'${esc(sourceQuote)}'` : 'CAST(NULL AS STRING)'}, '${esc(rationaleStr)}', CAST(NULL AS STRING), '${runId}', '${esc(runLabel)}', ${lead?.has_outbound ?? 'CAST(NULL AS BOOL)'}, ${lead?.has_internal_touch ?? 'CAST(NULL AS BOOL)'}, TRUE, 'proposed', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`
    }).join(',\n        ')

    await runScript(`
      MERGE \`${DS}.crm_auto_classifications\` T
      USING (SELECT * FROM UNNEST([${values}])) S
      ON T.opportunity_id = S.opportunity_id
        AND COALESCE(T.run_id, '') = COALESCE(S.run_id, '')
      WHEN MATCHED THEN UPDATE SET
        sub_status = S.sub_status, stage = S.stage,
        confidence = S.confidence, reasoning = S.reasoning,
        source_quote = S.source_quote, rationale = S.rationale,
        wc_leads_json = S.wc_leads_json, run_label = S.run_label,
        jobnumber = S.jobnumber, run_id = S.run_id,
        has_outbound = S.has_outbound, has_internal_touch = S.has_internal_touch,
        action = S.action, updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT (opportunity_id, wc_lead_id, wc_leads_json, gate_stage, sub_status, stage, confidence, reasoning, source_quote, rationale, jobnumber, run_id, run_label, has_outbound, has_internal_touch, is_auto, action, created_at, updated_at)
        VALUES (S.opportunity_id, S.wc_lead_id, S.wc_leads_json, S.gate_stage, S.sub_status, S.stage, S.confidence, S.reasoning, S.source_quote, S.rationale, S.jobnumber, S.run_id, S.run_label, S.has_outbound, S.has_internal_touch, S.is_auto, S.action, S.created_at, S.updated_at)
    `)
    written += chunk.length
    console.log(`  Batch ${Math.floor(i / CHUNK) + 1}: ${written}/${validVerdicts.length} written`)
  }
  console.log(`  Written ${validVerdicts.length} classifications to crm_auto_classifications`)
  if (badVerdicts.length > 0) {
    console.log(`  ⚠ ${badVerdicts.length} bad verdicts need review (action='bad_verdict'):`)
    for (const b of badVerdicts) {
      console.log(`    ${b.opportunity_id}: ${b.error}`)
    }
  }

  // Clean up staging rows for this run_id
  await runScript(`DELETE FROM \`${DS}.t7_classify_staging\` WHERE run_id = '${runId}'`)
  console.log(`  Staging rows deleted for run_id=${runId}`)
}

// ─── OPENAI INLINE: T7.1 MATCH ─────────────────────────────────────
// Runs OpenAI GPT-4.1 per-lead for T7.1 matching.
// Sequential calls (S15.1a: no parallel classification).
// Writes verdicts to docs/t7_match_ai_output.json (same path Step 6 reads).

async function runT71MatchInline(candidates: T7MatchCandidate[]): Promise<void> {
  // Group candidates by opportunity_id (each lead gets its own API call)
  const byOpp = new Map<string, T7MatchCandidate[]>()
  for (const c of candidates) {
    const list = byOpp.get(c.opportunity_id) || []
    list.push(c)
    byOpp.set(c.opportunity_id, list)
  }

  const total = byOpp.size
  console.log(`T7.1 MATCH (OpenAI): ${total} leads to evaluate...`)
  const startTime = Date.now()

  const verdicts: Array<{
    opportunity_id: string
    wc_lead_id: number
    jobnumber: string | null
    confidence: number
    evidence: string
    corroboration: string
    abstain: boolean
    rationale: string  // JSON-serialized T71Rationale
  }> = []

  let i = 0
  for (const [oppId, leadCandidates] of byOpp) {
    i++
    const first = leadCandidates[0]
    const userMessage = buildT71UserMessage(
      oppId,
      first.lead_content,
      first.contact_name,
      leadCandidates,
    )

    try {
      const result = await callOpenAI<{
        jobnumber: string | null
        confidence: number
        evidence: string
        corroboration: string
        abstain: boolean
      }>(MATCH_SYSTEM_PROMPT, userMessage, T71_MATCH_JSON_SCHEMA as Record<string, unknown>)

      // Build full T71Rationale for persistence
      const rationale: T71Rationale = {
        lead_id: oppId,
        candidate_count: leadCandidates.length,
        candidates_considered: leadCandidates.map(c => ({
          jobnumber: c.jobnumber,
          client: c.client_name,
          days_from_lead: c.days_fwd,
          signals_matched: [
            c.phone_match ? 'phone' : '',
            c.email_match ? 'email' : '',
            c.name_match ? 'name' : '',
            c.suburb_match ? 'suburb' : '',
            c.content_match ? 'content' : '',
          ].filter(Boolean),
        })),
        chosen_jobnumber: result.jobnumber || '',
        confidence: result.confidence,
        match_signals: result.corroboration ? result.corroboration.split('+') : [],
        reasoning: result.evidence,
      }

      verdicts.push({
        opportunity_id: oppId,
        wc_lead_id: first.wc_lead_id,
        ...result,
        rationale: JSON.stringify(rationale),
      })
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      const status = result.abstain ? 'ABSTAIN' : `${result.jobnumber} @ ${result.confidence}`
      console.log(`  T7.1 MATCH: lead ${i}/${total} (${oppId}) — ${status} — ${elapsed}s`)
    } catch (err) {
      console.error(`  T7.1 MATCH: lead ${i}/${total} (${oppId}) — ERROR: ${(err as Error).message}`)
      verdicts.push({
        opportunity_id: oppId,
        wc_lead_id: first.wc_lead_id,
        jobnumber: null,
        confidence: 0,
        evidence: `OpenAI API error: ${(err as Error).message}`,
        corroboration: '',
        abstain: true,
        rationale: JSON.stringify({
          lead_id: oppId,
          candidate_count: leadCandidates.length,
          candidates_considered: [],
          chosen_jobnumber: '',
          confidence: 0,
          match_signals: [],
          reasoning: `OpenAI API error: ${(err as Error).message}`,
        }),
      })
    }
  }

  // Write verdicts to the same path Step 6 reads
  const outPath = path.join(__dirname, '..', 'docs', 't7_match_ai_output.json')
  fs.writeFileSync(outPath, JSON.stringify(verdicts, null, 2))
  console.log(`T7.1 MATCH (OpenAI): ${verdicts.length} verdicts written to ${outPath}`)
  const matches = verdicts.filter(v => !v.abstain && v.confidence >= 0.8)
  console.log(`  ${matches.length} matches, ${verdicts.length - matches.length} abstentions`)
  const t71Usage = getTokenUsage()
  console.log(`  Tokens: ${t71Usage.prompt_tokens.toLocaleString()} prompt + ${t71Usage.completion_tokens.toLocaleString()} completion = ${t71Usage.total_tokens.toLocaleString()} total (${t71Usage.api_calls} calls)`)
  resetTokenUsage()
}

// ─── OPENAI INLINE: T7.2 CLASSIFY ─────────────────────────────────
// Runs OpenAI GPT-4.1 per-lead for T7.2 classification.
// Queries t7_classify_input in batches of 50, validates each verdict,
// writes to t7_classify_staging. Returns the generated run_id.

async function runT72ClassifyInline(): Promise<string> {
  const runId = `openai_${new Date().toISOString().replace(/[:.]/g, '_')}`
  console.log(`T7.2 CLASSIFY (OpenAI): run_id=${runId}`)

  // Ensure staging table exists
  await runScript(`
    CREATE TABLE IF NOT EXISTS \`${DS}.t7_classify_staging\` (
      run_id STRING,
      opportunity_id STRING,
      wc_lead_id INT64,
      gate_stage STRING,
      sub_status STRING,
      confidence FLOAT64,
      rationale STRING,
      written_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
    )
  `)

  // Count total leads
  const [{ total }] = await runQuery<{ total: number }>(
    `SELECT COUNT(*) AS total FROM \`${DS}.t7_classify_input\``
  )
  console.log(`  ${total} leads to classify`)

  const BATCH = 50
  let classified = 0
  const startTime = Date.now()
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')

  for (let offset = 0; offset < total; offset += BATCH) {
    const leads = await runQuery<LeadInput>(`
      SELECT opportunity_id, wc_lead_id, gate_stage, has_outbound,
        has_internal_touch, contact_name, channel, service, suburb,
        full_timeline, total_content_chars
      FROM \`${DS}.t7_classify_input\`
      ORDER BY opportunity_id
      LIMIT ${BATCH} OFFSET ${offset}
    `)

    const stagingRows: string[] = []

    for (const lead of leads) {
      classified++
      const isBooked = lead.gate_stage === 'judgement:Booked:completed_zero'

      // Derive allowed_set (same logic as classifyLead)
      let allowedSet: readonly string[]
      if (isBooked) {
        allowedSet = BOOKED_ALLOWED
      } else {
        allowedSet = lead.has_outbound ? [...NQ_NB_ALLOWED] : [...NQ_NB_ALLOWED_NO_OUTBOUND]
        if (!lead.has_internal_touch) {
          allowedSet = allowedSet.filter(s => s !== 'Not Job Related')
        }
      }

      const cuExcluded = !isBooked && !lead.has_outbound
      const njrExcluded = !lead.has_internal_touch
      const prePassFacts = {
        has_outbound: lead.has_outbound,
        has_internal_touch: lead.has_internal_touch,
        cu_excluded: cuExcluded,
        njr_excluded: njrExcluded,
      }

      const basePrompt = isBooked ? BOOKED_SYSTEM_PROMPT : NQ_NB_SYSTEM_PROMPT
      const systemPrompt = buildT72SystemPrompt(basePrompt, allowedSet, prePassFacts, isBooked ? 'Booked' : 'NQ/NB')
      const userMessage = buildT72UserMessage(lead)

      let rationale: T72Rationale | null = null
      let retries = 0
      const MAX_RETRIES = 2

      while (retries <= MAX_RETRIES && !rationale) {
        try {
          const raw = await callOpenAI<T72Rationale>(
            systemPrompt,
            userMessage,
            T72_RATIONALE_JSON_SCHEMA as Record<string, unknown>,
          )

          // Validate shape
          const validated = validateT72Rationale(raw)

          // Off-taxonomy check
          assertValidLeaf(validated.chosen)

          // Allowed-set check
          if (!allowedSet.includes(validated.chosen)) {
            throw new Error(
              `chosen "${validated.chosen}" not in allowed_set [${allowedSet.join(', ')}]`
            )
          }

          // Booked labour-note verbatim check
          if (isBooked && lead.full_timeline) {
            const labourMatch = lead.full_timeline.match(/TECH LABOUR NOTE:\n([\s\S]*?)(?:\n---|\n\nTASK|$)/)
            if (labourMatch) {
              const labourNote = labourMatch[1].trim()
              if (labourNote.length >= 12) {
                const searchIn = [validated.timeline_summary, ...validated.decisive_signals].join(' ')
                let found = false
                for (let j = 0; j <= labourNote.length - 12; j++) {
                  if (searchIn.includes(labourNote.substring(j, j + 12))) {
                    found = true
                    break
                  }
                }
                if (!found) {
                  throw new Error(
                    `Booked rationale does not reference verbatim TECH LABOUR NOTE content. ` +
                    `Note starts: "${labourNote.slice(0, 80)}..."`
                  )
                }
              }
            }
          }

          rationale = validated
        } catch (err) {
          retries++
          if (retries <= MAX_RETRIES) {
            console.warn(`  T7.2: ${lead.opportunity_id} retry ${retries}/${MAX_RETRIES}: ${(err as Error).message}`)
          } else {
            console.error(`  T7.2: ${lead.opportunity_id} FAILED after ${MAX_RETRIES} retries: ${(err as Error).message}`)
            // Fallback: Unable to Classify with confidence 0 → routes to human review
            rationale = {
              lead_id: lead.opportunity_id,
              gate_stage: isBooked ? 'Booked' : 'NQ/NB',
              allowed_set: [...allowedSet],
              pre_pass: prePassFacts,
              timeline_summary: `OpenAI classification failed: ${(err as Error).message}`,
              decisive_signals: [],
              chosen: 'Unable to Classify',
              confidence: 0,
              rejected_alternatives: [],
              reasoning: `Classification failed after ${MAX_RETRIES} retries: ${(err as Error).message}`,
            }
          }
        }
      }

      if (!rationale) continue // should not happen given fallback above

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`  T7.2 CLASSIFY: lead ${classified}/${total} (${lead.opportunity_id}) — ${rationale.chosen} @ ${rationale.confidence} — ${elapsed}s`)

      const rationaleJson = JSON.stringify(rationale)
      stagingRows.push(
        `('${runId}', '${lead.opportunity_id}', ${lead.wc_lead_id}, '${lead.gate_stage}', '${esc(rationale.chosen)}', ${rationale.confidence}, '${esc(rationaleJson)}', CURRENT_TIMESTAMP())`
      )
    }

    // Batch INSERT staging rows
    if (stagingRows.length > 0) {
      await runScript(`
        INSERT INTO \`${DS}.t7_classify_staging\` (run_id, opportunity_id, wc_lead_id, gate_stage, sub_status, confidence, rationale, written_at)
        VALUES ${stagingRows.join(',\n        ')}
      `)
      console.log(`  Batch ${Math.floor(offset / BATCH) + 1}: ${stagingRows.length} rows staged`)
    }
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  const t72Usage = getTokenUsage()
  console.log(`T7.2 CLASSIFY (OpenAI): ${classified} leads classified in ${totalElapsed}s, run_id=${runId}`)
  console.log(`  Tokens: ${t72Usage.prompt_tokens.toLocaleString()} prompt + ${t72Usage.completion_tokens.toLocaleString()} completion = ${t72Usage.total_tokens.toLocaleString()} total (${t72Usage.api_calls} calls)`)
  console.log(`  Est. cost: $${((t72Usage.prompt_tokens * 2 / 1_000_000) + (t72Usage.completion_tokens * 8 / 1_000_000)).toFixed(2)} (GPT-4.1 pricing)`)

  return runId
}

// ─── STEP 9: READOUT ────────────────────────────────────────────────
async function step9_readout(scope: string): Promise<void> {
  console.log('STEP 9: READOUT — generating per-lead report...')

  const dateFilter = scope === 'all' ? '' :
    `AND DATE(o.opportunity_timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${scope === '30d' ? 30 : scope === '90d' ? 90 : 100} DAY)`

  const rows = await runQuery<Record<string, unknown>>(`
    SELECT
      o.wc_lead_id,
      o.opportunity_id,
      le.contact_name,
      le.channel,
      DATE(o.opportunity_timestamp) AS lead_date,
      -- Resolving mechanism
      CASE
        WHEN g.gate_stage LIKE 'determined:%' THEN 'determined:gate'
        WHEN ac.sub_status IS NOT NULL THEN
          CASE WHEN g.gate_stage = 'judgement:Booked:completed_zero' THEN 'T7.2:judgement'
               ELSE 'T7.2:judgement' END
        WHEN q.jobnumber IS NOT NULL THEN 'T7.1:match'
        WHEN excl.jobnumber IS NOT NULL AND excl.match_tier = 'auto:t7_match' THEN 'T7.1:match'
        ELSE 'unresolved'
      END AS resolving_mechanism,
      -- Stage + sub-status
      CASE
        WHEN g.gate_stage = 'determined:Completed and Invoiced' THEN 'Booked'
        WHEN g.gate_stage = 'determined:Booking Cancelled' THEN 'Booked'
        WHEN g.gate_stage = 'determined:Job Pending' THEN 'Booked'
        WHEN g.gate_stage = 'determined:account_billing_review' THEN 'Booked'
        WHEN g.gate_stage = 'determined:Not Captured / Unanswered Call' THEN 'Not Captured'
        WHEN g.gate_stage = 'determined:Not Captured / Dropped Call' THEN 'Not Captured'
        WHEN g.gate_stage = 'determined:Unable to Classify' THEN 'Unable to Classify'
        WHEN ac.stage IS NOT NULL THEN ac.stage
        ELSE 'Unresolved'
      END AS stage,
      CASE
        WHEN g.gate_stage = 'determined:Completed and Invoiced' THEN 'Completed and Invoiced'
        WHEN g.gate_stage = 'determined:Booking Cancelled' THEN 'Booking Cancelled'
        WHEN g.gate_stage = 'determined:Job Pending' THEN 'Job Pending'
        WHEN g.gate_stage = 'determined:account_billing_review' THEN 'Account Billing Review'
        WHEN g.gate_stage = 'determined:Not Captured / Unanswered Call' THEN 'Unanswered Call'
        WHEN g.gate_stage = 'determined:Not Captured / Dropped Call' THEN 'Dropped Call'
        WHEN g.gate_stage = 'determined:Unable to Classify' THEN 'Unable to Classify'
        WHEN ac.sub_status IS NOT NULL THEN ac.sub_status
        ELSE 'Unresolved'
      END AS sub_status,
      ac.confidence,
      CASE
        WHEN g.gate_stage LIKE 'determined:%' THEN
          CONCAT('DETERMINED: gate — ', COALESCE(o.jobnumber, 'no JN'))
        WHEN ac.reasoning IS NOT NULL THEN
          CONCAT('T7.2 judgement (conf ', CAST(COALESCE(ac.confidence, 0) AS STRING), '): ', ac.reasoning)
        ELSE NULL
      END AS path_rationale,
      -- Match detail
      COALESCE(q.jobnumber, excl.jobnumber) AS matched_jobnumber,
      -- Flags
      COALESCE(q.review_recommended, excl.review_recommended, FALSE) AS review_recommended,
      COALESCE(ac.confidence, 1.0) < 0.70 AS low_confidence,
      TRUE AS is_auto,
      -- Revenue
      le.invoiced_amount,
      le.revenue
    FROM \`${DS}.opportunities\` o
    JOIN \`${DS}.lead_gate\` g ON o.opportunity_id = g.opportunity_id
    LEFT JOIN \`${DS}.vw_lead_enriched\` le ON o.opportunity_id = le.opportunity_id
    LEFT JOIN \`${DS}.crm_auto_classifications\` ac ON o.opportunity_id = ac.opportunity_id
    LEFT JOIN \`${DS}.crm_t7_match_queue\` q ON o.opportunity_id = q.opportunity_id AND q.match_tier = 'auto:t7_match'
    LEFT JOIN \`${DS}.crm_account_exclusions\` excl ON o.opportunity_id = excl.opportunity_id AND excl.match_tier = 'auto:t7_match'
    WHERE TRUE ${dateFilter}
    ORDER BY o.opportunity_timestamp DESC
  `)

  // Write readout
  const outPath = path.join(__dirname, '..', 'docs', 'cascade_readout.json')
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2))

  // Summary stats
  const stages: Record<string, number> = {}
  const mechanisms: Record<string, number> = {}
  let lowConf = 0
  let unresolved = 0

  for (const r of rows) {
    const stage = r.stage as string
    const mech = r.resolving_mechanism as string
    stages[stage] = (stages[stage] || 0) + 1
    mechanisms[mech] = (mechanisms[mech] || 0) + 1
    if (r.low_confidence) lowConf++
    if (stage === 'Unresolved') unresolved++
  }

  console.log(`\nSTEP 9: READOUT — ${rows.length} leads`)
  console.log('\n  By stage:')
  for (const [s, c] of Object.entries(stages).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${c} ${s}`)
  }
  console.log('\n  By mechanism:')
  for (const [m, c] of Object.entries(mechanisms).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${c} ${m}`)
  }
  console.log(`\n  Low confidence (< 0.70): ${lowConf}`)
  console.log(`  Unresolved: ${unresolved}`)
  console.log(`\n  Full readout: ${outPath}`)
}

// ─── SNAPSHOT (for reprocessing) ────────────────────────────────────
async function writeSnapshot(): Promise<void> {
  console.log('SNAPSHOT — writing lead state for reprocessing...')
  await runScript(`
    CREATE OR REPLACE TABLE \`${DS}.cascade_snapshot\` AS
    SELECT
      o.wc_lead_id,
      o.phone AS matched_phone,
      o.jobnumber AS linked_jobnumber,
      tc.job_status,
      COALESCE(inv.invoiced_total_ex, 0) AS invoiced,
      (SELECT MAX(interaction_datetime) FROM \`${DS}.lead_timeline\` lt
       WHERE lt.opportunity_id = o.opportunity_id) AS latest_touch_ts,
      COALESCE(ac.sub_status,
        CASE
          WHEN g.gate_stage = 'determined:Completed and Invoiced' THEN 'Completed and Invoiced'
          WHEN g.gate_stage = 'determined:Booking Cancelled' THEN 'Booking Cancelled'
          WHEN g.gate_stage = 'determined:Job Pending' THEN 'Job Pending'
          WHEN g.gate_stage = 'determined:account_billing_review' THEN 'Account Billing Review'
          WHEN g.gate_stage = 'determined:Not Captured / Unanswered Call' THEN 'Unanswered Call'
          WHEN g.gate_stage = 'determined:Not Captured / Dropped Call' THEN 'Dropped Call'
          WHEN g.gate_stage = 'determined:Unable to Classify' THEN 'Unable to Classify'
          ELSE NULL
        END) AS sub_status,
      ac.confidence,
      CURRENT_TIMESTAMP() AS last_run_ts,
      CASE
        WHEN g.gate_stage = 'determined:Completed and Invoiced' THEN TRUE
        WHEN g.gate_stage = 'determined:Booking Cancelled' THEN TRUE
        WHEN g.gate_stage = 'determined:Unable to Classify' THEN TRUE
        WHEN g.gate_stage = 'determined:Not Captured / Unanswered Call' THEN TRUE
        WHEN g.gate_stage = 'determined:Not Captured / Dropped Call' THEN TRUE
        WHEN ac.confidence >= 0.90 AND ac.sub_status IN ('Spam', 'Wrong Number',
          'Outside Service Area', 'Service Not Provided') THEN TRUE
        ELSE FALSE
      END AS is_terminal
    FROM \`${DS}.opportunities\` o
    LEFT JOIN \`${DS}.lead_gate\` g ON o.opportunity_id = g.opportunity_id
    LEFT JOIN \`pttr-taskdata.ds_aroflo.tasks_complete\` tc ON o.jobnumber = tc.jobnumber
    LEFT JOIN \`pttr-taskdata.ds_aroflo.vw_job_invoiced\` inv ON o.jobnumber = inv.jobnumber
    LEFT JOIN \`${DS}.crm_auto_classifications\` ac ON o.opportunity_id = ac.opportunity_id
  `)
  console.log('SNAPSHOT — done')
}



// ─── MAIN ───────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  let scope = args.find(a => a.startsWith('--scope'))?.split('=')[1] || '100d'
  const population = (args.find(a => a.startsWith('--population'))?.split('=')[1] || 'live_post_dec2025') as Scope
  const mode = (args.find(a => a.startsWith('--mode'))?.split('=')[1] || 'full') as Mode
  const skipSync = args.includes('--skip-sync')
  const startStep = parseInt(args.find(a => a.startsWith('--step'))?.split('=')[1] || '0')
  const runId = args.find(a => a.startsWith('--run-id'))?.split('=')[1] || ''
  const dryRun = args.includes('--dry-run')
  const haltAtSeam = args.includes('--halt-at-seam')

  // Validate population+mode before any BQ work
  const config = resolveRunConfig(population, mode)

  // Auto-widen date window for populations that are already constrained.
  // historical_pre_dec2025: era boundary constrains, date window would exclude most leads.
  // live_post_dec2025: date window matters — 100d idempotency for production daily runs.
  if (population !== 'live_post_dec2025' && population !== 'custom') {
    scope = 'all'
  }

  const cascadeStartTime = Date.now()
  const cascadeTimestamp = new Date().toISOString().replace(/[:.]/g, '_')
  const runLabel = [
    cascadeTimestamp,
    `pop=${population}`,
    `scope=${scope}`,
    `mode=${mode}`,
    haltAtSeam ? 'halt_at_seam' : 'openai_inline',
    `steps=${startStep}-9`,
  ].join(' | ')

  console.log(`\n${'='.repeat(60)}`)
  console.log(`CASCADE RUN — population=${population}, mode=${mode}, window=${scope}, start=step${startStep}, dryRun=${dryRun}, haltAtSeam=${haltAtSeam}${runId ? `, run_id=${runId}` : ''}`)
  console.log(`run_label: ${runLabel}`)
  console.log(`${'='.repeat(60)}\n`)

  if (dryRun) {
    // DRY RUN: read-only. No rebuilds, no writes, no materialisation.
    // Only Step 4 (read-only pre-pass query) and Step 9 (readout from
    // existing state). ZERO tables written or replaced.
    console.log('DRY RUN — read-only mode. No tables will be written or replaced.\n')
    const prePasses = await step4_prePasses(scope)
    await step9_readout(scope)
    console.log('\n  DRY RUN COMPLETE (read-only).\n')
    return
  }

  try {
    // Steps 0-3: deterministic spine (rebuilds production tables)
    if (startStep <= 0) await step0_sync(skipSync)
    if (startStep <= 1) await step1_buildOpportunities()
    if (startStep <= 2) await step2_buildLeadTimeline()
    if (startStep <= 3) await step3_leadGate()

    // Population count + logRunStart (after spine is built)
    if (startStep <= 3) {
      const scopeWhere = scopeWhereClause(config.scope, DS)
      const [{ cnt }] = await runQuery<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM \`${DS}.opportunities\` o WHERE ${scopeWhere}`)
      logRunStart(config, cnt)
    }

    // Step 3.5: write gate-determined classifications
    const determinedRunId = `determined_${new Date().toISOString().replace(/[:.]/g, '_')}`
    if (startStep <= 3) await step3_5_writeDetermined(scope, determinedRunId, runLabel)

    // Step 4: pre-passes (read-only queries)
    let prePasses: PrePassResult[] = []
    if (startStep <= 4) prePasses = await step4_prePasses(scope)

    // Step 5: T7.1 match (AI SEAM — pauses for CC, or runs OpenAI inline)
    if (startStep <= 5 && config.steps.t7_match) {
      const matchResult = await step5_t7Match(scope)
      if (matchResult.candidates.length > 0) {
        if (haltAtSeam) {
          console.log('\n  *** AI SEAM: T7.1 match input ready. ***')
          console.log('  CC evaluates, writes verdicts, re-invoke with --step=6')
          console.log('  Or if no signal leads to evaluate, create empty [] verdict file.\n')
          return  // pause for AI
        }
        // Run OpenAI inline for T7.1 matching
        await runT71MatchInline(matchResult.candidates)
      } else {
        console.log('  No signal leads — skipping to T7.2')
      }
    }

    // Step 6: write matches + re-build
    if (startStep <= 6 && config.steps.t7_match) await step6_writeMatches()

    // Step 6.5: orphan detection — PULLED from automated cascade.
    // Name-matching against AroFlo free-text produces ~7:1 false positives.
    // The 6 known orphans (S16.2) are handled manually. See DECISION_LOG.md.

    // Step 7: T7.2 classify — materialise input to BQ, then exit or run OpenAI inline
    let generatedRunId = runId
    if (startStep <= 7 && config.steps.t7_classify) {
      await step7_classify(prePasses, config)
      if (haltAtSeam) {
        return  // pause for classifier (CC or Cowork) to query sub-batches
      }
      // Run OpenAI inline for T7.2 classification
      generatedRunId = await runT72ClassifyInline()
    }

    // Step 8: read staging, validate, MERGE to crm_auto_classifications
    if (startStep <= 8 && config.steps.t7_classify) {
      const effectiveRunId = generatedRunId || runId
      if (!effectiveRunId) {
        throw new Error(
          'HALT: --run-id is required for --step=8.\n' +
          'Usage: npx tsx scripts/run-cascade.ts --step=8 --run-id=<run_id>\n' +
          'The run_id must match what the classifier wrote to t7_classify_staging.'
        )
      }
      await step8_writeClassifications(effectiveRunId, runLabel)
    }

    // Step 9: readout
    if (startStep <= 9) await step9_readout(scope)

    // Snapshot for reprocessing
    await writeSnapshot()

    const cascadeElapsed = ((Date.now() - cascadeStartTime) / 1000).toFixed(1)
    const finalUsage = getTokenUsage()
    console.log(`\n  CASCADE COMPLETE in ${cascadeElapsed}s`)
    if (finalUsage.api_calls > 0) {
      console.log(`  OpenAI totals: ${finalUsage.total_tokens.toLocaleString()} tokens, ${finalUsage.api_calls} calls, ~$${((finalUsage.prompt_tokens * 2 / 1_000_000) + (finalUsage.completion_tokens * 8 / 1_000_000)).toFixed(2)}`)
    }
    console.log()

  } catch (err) {
    console.error('CASCADE FAILED:', err)
    process.exit(1)
  }
}

main()
