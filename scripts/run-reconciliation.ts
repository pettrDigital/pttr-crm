/**
 * WC Reconciliation — standalone comparison script.
 *
 * Compares existing cascade output (crm_auto_classifications + lead_gate)
 * against the dashboard's enriched_leads CSV. Read-only against cascade
 * state — does not run Steps 0-9 or call any AI.
 *
 * Workflow:
 *   1. Drop a fresh enriched_leads.csv into data/reconciliation/
 *   2. Run: npx tsx scripts/run-reconciliation.ts
 *   3. Script loads CSV to BQ, maps leads to opps, compares, outputs report
 *
 * Usage:
 *   npx tsx scripts/run-reconciliation.ts [--csv=data/reconciliation/enriched_leads.csv]
 */

import { BigQuery } from '@google-cloud/bigquery'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { reconMappedOppsCTE } from '../src/lib/cascade/wc-mapping'
import { testExclusionWhereClause } from '../src/lib/cascade/test-exclusion'
import { runFootingCheck } from '../src/lib/cascade/footing/check'
import type { ObservedCounts } from '../src/lib/cascade/footing/check'
import { SUB_STATUS_TO_STAGE } from '../src/lib/classifier/taxonomy'

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

// ─── STEP 1: LOAD CSV TO BQ ───────────────────────────────────────

async function loadCsvToBQ(csvPath: string): Promise<number> {
  console.log(`RECON: Loading ${csvPath} to ds_crm.ferg_csv_classifications...`)

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`)
  }

  // Prepare a clean CSV for BQ load (extract the columns we need)
  // Use python csv module for correct parsing (handles multi-line quoted fields)
  const tmpCsv = '/tmp/recon_csv_upload.csv'
  const rowCountOut = execSync(`python3 -c "
import csv
with open('${csvPath}', 'r') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
with open('${tmpCsv}', 'w', newline='') as out:
    writer = csv.writer(out)
    writer.writerow(['wc_lead_id', 'job_status', 'quoteable', 'spam', 'reason', 'detail', 'job_number',
                      'lead_profile', 'wc_lead_type', 'wc_lead_category', 'wc_phone', 'wc_email',
                      'wc_status', 'wc_source', 'wc_medium', 'wc_date_created', 'wc_lead_summary',
                      'after_sale_value', 'aroflo_phone', 'aroflo_email', 'aroflo_requested_date'])
    for r in rows:
        writer.writerow([
            r['lead_id'], r['after_job_status'], r['after_quoteable'],
            'Yes' if r.get('after_spam') == 'true' else 'No',
            r['after_reason_did_not_convert'], r['after_reason_did_not_convert_detail'],
            r['after_job_number'], r['lead_profile'], r['wc_lead_type'],
            r['wc_lead_category'], r['wc_phone'], r['wc_email'],
            r['wc_status'], r['wc_source'], r['wc_medium'], r['wc_date_created'],
            r['wc_lead_summary'], r['after_sale_value'],
            r['aroflo_phone'], r['aroflo_email'], r['aroflo_requested_date'],
        ])
print(len(rows))
"`, { encoding: 'utf-8' }).trim()
  const rowCount = parseInt(rowCountOut)
  console.log(`  ${rowCount} rows in CSV (parsed)`)

  // Drop and recreate table
  await runScript(`DROP TABLE IF EXISTS \`${DS}.ferg_csv_classifications\``)
  await runScript(`
    CREATE TABLE \`${DS}.ferg_csv_classifications\` (
      wc_lead_id INT64,
      job_status STRING,
      quoteable STRING,
      spam STRING,
      reason STRING,
      detail STRING,
      job_number STRING,
      lead_profile STRING,
      wc_lead_type STRING,
      wc_lead_category STRING,
      wc_phone STRING,
      wc_email STRING,
      wc_status STRING,
      wc_source STRING,
      wc_medium STRING,
      wc_date_created STRING,
      wc_lead_summary STRING,
      after_sale_value FLOAT64,
      aroflo_phone STRING,
      aroflo_email STRING,
      aroflo_requested_date STRING
    )
  `)

  // Load CSV via bq CLI
  execSync(
    `bq load --location=${LOCATION} --source_format=CSV --skip_leading_rows=1 --allow_quoted_newlines ` +
    `${PROJECT_ID}:ds_crm.ferg_csv_classifications ${tmpCsv}`,
    { stdio: 'pipe' }
  )

  // Verify row count
  const [{ cnt }] = await runQuery<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM \`${DS}.ferg_csv_classifications\``
  )
  console.log(`  Loaded ${cnt} rows to BQ`)

  if (cnt !== rowCount) {
    throw new Error(`Row count mismatch: CSV has ${rowCount}, BQ has ${cnt}`)
  }

  return cnt
}

