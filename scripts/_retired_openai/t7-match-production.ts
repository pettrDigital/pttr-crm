/**
 * T7-MATCH Production Run — full WC residual, flagged state.
 * Writes Account matches to crm_account_exclusions (needs_audit=TRUE).
 * Writes COD matches to crm_t7_match_queue (needs_audit=TRUE).
 * Does NOT update opportunities.opp_type or add to §6 tier list.
 */
import 'dotenv/config'
import { BigQuery } from '@google-cloud/bigquery'
import OpenAI from 'openai'
import { execSync } from 'child_process'
import * as fs from 'fs'

require('dotenv').config({ path: '.env.local' })
const bq = new BigQuery({ projectId: 'pttr-taskdata' })
const openai = new OpenAI({ apiKey: execSync('gcloud secrets versions access latest --secret=openai-api-key --project=pttr-taskdata', { encoding: 'utf-8' }).trim() })

function flat(v: any): any {
  if (v == null || typeof v !== 'object') return v
  if ('value' in v && Object.keys(v).length === 1) return v.value
  if (Array.isArray(v)) return v.map(flat)
  const o: any = {}; for (const [k, val] of Object.entries(v)) o[k] = flat(val); return o
}
async function q<T>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
  const [r] = await bq.query({ query: sql, params, location: 'US' }); return r.map(flat) as T[]
}

const SYSTEM = `You match trade service leads (plumbing/electrical, Sydney AU) to candidate jobs.
You receive a LEAD (the customer's enquiry) and up to 15 CANDIDATE JOBS.
Each candidate has pre-computed PHONE_MATCH and EMAIL_MATCH signals — these are
AUTHORITATIVE (computed deterministically from normalised phone/email comparison).
Do NOT re-derive phone or email matches yourself.

Your task: evaluate each candidate on FOUR fuzzy dimensions:
1. NAME — does the lead's caller name match the candidate's client/contact name?
2. ADDRESS — does an address mentioned in the lead appear in the candidate?
3. SUBURB — does the lead's location match the candidate's suburb?
4. PROBLEM — does the lead's reported issue SEMANTICALLY match the candidate's
   work description? ("no hot water" ≈ "hot water unit failed". NOT "leaking tap" ≈ "blocked drain")

Pick the ONE candidate that best matches the lead, or ABSTAIN if none qualifies.

MATCH BAR:
- For COD jobs: >=2 corroborating signals (including pre-computed PHONE/EMAIL),
  at least one being problem-match.
- For Account jobs: >=1 HARD identity signal (name/phone/email matching a PERSON
  in the description — NOT the strata company name) AND problem-match AND a
  location signal (address or suburb). Suburb + problem alone = ABSTAIN.
- PROBLEM-MISMATCH VETO: if the lead's problem clearly contradicts the candidate's
  work description, disqualify that candidate regardless of other signals.
- If two candidates are within 0.1 confidence of each other, ABSTAIN (ambiguous).
- Confidence must be >= 0.8 for a match. Below 0.8 = ABSTAIN.

Return ONLY this JSON (no other text):
{"jobnumber":"XXXXXX","confidence":0.XX,"evidence":"one sentence citing the matching signals","corroboration":"name+problem|phone+problem|etc","abstain":false}

OR if no match qualifies:
{"jobnumber":null,"confidence":0,"evidence":"reason for abstaining","corroboration":"","abstain":true}`

interface MatchResult {
  opportunity_id: string; lead_phone: string | null; lead_name: string | null
  lead_suburb: string | null; service: string
  jobnumber: string | null; client_name: string | null; customer_type: string | null
  confidence: number; evidence: string; corroboration: string; abstain: boolean
  phone_match: boolean; days_fwd: number | null; invoiced_ex: number
  error: string | null
}

