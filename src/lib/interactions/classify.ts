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
}

export interface StructuredFacts {
  lead_type: string; channel: string; source: string; service: string
  answered: boolean | null; captured: boolean | null; is_after_hours: boolean
  booking_status: string; completed: boolean | null; job_count: number
  is_existing_customer: boolean; contact_name: string | null
  phone: string | null; suburb: string | null
}

export interface ClassifierInput {
  facts: StructuredFacts
  touches: EnrichedTouch[]       // chronological (oldest first)
  job_description: string | null
  labour_note: string | null
  task_notes: string | null
}

/**
 * Read touches from the materialised lead_timeline table and hydrate full bodies.
 * This is the classifier's input path — reads the SAME data the UI shows.
 * Replaces the old enrichTouches() which excluded Form Submissions (line 106 bug).
 */
export async function assembleTouchesFromTimeline(
  queryFn: QueryFn, opportunityId: string, opts?: { dataset?: string }
): Promise<EnrichedTouch[]> {
  const ds = opts?.dataset || DEFAULT_DS

  // Read touch metadata + summaries from lead_timeline
  const rows = await queryFn<{
    interaction_id: string | null; lead_id: number | null
    interaction_type: string; interaction_datetime: string
    interaction_date: string; interaction_time: string
    interaction_operator: string | null; interaction_duration_seconds: number | null
    interaction_summary: string | null; call_id: string | null
    called_did_label: string | null; body_source: string | null; body_id: string | null
  }>(`
    SELECT interaction_id, lead_id, interaction_type, interaction_datetime,
      interaction_date, interaction_time, interaction_operator,
      interaction_duration_seconds, interaction_summary, call_id,
      called_did_label, body_source, body_id
    FROM \`${ds}.lead_timeline\`
    WHERE opportunity_id = @opportunityId
    ORDER BY interaction_datetime ASC
  `, { opportunityId })

  if (rows.length === 0) return []

  // Hydrate full bodies from source tables
  const enriched: EnrichedTouch[] = rows.map(r => ({
    ...r,
    full_content: null,
    content_source: null,
  }))

  // ─── Calls: fetch transcripts (8x8 first, then WC fallback) ───
  const callIds = enriched.filter(r => r.body_source === 'call' && r.body_id).map(r => r.body_id!)
  if (callIds.length > 0) {
    const txRows = await queryFn<{ call_id: string; full_transcript: string | null }>(`
      SELECT rc.call_id, COALESCE(ct.full_transcript, ale.call_transcription) AS full_transcript
      FROM \`${ds}.raw_calls\` rc
      LEFT JOIN \`${ds}.call_transcripts\` ct ON rc.call_id = ct.call_id
      LEFT JOIN \`${ds}.vw_leads_unified\` lu ON rc.call_id = lu.lead_id AND lu.wc_lead_id IS NOT NULL
      LEFT JOIN \`pttr-taskdata.gd_WhatConverts.all_leads_enriched\` ale ON lu.wc_lead_id = ale.lead_id
      WHERE rc.call_id IN UNNEST(@callIds)
    `, { callIds }, { callIds: ['STRING'] })
    const txMap = new Map(txRows.map(r => [r.call_id, r.full_transcript]))

    for (const touch of enriched) {
      if (touch.body_source === 'call' && touch.body_id) {
        const tx = txMap.get(touch.body_id)
        if (tx) { touch.full_content = tx; touch.content_source = '8x8' }
      }
    }
  }

  // ─── WC calls (Third Stream seeded, no 8x8 CDR): fetch from all_leads_enriched ───
  const wcCallIds = enriched.filter(r => r.body_source === 'wc_call' && r.body_id).map(r => r.body_id!)
  if (wcCallIds.length > 0) {
    const wcRows = await queryFn<{ lead_id: string; call_transcription: string | null }>(`
      SELECT CAST(lead_id AS STRING) AS lead_id, call_transcription
      FROM \`pttr-taskdata.gd_WhatConverts.all_leads_enriched\`
      WHERE CAST(lead_id AS STRING) IN UNNEST(@ids)
        AND call_transcription IS NOT NULL AND call_transcription != ''
    `, { ids: wcCallIds }, { ids: ['STRING'] })
    const wcMap = new Map(wcRows.map(r => [r.lead_id, r.call_transcription]))

    for (const touch of enriched) {
      if (touch.body_source === 'wc_call' && touch.body_id) {
        const tx = wcMap.get(touch.body_id)
        if (tx) { touch.full_content = tx; touch.content_source = 'whatconverts' }
      }
    }
  }

  // ─── WC forms: full additional_fields_json parsed content ───
  const wcFormIds = enriched.filter(r => r.body_source === 'wc_form' && r.body_id).map(r => r.body_id!)
  if (wcFormIds.length > 0) {
    // The lead_timeline interaction_summary already has the parsed form content (≤300 chars).
    // For the classifier, use that as full_content — it's the parsed fields, not a truncation
    // of a longer body. The form's "body" IS the structured fields.
    for (const touch of enriched) {
      if (touch.body_source === 'wc_form' && touch.interaction_summary) {
        touch.full_content = touch.interaction_summary
        touch.content_source = 'form'
      }
    }
  }

  // ─── Email bodies (inbound/outbound/sent): fetch from raw_emails ───
  const emailReceivedIds = enriched
    .filter(r => r.body_source === 'email_received' && r.body_id && !r.full_content)
    .map(r => r.body_id!)
  if (emailReceivedIds.length > 0) {
    const emailRows = await queryFn<{ message_id: string; body: string }>(`
      SELECT message_id, COALESCE(body_preview, body_text) AS body
      FROM \`${ds}.raw_emails_received\`
      WHERE message_id IN UNNEST(@ids)
    `, { ids: emailReceivedIds }, { ids: ['STRING'] })
    const emailMap = new Map(emailRows.map(r => [r.message_id, r.body]))

    for (const touch of enriched) {
      if (touch.body_source === 'email_received' && touch.body_id && !touch.full_content) {
        const body = emailMap.get(touch.body_id)
        if (body) {
          touch.full_content = body
          const t = (touch.interaction_type || '').toLowerCase()
          touch.content_source = t.includes('sms') ? 'sms' : t.includes('ohq') || t.includes('answering') ? 'ohq' : 'email'
        }
      }
    }
  }

  const emailSentIds = enriched
    .filter(r => r.body_source === 'email_sent' && r.body_id && !r.full_content)
    .map(r => r.body_id!)
  if (emailSentIds.length > 0) {
    const sentRows = await queryFn<{ message_id: string; body: string }>(`
      SELECT message_id, COALESCE(body_preview, body_text) AS body
      FROM \`${ds}.raw_emails_sent\`
      WHERE message_id IN UNNEST(@ids)
    `, { ids: emailSentIds }, { ids: ['STRING'] })
    const sentMap = new Map(sentRows.map(r => [r.message_id, r.body]))

    for (const touch of enriched) {
      if (touch.body_source === 'email_sent' && touch.body_id && !touch.full_content) {
        const body = sentMap.get(touch.body_id)
        if (body) { touch.full_content = body; touch.content_source = 'email' }
      }
    }
  }

  return enriched
}