// ─── STEP 2: MAP LEADS TO OPPORTUNITIES ────────────────────────────

interface MappedLead {
  csv_lead_id: number
  opp_id: string
  priority: number
  // Cascade fields
  gate_stage: string | null
  cascade_sub_status: string | null
  cascade_stage: string | null
  cascade_confidence: number | null
  cascade_action: string | null
  cascade_jobnumber: string | null
  cascade_invoiced: number | null
  // Dashboard fields
  dashboard_job_status: string
  dashboard_category: string | null
  dashboard_reason: string | null
  dashboard_quoteable: string
  dashboard_job_number: string | null
  dashboard_sale_value: number | null
  wc_status: string
  wc_lead_type: string | null
  lead_profile: string | null
}

async function mapAndCompare(): Promise<{
  mapped: MappedLead[]
  unmapped: Array<{ wc_lead_id: number; wc_status: string; reason: string }>
  footingCounts: ObservedCounts
}> {
  console.log('RECON: Mapping CSV leads to opportunities...')

  const excludeClause = testExclusionWhereClause('ale', DS)
  const reconCTE = reconMappedOppsCTE(DS)

  // Footing counts
  const [footingCounts] = await runQuery<ObservedCounts>(`
    WITH
    csv_leads AS (
      SELECT wc_lead_id FROM \`${DS}.ferg_csv_classifications\`
    ),
    test_excluded AS (
      SELECT f.wc_lead_id
      FROM \`${DS}.ferg_csv_classifications\` f
      LEFT JOIN \`pttr-taskdata.gd_WhatConverts.all_leads_enriched\` ale
        ON f.wc_lead_id = ale.lead_id
      WHERE ${excludeClause}
    ),
    ${reconCTE},
    mapped_leads AS (
      SELECT DISTINCT f.wc_lead_id
      FROM \`${DS}.ferg_csv_classifications\` f
      WHERE f.wc_lead_id IN (
        SELECT o.wc_lead_id FROM \`${DS}.opportunities\` o
        JOIN recon_mapped_opps r ON o.opportunity_id = r.opp_id
        WHERE o.wc_lead_id IS NOT NULL
      )
    ),
    non_excluded_unmapped AS (
      SELECT f.wc_lead_id
      FROM \`${DS}.ferg_csv_classifications\` f
      LEFT JOIN \`pttr-taskdata.gd_WhatConverts.all_leads_enriched\` ale
        ON f.wc_lead_id = ale.lead_id
      WHERE f.wc_lead_id NOT IN (SELECT wc_lead_id FROM test_excluded)
        AND f.wc_lead_id NOT IN (SELECT wc_lead_id FROM mapped_leads)
    ),
    no_identity AS (
      SELECT nu.wc_lead_id
      FROM non_excluded_unmapped nu
      LEFT JOIN \`pttr-taskdata.gd_WhatConverts.all_leads_enriched\` ale
        ON nu.wc_lead_id = ale.lead_id
      WHERE (ale.norm_phone IS NULL OR ale.norm_phone = '')
        AND (ale.norm_contact_phone IS NULL OR ale.norm_contact_phone = '')
    )
    SELECT
      (SELECT COUNT(*) FROM test_excluded) AS test_excluded,
      (SELECT COUNT(*) FROM mapped_leads) AS mapped,
      (SELECT COUNT(*) FROM no_identity) AS no_identity,
      (SELECT COUNT(*) FROM non_excluded_unmapped)
        - (SELECT COUNT(*) FROM no_identity) AS spine_gap,
      (SELECT COUNT(*) FROM csv_leads) AS total
  `)

  console.log(`  Footing: test_excluded=${footingCounts.test_excluded}, mapped=${footingCounts.mapped}, no_identity=${footingCounts.no_identity}, spine_gap=${footingCounts.spine_gap}, total=${footingCounts.total}`)

  // Get mapped leads with cascade + dashboard classifications
  // Uses 3-way join: primary wc_lead_id OR wc_leads array OR phone fallback
  const mapped = await runQuery<MappedLead>(`
    WITH ${reconCTE},
    csv_to_opp AS (
      -- P1: primary wc_lead_id
      SELECT f.wc_lead_id, o.opportunity_id AS opp_id, 1 AS priority
      FROM \`${DS}.ferg_csv_classifications\` f
      JOIN \`${DS}.opportunities\` o ON f.wc_lead_id = o.wc_lead_id
      LEFT JOIN \`pttr-taskdata.gd_WhatConverts.all_leads_enriched\` ale ON f.wc_lead_id = ale.lead_id
      WHERE NOT ${excludeClause}
      UNION ALL
      -- P2: wc_leads array membership
      SELECT f.wc_lead_id, aw.opportunity_id AS opp_id, 2 AS priority
      FROM \`${DS}.ferg_csv_classifications\` f
      JOIN (SELECT o2.opportunity_id, wl.wc_lead_id FROM \`${DS}.opportunities\` o2, UNNEST(o2.wc_leads) wl) aw
        ON f.wc_lead_id = aw.wc_lead_id
      LEFT JOIN \`pttr-taskdata.gd_WhatConverts.all_leads_enriched\` ale ON f.wc_lead_id = ale.lead_id
      WHERE NOT ${excludeClause}
      UNION ALL
      -- P3: phone fallback
      SELECT f.wc_lead_id, o.opportunity_id AS opp_id, 3 AS priority
      FROM \`${DS}.ferg_csv_classifications\` f
      JOIN \`pttr-taskdata.gd_WhatConverts.all_leads_enriched\` ale ON f.wc_lead_id = ale.lead_id
      JOIN \`${DS}.opportunities\` o ON ale.norm_phone = o.phone AND ale.norm_phone IS NOT NULL AND ale.norm_phone != ''
      WHERE NOT ${excludeClause}
    ),
    ranked AS (
      SELECT wc_lead_id, opp_id, priority,
        ROW_NUMBER() OVER (PARTITION BY wc_lead_id ORDER BY priority, opp_id) AS rn
      FROM csv_to_opp
    ),
    best_match AS (
      SELECT wc_lead_id, opp_id, priority FROM ranked WHERE rn = 1
    )
    SELECT
      bm.wc_lead_id AS csv_lead_id,
      bm.opp_id,
      bm.priority,
      -- Cascade fields
      g.gate_stage,
      ac.sub_status AS cascade_sub_status,
      ac.stage AS cascade_stage,
      ac.confidence AS cascade_confidence,
      ac.action AS cascade_action,
      o.jobnumber AS cascade_jobnumber,
      COALESCE(inv.invoiced_total_ex, 0) AS cascade_invoiced,
      -- Dashboard fields
      f.job_status AS dashboard_job_status,
      f.wc_lead_category AS dashboard_category,
      f.reason AS dashboard_reason,
      f.quoteable AS dashboard_quoteable,
      f.job_number AS dashboard_job_number,
      f.after_sale_value AS dashboard_sale_value,
      f.wc_status,
      f.wc_lead_type,
      f.lead_profile
    FROM best_match bm
    JOIN \`${DS}.ferg_csv_classifications\` f ON bm.wc_lead_id = f.wc_lead_id
    JOIN \`${DS}.opportunities\` o ON bm.opp_id = o.opportunity_id
    LEFT JOIN \`${DS}.lead_gate\` g ON bm.opp_id = g.opportunity_id
    LEFT JOIN \`${DS}.crm_auto_classifications\` ac ON bm.opp_id = ac.opportunity_id
    LEFT JOIN \`pttr-taskdata.ds_aroflo.vw_job_invoiced\` inv ON o.jobnumber = inv.jobnumber
  `)

  console.log(`  ${mapped.length} leads mapped with classifications`)

  // Get unmapped leads with reasons
  const unmapped = await runQuery<{ wc_lead_id: number; wc_status: string; reason: string }>(`
    WITH ${reconCTE},
    all_mapped AS (
      -- P1: primary
      SELECT DISTINCT f.wc_lead_id FROM \`${DS}.ferg_csv_classifications\` f
      JOIN \`${DS}.opportunities\` o ON f.wc_lead_id = o.wc_lead_id
      UNION DISTINCT
      -- P2: array
      SELECT DISTINCT f.wc_lead_id FROM \`${DS}.ferg_csv_classifications\` f
      JOIN (SELECT o2.opportunity_id, wl.wc_lead_id FROM \`${DS}.opportunities\` o2, UNNEST(o2.wc_leads) wl) aw
        ON f.wc_lead_id = aw.wc_lead_id
      UNION DISTINCT
      -- P3: phone
      SELECT DISTINCT f.wc_lead_id FROM \`${DS}.ferg_csv_classifications\` f
      JOIN \`pttr-taskdata.gd_WhatConverts.all_leads_enriched\` ale ON f.wc_lead_id = ale.lead_id
      JOIN \`${DS}.opportunities\` o ON ale.norm_phone = o.phone AND ale.norm_phone IS NOT NULL AND ale.norm_phone != ''
    )
    SELECT f.wc_lead_id, f.wc_status,
      CASE
        WHEN ${excludeClause.replace(/ale\./g, 'a.')} THEN 'test_excluded'
        WHEN (a.norm_phone IS NULL OR a.norm_phone = '') AND (a.norm_contact_phone IS NULL OR a.norm_contact_phone = '') THEN 'no_identity'
        ELSE 'spine_gap'
      END AS reason
    FROM \`${DS}.ferg_csv_classifications\` f
    LEFT JOIN \`pttr-taskdata.gd_WhatConverts.all_leads_enriched\` a ON f.wc_lead_id = a.lead_id
    WHERE f.wc_lead_id NOT IN (SELECT wc_lead_id FROM all_mapped)
  `)

  console.log(`  ${unmapped.length} leads unmapped`)

  return { mapped, unmapped, footingCounts }
}

