// Classifier content assembly — transforms interaction rows into model input.
// Used by T7 harness and future production classifier.
//
// As of commit b510d37, the UI reads from the materialised lead_timeline table.
// The classifier now reads from the SAME table (repointed here) so that UI = classifier input.
// Full bodies are hydrated on demand from source tables via body_source + body_id.

import type { QueryFn, Anchors, InteractionRow } from './types'

const DEFAULT_DS = 'pttr-taskdata.ds_crm'

export interface EnrichedTouch extends InteractionRow {
  full_content: string | null   // full transcript / email body / form body / OHQ body
  content_source: string | null // '8x8' | 'whatconverts' | 'email' | 'form' | 'ohq' | 'sms'
  body_source?: string | null
  touch_source?: string | null
}

export interface StructuredFacts {
  lead_type: string; channel: string; source: string; service: string
  answered: boolean | null; captured: boolean | null; is_after_hours: boolean
  booking_status: string; completed: boolean | null; job_count: number
  is_existing_customer: boolean; contact_name: string | null
  phone: string | null; suburb: string | null
  // §6: Job identity (for T7 corroboration by client/location)
  client_name: string | null
  client_address: string | null
  job_contact_name: string | null
}

export interface ClassifierInput {
  facts: StructuredFacts
  touches: EnrichedTouch[]       // chronological (oldest first)
  job_description: string | null
  labour_note: string | null
  task_notes: string | null
}

/**
 * Read ALL classifier input from the materialised lead_timeline table.
 * lead_timeline is the single source of truth — Build A materialised:
 *   - WC-primary transcripts (COALESCE(wc, 8x8) — correct priority)
 *   - Full SMS/OHQ/Outlook/task-email bodies
 *   - ALL labour notes (no LIMIT 1)
 *   - ALL task notes with authors (no LIMIT 5)
 *   - Form bodies at 2000-char cap (not 300)
 *   - gate_stage (deterministic classifier)
 *
 * Falls through to runtime hydration ONLY when full_content IS NULL
 * (pre-April calls with no transcript, edge cases).
 *
 * Replaces enrichTouches() which had: reversed transcript priority,
 * form skip bug, and did not read materialised content.
 */
export async function assembleTouchesFromTimeline(
  queryFn: QueryFn, opportunityId: string, opts?: { dataset?: string }
): Promise<{ touches: EnrichedTouch[]; job_description: string | null; labour_notes: string | null; task_notes: string | null; gate_stage: string | null }> {
  const ds = opts?.dataset || DEFAULT_DS

  // Single query: all touches + job content + gate from lead_timeline
  const rows = await queryFn<{
    interaction_id: string | null; lead_id: number | null
    interaction_type: string; interaction_datetime: string
    interaction_date: string; interaction_time: string
    interaction_operator: string | null; interaction_duration_seconds: number | null
    interaction_summary: string | null; call_id: string | null
    called_did_label: string | null; body_source: string | null; body_id: string | null
    touch_source: string | null
    full_content: string | null
    task_description: string | null
    labour_notes: string | null
    task_notes: string | null
    gate_stage: string | null
  }>(`
    SELECT interaction_id, lead_id, interaction_type, interaction_datetime,
      interaction_date, interaction_time, interaction_operator,
      interaction_duration_seconds, interaction_summary, call_id,
      called_did_label, body_source, body_id, touch_source,
      full_content,
      task_description, labour_notes, task_notes, gate_stage
    FROM \`${ds}.lead_timeline\`
    WHERE opportunity_id = @opportunityId
    ORDER BY interaction_datetime ASC
  `, { opportunityId })

  if (rows.length === 0) return { touches: [], job_description: null, labour_notes: null, task_notes: null, gate_stage: null }

  // Job content + gate are per-opp (same on every row) — take from first row
  const job_description = rows[0].task_description
  const labour_notes = rows[0].labour_notes
  const task_notes = rows[0].task_notes
  const gate_stage = rows[0].gate_stage

  // Map touches: use materialised full_content, infer content_source from touch_source
  const touches: EnrichedTouch[] = rows.map(r => ({
    interaction_id: r.interaction_id,
    lead_id: r.lead_id,
    interaction_type: r.interaction_type,
    interaction_datetime: r.interaction_datetime,
    interaction_date: r.interaction_date,
    interaction_time: r.interaction_time,
    interaction_operator: r.interaction_operator,
    interaction_duration_seconds: r.interaction_duration_seconds,
    interaction_summary: r.interaction_summary,
    call_id: r.call_id,
    called_did_label: r.called_did_label,
    body_source: r.body_source,
    touch_source: r.touch_source,
    full_content: r.full_content,
    content_source: inferContentSource(r.touch_source, r.body_source),
  }))

  // Fallback: runtime hydration for touches where full_content is NULL but a body
  // should exist (pre-April calls, edge cases). Only calls need this — SMS/OHQ/email/
  // form bodies are 100% materialised by Build A.
  const nullContentCalls = touches.filter(t =>
    !t.full_content && t.body_source === 'call' && t.call_id)
  if (nullContentCalls.length > 0) {
    const callIds = nullContentCalls.map(t => t.call_id!)
    const txRows = await queryFn<{ call_id: string; full_transcript: string | null }>(`
      SELECT rc.call_id,
        COALESCE(ale.call_transcription, ct.full_transcript) AS full_transcript
      FROM \`${ds}.raw_calls\` rc
      LEFT JOIN \`${ds}.call_transcripts\` ct ON rc.call_id = ct.call_id
      LEFT JOIN \`${ds}.vw_leads_unified\` lu ON rc.call_id = lu.lead_id AND lu.wc_lead_id IS NOT NULL
      LEFT JOIN \`pttr-taskdata.gd_WhatConverts.all_leads_enriched\` ale ON lu.wc_lead_id = ale.lead_id
      WHERE rc.call_id IN UNNEST(@callIds)
    `, { callIds }, { callIds: ['STRING'] })
    const txMap = new Map(txRows.map(r => [r.call_id, r.full_transcript]))

    for (const touch of touches) {
      if (!touch.full_content && touch.body_source === 'call' && touch.call_id) {
        const tx = txMap.get(touch.call_id)
        if (tx) { touch.full_content = tx; touch.content_source = 'transcript' }
      }
    }
  }

  return { touches, job_description, labour_notes, task_notes, gate_stage }
}

