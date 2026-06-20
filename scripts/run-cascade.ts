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
 * AI SEAM: Steps 5 and 7 are the AI seam. In CC-mode (current),
 *   the function assembles the input and outputs it for CC to reason
 *   over in conversation. The function does NOT call any AI API.
 *
 * Usage:
 *   npx tsx scripts/run-cascade.ts [--scope all|30d|90d] [--skip-sync]
 *     [--step N]  (run from step N, skip earlier steps)
 *     [--dry-run] (readout only, no writes)
 */

import { BigQuery } from '@google-cloud/bigquery'
import * as fs from 'fs'
import * as path from 'path'
import { SUB_STATUS_TO_STAGE, assertValidLeaf } from '../src/lib/classifier/taxonomy'
import { validateT72Rationale, validateT71Rationale } from '../src/lib/cascade/rationale'
import type { T72Rationale, T71Rationale } from '../src/lib/cascade/rationale'

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
              days_lead_to_job, needs_audit, review_recommended, t7_confidence, t7_evidence
            ) VALUES (
              S.opportunity_id, TRUE, 'auto:t7_match', CURRENT_TIMESTAMP(), S.jobnumber,
              NULLIF(S.matched_phone, ''), '${job.client_name.replace(/'/g, "\\'")}', 'auto:t7_match',
              ${job.invoiced}, ${opp.days}, TRUE, TRUE, ${m.confidence},
              '${(m.evidence || '').replace(/'/g, "\\'")}'
            )
            WHEN MATCHED THEN UPDATE SET
              opportunity_id = S.opportunity_id,
              t7_confidence = ${m.confidence},
              t7_evidence = '${(m.evidence || '').replace(/'/g, "\\'")}',
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
              wc_lead_id, created_at
            ) VALUES (
              '${opp.opportunity_id}', S.jobnumber, ${opp.phone ? `'${opp.phone}'` : 'NULL'},
              '${job.customer_type}', '${job.client_name.replace(/'/g, "\\'")}',
              'auto:t7_match', ${m.confidence},
              '${(m.evidence || '').replace(/'/g, "\\'")}',
              '${(m.corroboration || '').replace(/'/g, "\\'")}',
              TRUE, TRUE, ${job.invoiced}, ${opp.days},
              S.wc_lead_id, CURRENT_TIMESTAMP()
            )
            WHEN MATCHED THEN UPDATE SET
              opportunity_id = '${opp.opportunity_id}',
              t7_confidence = ${m.confidence},
              t7_evidence = '${(m.evidence || '').replace(/'/g, "\\'")}',
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
async function step7_classify(prePasses: PrePassResult[]): Promise<string> {
  console.log('STEP 7: T7.2 CLASSIFY — assembling input...')

  // Get the judgement population AFTER re-build
  const judgementLeads = await runQuery<{
    opportunity_id: string
    wc_lead_id: number
    gate_stage: string
    has_outbound: boolean
    contact_name: string | null
    channel: string
    service: string
    suburb: string | null
    full_timeline: string
    total_content_chars: number
  }>(`
    SELECT o.opportunity_id, o.wc_lead_id, g.gate_stage,
      COALESCE(ob.has_outbound, FALSE) AS has_outbound,
      le.contact_name, le.channel, le.service, le.suburb,
      lt_agg.full_timeline, lt_agg.total_content_chars
    FROM \`${DS}.opportunities\` o
    JOIN \`${DS}.lead_gate\` g ON o.opportunity_id = g.opportunity_id
    LEFT JOIN (
      SELECT opportunity_id,
        MAX(CASE WHEN interaction_type IN ('Outbound Call', 'Outbound Email') THEN 1 ELSE 0 END) = 1 AS has_outbound
      FROM \`${DS}.lead_timeline\` GROUP BY opportunity_id
    ) ob ON o.opportunity_id = ob.opportunity_id
    LEFT JOIN (SELECT DISTINCT opportunity_id, contact_name, channel, service, suburb
      FROM \`${DS}.vw_lead_enriched\`) le ON o.opportunity_id = le.opportunity_id
    LEFT JOIN (
      SELECT opportunity_id,
        STRING_AGG(
          CONCAT('[', CAST(interaction_datetime AS STRING), '] ',
            COALESCE(interaction_type, 'Unknown'),
            CASE WHEN full_content IS NOT NULL AND full_content != ''
              THEN CONCAT('\\n', full_content) ELSE ' (no content)' END),
          '\\n---\\n' ORDER BY interaction_datetime
        ) AS full_timeline,
        SUM(LENGTH(COALESCE(full_content, ''))) AS total_content_chars
      FROM \`${DS}.lead_timeline\` GROUP BY opportunity_id
    ) lt_agg ON o.opportunity_id = lt_agg.opportunity_id
    WHERE g.gate_stage IN ('judgement:NQ/NB', 'judgement:Booked:completed_zero')
    ORDER BY o.opportunity_id
  `)

  console.log(`STEP 7: T7.2 CLASSIFY — ${judgementLeads.length} leads need classification`)
  console.log(`  NQ/NB: ${judgementLeads.filter(l => l.gate_stage === 'judgement:NQ/NB').length}`)
  console.log(`  Booked:completed_zero: ${judgementLeads.filter(l => l.gate_stage === 'judgement:Booked:completed_zero').length}`)

  // Write the AI input
  const outPath = path.join(__dirname, '..', 'docs', 't7_classify_ai_input.json')
  fs.writeFileSync(outPath, JSON.stringify(judgementLeads, null, 2))

  console.log(`  AI SEAM: CC reads ${outPath}, classifies per NQ_NB/BOOKED prompts,`)
  console.log(`  writes verdicts to docs/t7_classify_ai_output.json`)
  console.log(`  Then re-invoke with --step 8 to continue.`)

  return outPath
}