// ─── STEP 3: GENERATE REPORT ──────────────────────────────────────

function generateReport(
  mapped: MappedLead[],
  unmapped: Array<{ wc_lead_id: number; wc_status: string; reason: string }>,
  footingCounts: ObservedCounts,
  csvPath: string,
): string {
  const now = new Date().toISOString().split('T')[0]

  // Stage distribution
  const stageGroups: Record<string, number> = {}
  const actionGroups: Record<string, number> = {}
  const subStatusGroups: Record<string, number> = {}
  const dashboardGroups: Record<string, number> = {}
  let noClassification = 0
  let badVerdicts = 0

  for (const m of mapped) {
    const stage = m.cascade_stage || m.gate_stage || 'Unresolved'
    stageGroups[stage] = (stageGroups[stage] || 0) + 1
    const action = m.cascade_action || 'none'
    actionGroups[action] = (actionGroups[action] || 0) + 1
    if (m.cascade_sub_status) {
      subStatusGroups[m.cascade_sub_status] = (subStatusGroups[m.cascade_sub_status] || 0) + 1
    } else {
      noClassification++
    }
    if (m.cascade_action === 'bad_verdict') badVerdicts++
    dashboardGroups[m.dashboard_job_status] = (dashboardGroups[m.dashboard_job_status] || 0) + 1
  }

  // Unmapped breakdown
  const unmappedReasons: Record<string, number> = {}
  for (const u of unmapped) {
    unmappedReasons[u.reason] = (unmappedReasons[u.reason] || 0) + 1
  }

  const lines: string[] = [
    '# T7 vs Dashboard — Reconciliation Report',
    '',
    `**Date**: ${now}`,
    `**CSV**: ${csvPath} (${footingCounts.total} leads)`,
    `**Engine**: Cascade output from crm_auto_classifications`,
    '',
    '---',
    '',
    '## Population Funnel',
    '',
    '| Bucket | Count |',
    '|--------|-------|',
    `| Test excluded | ${footingCounts.test_excluded} |`,
    `| Mapped (3-way join) | ${footingCounts.mapped} |`,
    `| No identity | ${footingCounts.no_identity} |`,
    `| Spine gap | ${footingCounts.spine_gap} |`,
    `| **Total** | **${footingCounts.total}** |`,
    '',
    '---',
    '',
    '## Cascade Classification (mapped leads)',
    '',
    '### By action',
    '',
    '| Action | Count |',
    '|--------|-------|',
    ...Object.entries(actionGroups)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '### By sub-status',
    '',
    '| Sub-Status | Count |',
    '|------------|-------|',
    ...Object.entries(subStatusGroups)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `| ${k} | ${v} |`),
    noClassification > 0 ? `| (no classification) | ${noClassification} |` : '',
    '',
    '---',
    '',
    '## Dashboard Classification (mapped leads)',
    '',
    '| Dashboard Status | Count |',
    '|-----------------|-------|',
    ...Object.entries(dashboardGroups)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '---',
    '',
    '## Unmapped Leads',
    '',
    '| Reason | Count |',
    '|--------|-------|',
    ...Object.entries(unmappedReasons)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `| ${k} | ${v} |`),
    '',
  ]

  if (badVerdicts > 0) {
    lines.push('---', '', `## Bad Verdicts: ${badVerdicts}`, '',
      'These leads failed T7.2 validation and need manual review.',
      'Query: `SELECT * FROM crm_auto_classifications WHERE action = \'bad_verdict\'`', '')
  }

  return lines.filter(l => l !== '').join('\n') + '\n'
}