function inferContentSource(touchSource: string | null, bodySource: string | null): string | null {
  if (!touchSource && !bodySource) return null
  const ts = touchSource || bodySource || ''
  if (ts.includes('phone_call') || ts === 'call') return 'transcript'
  if (ts.includes('wc_interaction') || ts === 'wc_call') return 'transcript'
  if (ts.includes('wc_form') || ts === 'wc_form') return 'form'
  if (ts.includes('email_form')) return 'form'
  if (ts.includes('sms')) return 'sms'
  if (ts.includes('ohq')) return 'ohq'
  if (ts.includes('task_email')) return 'email'
  if (ts.includes('outlook') || ts === 'email_received' || ts === 'email_sent') return 'email'
  if (ts.includes('email_thread')) return 'email'
  return 'email'
}

/**
 * Fetch structured facts for an opportunity (the objective fields the classifier sees).
 * Includes job identity (client_name, address, contact) for T7 corroboration.
 */
export async function fetchFacts(
  queryFn: QueryFn, opportunityId: string, opts?: { dataset?: string }
): Promise<StructuredFacts | null> {
  const ds = opts?.dataset || DEFAULT_DS
  const [row] = await queryFn<Record<string, unknown>>(`
    SELECT le.lead_type, le.channel, le.source, le.service,
      le.answered, le.captured, le.is_after_hours, le.booking_status,
      le.completed, le.job_count, le.is_existing_customer,
      le.contact_name, le.phone, le.suburb,
      tc.client_name,
      tc.address_suburb AS client_address,
      cd.contactname AS job_contact_name
    FROM \`${ds}.vw_lead_enriched\` le
    LEFT JOIN \`pttr-taskdata.ds_aroflo.tasks_complete\` tc
      ON le.jobnumber = tc.jobnumber
    LEFT JOIN \`pttr-taskdata.ds_aroflo.tasks_deduped\` td
      ON le.jobnumber = td.jobnumber
    LEFT JOIN \`pttr-taskdata.ds_aroflo.contacts_deduped\` cd
      ON td.contact_userid = cd.userid
      AND td.contact_userid IS NOT NULL AND td.contact_userid != ''
    WHERE le.opportunity_id = @opportunityId
  `, { opportunityId })
  if (!row) return null
  return row as unknown as StructuredFacts
}

/**
 * @deprecated Use assembleTouchesFromTimeline instead. This function has:
 *   - Reversed transcript priority (8x8 first, should be WC first)
 *   - Form Submission skip bug (line 247 filter excludes forms entirely)
 *   - No materialised content (re-derives from source tables)
 * Kept for backward compatibility — do not use in new code.
 */