// ─── STEP 8: WRITE CLASSIFICATIONS (STAGING) ────────────────────────
async function step8_writeClassifications(): Promise<void> {
  console.log('STEP 8: WRITE CLASSIFICATIONS — reading verdicts...')

  const verdictsPath = path.join(__dirname, '..', 'docs', 't7_classify_ai_output.json')
  if (!fs.existsSync(verdictsPath)) {
    console.log('  No verdicts file found at', verdictsPath)
    return
  }

  const verdicts = JSON.parse(fs.readFileSync(verdictsPath, 'utf-8'))
  console.log(`  ${verdicts.length} classifications to write to staging`)

  // Write to BQ staging table (NOT Firestore crm_lead_overrides)
  await runScript(`
    CREATE TABLE IF NOT EXISTS \`${DS}.crm_auto_classifications\` (
      opportunity_id STRING,
      wc_lead_id INT64,
      gate_stage STRING,
      sub_status STRING,
      stage STRING,
      confidence FLOAT64,
      reasoning STRING,
      source_quote STRING,
      rationale STRING,
      jobnumber STRING,
      run_id STRING,
      has_outbound BOOL,
      has_internal_touch BOOL,
      is_auto BOOL DEFAULT TRUE,
      action STRING DEFAULT 'proposed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
    )
  `)

  // Validate every verdict: sub_status against taxonomy + rationale shape.
  // If T7.2 emitted an off-taxonomy string or malformed rationale, HALT.
  // Whitelist action='system_miss' (orphan flag) — not a sub_status.
  for (const v of verdicts) {
    if (v.action === 'system_miss') {
      // Orphan rows: validate T7.1 rationale shape if present
      if (v.rationale) {
        try {
          validateT71Rationale(typeof v.rationale === 'string' ? JSON.parse(v.rationale) : v.rationale)
        } catch (e) {
          throw new Error(
            `HALT: T7.1 rationale validation failed for ${v.opportunity_id}: ${(e as Error).message}`
          )
        }
      }
      continue
    }
    // T7.2: validate sub_status
    try {
      assertValidLeaf(v.sub_status)
    } catch (e) {
      throw new Error(
        `HALT: T7.2 emitted off-taxonomy sub_status "${v.sub_status}" ` +
        `for opportunity ${v.opportunity_id}. Fix the classifier or add ` +
        `the leaf to taxonomy.ts. Error: ${(e as Error).message}`
      )
    }
    // T7.2: validate rationale shape
    if (!v.rationale) {
      throw new Error(
        `HALT: T7.2 verdict for ${v.opportunity_id} is missing rationale. ` +
        `Every classification must have a structured rationale.`
      )
    }
    try {
      const parsed = typeof v.rationale === 'string' ? JSON.parse(v.rationale) : v.rationale
      const validated = validateT72Rationale(parsed)
      // Cross-check: rationale.chosen must match verdict.sub_status
      if (validated.chosen !== v.sub_status) {
        throw new Error(
          `HALT: rationale.chosen "${validated.chosen}" does not match verdict.sub_status "${v.sub_status}"`
        )
      }
    } catch (e) {
      throw new Error(
        `HALT: T7.2 rationale validation failed for ${v.opportunity_id}: ${(e as Error).message}`
      )
    }
  }

  // Build VALUES from verdicts — rationale written ATOMICALLY with the staging row
  if (verdicts.length > 0) {
    const esc = (s: string | null | undefined) => s ? s.replace(/'/g, "\\'").replace(/\n/g, '\\n') : ''
    const values = verdicts.map((v: any) => {
      const stage = v.gate_stage?.includes('Booked') ? 'Booked' :
        (SUB_STATUS_TO_STAGE[v.sub_status] || 'Not Booked')
      const rationaleStr = typeof v.rationale === 'object' ? JSON.stringify(v.rationale) : (v.rationale || '')
      return `('${v.opportunity_id}', ${v.wc_lead_id || 'NULL'}, '${v.gate_stage}', '${esc(v.sub_status)}', '${stage}', ${v.confidence || 0}, '${esc(v.reasoning)}', ${v.source_quote ? `'${esc(v.source_quote)}'` : 'NULL'}, '${esc(rationaleStr)}', ${v.jobnumber ? `'${v.jobnumber}'` : 'NULL'}, ${v.run_id ? `'${v.run_id}'` : 'NULL'}, ${v.has_outbound ?? 'NULL'}, ${v.has_internal_touch ?? 'NULL'}, TRUE, '${v.action || 'proposed'}', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`
    }).join(',\n      ')

    await runScript(`
      MERGE \`${DS}.crm_auto_classifications\` T
      USING (SELECT * FROM UNNEST([${values}]) AS v) S
      ON T.opportunity_id = S.opportunity_id
      WHEN MATCHED THEN UPDATE SET
        sub_status = S.sub_status, stage = S.stage,
        confidence = S.confidence, reasoning = S.reasoning,
        source_quote = S.source_quote, rationale = S.rationale,
        jobnumber = S.jobnumber, run_id = S.run_id,
        has_outbound = S.has_outbound, has_internal_touch = S.has_internal_touch,
        action = S.action, updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT ROW
    `)
    console.log(`  Written ${verdicts.length} classifications to crm_auto_classifications (staging)`)
  }
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
  const scope = args.find(a => a.startsWith('--scope'))?.split('=')[1] || '100d'
  const skipSync = args.includes('--skip-sync')
  const startStep = parseInt(args.find(a => a.startsWith('--step'))?.split('=')[1] || '0')
  const dryRun = args.includes('--dry-run')

  console.log(`\n${'='.repeat(60)}`)
  console.log(`CASCADE RUN — scope=${scope}, start=step${startStep}, dryRun=${dryRun}`)
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

    // Step 4: pre-passes (read-only queries)
    let prePasses: PrePassResult[] = []
    if (startStep <= 4) prePasses = await step4_prePasses(scope)

    // Step 5: T7.1 match (AI SEAM — pauses for CC)
    if (startStep <= 5) {
      const matchResult = await step5_t7Match(scope)
      if (matchResult.candidates.length > 0) {
        console.log('\n  *** AI SEAM: T7.1 match input ready. ***')
        console.log('  CC evaluates, writes verdicts, re-invoke with --step=6')
        console.log('  Or if no signal leads to evaluate, create empty [] verdict file.\n')
        return  // pause for AI
      }
      console.log('  No signal leads — skipping to T7.2')
    }

    // Step 6: write matches + re-build
    if (startStep <= 6) await step6_writeMatches()

    // Step 7: T7.2 classify (AI SEAM — pauses for CC)
    if (startStep <= 7) {
      const classifyInput = await step7_classify(prePasses)
      console.log('\n  *** AI SEAM: T7.2 classify input ready. ***')
      console.log('  CC evaluates, writes verdicts, re-invoke with --step=8\n')
      return  // pause for AI
    }

    // Step 8: write classifications (staging only)
    if (startStep <= 8) await step8_writeClassifications()

    // Step 9: readout
    if (startStep <= 9) await step9_readout(scope)

    // Snapshot for reprocessing
    await writeSnapshot()

    console.log('\n  CASCADE COMPLETE.\n')

  } catch (err) {
    console.error('CASCADE FAILED:', err)
    process.exit(1)
  }
}

main()