async function runLead(opp: any): Promise<MatchResult> {
  const base = {
    opportunity_id: opp.opportunity_id, lead_phone: opp.phone,
    lead_name: opp.contact_name, lead_suburb: opp.suburb, service: opp.service,
    jobnumber: null, client_name: null, customer_type: null,
    confidence: 0, evidence: '', corroboration: '', abstain: true,
    phone_match: false, days_fwd: null, invoiced_ex: 0, error: null
  } as MatchResult

  try {
    // Lead content
    const lcRows = await q<any>(`
      SELECT content FROM (
        SELECT SUBSTR(full_content, 1, 1500) AS content,
          ROW_NUMBER() OVER (ORDER BY interaction_datetime) AS rn
        FROM \`pttr-taskdata.ds_crm.lead_timeline\`
        WHERE opportunity_id = '${opp.opportunity_id}'
          AND full_content IS NOT NULL AND LENGTH(full_content) > 30
      ) WHERE rn = 1`)
    const content = lcRows[0]?.content || 'No content'

    // Candidates (top 15, forward 0-30d, same service)
    const sf = opp.service === 'PTTR' ? "tc.task_type LIKE '%Plumb%'" : "tc.task_type LIKE '%Electri%'"
    const phoneSlice = opp.phone ? opp.phone.slice(3) : null
    const cands = await q<any>(`
      WITH ranked AS (
        SELECT tc.jobnumber, tc.client_name, tc.customer_type, tc.address_suburb,
          SUBSTR(REGEXP_REPLACE(REGEXP_REPLACE(td.description, r'<[^>]+>', ' '), r'&[a-zA-Z]+;|&#\\d+;', ' '), 1, 400) AS job_desc,
          COALESCE(inv.invoiced_total_ex, 0) AS inv,
          DATE_DIFF(tc.requested_date_parsed, DATE('${opp.lead_date}'), DAY) AS days_fwd,
          ROW_NUMBER() OVER (ORDER BY DATE_DIFF(tc.requested_date_parsed, DATE('${opp.lead_date}'), DAY), tc.jobnumber) AS rn
        FROM \`pttr-taskdata.ds_aroflo.tasks_complete\` tc
        JOIN \`pttr-taskdata.ds_aroflo.tasks_deduped\` td ON tc.jobnumber = td.jobnumber
        LEFT JOIN \`pttr-taskdata.ds_aroflo.vw_job_invoiced\` inv ON tc.jobnumber = inv.jobnumber
        WHERE ${sf}
          AND DATE_DIFF(tc.requested_date_parsed, DATE('${opp.lead_date}'), DAY) BETWEEN 0 AND 30
      )
      SELECT r.*,
        ${phoneSlice ? `(
          REPLACE(REPLACE(td2.description, ' ', ''), '&nbsp;', '') LIKE '%${phoneSlice}%'
          OR EXISTS(SELECT 1 FROM \`pttr-taskdata.ds_aroflo.task_notes_deduped\` tn
            WHERE tn.jobnumber = r.jobnumber AND REPLACE(tn.note_clean, ' ', '') LIKE '%${phoneSlice}%')
          OR tc2.id_phone = '${opp.phone}' OR tc2.norm_client_phone = '${opp.phone}' OR tc2.norm_client_mobile = '${opp.phone}'
        )` : 'FALSE'} AS phone_match,
        FALSE AS email_match
      FROM ranked r
      JOIN \`pttr-taskdata.ds_aroflo.tasks_deduped\` td2 ON r.jobnumber = td2.jobnumber
      JOIN \`pttr-taskdata.ds_aroflo.tasks_complete\` tc2 ON r.jobnumber = tc2.jobnumber
      WHERE r.rn <= 15
      ORDER BY r.rn`)

    if (cands.length === 0) return { ...base, evidence: 'No candidates within forward 0-30d window' }

    // Build prompt
    let prompt = `LEAD:\n- Service: ${opp.service === 'PTTR' ? 'Plumbing' : 'Electrical'}\n`
    if (opp.contact_name) prompt += `- Caller: ${opp.contact_name}\n`
    if (opp.suburb) prompt += `- Suburb: ${opp.suburb}\n`
    if (opp.phone) prompt += `- Phone: ${opp.phone}\n`
    prompt += `\nLEAD CONTENT:\n${content.slice(0, 1500)}\n\nCANDIDATE JOBS:\n`
    for (const [i, cd] of cands.entries()) {
      prompt += `\n${i + 1}. JN${cd.jobnumber} | ${cd.client_name} | ${cd.customer_type} | Suburb: ${cd.address_suburb || 'unknown'} | $${cd.inv}`
      prompt += `\n   PHONE_MATCH: ${cd.phone_match === true || cd.phone_match === 'true' ? 'yes' : 'no'} | EMAIL_MATCH: no`
      prompt += `\n   ${(cd.job_desc || '').slice(0, 300)}\n`
    }

    // Call T7
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o', max_tokens: 300,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }]
    })
    const txt = resp.choices[0]?.message?.content || ''
    const m = txt.match(/\{[\s\S]*\}/)
    const p = m ? JSON.parse(m[0]) : { abstain: true, evidence: txt }
    const picked = p.jobnumber?.replace(/^JN/i, '') || null

    if (p.abstain || !picked || p.confidence < 0.8) {
      return { ...base, evidence: p.evidence || 'Below threshold', confidence: p.confidence || 0 }
    }

    const matchedCand = cands.find((c: any) => c.jobnumber === picked)
    const pm = matchedCand?.phone_match === true || matchedCand?.phone_match === 'true'

    // §5.3 MATCH BAR GATE — enforce corroboration rules mechanically
    // Extract distinct signal types from T7's corroboration string
    const corrStr = (p.corroboration || '').toLowerCase()
    const signalTypes = new Set<string>()
    for (const tok of corrStr.replace(/[+|,]/g, ' ').split(/\s+/)) {
      if (['name','phone','email','address','suburb','problem'].includes(tok)) signalTypes.add(tok)
    }
    // Add pre-computed signals if T7 didn't list them but they exist
    if (pm) signalTypes.add('phone')

    const custType = matchedCand?.customer_type || 'COD'
    const hasHardIdentity = signalTypes.has('name') || signalTypes.has('phone') || signalTypes.has('email')
    const hasProblem = signalTypes.has('problem')
    const hasLocation = signalTypes.has('suburb') || signalTypes.has('address')

    let barPassed = false
    let barReason = ''

    if (custType === 'Account') {
      // Account: ≥1 hard identity + problem + location
      barPassed = hasHardIdentity && hasProblem && hasLocation
      if (!barPassed) barReason = `Account bar failed: identity=${hasHardIdentity} problem=${hasProblem} location=${hasLocation}`
    } else {
      // COD: ≥2 distinct signals, at least one being problem
      barPassed = signalTypes.size >= 2 && hasProblem
      if (!barPassed) barReason = `COD bar failed: ${signalTypes.size} distinct signals (need ≥2 incl problem)`
    }

    if (!barPassed) {
      return { ...base, evidence: barReason, confidence: p.confidence }
    }

    return {
      ...base,
      jobnumber: picked,
      client_name: matchedCand?.client_name || null,
      customer_type: custType,
      confidence: p.confidence,
      evidence: p.evidence || '',
      corroboration: p.corroboration || '',
      abstain: false,
      phone_match: pm,
      days_fwd: matchedCand?.days_fwd ?? null,
      invoiced_ex: matchedCand?.inv || 0,
    }
  } catch (e) {
    return { ...base, error: (e as Error).message?.slice(0, 200) }
  }
}