export async function enrichTouches(
  queryFn: QueryFn, rows: InteractionRow[], anchors: Anchors, opts?: { dataset?: string }
): Promise<EnrichedTouch[]> {
  const ds = opts?.dataset || DEFAULT_DS

  // Start with base rows (full_content = null)
  const enriched: EnrichedTouch[] = rows.map(r => ({ ...r, full_content: null, content_source: null }))

  // ─── Call transcripts (8x8 first, then WC fallback via spine per-call mapping) ───
  const callIds = enriched.filter(r => r.call_id).map(r => r.call_id!)
  if (callIds.length > 0) {
    // 8x8 transcripts
    const txRows = await queryFn<{ call_id: string; full_transcript: string | null; duration_sec: number | null }>(`
      SELECT rc.call_id,
        ct.full_transcript,
        CASE WHEN rc.talk_time IS NOT NULL AND REGEXP_CONTAINS(rc.talk_time, r'^\\d{2}:\\d{2}:\\d{2}$')
          THEN CAST(SPLIT(rc.talk_time, ':')[OFFSET(0)] AS INT64) * 3600
             + CAST(SPLIT(rc.talk_time, ':')[OFFSET(1)] AS INT64) * 60
             + CAST(SPLIT(rc.talk_time, ':')[OFFSET(2)] AS INT64)
          ELSE NULL END AS duration_sec
      FROM \`${ds}.raw_calls\` rc
      LEFT JOIN \`${ds}.call_transcripts\` ct ON rc.call_id = ct.call_id
      WHERE rc.call_id IN UNNEST(@callIds)
    `, { callIds }, { callIds: ['STRING'] })

    const txMap = new Map(txRows.map(r => [r.call_id, r]))

    // WC transcripts via per-call spine mapping (the fix from this session)
    const wcTxRows = await queryFn<{ call_id: string; wc_transcript: string | null }>(`
      SELECT lu.lead_id AS call_id, ale.call_transcription AS wc_transcript
      FROM \`${ds}.vw_leads_unified\` lu
      JOIN \`pttr-taskdata.gd_WhatConverts.all_leads_enriched\` ale ON lu.wc_lead_id = ale.lead_id
      WHERE lu.lead_id IN UNNEST(@callIds) AND lu.wc_lead_id IS NOT NULL
        AND ale.call_transcription IS NOT NULL AND ale.call_transcription != ''
    `, { callIds }, { callIds: ['STRING'] })

    const wcTxMap = new Map(wcTxRows.map(r => [r.call_id, r.wc_transcript]))

    for (const touch of enriched) {
      if (!touch.call_id) continue
      const tx = txMap.get(touch.call_id)
      if (tx?.full_transcript) {
        touch.full_content = tx.full_transcript
        touch.content_source = '8x8'
        if (tx.duration_sec) touch.interaction_duration_seconds = tx.duration_sec
      } else {
        const wcTx = wcTxMap.get(touch.call_id)
        if (wcTx) { touch.full_content = wcTx; touch.content_source = 'whatconverts' }
      }
    }
  }

  // ─── Email/form/SMS/OHQ bodies (by message_id = interaction_id) ───
  const emailIds = enriched
    .filter(r => !r.call_id && r.interaction_id && r.interaction_type !== 'Form Submission')
    .map(r => r.interaction_id!)

  if (emailIds.length > 0) {
    // Try raw_emails_received first
    const inboundRows = await queryFn<{ message_id: string; body: string }>(`
      SELECT message_id, COALESCE(body_preview, body_text) AS body
      FROM \`${ds}.raw_emails_received\`
      WHERE message_id IN UNNEST(@ids)
    `, { ids: emailIds }, { ids: ['STRING'] })
    const inboundMap = new Map(inboundRows.map(r => [r.message_id, r.body]))

    // Then raw_emails_sent for outbound
    const unmatchedIds = emailIds.filter(id => !inboundMap.has(id))
    const outboundMap = new Map<string, string>()
    if (unmatchedIds.length > 0) {
      const outboundRows = await queryFn<{ message_id: string; body: string }>(`
        SELECT message_id, COALESCE(body_preview, body_text) AS body
        FROM \`${ds}.raw_emails_sent\`
        WHERE message_id IN UNNEST(@ids)
      `, { ids: unmatchedIds }, { ids: ['STRING'] })
      for (const r of outboundRows) outboundMap.set(r.message_id, r.body)
    }

    for (const touch of enriched) {
      if (touch.full_content || touch.call_id || !touch.interaction_id) continue
      const body = inboundMap.get(touch.interaction_id) || outboundMap.get(touch.interaction_id)
      if (body) {
        touch.full_content = body
        const t = (touch.interaction_type || '').toLowerCase()
        touch.content_source = t.includes('sms') ? 'sms' : t.includes('ohq') || t.includes('answering') ? 'ohq' : 'email'
      }
    }
  }

  // ─── Job description + notes (by anchors.allJobnumbers) ───
  // These attach to the ClassifierInput, not individual touches — handled in buildClassifierInput

  return enriched
}

