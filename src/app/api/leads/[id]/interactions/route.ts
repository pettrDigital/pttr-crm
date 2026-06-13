import { NextRequest } from 'next/server'
import { verifyAuth } from '@/lib/auth/verify-token'
import { query } from '@/lib/bigquery/client'
import { adminDb } from '@/lib/firebase/admin'

const DS = 'pttr-taskdata.ds_crm'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const { id: opportunityId } = await params

  try {
    // Resolve the opportunity's contact points
    const [opp] = await query(`
      SELECT matched_phones, matched_emails, wc_lead_id, opportunity_timestamp,
        -- wc_leads array not yet deployed to opportunities table; use scalar wc_lead_id
        CASE WHEN wc_lead_id IS NOT NULL THEN [wc_lead_id] ELSE [] END AS all_wc_lead_ids,
        all_jobnumbers
      FROM \`${DS}.opportunities\`
      WHERE opportunity_id = @opportunityId
    `, { opportunityId })

    if (!opp) return Response.json([])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oppData = opp as any
    const phones = (oppData.matched_phones as string || '').split(',').map((p: string) => p.trim()).filter(Boolean)
    const emails = (oppData.matched_emails as string || '').split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)

    // Collect all WC lead IDs and job numbers from BQ + Firestore
    const wcLeadIds: number[] = [...(oppData.all_wc_lead_ids || [])].filter(Boolean)
    let allJobnumbers = oppData.all_jobnumbers as string || ''
    try {
      const overrideDoc = await adminDb.collection('crm_lead_overrides').doc(opportunityId).get()
      if (overrideDoc.exists) {
        const data = overrideDoc.data()!
        const manualWc = data.manual_wc_lead_id
        if (manualWc != null && !wcLeadIds.includes(manualWc)) wcLeadIds.push(manualWc)
        // Add Firestore-linked job numbers (manual link + sms_jn_tier linked_jobs)
        const extraJns = [data.manual_job_number as string, ...(data.linked_jobs as string[] || [])].filter(Boolean)
        if (extraJns.length > 0) {
          const existing = new Set(allJobnumbers.split(',').map(s => s.trim()).filter(Boolean))
          for (const jn of extraJns) existing.add(jn)
          allJobnumbers = [...existing].join(',')
        }
      }
    } catch {} // non-fatal

    // Primary WC lead for backward-compatible single-value usage
    const wc_lead_id = wcLeadIds.length > 0 ? wcLeadIds[0] : oppData.wc_lead_id

    // Eight-source interaction query:
    // 1. WC lead_interactions by wc_lead_id
    // 2. raw_calls by matched_phones
    // 3. email reply threads (RE:/FW: on form conversations)
    // 4. form submissions (WC + email-parsed)
    // 5. OfficeHQ answering-service emails
    // 6. MessageMedia SMS threads (phone/JN matched)
    // 7. AroFlo task emails (JN matched)
    // 8. General Outlook correspondence (Path A: email match, B: JN anchor, C: subject thread)
    // UNION and dedupe
    const rows = await query(`
      WITH
      -- Source 1: WC-linked interactions via lead_interactions
      wc_interactions AS (
        SELECT
          li.call_id AS interaction_id,
          li.lead_id,
          CASE
            WHEN li.contact_type = 'Phone' AND li.direction = 'inbound' THEN 'Inbound Call'
            WHEN li.contact_type = 'Phone' AND li.direction = 'outbound' THEN 'Outbound Call'
            WHEN li.contact_type = 'Phone' THEN 'Inbound Call'
            WHEN li.direction = 'inbound' THEN 'Inbound Email'
            WHEN li.direction = 'outbound' THEN 'Outbound Email'
            ELSE li.contact_type
          END AS interaction_type,
          li.contact_datetime_sydney AS interaction_datetime,
          DATE(li.contact_datetime_sydney) AS interaction_date,
          FORMAT_DATETIME('%H:%M', li.contact_datetime_sydney) AS interaction_time,
          COALESCE(
            agent.callee_name,
            CASE WHEN li.operator_name NOT LIKE '%->%' THEN li.operator_name END,
            rc.callee_name
          ) AS interaction_operator,
          CASE
            WHEN rc.talk_time IS NOT NULL AND REGEXP_CONTAINS(rc.talk_time, r'^\\d{2}:\\d{2}:\\d{2}$')
            THEN CAST(SPLIT(rc.talk_time, ':')[OFFSET(0)] AS INT64) * 3600
               + CAST(SPLIT(rc.talk_time, ':')[OFFSET(1)] AS INT64) * 60
               + CAST(SPLIT(rc.talk_time, ':')[OFFSET(2)] AS INT64)
            ELSE NULL
          END AS interaction_duration_seconds,
          LEFT(COALESCE(li.contact_subject, li.contact_content, ''), 120) AS interaction_summary,
          li.call_id,
          did.label AS called_did_label
        FROM \`${DS}.lead_interactions\` li
        LEFT JOIN \`${DS}.raw_calls\` rc ON li.call_id = rc.call_id
        LEFT JOIN \`${DS}.lkp_did_trade\` did ON rc.callee = did.did
        LEFT JOIN (
          SELECT parent_call_id, callee_name,
            ROW_NUMBER() OVER (PARTITION BY parent_call_id
              ORDER BY TIMESTAMP_DIFF(disconnected_time, start_time, SECOND) DESC) AS rn
          FROM \`${DS}.raw_call_legs\`
          WHERE answered = 'Answered' AND direction = 'Internal'
            AND parent_call_id IS NOT NULL
            AND callee NOT LIKE 'CallForking%' AND callee NOT LIKE 'RingGroup%'
            AND REGEXP_CONTAINS(callee_name, r'^[A-Z][a-z]+ [A-Z][a-z]+$')
            AND callee_name NOT IN ('Mr Washer Generic', 'Mr Washer Temp', 'Plumber Rescue')
        ) agent ON rc.call_id = agent.parent_call_id AND agent.rn = 1
        WHERE li.lead_id IN UNNEST(@wcLeadIds) AND ARRAY_LENGTH(@wcLeadIds) > 0
          -- Window to the opportunity's cluster span (±5s before, +30 days after)
          -- to exclude historical contact-level noise from WC's cross-lead linking
          AND CAST(li.contact_datetime_sydney AS TIMESTAMP) BETWEEN
            TIMESTAMP_SUB(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 300 SECOND)
            AND TIMESTAMP_ADD(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 2592000 SECOND)
      ),
      -- Source 2: raw_calls by matched_phones (catches direct/untracked)
      phone_calls AS (
        SELECT
          rc.call_id AS interaction_id,
          CAST(NULL AS INT64) AS lead_id,
          CASE rc.direction
            WHEN 'Incoming' THEN 'Inbound Call'
            WHEN 'Outgoing' THEN 'Outbound Call'
            ELSE 'Call'
          END AS interaction_type,
          DATETIME(rc.start_time, 'Australia/Sydney') AS interaction_datetime,
          DATE(DATETIME(rc.start_time, 'Australia/Sydney')) AS interaction_date,
          FORMAT_DATETIME('%H:%M', DATETIME(rc.start_time, 'Australia/Sydney')) AS interaction_time,
          COALESCE(
            agent.callee_name,
            rec.operator_name,
            CASE WHEN REGEXP_CONTAINS(COALESCE(rc.callee_name, ''), r'^[A-Z][a-z]+ [A-Z][a-z]+$')
              AND rc.callee_name NOT IN ('Mr Washer Generic', 'Mr Washer Temp', 'Plumber Rescue',
                'Strata Account', 'Plumbing Rescue', 'Electrician Rescue')
              THEN rc.callee_name END
          ) AS interaction_operator,
          CASE
            WHEN rc.talk_time IS NOT NULL AND REGEXP_CONTAINS(rc.talk_time, r'^\\d{2}:\\d{2}:\\d{2}$')
            THEN CAST(SPLIT(rc.talk_time, ':')[OFFSET(0)] AS INT64) * 3600
               + CAST(SPLIT(rc.talk_time, ':')[OFFSET(1)] AS INT64) * 60
               + CAST(SPLIT(rc.talk_time, ':')[OFFSET(2)] AS INT64)
            ELSE NULL
          END AS interaction_duration_seconds,
          CAST(NULL AS STRING) AS interaction_summary,
          rc.call_id,
          did.label AS called_did_label
        FROM \`${DS}.raw_calls\` rc
        LEFT JOIN \`${DS}.lkp_did_trade\` did ON rc.callee = did.did
        LEFT JOIN (
          SELECT parent_call_id, callee_name,
            ROW_NUMBER() OVER (PARTITION BY parent_call_id
              ORDER BY TIMESTAMP_DIFF(disconnected_time, start_time, SECOND) DESC) AS rn
          FROM \`${DS}.raw_call_legs\`
          WHERE answered = 'Answered' AND direction = 'Internal'
            AND parent_call_id IS NOT NULL
            AND callee NOT LIKE 'CallForking%' AND callee NOT LIKE 'RingGroup%'
            AND REGEXP_CONTAINS(callee_name, r'^[A-Z][a-z]+ [A-Z][a-z]+$')
            AND callee_name NOT IN ('Mr Washer Generic', 'Mr Washer Temp', 'Plumber Rescue')
        ) agent ON rc.call_id = agent.parent_call_id AND agent.rn = 1
        LEFT JOIN (
          SELECT call_id, ARRAY_AGG(operator_name ORDER BY operator_name LIMIT 1)[OFFSET(0)] AS operator_name
          FROM \`${DS}.raw_recordings\`
          WHERE operator_name IS NOT NULL AND operator_name != ''
          GROUP BY call_id
        ) rec ON rc.call_id = rec.call_id
        WHERE (rc.norm_caller_phone IN UNNEST(@phones) OR rc.norm_callee_phone IN UNNEST(@phones))
          AND rc.start_time BETWEEN
            TIMESTAMP_SUB(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 300 SECOND)
            AND TIMESTAMP_ADD(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 2592000 SECOND)
      ),
      -- Source 3: email reply threads (RE:/FW: on form conversations + OHQ threads)
      -- Two paths: (a) conversation_id match from form emails, (b) phone-in-subject
      -- match for forwarded OHQ pager threads (Gmail forwards break conversation_id)
      email_thread_replies AS (
        SELECT
          reply.message_id AS interaction_id,
          CAST(NULL AS INT64) AS lead_id,
          CASE
            WHEN reply.from_email LIKE '%@mrwasher%' OR reply.from_email LIKE '%plumber%' OR reply.from_email LIKE '%electrician%'
              THEN 'Outbound Email'
            ELSE 'Inbound Email'
          END AS interaction_type,
          DATETIME(reply.received_at, 'Australia/Sydney') AS interaction_datetime,
          DATE(DATETIME(reply.received_at, 'Australia/Sydney')) AS interaction_date,
          FORMAT_DATETIME('%H:%M', DATETIME(reply.received_at, 'Australia/Sydney')) AS interaction_time,
          reply.from_name AS interaction_operator,
          CAST(NULL AS INT64) AS interaction_duration_seconds,
          LEFT(COALESCE(reply.subject, reply.body_preview, ''), 120) AS interaction_summary,
          CAST(NULL AS STRING) AS call_id,
          CAST(NULL AS STRING) AS called_did_label
        FROM \`${DS}.raw_emails_received\` reply
        WHERE (reply.subject LIKE 'RE:%' OR reply.subject LIKE 'Re:%'
          OR reply.subject LIKE 'FW:%' OR reply.subject LIKE 'Fw:%'
          OR reply.subject LIKE 'Fwd:%' OR reply.subject LIKE 'fwd:%')
          AND reply.received_at BETWEEN
            TIMESTAMP_SUB(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 300 SECOND)
            AND TIMESTAMP_ADD(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 2592000 SECOND)
          AND (
            -- (a) Conversation thread from email-parsed forms
            reply.conversation_id IN (
              SELECT DISTINCT orig.conversation_id
              FROM \`${DS}.vw_leads_unified\` lu
              JOIN \`${DS}.raw_emails_received\` orig ON CONCAT('email-', orig.message_id) = lu.lead_id
              WHERE lu.source_type = 'email'
                AND (lu.phone IN UNNEST(@phones) OR lu.phone IS NULL)
                AND lu.lead_timestamp BETWEEN
                  TIMESTAMP_SUB(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 300 SECOND)
                  AND TIMESTAMP_ADD(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 2592000 SECOND)
            )
            -- (b) Phone number in subject (catches forwarded OHQ/pager threads)
            OR EXISTS (
              SELECT 1 FROM UNNEST(@phones) AS p
              WHERE reply.subject LIKE CONCAT('%', REPLACE(p, '+61', '0'), '%')
                 OR REPLACE(reply.subject, ' ', '') LIKE CONCAT('%', REPLACE(p, '+61', '0'), '%')
            )
          )
      ),
      -- Source 4: form submissions as interactions (WC forms + email-parsed forms)
      form_submissions AS (
        -- WC form submission
        SELECT
          CONCAT('wc-form-', CAST(wc.lead_id AS STRING)) AS interaction_id,
          wc.lead_id AS lead_id,
          'Form Submission' AS interaction_type,
          DATETIME(wc.date_created, 'Australia/Sydney') AS interaction_datetime,
          DATE(DATETIME(wc.date_created, 'Australia/Sydney')) AS interaction_date,
          FORMAT_DATETIME('%H:%M', DATETIME(wc.date_created, 'Australia/Sydney')) AS interaction_time,
          'Website' AS interaction_operator,
          CAST(NULL AS INT64) AS interaction_duration_seconds,
          LEFT(COALESCE(wc.form_my_problem, ''), 120) AS interaction_summary,
          CAST(NULL AS STRING) AS call_id,
          CAST(NULL AS STRING) AS called_did_label
        FROM \`pttr-taskdata.gd_WhatConverts.all_leads_enriched\` wc
        WHERE wc.lead_id IN UNNEST(@wcLeadIds) AND ARRAY_LENGTH(@wcLeadIds) > 0
          AND wc.lead_type = 'Web Form'

        UNION ALL

        -- Email-parsed form submission (phone-matched)
        SELECT
          lu.lead_id AS interaction_id,
          CAST(NULL AS INT64) AS lead_id,
          'Form Submission' AS interaction_type,
          lu.lead_timestamp_sydney AS interaction_datetime,
          DATE(lu.lead_timestamp_sydney) AS interaction_date,
          FORMAT_DATETIME('%H:%M', lu.lead_timestamp_sydney) AS interaction_time,
          'Website' AS interaction_operator,
          CAST(NULL AS INT64) AS interaction_duration_seconds,
          LEFT(COALESCE(lu.form_problem, ''), 120) AS interaction_summary,
          CAST(NULL AS STRING) AS call_id,
          CAST(NULL AS STRING) AS called_did_label
        FROM \`${DS}.vw_leads_unified\` lu
        WHERE lu.source_type = 'email'
          AND lu.phone IN UNNEST(@phones)
          AND lu.lead_timestamp BETWEEN
            TIMESTAMP_SUB(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 300 SECOND)
            AND TIMESTAMP_ADD(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 2592000 SECOND)

        UNION ALL

        -- Email-parsed form submission (phoneless fallback — match by timestamp)
        -- For opportunities with no phone, the form IS the spine event.
        SELECT
          lu.lead_id AS interaction_id,
          CAST(NULL AS INT64) AS lead_id,
          'Form Submission' AS interaction_type,
          lu.lead_timestamp_sydney AS interaction_datetime,
          DATE(lu.lead_timestamp_sydney) AS interaction_date,
          FORMAT_DATETIME('%H:%M', lu.lead_timestamp_sydney) AS interaction_time,
          'Website' AS interaction_operator,
          CAST(NULL AS INT64) AS interaction_duration_seconds,
          LEFT(COALESCE(lu.form_problem, lu.contact_name, ''), 120) AS interaction_summary,
          CAST(NULL AS STRING) AS call_id,
          CAST(NULL AS STRING) AS called_did_label
        FROM \`${DS}.vw_leads_unified\` lu
        WHERE lu.source_type = 'email'
          AND ARRAY_LENGTH(@phones) = 0
          AND lu.phone IS NULL
          AND ABS(TIMESTAMP_DIFF(lu.lead_timestamp, CAST(@oppTimestamp AS TIMESTAMP), SECOND)) <= 5
      ),
      -- Source 5: OfficeHQ answering-service emails matched by phone + time window
      -- These carry customer name, phone, address, reason for call — critical for
      -- after-hours calls with no 8x8 recording/transcript.
      ohq_emails AS (
        SELECT
          e.message_id AS interaction_id,
          CAST(NULL AS INT64) AS lead_id,
          'Answering Service' AS interaction_type,
          DATETIME(e.received_at, 'Australia/Sydney') AS interaction_datetime,
          DATE(DATETIME(e.received_at, 'Australia/Sydney')) AS interaction_date,
          FORMAT_DATETIME('%H:%M', DATETIME(e.received_at, 'Australia/Sydney')) AS interaction_time,
          'OfficeHQ' AS interaction_operator,
          CAST(NULL AS INT64) AS interaction_duration_seconds,
          LEFT(e.body_preview, 120) AS interaction_summary,
          CAST(NULL AS STRING) AS call_id,
          CAST(NULL AS STRING) AS called_did_label
        FROM \`${DS}.raw_emails_received\` e
        WHERE LOWER(e.from_email) LIKE '%myreceptionist%'
          AND (
            -- Match E.164 format in Caller ID field
            EXISTS (SELECT 1 FROM UNNEST(@phones) AS p WHERE e.body_preview LIKE CONCAT('%', p, '%'))
            -- Match 0-prefix format (spaces stripped) in Phone field
            OR EXISTS (SELECT 1 FROM UNNEST(@phones) AS p WHERE REPLACE(e.body_preview, ' ', '') LIKE CONCAT('%', REPLACE(p, '+61', '0'), '%'))
          )
          AND TIMESTAMP(e.received_at) BETWEEN
            TIMESTAMP_SUB(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 60 SECOND)
            AND TIMESTAMP_ADD(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 2592000 SECOND)
      ),
      -- Source 6: MessageMedia SMS threads matched by phone or JN
      sms_threads AS (
        SELECT
          e.message_id AS interaction_id,
          CAST(NULL AS INT64) AS lead_id,
          CASE WHEN LOWER(e.subject) LIKE '%reply%' THEN 'SMS Reply' ELSE 'SMS' END AS interaction_type,
          DATETIME(e.received_at, 'Australia/Sydney') AS interaction_datetime,
          DATE(DATETIME(e.received_at, 'Australia/Sydney')) AS interaction_date,
          FORMAT_DATETIME('%H:%M', DATETIME(e.received_at, 'Australia/Sydney')) AS interaction_time,
          'MessageMedia' AS interaction_operator,
          CAST(NULL AS INT64) AS interaction_duration_seconds,
          LEFT(e.body_preview, 120) AS interaction_summary,
          CAST(NULL AS STRING) AS call_id,
          CAST(NULL AS STRING) AS called_did_label
        FROM \`${DS}.raw_emails_received\` e
        WHERE (LOWER(e.from_email) LIKE '%message-media%' OR LOWER(e.from_email) LIKE '%messagemedia%')
          AND (
            EXISTS (SELECT 1 FROM UNNEST(@phones) AS p WHERE e.subject LIKE CONCAT('%', SUBSTR(p, 2), '%'))
            OR EXISTS (SELECT 1 FROM UNNEST(SPLIT(COALESCE(@allJobnumbers, ''), ',')) AS jn
              WHERE TRIM(jn) != '' AND e.body_text LIKE CONCAT('%JN', TRIM(jn), '%'))
          )
          AND TIMESTAMP(e.received_at) BETWEEN
            TIMESTAMP_SUB(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 300 SECOND)
            AND TIMESTAMP_ADD(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 2592000 SECOND)
      ),
      -- Source 7: AroFlo task emails (forwarded to mrwasher_task+xxx@inboundemail.aroflo.com)
      task_emails AS (
        SELECT
          e.message_id AS interaction_id,
          CAST(NULL AS INT64) AS lead_id,
          'Task Email' AS interaction_type,
          DATETIME(e.received_at, 'Australia/Sydney') AS interaction_datetime,
          DATE(DATETIME(e.received_at, 'Australia/Sydney')) AS interaction_date,
          FORMAT_DATETIME('%H:%M', DATETIME(e.received_at, 'Australia/Sydney')) AS interaction_time,
          e.from_name AS interaction_operator,
          CAST(NULL AS INT64) AS interaction_duration_seconds,
          LEFT(COALESCE(e.subject, e.body_preview, ''), 120) AS interaction_summary,
          CAST(NULL AS STRING) AS call_id,
          CAST(NULL AS STRING) AS called_did_label
        FROM \`${DS}.raw_emails_sent\` e
        WHERE LOWER(e.to_email) LIKE '%aroflo%'
          AND EXISTS (SELECT 1 FROM UNNEST(SPLIT(COALESCE(@allJobnumbers, ''), ',')) AS jn
            WHERE TRIM(jn) != '' AND (e.subject LIKE CONCAT('%', TRIM(jn), '%')
              OR e.body_text LIKE CONCAT('%', TRIM(jn), '%')))
          AND TIMESTAMP(e.received_at) BETWEEN
            TIMESTAMP_SUB(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 300 SECOND)
            AND TIMESTAMP_ADD(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 2592000 SECOND)
      ),
      -- Source 8: General Outlook correspondence (3 link paths, tagged)
      -- Excludes already-categorized senders: message-media (SMS), myreceptionist (OHQ),
      -- aroflo forwards (task email), WC/Quinn form senders, noreply@message-media.com
      -- Generic-subject stop-list for Path C to prevent cross-customer merging.
      outlook_emails AS (
        WITH
        -- Sender exclusion: already rendered by Sources 3/5/6/7
        excluded_senders AS (
          SELECT sender FROM UNNEST([
            'message-media', 'messagemedia', 'myreceptionist', 'inboundemail.aroflo',
            'noreply@message-media.com', 'noreply@messagemedia.com',
            'noreply@myreceptionist.com.au', 'vodafone@myreceptionist.com.au',
            'leads@resend.quinnmarketing.com.au', 'noreply@smata.com',
            'noreply@message-media.com'
          ]) AS sender
        ),
        -- Path A: customer email match (inbound + outbound)
        path_a_inbound AS (
          SELECT e.message_id, 'Inbound Email' AS interaction_type, 'A:email' AS link_path,
            e.from_name AS operator, e.subject, e.body_preview, e.received_at
          FROM \`${DS}.raw_emails_received\` e
          WHERE ARRAY_LENGTH(@emails) > 0
            AND LOWER(TRIM(e.from_email)) IN UNNEST(@emails)
            AND NOT EXISTS (SELECT 1 FROM excluded_senders x WHERE LOWER(e.from_email) LIKE CONCAT('%', x.sender, '%'))
            AND TIMESTAMP(e.received_at) BETWEEN
              TIMESTAMP_SUB(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 300 SECOND)
              AND TIMESTAMP_ADD(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 2592000 SECOND)
        ),
        path_a_outbound AS (
          SELECT e.message_id, 'Outbound Email' AS interaction_type, 'A:email' AS link_path,
            e.from_name AS operator, e.subject, e.body_preview, e.received_at
          FROM \`${DS}.raw_emails_sent\` e
          WHERE ARRAY_LENGTH(@emails) > 0
            AND LOWER(TRIM(e.to_email)) IN UNNEST(@emails)
            AND NOT EXISTS (SELECT 1 FROM excluded_senders x WHERE LOWER(e.to_email) LIKE CONCAT('%', x.sender, '%'))
            AND NOT LOWER(e.to_email) LIKE '%aroflo%'
            AND TIMESTAMP(e.received_at) BETWEEN
              TIMESTAMP_SUB(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 300 SECOND)
              AND TIMESTAMP_ADD(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 2592000 SECOND)
        ),
        -- Path B: JN in subject or body
        path_b_inbound AS (
          SELECT e.message_id,
            CASE WHEN LOWER(e.from_email) LIKE '%@mrwasher%' OR LOWER(e.from_email) LIKE '%plumber%'
              OR LOWER(e.from_email) LIKE '%electrician%' THEN 'Internal Email' ELSE 'Inbound Email' END AS interaction_type,
            'B:JN' AS link_path,
            e.from_name AS operator, e.subject, e.body_preview, e.received_at
          FROM \`${DS}.raw_emails_received\` e
          WHERE EXISTS (SELECT 1 FROM UNNEST(SPLIT(COALESCE(@allJobnumbers, ''), ',')) AS jn
            WHERE TRIM(jn) != '' AND (e.subject LIKE CONCAT('%', TRIM(jn), '%')
              OR e.body_text LIKE CONCAT('%', TRIM(jn), '%')))
            AND NOT EXISTS (SELECT 1 FROM excluded_senders x WHERE LOWER(e.from_email) LIKE CONCAT('%', x.sender, '%'))
            AND TIMESTAMP(e.received_at) BETWEEN
              TIMESTAMP_SUB(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 300 SECOND)
              AND TIMESTAMP_ADD(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 2592000 SECOND)
        ),
        path_b_outbound AS (
          SELECT e.message_id,
            'Outbound Email' AS interaction_type, 'B:JN' AS link_path,
            e.from_name AS operator, e.subject, e.body_preview, e.received_at
          FROM \`${DS}.raw_emails_sent\` e
          WHERE EXISTS (SELECT 1 FROM UNNEST(SPLIT(COALESCE(@allJobnumbers, ''), ',')) AS jn
            WHERE TRIM(jn) != '' AND (e.subject LIKE CONCAT('%', TRIM(jn), '%')
              OR e.body_text LIKE CONCAT('%', TRIM(jn), '%')))
            AND NOT LOWER(e.to_email) LIKE '%aroflo%'
            AND TIMESTAMP(e.received_at) BETWEEN
              TIMESTAMP_SUB(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 300 SECOND)
              AND TIMESTAMP_ADD(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 2592000 SECOND)
        ),
        -- Combine A + B (dedupe by message_id, prefer B tag over A)
        ab_combined AS (
          SELECT message_id, interaction_type, link_path, operator, subject, body_preview, received_at
          FROM path_b_inbound
          UNION DISTINCT
          SELECT * FROM path_b_outbound
          UNION DISTINCT
          SELECT * FROM path_a_inbound WHERE message_id NOT IN (SELECT message_id FROM path_b_inbound)
          UNION DISTINCT
          SELECT * FROM path_a_outbound WHERE message_id NOT IN (SELECT message_id FROM path_b_outbound)
        ),
        -- Path C: subject-thread continuation (only on distinctive subjects)
        -- Normalized subject = strip RE:/FW:/Fwd: prefixes
        ab_subjects AS (
          SELECT DISTINCT TRIM(REGEXP_REPLACE(subject, r'^(?:RE:|Re:|FW:|Fw:|Fwd:|fwd:)\s*', '')) AS norm_subject
          FROM ab_combined
          WHERE subject IS NOT NULL
            -- Guard: subject must be distinctive (>15 chars, not in stop-list)
            AND LENGTH(TRIM(REGEXP_REPLACE(subject, r'^(?:RE:|Re:|FW:|Fw:|Fwd:|fwd:)\s*', ''))) > 15
            AND LOWER(TRIM(REGEXP_REPLACE(subject, r'^(?:RE:|Re:|FW:|Fw:|Fwd:|fwd:)\s*', ''))) NOT IN (
              'quote', 'hi', 'hello', 'thanks', 'thank you', 'hot water', 'plumbing', 'electrical',
              'urgent', 'booking', 'invoice', 'receipt', 'confirmation', 'appointment',
              'job update', 'work order', 'enquiry', 'inquiry', 'new enquiry', 'new lead',
              'fw:', 'fwd:', 're:', ''
            )
        ),
        path_c_inbound AS (
          SELECT e.message_id,
            CASE WHEN LOWER(e.from_email) LIKE '%@mrwasher%' OR LOWER(e.from_email) LIKE '%plumber%'
              OR LOWER(e.from_email) LIKE '%electrician%' THEN 'Internal Email' ELSE 'Inbound Email' END AS interaction_type,
            'C:thread' AS link_path,
            e.from_name AS operator, e.subject, e.body_preview, e.received_at
          FROM \`${DS}.raw_emails_received\` e
          JOIN ab_subjects s ON TRIM(REGEXP_REPLACE(e.subject, r'^(?:RE:|Re:|FW:|Fw:|Fwd:|fwd:)\\s*', '')) = s.norm_subject
          WHERE e.message_id NOT IN (SELECT message_id FROM ab_combined)
            AND NOT EXISTS (SELECT 1 FROM excluded_senders x WHERE LOWER(e.from_email) LIKE CONCAT('%', x.sender, '%'))
            AND TIMESTAMP(e.received_at) BETWEEN
              TIMESTAMP_SUB(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 300 SECOND)
              AND TIMESTAMP_ADD(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 2592000 SECOND)
        ),
        path_c_outbound AS (
          SELECT e.message_id, 'Outbound Email' AS interaction_type, 'C:thread' AS link_path,
            e.from_name AS operator, e.subject, e.body_preview, e.received_at
          FROM \`${DS}.raw_emails_sent\` e
          JOIN ab_subjects s ON TRIM(REGEXP_REPLACE(e.subject, r'^(?:RE:|Re:|FW:|Fw:|Fwd:|fwd:)\\s*', '')) = s.norm_subject
          WHERE e.message_id NOT IN (SELECT message_id FROM ab_combined)
            AND NOT LOWER(e.to_email) LIKE '%aroflo%'
            AND TIMESTAMP(e.received_at) BETWEEN
              TIMESTAMP_SUB(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 300 SECOND)
              AND TIMESTAMP_ADD(CAST(@oppTimestamp AS TIMESTAMP), INTERVAL 2592000 SECOND)
        )
        -- Final: A+B+C combined, one row per message_id
        SELECT
          message_id AS interaction_id,
          CAST(NULL AS INT64) AS lead_id,
          interaction_type,
          DATETIME(received_at, 'Australia/Sydney') AS interaction_datetime,
          DATE(DATETIME(received_at, 'Australia/Sydney')) AS interaction_date,
          FORMAT_DATETIME('%H:%M', DATETIME(received_at, 'Australia/Sydney')) AS interaction_time,
          operator AS interaction_operator,
          CAST(NULL AS INT64) AS interaction_duration_seconds,
          LEFT(COALESCE(CONCAT('[', link_path, '] ', subject), body_preview, ''), 120) AS interaction_summary,
          CAST(NULL AS STRING) AS call_id,
          CAST(NULL AS STRING) AS called_did_label
        FROM ab_combined
        UNION ALL
        SELECT message_id, CAST(NULL AS INT64),interaction_type,
          DATETIME(received_at, 'Australia/Sydney'), DATE(DATETIME(received_at, 'Australia/Sydney')),
          FORMAT_DATETIME('%H:%M', DATETIME(received_at, 'Australia/Sydney')),
          operator, CAST(NULL AS INT64),
          LEFT(COALESCE(CONCAT('[', link_path, '] ', subject), body_preview, ''), 120),
          CAST(NULL AS STRING), CAST(NULL AS STRING)
        FROM path_c_inbound
        UNION ALL
        SELECT message_id, CAST(NULL AS INT64), interaction_type,
          DATETIME(received_at, 'Australia/Sydney'), DATE(DATETIME(received_at, 'Australia/Sydney')),
          FORMAT_DATETIME('%H:%M', DATETIME(received_at, 'Australia/Sydney')),
          operator, CAST(NULL AS INT64),
          LEFT(COALESCE(CONCAT('[', link_path, '] ', subject), body_preview, ''), 120),
          CAST(NULL AS STRING), CAST(NULL AS STRING)
        FROM path_c_outbound
      ),
      -- Dedupe forms + email threads against WC interactions (±90s timestamp overlap).
      -- WC interactions are authoritative — if they cover the same event, skip the dupe.
      forms_deduped AS (
        SELECT fs.* FROM form_submissions fs
        LEFT JOIN wc_interactions wi
          ON ABS(TIMESTAMP_DIFF(CAST(wi.interaction_datetime AS TIMESTAMP), CAST(fs.interaction_datetime AS TIMESTAMP), SECOND)) <= 90
        WHERE wi.interaction_datetime IS NULL
      ),
      threads_deduped AS (
        SELECT etr.* FROM email_thread_replies etr
        LEFT JOIN wc_interactions wi
          ON ABS(TIMESTAMP_DIFF(CAST(wi.interaction_datetime AS TIMESTAMP), CAST(etr.interaction_datetime AS TIMESTAMP), SECOND)) <= 90
        WHERE wi.interaction_datetime IS NULL
      ),
      -- Combine all sources
      combined AS (
        SELECT * FROM wc_interactions
        UNION ALL
        SELECT * FROM phone_calls pc
        WHERE pc.call_id NOT IN (SELECT call_id FROM wc_interactions WHERE call_id IS NOT NULL)
        UNION ALL
        SELECT * FROM forms_deduped
        UNION ALL
        SELECT * FROM threads_deduped
        UNION ALL
        SELECT * FROM ohq_emails
        UNION ALL
        SELECT * FROM sms_threads
        UNION ALL
        SELECT * FROM task_emails
        UNION ALL
        SELECT oe.* FROM outlook_emails oe
        WHERE oe.interaction_id NOT IN (SELECT interaction_id FROM wc_interactions WHERE interaction_id IS NOT NULL)
          AND oe.interaction_id NOT IN (SELECT interaction_id FROM forms_deduped WHERE interaction_id IS NOT NULL)
          AND oe.interaction_id NOT IN (SELECT interaction_id FROM threads_deduped WHERE interaction_id IS NOT NULL)
          AND oe.interaction_id NOT IN (SELECT interaction_id FROM ohq_emails WHERE interaction_id IS NOT NULL)
          AND oe.interaction_id NOT IN (SELECT interaction_id FROM sms_threads WHERE interaction_id IS NOT NULL)
          AND oe.interaction_id NOT IN (SELECT interaction_id FROM task_emails WHERE interaction_id IS NOT NULL)
      )
      SELECT interaction_id, lead_id, interaction_type, interaction_datetime,
        interaction_date, interaction_time, interaction_operator,
        interaction_duration_seconds, interaction_summary, call_id,
        called_did_label
      FROM combined
      ORDER BY interaction_datetime DESC
    `, {
      wcLeadIds: wcLeadIds.length > 0 ? wcLeadIds : [],
      phones,
      emails: emails.length > 0 ? emails : [],
      oppTimestamp: String(oppData.opportunity_timestamp),
      allJobnumbers: allJobnumbers || '',
    }, {
      wcLeadIds: ['INT64'],
      phones: ['STRING'],
      emails: ['STRING'],
    })

    return Response.json(JSON.parse(JSON.stringify(rows)))
  } catch (error) {
    console.error('Interactions error:', error)
    return Response.json([])
  }
}