async function main() {
  console.log('T7-MATCH Production Run — Full WC Residual (flagged state)')
  console.log('='.repeat(100))

  // Get eligible leads
  const eligible = await q<any>(`
    WITH conflated_phones AS (
      SELECT phone FROM (
        SELECT gp.phone, COUNT(DISTINCT td.jobnumber) AS dc
        FROM (SELECT DISTINCT phone FROM \`pttr-taskdata.ds_crm.opportunities\`
              WHERE opp_type = 'gap_based' AND phone IS NOT NULL) gp
        JOIN \`pttr-taskdata.ds_aroflo.tasks_deduped\` td
          ON REPLACE(REPLACE(td.description, ' ', ''), '&nbsp;', '') LIKE CONCAT('%', SUBSTR(gp.phone, 4), '%')
        JOIN \`pttr-taskdata.ds_aroflo.tasks_complete\` tc ON td.jobnumber = tc.jobnumber
        WHERE tc.customer_type = 'Account'
        GROUP BY gp.phone
      ) WHERE dc >= 10
    )
    SELECT o.opportunity_id, o.phone, DATE(o.opportunity_timestamp) AS lead_date,
      le.contact_name, le.suburb, le.service
    FROM \`pttr-taskdata.ds_crm.opportunities\` o
    JOIN \`pttr-taskdata.ds_crm.vw_lead_enriched\` le ON o.opportunity_id = le.opportunity_id
    WHERE o.opp_type = 'gap_based' AND o.jobnumber IS NULL AND o.wc_lead_id IS NOT NULL
      AND (o.phone IS NULL OR o.phone NOT IN (SELECT phone FROM conflated_phones))
      AND o.opportunity_id IN (
        SELECT DISTINCT opportunity_id FROM \`pttr-taskdata.ds_crm.lead_timeline\`
        WHERE full_content IS NOT NULL AND LENGTH(full_content) > 50 AND gate_stage = 'judgement:NQ/NB'
      )
    ORDER BY o.opportunity_timestamp`)

  console.log(`Eligible leads: ${eligible.length}`)

  const results: MatchResult[] = []
  const BATCH = 5
  let matched = 0, abstained = 0, errored = 0

  for (let i = 0; i < eligible.length; i += BATCH) {
    const batch = eligible.slice(i, i + BATCH)
    const batchResults = await Promise.all(batch.map(runLead))
    results.push(...batchResults)

    for (const r of batchResults) {
      if (r.error) errored++
      else if (r.abstain || !r.jobnumber) abstained++
      else matched++
    }

    const done = Math.min(i + BATCH, eligible.length)
    if (done % 50 === 0 || done === eligible.length) {
      console.log(`[${done}/${eligible.length}] matched:${matched} abstained:${abstained} errors:${errored}`)
    }
  }

  console.log('\n' + '='.repeat(100))
  console.log(`TOTAL: ${results.length} | MATCHED: ${matched} | ABSTAINED: ${abstained} | ERRORS: ${errored}`)

  // Write matches
  const matches = results.filter(r => r.jobnumber && !r.abstain && !r.error)
  const acctMatches = matches.filter(r => r.customer_type === 'Account')
  const codMatches = matches.filter(r => r.customer_type !== 'Account')

  console.log(`Account matches: ${acctMatches.length}, COD matches: ${codMatches.length}`)

  // Save results FIRST (before any writes that might fail)
  fs.writeFileSync('docs/t7_match_production_results.json', JSON.stringify(results, null, 2))
  console.log('Results saved to docs/t7_match_production_results.json')

  // Print match list for audit
  console.log('\n=== MATCH LIST FOR AUDIT ===')
  for (const m of matches) {
    console.log(`${m.opportunity_id.slice(0,20)} | ${(m.lead_name||'-').padEnd(20)} | ${(m.lead_phone||'-').padEnd(14)} | ${(m.lead_suburb||'-').padEnd(15)} | JN${m.jobnumber} | ${m.customer_type} | ${(m.client_name||'').slice(0,20).padEnd(20)} | c:${m.confidence} | PM:${m.phone_match?'Y':'N'} | d+${m.days_fwd} | $${m.invoiced_ex} | ${m.corroboration} | ${(m.evidence||'').slice(0,60)}`)
  }
  const confBands: Record<string, number> = { '0.80-0.84': 0, '0.85-0.89': 0, '0.90-0.94': 0, '0.95-1.00': 0 }
  for (const m of matches) {
    if (m.confidence >= 0.95) confBands['0.95-1.00']++
    else if (m.confidence >= 0.90) confBands['0.90-0.94']++
    else if (m.confidence >= 0.85) confBands['0.85-0.89']++
    else confBands['0.80-0.84']++
  }
  console.log('\nConfidence distribution:', confBands)

  // Skip SDK writes (permission issue) — write via bq CLI from the saved JSON
  console.log('\nWrites deferred to bq CLI. Run: python3 scripts/t7_match_write.py')
  return

  // (Legacy write code below — not reached)
  for (const m of acctMatches) {
    await q(`INSERT INTO \`pttr-taskdata.ds_crm.crm_account_exclusions\`
      (opportunity_id, is_account, provenance, synced_at, jobnumber, matched_phone,
       account_client, match_tier, invoiced_ex, days_lead_to_job,
       needs_audit, t7_confidence, t7_evidence)
      VALUES ('${m.opportunity_id}', TRUE, 'auto:t7_match', CURRENT_TIMESTAMP(),
        '${m.jobnumber}', ${m.lead_phone ? `'${m.lead_phone}'` : 'NULL'},
        ${m.client_name ? `'${m.client_name.replace(/'/g, "\\'")}'` : 'NULL'},
        'auto:t7_match', ${m.invoiced_ex}, ${m.days_fwd ?? 0},
        TRUE, ${m.confidence}, '${(m.evidence || '').replace(/'/g, "\\'").slice(0, 500)}')`)
  }

  // Write COD matches to crm_t7_match_queue
  for (const m of codMatches) {
    await q(`INSERT INTO \`pttr-taskdata.ds_crm.crm_t7_match_queue\`
      (opportunity_id, jobnumber, matched_phone, customer_type, client_name,
       match_tier, t7_confidence, t7_evidence, t7_corroboration,
       needs_audit, invoiced_ex, days_lead_to_job)
      VALUES ('${m.opportunity_id}', '${m.jobnumber}',
        ${m.lead_phone ? `'${m.lead_phone}'` : 'NULL'},
        '${m.customer_type}',
        ${m.client_name ? `'${m.client_name.replace(/'/g, "\\'")}'` : 'NULL'},
        'auto:t7_match', ${m.confidence},
        '${(m.evidence || '').replace(/'/g, "\\'").slice(0, 500)}',
        '${(m.corroboration || '').replace(/'/g, "\\'")}',
        TRUE, ${m.invoiced_ex}, ${m.days_fwd ?? 0})`)
  }

  // (Old write+print code removed — handled above the return)
}

main().catch(console.error)