// ─── MAIN ──────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const csvPath = args.find(a => a.startsWith('--csv='))?.split('=')[1]
    || path.join(__dirname, '..', 'data', 'reconciliation', 'enriched_leads.csv')

  console.log(`\n${'='.repeat(60)}`)
  console.log(`RECONCILIATION — comparing cascade output vs dashboard CSV`)
  console.log(`CSV: ${csvPath}`)
  console.log(`${'='.repeat(60)}\n`)

  try {
    // Step 1: Load CSV to BQ
    const totalRows = await loadCsvToBQ(csvPath)

    // Step 2: Map and compare
    const { mapped, unmapped, footingCounts } = await mapAndCompare()

    // Step 3: Footing check
    console.log('RECON: Running footing check...')
    runFootingCheck('reconciliation_1215', footingCounts)

    // Step 4: Generate markdown report
    const report = generateReport(mapped, unmapped, footingCounts, csvPath)
    const outPath = path.join(__dirname, '..', 'docs', 't7_wc_reconciliation_full.md')
    fs.writeFileSync(outPath, report)
    console.log(`\nRECON: Report written to ${outPath}`)

    // Step 5: Generate per-lead CSV for detailed review
    const csvOutPath = path.join(__dirname, '..', 'data', 'reconciliation', 'reconciliation_output.csv')
    const csvHeader = [
      'opportunity_id', 'wc_lead_id', 'lead_profile', 'wc_lead_type', 'wc_status',
      'cascade_sub_status', 'cascade_stage', 'cascade_confidence', 'cascade_action',
      'cascade_jobnumber', 'cascade_invoiced',
      'dashboard_job_status', 'dashboard_category', 'dashboard_reason',
      'dashboard_job_number', 'dashboard_sale_value',
    ].join(',')
    const csvEsc = (v: unknown) => {
      if (v === null || v === undefined) return '""'
      const s = String(v).replace(/"/g, '""')
      return `"${s}"`
    }
    const csvRows = mapped.map(m => [
      csvEsc(m.opp_id), csvEsc(m.csv_lead_id), csvEsc(m.lead_profile), csvEsc(m.wc_lead_type), csvEsc(m.wc_status),
      csvEsc(m.cascade_sub_status), csvEsc(m.cascade_stage), csvEsc(m.cascade_confidence), csvEsc(m.cascade_action),
      csvEsc(m.cascade_jobnumber), csvEsc(m.cascade_invoiced),
      csvEsc(m.dashboard_job_status), csvEsc(m.dashboard_category), csvEsc(m.dashboard_reason),
      csvEsc(m.dashboard_job_number), csvEsc(m.dashboard_sale_value),
    ].join(','))
    fs.writeFileSync(csvOutPath, [csvHeader, ...csvRows].join('\n'))
    console.log(`RECON: Per-lead CSV written to ${csvOutPath}`)

    // Summary
    console.log(`\n${'='.repeat(60)}`)
    console.log(`RECONCILIATION COMPLETE`)
    console.log(`  CSV: ${totalRows} leads`)
    console.log(`  Mapped: ${mapped.length}`)
    console.log(`  Unmapped: ${unmapped.length}`)
    console.log(`  Bad verdicts: ${mapped.filter(m => m.cascade_action === 'bad_verdict').length}`)
    console.log(`  No classification: ${mapped.filter(m => !m.cascade_sub_status).length}`)
    console.log(`${'='.repeat(60)}\n`)

  } catch (err) {
    console.error('RECONCILIATION FAILED:', err)
    process.exit(1)
  }
}

main()