/**
 * @deprecated Use assembleTouchesFromTimeline instead, which reads job content
 * directly from lead_timeline (ALL notes, no LIMIT). This function truncates:
 *   - Labour notes: LIMIT 1 (only latest note)
 *   - Task notes: LIMIT 5 (only 5 most recent)
 * Kept for backward compatibility — do not use in new code.
 */
export async function fetchJobContent(
  queryFn: QueryFn, anchors: Anchors, opts?: { dataset?: string }
): Promise<{ job_description: string | null; labour_note: string | null; task_notes: string | null }> {
  const ds = opts?.dataset || DEFAULT_DS
  if (!anchors.allJobnumbers || anchors.allJobnumbers.trim() === '') {
    return { job_description: null, labour_note: null, task_notes: null }
  }

  const jobRows = await queryFn<{ job_description: string | null; labour_note: string | null; task_notes: string | null }>(`
    SELECT
      STRING_AGG(DISTINCT td.description, '\\n---\\n') AS job_description,
      STRING_AGG(DISTINCT ln.labour_note, '\\n---\\n') AS labour_note,
      STRING_AGG(DISTINCT tn.task_notes, '\\n---\\n') AS task_notes
    FROM UNNEST(SPLIT(@jns, ',')) AS jn
    JOIN \`pttr-taskdata.ds_aroflo.tasks_deduped\` td ON TRIM(jn) = CAST(td.jobnumber AS STRING)
    LEFT JOIN (
      SELECT task_jobnumber AS jobnumber,
        ARRAY_AGG(note ORDER BY workdate DESC LIMIT 1)[OFFSET(0)] AS labour_note
      FROM (SELECT task_jobnumber, note, workdate,
          ROW_NUMBER() OVER (PARTITION BY task_jobnumber, lineid ORDER BY workdate DESC) AS rn
        FROM \`pttr-taskdata.ds_aroflo.tasklabours_raw\`
        WHERE note IS NOT NULL AND TRIM(note) != '' AND (deleted IS NULL OR deleted != 'true')
      ) WHERE rn = 1 GROUP BY task_jobnumber
    ) ln ON TRIM(jn) = ln.jobnumber
    LEFT JOIN (
      SELECT jobnumber,
        STRING_AGG(CONCAT(COALESCE(dateposted, ''), ': ', COALESCE(note_clean, '')), '\\n' ORDER BY dateposted DESC LIMIT 5) AS task_notes
      FROM \`pttr-taskdata.ds_aroflo.task_notes_deduped\` GROUP BY jobnumber
    ) tn ON TRIM(jn) = tn.jobnumber
  `, { jns: anchors.allJobnumbers })

  return jobRows[0] || { job_description: null, labour_note: null, task_notes: null }
}

/**
 * Build the full classifier input from the materialised lead_timeline.
 * Single function: reads touches + job content + gate from lead_timeline,
 * facts from vw_lead_enriched + AroFlo (with job identity).
 * No dependency on enrichTouches or fetchJobContent.
 */
export async function buildClassifierInputFromTimeline(
  queryFn: QueryFn, opportunityId: string, opts?: { dataset?: string }
): Promise<{ input: ClassifierInput; gate_stage: string | null } | null> {
  const [facts, timeline] = await Promise.all([
    fetchFacts(queryFn, opportunityId, opts),
    assembleTouchesFromTimeline(queryFn, opportunityId, opts),
  ])
  if (!facts) return null

  return {
    input: {
      facts,
      touches: timeline.touches,
      job_description: timeline.job_description,
      labour_note: timeline.labour_notes,
      task_notes: timeline.task_notes,
    },
    gate_stage: timeline.gate_stage,
  }
}

/**
 * @deprecated Use buildClassifierInputFromTimeline instead.
 * This function uses enrichTouches (wrong priority) + fetchJobContent (truncated).
 */
export async function buildClassifierInput(
  queryFn: QueryFn, opportunityId: string, touches: EnrichedTouch[], anchors: Anchors,
  opts?: { dataset?: string }
): Promise<ClassifierInput | null> {
  const facts = await fetchFacts(queryFn, opportunityId, opts)
  if (!facts) return null

  const jobContent = await fetchJobContent(queryFn, anchors, opts)

  const sorted = [...touches].sort((a, b) =>
    (a.interaction_datetime || '').localeCompare(b.interaction_datetime || ''))

  return {
    facts,
    touches: sorted,
    ...jobContent,
  }
}

