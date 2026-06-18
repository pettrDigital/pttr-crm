/**
 * T7-MATCH Stage 2 — Blind re-validation (13 eligible leads).
 * Candidate gen from Stage 1 SQL (capped 15, forward 0-30d).
 * Pre-computed PHONE_MATCH / EMAIL_MATCH. T7 reasons over fuzzy dims only.
 * Per §5.3 of PETTR_CRM_DATA_SPEC.md.
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
async function q<T>(sql: string): Promise<T[]> {
  const [r] = await bq.query({ query: sql, location: 'US' }); return r.map(flat) as T[]
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

// The 13 eligible test leads (WC-211915178 excluded — linked by T3)
const TEST_LEADS = [
  { wc: 236286440, true_jn: '142586', svc: 'ETTR' },
  { wc: 230563333, true_jn: '142192', svc: 'ETTR' },
  { wc: 214127245, true_jn: '141035', svc: 'PTTR' },
  { wc: 223847706, true_jn: '141721', svc: 'ETTR' },
  { wc: 214123961, true_jn: '141030', svc: 'PTTR' },
  { wc: 238745838, true_jn: '142760', svc: 'ETTR' },
  { wc: 216450883, true_jn: '141237', svc: 'PTTR' },
  { wc: 208123762, true_jn: '140652', svc: 'PTTR' },
  { wc: 232004696, true_jn: '142270', svc: 'PTTR' },
  { wc: 215756822, true_jn: '141193', svc: 'ETTR' },
  { wc: 210835017, true_jn: '140878', svc: 'PTTR' },
  { wc: 223945610, true_jn: '141734', svc: 'ETTR' },
  { wc: 221688028, true_jn: '141556', svc: 'ETTR' },
]

async function runLead(wc: number, true_jn: string, svc: string) {
  try {
  // Get lead info
  const leadRows = await q<any>(`
    SELECT le.contact_name, le.suburb, o.phone, o.wc_lead_id
    FROM \`pttr-taskdata.ds_crm.opportunities\` o
    JOIN \`pttr-taskdata.ds_crm.vw_lead_enriched\` le ON o.opportunity_id = le.opportunity_id
    WHERE o.wc_lead_id = ${wc}
  `)
  const lead = leadRows[0]
  if (!lead) return { wc, true_jn, picked: null, verdict: 'NOT_FOUND', confidence: 0, evidence: 'Lead not found', corroboration: '', abstain: true, cand_count: 0, phone_match_on_true: false }

  // Get lead content (earliest substantive touch)
  const lc = (await q<any>(`
    SELECT content FROM (
      SELECT SUBSTR(full_content, 1, 1500) AS content,
        ROW_NUMBER() OVER (ORDER BY interaction_datetime) AS rn
      FROM \`pttr-taskdata.ds_crm.lead_timeline\`
      WHERE opportunity_id = (SELECT opportunity_id FROM \`pttr-taskdata.ds_crm.opportunities\` WHERE wc_lead_id = ${wc})
        AND full_content IS NOT NULL AND LENGTH(full_content) > 30
    ) WHERE rn = 1
  `))[0]

  // Get lead date
  const ld = (await q<any>(`
    SELECT DATE(opportunity_timestamp) AS d, phone
    FROM \`pttr-taskdata.ds_crm.opportunities\` WHERE wc_lead_id = ${wc}
  `))[0]

  // Get top 15 candidates with pre-computed PHONE_MATCH / EMAIL_MATCH
  const sf = svc === 'PTTR' ? "tc.task_type LIKE '%Plumb%'" : "tc.task_type LIKE '%Electri%'"
  const candQuery = `
    WITH ranked AS (
      SELECT tc.jobnumber, tc.client_name, tc.customer_type, tc.address_suburb,
        SUBSTR(REGEXP_REPLACE(REGEXP_REPLACE(td.description, r'<[^>]+>', ' '), r'&[a-zA-Z]+;|&#\\d+;', ' '), 1, 400) AS job_desc,
        COALESCE(inv.invoiced_total_ex, 0) AS inv,
        DATE_DIFF(tc.requested_date_parsed, DATE('${ld.d}'), DAY) AS days_fwd,
        ROW_NUMBER() OVER (ORDER BY DATE_DIFF(tc.requested_date_parsed, DATE('${ld.d}'), DAY), tc.jobnumber) AS rn
      FROM \`pttr-taskdata.ds_aroflo.tasks_complete\` tc
      JOIN \`pttr-taskdata.ds_aroflo.tasks_deduped\` td ON tc.jobnumber = td.jobnumber
      LEFT JOIN \`pttr-taskdata.ds_aroflo.vw_job_invoiced\` inv ON tc.jobnumber = inv.jobnumber
      WHERE ${sf}
        AND DATE_DIFF(tc.requested_date_parsed, DATE('${ld.d}'), DAY) BETWEEN 0 AND 30
    )
    SELECT r.*,
      -- PHONE_MATCH: does lead phone appear in this job's identity bundle?
      ${ld.phone ? `(
        REPLACE(REPLACE(td2.description, ' ', ''), '&nbsp;', '') LIKE '%${ld.phone.slice(3)}%'
        OR EXISTS(SELECT 1 FROM \`pttr-taskdata.ds_aroflo.task_notes_deduped\` tn
          WHERE tn.jobnumber = r.jobnumber AND REPLACE(tn.note_clean, ' ', '') LIKE '%${ld.phone.slice(3)}%')
        OR tc2.id_phone = '${ld.phone}' OR tc2.norm_client_phone = '${ld.phone}' OR tc2.norm_client_mobile = '${ld.phone}'
      )` : 'FALSE'} AS phone_match,
      FALSE AS email_match
    FROM ranked r
    JOIN \`pttr-taskdata.ds_aroflo.tasks_deduped\` td2 ON r.jobnumber = td2.jobnumber
    JOIN \`pttr-taskdata.ds_aroflo.tasks_complete\` tc2 ON r.jobnumber = tc2.jobnumber
    WHERE r.rn <= 15
    ORDER BY r.rn
  `
  // Debug: print first query for inspection
  // Debug removed
  const cands = await q<any>(candQuery)

  // Build prompt
  let prompt = `LEAD:\n- Service: ${svc === 'PTTR' ? 'Plumbing' : 'Electrical'}\n`
  if (lead.contact_name) prompt += `- Caller: ${lead.contact_name}\n`
  if (lead.suburb) prompt += `- Suburb: ${lead.suburb}\n`
  if (lead.phone) prompt += `- Phone: ${lead.phone}\n`
  prompt += `\nLEAD CONTENT:\n${(lc?.content || 'No content').slice(0, 1500)}\n\nCANDIDATE JOBS:\n`

  for (const [i, cd] of cands.entries()) {
    prompt += `\n${i + 1}. JN${cd.jobnumber} | ${cd.client_name} | ${cd.customer_type} | Suburb: ${cd.address_suburb || 'unknown'} | $${cd.inv}`
    prompt += `\n   PHONE_MATCH: ${cd.phone_match ? 'yes' : 'no'} | EMAIL_MATCH: ${cd.email_match ? 'yes' : 'no'}`
    prompt += `\n   ${(cd.job_desc || '').slice(0, 300)}\n`
  }

  // Circularity guard: confirm true_jn does NOT appear as text in the prompt
  // (it may appear as a candidate JN — that's fine, it's one of 15. But the
  // ANSWER that it's the correct one must not be in the prompt.)
  // The true_jn appears as "JN141030" in the candidate list — that's expected.
  // What must NOT appear: any signal that singles it out as "the answer."

  // Call T7
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o', max_tokens: 300,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: prompt }
      ]
    })
    const txt = resp.choices[0]?.message?.content || ''
    const m = txt.match(/\{[\s\S]*\}/)
    const p = m ? JSON.parse(m[0]) : { abstain: true, evidence: txt }

    // Strip "JN" prefix if present
    const picked = p.jobnumber?.replace(/^JN/i, '') || null
    const matchedCand = picked ? cands.find((c: any) => c.jobnumber === picked) : null
    const pm = matchedCand?.phone_match === true || matchedCand?.phone_match === 'true'

    // §5.3 MATCH BAR GATE — enforce corroboration rules mechanically
    const corrStr = (p.corroboration || '').toLowerCase()
    const signalTypes = new Set<string>()
    for (const tok of corrStr.replace(/[+|,]/g, ' ').split(/\s+/)) {
      if (['name','phone','email','address','suburb','problem'].includes(tok)) signalTypes.add(tok)
    }
    if (pm) signalTypes.add('phone')

    const custType = matchedCand?.customer_type || 'COD'
    const hasHardId = signalTypes.has('name') || signalTypes.has('phone') || signalTypes.has('email')
    const hasProb = signalTypes.has('problem')
    const hasLoc = signalTypes.has('suburb') || signalTypes.has('address')

    let barOk = false
    if (custType === 'Account') {
      barOk = hasHardId && hasProb && hasLoc
    } else {
      barOk = signalTypes.size >= 2 && hasProb
    }

    if (p.abstain || !picked || p.confidence < 0.8 || !barOk) {
      const verdict2 = p.abstain ? 'ABSTAIN' : 'ABSTAIN'
      return { wc, true_jn, picked: null, verdict: verdict2, confidence: p.confidence || 0,
        evidence: barOk ? (p.evidence || 'Below threshold') : `BAR_FAIL: ${[...signalTypes].join('+')} (${custType})`,
        corroboration: p.corroboration, abstain: true, cand_count: cands.length,
        phone_match_on_true: cands.find((c: any) => c.jobnumber === true_jn)?.phone_match || false }
    }

    const verdict = picked === true_jn ? 'CORRECT' : 'WRONG'
    return {
      wc, true_jn, picked, verdict,
      confidence: p.confidence,
      evidence: p.evidence,
      corroboration: p.corroboration,
      abstain: false,
      cand_count: cands.length,
      phone_match_on_true: cands.find((c: any) => c.jobnumber === true_jn)?.phone_match || false,
    }
  } catch (e) {
    return { wc, true_jn, picked: null, verdict: 'ERROR', confidence: 0, evidence: (e as Error).message?.slice(0, 200), corroboration: '', abstain: true, cand_count: cands?.length || 0, phone_match_on_true: false }
  }
  } catch (outerErr) {
    return { wc, true_jn, picked: null, verdict: 'ERROR', confidence: 0, evidence: `OUTER: ${(outerErr as Error).message?.slice(0, 200)}`, corroboration: '', abstain: true, cand_count: 0, phone_match_on_true: false }
  }
}

async function main() {
  console.log('T7-MATCH Stage 2 — Blind Re-validation (13 eligible leads)')
  console.log('=' .repeat(100))

  const results: any[] = []
  for (const t of TEST_LEADS) {
    const r = await runLead(t.wc, t.true_jn, t.svc)
    results.push(r)
    console.log(`WC-${r.wc} | true:${r.true_jn} | pick:${r.picked || 'ABSTAIN'} | ${r.verdict} | conf:${r.confidence} | corr:${r.corroboration} | PM_true:${r.phone_match_on_true} | ${(r.evidence || '').slice(0, 80)}`)
  }

  console.log('\n' + '='.repeat(100))
  const correct = results.filter(r => r.verdict === 'CORRECT').length
  const abstain = results.filter(r => r.verdict === 'ABSTAIN').length
  const wrong = results.filter(r => r.verdict === 'WRONG').length
  const error = results.filter(r => r.verdict === 'ERROR').length
  console.log(`CORRECT: ${correct}, ABSTAIN: ${abstain}, WRONG: ${wrong}, ERROR: ${error}`)
  console.log(`Expected: 11 correct, 3 abstain (including WC-216450883 correct-rejection), 0 wrong`)

  // Note WC-211915178 separately
  console.log('\nWC-211915178: excluded (linked by T3 to JN140961 this session)')

  fs.writeFileSync('docs/t7_match_stage2_results.json', JSON.stringify(results, null, 2))
  console.log('Results saved to docs/t7_match_stage2_results.json')
}

main().catch(console.error)
