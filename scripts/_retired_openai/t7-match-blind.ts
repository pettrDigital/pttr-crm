import 'dotenv/config'
import { BigQuery } from '@google-cloud/bigquery'
import OpenAI from 'openai'
import { execSync } from 'child_process'

require('dotenv').config({ path: '.env.local' })
const bq = new BigQuery({ projectId: 'pttr-taskdata' })
const openai = new OpenAI({ apiKey: execSync('gcloud secrets versions access latest --secret=openai-api-key --project=pttr-taskdata', { encoding: 'utf-8' }).trim() })

function flat(v: any): any {
  if (v == null || typeof v !== 'object') return v
  if ('value' in v && Object.keys(v).length === 1) return v.value
  if (Array.isArray(v)) return v.map(flat)
  const o: any = {}; for (const [k,val] of Object.entries(v)) o[k] = flat(val); return o
}
async function q<T>(sql: string): Promise<T[]> { const [r] = await bq.query({query:sql,location:'US'}); return r.map(flat) as T[] }

const SYSTEM = `You match trade service leads (plumbing/electrical, Sydney AU) to candidate jobs. Pick the ONE candidate matching the lead, or ABSTAIN.

Score each candidate on SIX dimensions:
1. NAME — caller name matches job client/contact?
2. ADDRESS — address in lead matches job?
3. SUBURB — location matches?
4. PHONE — any phone in lead content appears in job?
5. EMAIL — email matches?
6. PROBLEM — lead's reported issue semantically matches job's work description? ("no hot water" ≈ "hot water unit failed". NOT "leaking tap" ≈ "blocked drain")

MATCH BAR: >=2 independent signals. Problem counts as one.
ABSTAIN if <2 signals, problem clearly doesn't match, or multiple candidates match equally.

Return ONLY JSON:
{"jobnumber":"XXXXXX","confidence":0.XX,"signals":{"name":true,"address":false,"suburb":true,"phone":false,"email":false,"problem":true},"signal_count":3,"evidence":"...","abstain":false}
OR: {"jobnumber":null,"confidence":0,"signals":{},"signal_count":0,"evidence":"reason","abstain":true}`

const cases = [
  {wc:236286440,jn:'142586',svc:'Electrical'},{wc:230563333,jn:'142192',svc:'Electrical'},
  {wc:214127245,jn:'141035',svc:'Plumbing'},{wc:223847706,jn:'141721',svc:'Electrical'},
  {wc:214123961,jn:'141030',svc:'Plumbing'},{wc:238745838,jn:'142760',svc:'Electrical'},
  {wc:216450883,jn:'141237',svc:'Plumbing'},{wc:208123762,jn:'140652',svc:'Plumbing'},
  {wc:232004696,jn:'142270',svc:'Plumbing'},{wc:215756822,jn:'141193',svc:'Electrical'},
  {wc:210835017,jn:'140878',svc:'Plumbing'},{wc:223945610,jn:'141734',svc:'Electrical'},
  {wc:221688028,jn:'141556',svc:'Electrical'},{wc:211915178,jn:'140930',svc:'Plumbing'},
  {wc:215312436,jn:'141307',svc:'Plumbing'},
]

async function main() {
  for (const c of cases) {
    // Lead info
    const lead = (await q<any>(`
      SELECT le.contact_name, le.suburb, o.phone
      FROM \`pttr-taskdata.ds_crm.opportunities\` o
      JOIN \`pttr-taskdata.ds_crm.vw_lead_enriched\` le ON o.opportunity_id = le.opportunity_id
      WHERE o.wc_lead_id = ${c.wc}
    `))[0]
    // Lead content
    const lc = (await q<any>(`
      SELECT SUBSTR(full_content, 1, 1500) AS content FROM \`pttr-taskdata.ds_crm.lead_timeline\`
      WHERE opportunity_id = (SELECT opportunity_id FROM \`pttr-taskdata.ds_crm.opportunities\` WHERE wc_lead_id = ${c.wc})
        AND full_content IS NOT NULL AND LENGTH(full_content) > 30
      ORDER BY interaction_datetime LIMIT 1
    `))[0]
    // Lead date
    const ld = (await q<any>(`SELECT DATE(opportunity_timestamp) AS d FROM \`pttr-taskdata.ds_crm.opportunities\` WHERE wc_lead_id = ${c.wc}`))[0]
    // Candidates
    const sf = c.svc === 'Plumbing' ? "tc.task_type LIKE '%Plumb%'" : "tc.task_type LIKE '%Electri%'"
    const cands = await q<any>(`
      SELECT tc.jobnumber, tc.client_name, tc.customer_type, tc.address_suburb,
        SUBSTR(REGEXP_REPLACE(REGEXP_REPLACE(td.description, r'<[^>]+>', ' '), r'&[a-zA-Z]+;|&#\\d+;', ' '), 1, 400) AS d,
        COALESCE(inv.invoiced_total_ex, 0) AS inv
      FROM \`pttr-taskdata.ds_aroflo.tasks_complete\` tc
      JOIN \`pttr-taskdata.ds_aroflo.tasks_deduped\` td ON tc.jobnumber = td.jobnumber
      LEFT JOIN \`pttr-taskdata.ds_aroflo.vw_job_invoiced\` inv ON tc.jobnumber = inv.jobnumber
      WHERE ${sf} AND ABS(DATE_DIFF(tc.requested_date_parsed, DATE('${ld.d}'), DAY)) <= 7
      ORDER BY ABS(DATE_DIFF(tc.requested_date_parsed, DATE('${ld.d}'), DAY)), tc.jobnumber LIMIT 15
    `)

    let prompt = `LEAD:\n- Service: ${c.svc}\n`
    if (lead.contact_name) prompt += `- Caller: ${lead.contact_name}\n`
    if (lead.suburb) prompt += `- Suburb: ${lead.suburb}\n`
    if (lead.phone) prompt += `- Phone: ${lead.phone}\n`
    prompt += `\nLEAD CONTENT:\n${(lc?.content || 'No content').slice(0,1500)}\n\nCANDIDATE JOBS:\n`
    for (const [i,cd] of cands.entries()) {
      prompt += `\n${i+1}. JN${cd.jobnumber} | ${cd.client_name} | ${cd.customer_type} | Suburb: ${cd.address_suburb||'unknown'} | $${cd.inv}\n   ${(cd.d||'').slice(0,300)}\n`
    }

    try {
      const resp = await openai.chat.completions.create({
        model:'gpt-4o', max_tokens:300, messages:[{role:'system',content:SYSTEM},{role:'user',content:prompt}]
      })
      const txt = resp.choices[0]?.message?.content || ''
      const m = txt.match(/\{[\s\S]*\}/)
      const p = m ? JSON.parse(m[0]) : {abstain:true,evidence:txt}
      const s = p.signals || {}
      const verdict = p.jobnumber === c.jn ? 'CORRECT' : p.abstain ? 'ABSTAIN' : 'WRONG'
      console.log(`${c.wc} | true:${c.jn} | t7:${p.jobnumber||'ABSTAIN'} | ${verdict} | conf:${p.confidence} | sig:${p.signal_count} [N:${s.name?'✓':'✗'} A:${s.address?'✓':'✗'} S:${s.suburb?'✓':'✗'} P:${s.phone?'✓':'✗'} E:${s.email?'✓':'✗'} Pr:${s.problem?'✓':'✗'}] | ${(p.evidence||'').slice(0,100)}`)
    } catch(e) { console.log(`${c.wc} | ERROR: ${(e as Error).message.slice(0,100)}`) }
  }
}
main().catch(console.error)