/**
 * Format ClassifierInput into the prompt text string for the model.
 * Caps per-source content to stay within token budget.
 * Never drops the latest touch (it often holds the outcome).
 */
export function formatClassifierPrompt(input: ClassifierInput, opts?: {
  transcriptCap?: number; formCap?: number; emailCap?: number; jobDescCap?: number
}): string {
  const tcap = opts?.transcriptCap ?? 4000
  const fcap = opts?.formCap ?? 2000
  const ecap = opts?.emailCap ?? 1500
  const jcap = opts?.jobDescCap ?? 1500

  const parts: string[] = []

  // ─── Objective facts ───
  parts.push('OBJECTIVE FACTS:')
  parts.push(`- Lead type: ${input.facts.lead_type}, Channel: ${input.facts.channel}, Source: ${input.facts.source}`)
  parts.push(`- Service: ${input.facts.service}`)
  parts.push(`- Answered: ${input.facts.answered}, Captured (>=20s): ${input.facts.captured}`)
  parts.push(`- After hours: ${input.facts.is_after_hours}`)
  parts.push(`- Booking status: ${input.facts.booking_status}, Completed: ${input.facts.completed}, Job count: ${input.facts.job_count}`)
  parts.push(`- Existing customer: ${input.facts.is_existing_customer}`)
  if (input.facts.contact_name) parts.push(`- Contact: ${input.facts.contact_name}`)
  if (input.facts.suburb) parts.push(`- Suburb: ${input.facts.suburb}`)
  if (input.facts.client_name) parts.push(`- Client (AroFlo): ${input.facts.client_name}`)
  if (input.facts.client_address) parts.push(`- Client suburb: ${input.facts.client_address}`)
  if (input.facts.job_contact_name) parts.push(`- Job contact: ${input.facts.job_contact_name}`)

  // ─── Interaction timeline (chronological, all touches) ───
  if (input.touches.length > 0) {
    parts.push(`\nINTERACTION TIMELINE (${input.touches.length} touches, chronological):`)
    let transcriptBudget = tcap
    let formBudget = fcap
    let emailBudget = ecap

    for (const touch of input.touches) {
      const ts = touch.interaction_datetime || '?'
      const type = touch.interaction_type || 'Unknown'
      const op = touch.interaction_operator ? ` | ${touch.interaction_operator}` : ''
      const dur = touch.interaction_duration_seconds ? ` | ${Math.floor(touch.interaction_duration_seconds / 60)}m${touch.interaction_duration_seconds % 60}s` : ''
      const did = touch.called_did_label ? ` | DID: ${touch.called_did_label}` : ''

      const header = `[${ts}] ${type}${op}${dur}${did}`

      if (touch.full_content && touch.content_source) {
        let content = touch.full_content
        let budget: number

        if (touch.content_source === '8x8' || touch.content_source === 'whatconverts' || touch.content_source === 'transcript') {
          budget = transcriptBudget
          if (content.length > budget) content = content.slice(0, budget) + '...[truncated]'
          transcriptBudget -= Math.min(content.length, budget)
        } else if (touch.content_source === 'sms' || touch.content_source === 'email') {
          budget = emailBudget
          if (content.length > budget) content = content.slice(0, budget) + '...[truncated]'
          emailBudget -= Math.min(content.length, budget)
        } else {
          budget = formBudget
          if (content.length > budget) content = content.slice(0, budget) + '...[truncated]'
          formBudget -= Math.min(content.length, budget)
        }
        parts.push(`\n${header}`)
        parts.push(content)
      } else {
        // No-transcript touch: emit metadata only (not absence — the recording may not exist)
        parts.push(`${header} (no transcript available)`)
      }
    }
  }

  // ─── Job-side content ───
  if (input.job_description) {
    parts.push('\nJOB DESCRIPTION:')
    parts.push(input.job_description.length > jcap
      ? input.job_description.slice(0, jcap) + '...[truncated]'
      : input.job_description)
  }
  if (input.labour_note) {
    parts.push('\nTECH LABOUR NOTE:')
    parts.push(input.labour_note.slice(0, 3000))
  }
  if (input.task_notes) {
    parts.push('\nTASK NOTES:')
    parts.push(input.task_notes.slice(0, 3000))
  }

  return parts.join('\n')
}