/**
 * Fetch structured facts for an opportunity (the objective fields the classifier sees).
 */
export async function fetchFacts(
  queryFn: QueryFn, opportunityId: string, opts?: { dataset?: string }
): Promise<StructuredFacts | null> {
  const ds = opts?.dataset || DEFAULT_DS
  const [row] = await queryFn<Record<string, unknown>>(`
    SELECT le.lead_type, le.channel, le.source, le.service,
      le.answered, le.captured, le.is_after_hours, le.booking_status,
      le.completed, le.job_count, le.is_existing_customer,
      le.contact_name, le.phone, le.suburb
    FROM \`${ds}.vw_lead_enriched\` le
    WHERE le.opportunity_id = @opportunityId
  `, { opportunityId })
  if (!row) return null
  return row as unknown as StructuredFacts
}

/**
 * Enrich interaction rows with full content (transcripts, email bodies, etc.).
 * Batch-fetches by call_id (transcripts) and interaction_id (emails/forms).
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
 * Fetch job-side content (description, labour note, task notes) for the opp's jobs.
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
 * Build the full classifier input: structured facts + enriched touches + job content.
 */
export async function buildClassifierInput(
  queryFn: QueryFn, opportunityId: string, touches: EnrichedTouch[], anchors: Anchors,
  opts?: { dataset?: string }
): Promise<ClassifierInput | null> {
  const facts = await fetchFacts(queryFn, opportunityId, opts)
  if (!facts) return null

  const jobContent = await fetchJobContent(queryFn, anchors, opts)

  // Sort touches chronologically (oldest first) for the prompt
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

        if (touch.content_source === '8x8' || touch.content_source === 'whatconverts') {
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
    parts.push(input.labour_note.slice(0, 1000))
  }
  if (input.task_notes) {
    parts.push('\nTASK NOTES:')
    parts.push(input.task_notes.slice(0, 1000))
  }

  return parts.join('\n')
}
