-- build_lead_timeline.sql — Materialised per-touch timeline for every opportunity.
-- Single source of truth for BOTH the CRM UI lead-detail AND the T7 classifier.
-- A human verifying a T7 classification sees EXACTLY the touches T7 classified on.
--
-- One row per touch, keyed by opportunity_id. All 8 interaction sources.
-- Full bodies NOT stored — fetched on demand via bodyRef (body_source + body_id).
-- Summaries (≤300 chars) stored inline for list/scan views.
--
-- Raw evidence only — NO human work-product (WC judgements, form_job_number,
-- manual_job_number, linked_jobs). Those are the held-out comparison basis.
--
-- SUPERSEDES (do not extend; drop when all consumers repoint):
--   - ds_crm.lead_interactions (WC-centric, ~3k rows, phone+email only)
--   - ds_crm.vw_lead_email_timeline (email-only, 210 rows)
--   - ds_crm.vw_contact_timeline (account/job-focused, not a lead timeline)
--   - The per-opp live assembly in src/lib/interactions/sql.ts
--
-- Orchestrate: run daily after build_opportunities.sql (depends on opportunities table).
-- Idempotent: CREATE OR REPLACE TABLE.

CREATE OR REPLACE TABLE `pttr-taskdata.ds_crm.lead_timeline` AS

WITH
-- ═══════════════════════════════════════════════════════════════════════
-- ANCHOR: explode opportunity identity anchors for set-based joins
-- ═══════════════════════════════════════════════════════════════════════
opp_anchors AS (
  SELECT
    o.opportunity_id,
    o.opportunity_timestamp,
    TIMESTAMP_SUB(o.opportunity_timestamp, INTERVAL 300 SECOND) AS window_start,
    TIMESTAMP_ADD(o.opportunity_timestamp, INTERVAL 2592000 SECOND) AS window_end,  -- +30 days
    o.wc_lead_id,
    o.all_jobnumbers,
    o.matched_phones,
    o.matched_emails
  FROM `pttr-taskdata.ds_crm.opportunities` o
),
opp_phones AS (
  SELECT oa.opportunity_id, TRIM(p) AS phone
  FROM opp_anchors oa, UNNEST(SPLIT(COALESCE(oa.matched_phones, ''), ',')) AS p
  WHERE TRIM(p) != ''
),
opp_emails AS (
  SELECT oa.opportunity_id, LOWER(TRIM(e)) AS email
  FROM opp_anchors oa, UNNEST(SPLIT(COALESCE(oa.matched_emails, ''), ',')) AS e
  WHERE TRIM(e) != ''
),
opp_jobnumbers AS (
  SELECT oa.opportunity_id, TRIM(jn) AS jn
  FROM opp_anchors oa, UNNEST(SPLIT(COALESCE(oa.all_jobnumbers, ''), ',')) AS jn
  WHERE TRIM(jn) != ''
),
-- WC lead IDs: use the wc_leads array if available, else scalar
opp_wc_ids AS (
  SELECT o.opportunity_id, wl.wc_lead_id
  FROM `pttr-taskdata.ds_crm.opportunities` o, UNNEST(o.wc_leads) wl
  WHERE wl.wc_lead_id IS NOT NULL
),

-- ═══════════════════════════════════════════════════════════════════════
-- OPERATOR RESOLUTION: call-leg agent name (longest-answered internal leg)
-- ═══════════════════════════════════════════════════════════════════════
call_agents AS (
  SELECT parent_call_id, callee_name,
    ROW_NUMBER() OVER (PARTITION BY parent_call_id
      ORDER BY TIMESTAMP_DIFF(disconnected_time, start_time, SECOND) DESC) AS rn
  FROM `pttr-taskdata.ds_crm.raw_call_legs`
  WHERE answered = 'Answered' AND direction = 'Internal'
    AND parent_call_id IS NOT NULL
    AND callee NOT LIKE 'CallForking%' AND callee NOT LIKE 'RingGroup%'
    AND REGEXP_CONTAINS(callee_name, r'^\p{Lu}\p{Ll}+ \p{Lu}\p{Ll}+$')
    AND callee_name NOT IN ('Mr Washer Generic', 'Mr Washer Temp', 'Plumber Rescue')
),
recording_operators AS (
  SELECT call_id, ARRAY_AGG(operator_name ORDER BY operator_name LIMIT 1)[OFFSET(0)] AS operator_name
  FROM `pttr-taskdata.ds_crm.raw_recordings`
  WHERE operator_name IS NOT NULL AND operator_name != ''
  GROUP BY call_id
),


-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE 1: WC-linked interactions — reads directly from all_leads_enriched
-- (Replaces the narrow lead_interactions table dependency. WC Phone Call leads
-- that were seeded by the Third Stream but had no lead_interactions row now
-- get their touches.)
-- ═══════════════════════════════════════════════════════════════════════
wc_interactions AS (
  -- WC Phone Call interactions: match WC lead to 8x8 call by phone + ±5s timestamp
  SELECT
    ow.opportunity_id,
    COALESCE(rc.call_id, CONCAT('wc-call-', CAST(ale.lead_id AS STRING))) AS interaction_id,
    ale.lead_id,
    CASE
      WHEN rc.direction = 'Outgoing' THEN 'Outbound Call'
      ELSE 'Inbound Call'
    END AS interaction_type,
    'wc_interaction' AS touch_source,
    DATETIME(ale.date_created, 'Australia/Sydney') AS interaction_datetime,
    COALESCE(
      agent.callee_name,
      rec.operator_name,
      CASE WHEN REGEXP_CONTAINS(COALESCE(rc.callee_name, ''), r'^\p{Lu}\p{Ll}+ \p{Lu}\p{Ll}+$')
        AND rc.callee_name NOT IN ('Mr Washer Generic', 'Mr Washer Temp', 'Plumber Rescue',
          'Strata Account', 'Plumbing Rescue', 'Electrician Rescue')
        THEN rc.callee_name END
    ) AS interaction_operator,
    CASE
      WHEN rc.talk_time IS NOT NULL AND REGEXP_CONTAINS(rc.talk_time, r'^\d{2}:\d{2}:\d{2}$')
      THEN CAST(SPLIT(rc.talk_time, ':')[OFFSET(0)] AS INT64) * 3600
         + CAST(SPLIT(rc.talk_time, ':')[OFFSET(1)] AS INT64) * 60
         + CAST(SPLIT(rc.talk_time, ':')[OFFSET(2)] AS INT64)
      ELSE ale.call_duration_seconds
    END AS interaction_duration_seconds,
    LEFT(COALESCE(ale.caller_name, ''), 300) AS interaction_summary,
    rc.call_id,
    did.label AS called_did_label,
    CASE WHEN rc.call_id IS NOT NULL THEN 'call' ELSE 'wc_call' END AS body_source,
    COALESCE(rc.call_id, CAST(ale.lead_id AS STRING)) AS body_id
  FROM opp_wc_ids ow
  JOIN `pttr-taskdata.gd_WhatConverts.all_leads_enriched` ale ON ow.wc_lead_id = ale.lead_id
  JOIN opp_anchors oa ON ow.opportunity_id = oa.opportunity_id
  -- Try to match WC call to 8x8 CDR by phone + ±5s (same logic as spine)
  LEFT JOIN `pttr-taskdata.ds_crm.raw_calls` rc
    ON ale.norm_phone IS NOT NULL
    AND rc.norm_caller_phone = ale.norm_phone
    AND ABS(TIMESTAMP_DIFF(rc.start_time, ale.date_created, SECOND)) <= 5
  LEFT JOIN `pttr-taskdata.ds_crm.lkp_did_trade` did ON rc.callee = did.did
  LEFT JOIN call_agents agent ON rc.call_id = agent.parent_call_id AND agent.rn = 1
  LEFT JOIN recording_operators rec ON rc.call_id = rec.call_id
  WHERE ale.lead_type = 'Phone Call'
    AND TIMESTAMP(DATETIME(ale.date_created, 'Australia/Sydney')) BETWEEN oa.window_start AND oa.window_end
),

-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE 2: raw_calls by matched_phones (catches direct/untracked)
-- ═══════════════════════════════════════════════════════════════════════
phone_calls AS (
  SELECT
    op.opportunity_id,
    rc.call_id AS interaction_id,
    CAST(NULL AS INT64) AS lead_id,
    CASE rc.direction
      WHEN 'Incoming' THEN 'Inbound Call'
      WHEN 'Outgoing' THEN 'Outbound Call'
      ELSE 'Call'
    END AS interaction_type,
    'phone_call' AS touch_source,
    DATETIME(rc.start_time, 'Australia/Sydney') AS interaction_datetime,
    COALESCE(
      agent.callee_name,
      rec.operator_name,
      CASE WHEN REGEXP_CONTAINS(COALESCE(rc.callee_name, ''), r'^\p{Lu}\p{Ll}+ \p{Lu}\p{Ll}+$')
        AND rc.callee_name NOT IN ('Mr Washer Generic', 'Mr Washer Temp', 'Plumber Rescue',
          'Strata Account', 'Plumbing Rescue', 'Electrician Rescue')
        THEN rc.callee_name END
    ) AS interaction_operator,
    CASE
      WHEN rc.talk_time IS NOT NULL AND REGEXP_CONTAINS(rc.talk_time, r'^\d{2}:\d{2}:\d{2}$')
      THEN CAST(SPLIT(rc.talk_time, ':')[OFFSET(0)] AS INT64) * 3600
         + CAST(SPLIT(rc.talk_time, ':')[OFFSET(1)] AS INT64) * 60
         + CAST(SPLIT(rc.talk_time, ':')[OFFSET(2)] AS INT64)
      ELSE NULL
    END AS interaction_duration_seconds,
    CAST(NULL AS STRING) AS interaction_summary,
    rc.call_id,
    did.label AS called_did_label,
    'call' AS body_source,
    rc.call_id AS body_id
  FROM opp_phones op
  JOIN opp_anchors oa ON op.opportunity_id = oa.opportunity_id
  JOIN `pttr-taskdata.ds_crm.raw_calls` rc
    ON (rc.norm_caller_phone = op.phone OR rc.norm_callee_phone = op.phone)
    AND rc.start_time BETWEEN oa.window_start AND oa.window_end
  LEFT JOIN `pttr-taskdata.ds_crm.lkp_did_trade` did ON rc.callee = did.did
  LEFT JOIN call_agents agent ON rc.call_id = agent.parent_call_id AND agent.rn = 1
  LEFT JOIN recording_operators rec ON rc.call_id = rec.call_id
),

-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE 3: email reply threads (RE:/FW: on form conversations + OHQ)
-- ═══════════════════════════════════════════════════════════════════════
-- Seed conversations: email-parsed forms linked by phone
form_conversations AS (
  SELECT DISTINCT orig.conversation_id, op.opportunity_id
  FROM opp_phones op
  JOIN opp_anchors oa ON op.opportunity_id = oa.opportunity_id
  JOIN `pttr-taskdata.ds_crm.vw_leads_unified` lu
    ON lu.phone = op.phone AND lu.source_type = 'email'
    AND lu.lead_timestamp BETWEEN oa.window_start AND oa.window_end
  JOIN `pttr-taskdata.ds_crm.raw_emails_received` orig ON CONCAT('email-', orig.message_id) = lu.lead_id
  WHERE orig.conversation_id IS NOT NULL
),
email_thread_replies AS (
  SELECT
    fc.opportunity_id,
    reply.message_id AS interaction_id,
    CAST(NULL AS INT64) AS lead_id,
    CASE
      WHEN LOWER(reply.from_email) LIKE '%@mrwasher%' OR LOWER(reply.from_email) LIKE '%plumber%'
        OR LOWER(reply.from_email) LIKE '%electrician%'
        THEN 'Outbound Email'
      ELSE 'Inbound Email'
    END AS interaction_type,
    'email_thread' AS touch_source,
    DATETIME(reply.received_at, 'Australia/Sydney') AS interaction_datetime,
    reply.from_name AS interaction_operator,
    CAST(NULL AS INT64) AS interaction_duration_seconds,
    LEFT(COALESCE(reply.subject, reply.body_preview, ''), 300) AS interaction_summary,
    CAST(NULL AS STRING) AS call_id,
    CAST(NULL AS STRING) AS called_did_label,
    'email_received' AS body_source,
    reply.message_id AS body_id
  FROM form_conversations fc
  JOIN opp_anchors oa ON fc.opportunity_id = oa.opportunity_id
  JOIN `pttr-taskdata.ds_crm.raw_emails_received` reply
    ON reply.conversation_id = fc.conversation_id
    AND (reply.subject LIKE 'RE:%' OR reply.subject LIKE 'Re:%'
      OR reply.subject LIKE 'FW:%' OR reply.subject LIKE 'Fw:%'
      OR reply.subject LIKE 'Fwd:%' OR reply.subject LIKE 'fwd:%')
    AND TIMESTAMP(reply.received_at) BETWEEN oa.window_start AND oa.window_end
),

-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE 4: Form submissions (WC + email-parsed)
-- Form content: parse additional_fields_json for WC-tracked; email body for email-only.
-- ═══════════════════════════════════════════════════════════════════════
wc_form_content AS (
  -- Extract human-readable form content from additional_fields_json.
  -- Keys vary by form type: WPForms numeric IDs, Quinn named fields, ETTR named fields.
  -- Use SAFE.PARSE_JSON + subscript (handles special chars like * in key names).
  -- Exclude human work-product keys (Lead Status, Job Number, Reason Did Not Convert, etc.)
  SELECT
    wc.lead_id,
    ARRAY_TO_STRING(ARRAY(
      SELECT part FROM UNNEST([
        -- Name (multiple possible keys)
        CASE WHEN COALESCE(
          STRING(afj["My name is *"]), STRING(afj["Name*"]),
          STRING(afj["wpforms - fields - 1"]), STRING(afj["wpforms - fields - 11"])
        ) IS NOT NULL THEN CONCAT('Name: ', COALESCE(
          STRING(afj["My name is *"]), STRING(afj["Name*"]),
          STRING(afj["wpforms - fields - 1"]), STRING(afj["wpforms - fields - 11"])
        )) END,
        -- Phone
        CASE WHEN COALESCE(
          STRING(afj["My phone number is *"]), STRING(afj["Phone*"]),
          STRING(afj["wpforms - fields - 17"])
        ) IS NOT NULL THEN CONCAT('Phone: ', COALESCE(
          STRING(afj["My phone number is *"]), STRING(afj["Phone*"]),
          STRING(afj["wpforms - fields - 17"])
        )) END,
        -- Email
        CASE WHEN COALESCE(
          STRING(afj["My email is *"]), STRING(afj["wpforms - fields - 20"])
        ) IS NOT NULL THEN CONCAT('Email: ', COALESCE(
          STRING(afj["My email is *"]), STRING(afj["wpforms - fields - 20"])
        )) END,
        -- Address
        CASE WHEN COALESCE(
          STRING(afj["My address is *"]), STRING(afj["Address*"])
        ) IS NOT NULL THEN CONCAT('Address: ', COALESCE(
          STRING(afj["My address is *"]), STRING(afj["Address*"])
        )) END,
        -- Problem / How can we help (the primary content field)
        CASE WHEN COALESCE(
          STRING(afj["My problem is *"]), STRING(afj["My Problem is *"]),
          STRING(afj["How Can We Help?*"]), STRING(afj["How can we help? *"]),
          STRING(afj["wpforms - fields - 2"]), STRING(afj["wpforms - fields - 13"]),
          STRING(afj["My question is *"])
        ) IS NOT NULL THEN CONCAT('Problem: ', LEFT(COALESCE(
          STRING(afj["My problem is *"]), STRING(afj["My Problem is *"]),
          STRING(afj["How Can We Help?*"]), STRING(afj["How can we help? *"]),
          STRING(afj["wpforms - fields - 2"]), STRING(afj["wpforms - fields - 13"]),
          STRING(afj["My question is *"])
        ), 500)) END,
        -- Intent
        CASE WHEN COALESCE(
          STRING(afj["Book a job"]), STRING(afj["wpforms - fields - 3"])
        ) IS NOT NULL THEN CONCAT('Intent: ', REGEXP_REPLACE(COALESCE(
          STRING(afj["Book a job"]), STRING(afj["wpforms - fields - 3"])
        ), r'<[^>]+>', '')) END,
        -- Date/Time preference
        CASE WHEN STRING(afj["Date"]) IS NOT NULL THEN CONCAT('Requested: ', STRING(afj["Date"]),
          COALESCE(CONCAT(' ', STRING(afj["Time"])), '')) END
      ]) AS part
      WHERE part IS NOT NULL
    ), '\n') AS form_content
  FROM `pttr-taskdata.gd_WhatConverts.all_leads_enriched` wc
  CROSS JOIN UNNEST([SAFE.PARSE_JSON(wc.additional_fields_json)]) AS afj
  WHERE wc.lead_type = 'Web Form'
    AND wc.additional_fields_json IS NOT NULL
    AND LENGTH(wc.additional_fields_json) > 10
),
form_submissions AS (
  -- WC-tracked forms (90% of forms)
  SELECT
    ow.opportunity_id,
    CONCAT('wc-form-', CAST(wc.lead_id AS STRING)) AS interaction_id,
    wc.lead_id AS lead_id,
    'Form Submission' AS interaction_type,
    'wc_form' AS touch_source,
    DATETIME(wc.date_created, 'Australia/Sydney') AS interaction_datetime,
    'Website' AS interaction_operator,
    CAST(NULL AS INT64) AS interaction_duration_seconds,
    LEFT(COALESCE(fc.form_content, wc.form_my_problem, ''), 300) AS interaction_summary,
    CAST(NULL AS STRING) AS call_id,
    CAST(NULL AS STRING) AS called_did_label,
    'wc_form' AS body_source,
    CAST(wc.lead_id AS STRING) AS body_id
  FROM opp_wc_ids ow
  JOIN `pttr-taskdata.gd_WhatConverts.all_leads_enriched` wc ON ow.wc_lead_id = wc.lead_id
  LEFT JOIN wc_form_content fc ON wc.lead_id = fc.lead_id
  WHERE wc.lead_type = 'Web Form'

  UNION ALL

  -- Email-parsed forms (phone-matched, 10% of forms)
  SELECT
    op.opportunity_id,
    lu.lead_id AS interaction_id,
    CAST(NULL AS INT64) AS lead_id,
    'Form Submission' AS interaction_type,
    'email_form' AS touch_source,
    lu.lead_timestamp_sydney AS interaction_datetime,
    'Website' AS interaction_operator,
    CAST(NULL AS INT64) AS interaction_duration_seconds,
    LEFT(COALESCE(lu.form_problem, ''), 300) AS interaction_summary,
    CAST(NULL AS STRING) AS call_id,
    CAST(NULL AS STRING) AS called_did_label,
    'email_received' AS body_source,
    REPLACE(lu.lead_id, 'email-', '') AS body_id
  FROM opp_phones op
  JOIN opp_anchors oa ON op.opportunity_id = oa.opportunity_id
  JOIN `pttr-taskdata.ds_crm.vw_leads_unified` lu
    ON lu.phone = op.phone AND lu.source_type = 'email'
    AND lu.lead_timestamp BETWEEN oa.window_start AND oa.window_end

  UNION ALL

  -- Email-parsed forms (phoneless opps, timestamp-matched)
  SELECT
    oa.opportunity_id,
    lu.lead_id AS interaction_id,
    CAST(NULL AS INT64) AS lead_id,
    'Form Submission' AS interaction_type,
    'email_form' AS touch_source,
    lu.lead_timestamp_sydney AS interaction_datetime,
    'Website' AS interaction_operator,
    CAST(NULL AS INT64) AS interaction_duration_seconds,
    LEFT(COALESCE(lu.form_problem, lu.contact_name, ''), 300) AS interaction_summary,
    CAST(NULL AS STRING) AS call_id,
    CAST(NULL AS STRING) AS called_did_label,
    'email_received' AS body_source,
    REPLACE(lu.lead_id, 'email-', '') AS body_id
  FROM opp_anchors oa
  LEFT JOIN opp_phones op ON oa.opportunity_id = op.opportunity_id
  JOIN `pttr-taskdata.ds_crm.vw_leads_unified` lu
    ON lu.source_type = 'email'
    AND lu.phone IS NULL
    AND ABS(TIMESTAMP_DIFF(lu.lead_timestamp, oa.opportunity_timestamp, SECOND)) <= 5
  WHERE op.phone IS NULL  -- only for phoneless opps
),

-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE 5: OfficeHQ answering-service emails
-- ═══════════════════════════════════════════════════════════════════════
ohq_emails AS (
  SELECT
    op.opportunity_id,
    e.message_id AS interaction_id,
    CAST(NULL AS INT64) AS lead_id,
    'Answering Service' AS interaction_type,
    'ohq' AS touch_source,
    DATETIME(e.received_at, 'Australia/Sydney') AS interaction_datetime,
    'OfficeHQ' AS interaction_operator,
    CAST(NULL AS INT64) AS interaction_duration_seconds,
    LEFT(e.body_preview, 300) AS interaction_summary,
    CAST(NULL AS STRING) AS call_id,
    CAST(NULL AS STRING) AS called_did_label,
    'email_received' AS body_source,
    e.message_id AS body_id
  FROM opp_phones op
  JOIN opp_anchors oa ON op.opportunity_id = oa.opportunity_id
  JOIN `pttr-taskdata.ds_crm.raw_emails_received` e
    ON LOWER(e.from_email) LIKE '%myreceptionist%'
    AND (e.body_preview LIKE CONCAT('%', op.phone, '%')
      OR REPLACE(e.body_preview, ' ', '') LIKE CONCAT('%', REPLACE(op.phone, '+61', '0'), '%'))
    AND TIMESTAMP(e.received_at) BETWEEN
      TIMESTAMP_SUB(oa.opportunity_timestamp, INTERVAL 60 SECOND) AND oa.window_end
),

-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE 6: MessageMedia SMS threads
-- ═══════════════════════════════════════════════════════════════════════
sms_by_phone AS (
  SELECT op.opportunity_id, e.*
  FROM opp_phones op
  JOIN opp_anchors oa ON op.opportunity_id = oa.opportunity_id
  JOIN `pttr-taskdata.ds_crm.raw_emails_received` e
    ON (LOWER(e.from_email) LIKE '%message-media%' OR LOWER(e.from_email) LIKE '%messagemedia%')
    AND e.subject LIKE CONCAT('%', SUBSTR(op.phone, 2), '%')
    AND TIMESTAMP(e.received_at) BETWEEN oa.window_start AND oa.window_end
),
sms_by_jn AS (
  SELECT oj.opportunity_id, e.*
  FROM opp_jobnumbers oj
  JOIN opp_anchors oa ON oj.opportunity_id = oa.opportunity_id
  JOIN `pttr-taskdata.ds_crm.raw_emails_received` e
    ON (LOWER(e.from_email) LIKE '%message-media%' OR LOWER(e.from_email) LIKE '%messagemedia%')
    AND e.body_text LIKE CONCAT('%JN', oj.jn, '%')
    AND TIMESTAMP(e.received_at) BETWEEN oa.window_start AND oa.window_end
),
sms_threads AS (
  SELECT
    opportunity_id,
    message_id AS interaction_id,
    CAST(NULL AS INT64) AS lead_id,
    CASE WHEN LOWER(subject) LIKE '%reply%' THEN 'SMS Reply' ELSE 'SMS' END AS interaction_type,
    'sms' AS touch_source,
    DATETIME(received_at, 'Australia/Sydney') AS interaction_datetime,
    'MessageMedia' AS interaction_operator,
    CAST(NULL AS INT64) AS interaction_duration_seconds,
    LEFT(body_preview, 300) AS interaction_summary,
    CAST(NULL AS STRING) AS call_id,
    CAST(NULL AS STRING) AS called_did_label,
    'email_received' AS body_source,
    message_id AS body_id
  FROM (
    SELECT * FROM sms_by_phone
    UNION DISTINCT
    SELECT * FROM sms_by_jn
  )
),

-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE 7: AroFlo task emails
-- ═══════════════════════════════════════════════════════════════════════
task_emails AS (
  SELECT
    oj.opportunity_id,
    e.message_id AS interaction_id,
    CAST(NULL AS INT64) AS lead_id,
    'Task Email' AS interaction_type,
    'task_email' AS touch_source,
    DATETIME(e.received_at, 'Australia/Sydney') AS interaction_datetime,
    e.from_name AS interaction_operator,
    CAST(NULL AS INT64) AS interaction_duration_seconds,
    LEFT(COALESCE(e.subject, e.body_preview, ''), 300) AS interaction_summary,
    CAST(NULL AS STRING) AS call_id,
    CAST(NULL AS STRING) AS called_did_label,
    'email_sent' AS body_source,
    e.message_id AS body_id
  FROM opp_jobnumbers oj
  JOIN opp_anchors oa ON oj.opportunity_id = oa.opportunity_id
  JOIN `pttr-taskdata.ds_crm.raw_emails_sent` e
    ON LOWER(e.to_email) LIKE '%aroflo%'
    AND (e.subject LIKE CONCAT('%', oj.jn, '%') OR e.body_text LIKE CONCAT('%', oj.jn, '%'))
    AND TIMESTAMP(e.received_at) BETWEEN oa.window_start AND oa.window_end
),

-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE 8: General Outlook correspondence (Path A/B/C)
-- ═══════════════════════════════════════════════════════════════════════
-- Path A: email address match (inbound + outbound)
path_a_inbound AS (
  SELECT oe.opportunity_id, e.message_id, 'Inbound Email' AS interaction_type,
    'A:email' AS link_path, e.from_name AS operator, e.subject, e.body_preview, e.received_at
  FROM opp_emails oe
  JOIN opp_anchors oa ON oe.opportunity_id = oa.opportunity_id
  JOIN `pttr-taskdata.ds_crm.raw_emails_received` e
    ON LOWER(TRIM(e.from_email)) = oe.email
    AND LOWER(e.from_email) NOT LIKE '%message-media%'
    AND LOWER(e.from_email) NOT LIKE '%messagemedia%'
    AND LOWER(e.from_email) NOT LIKE '%myreceptionist%'
    AND LOWER(e.from_email) NOT LIKE '%inboundemail.aroflo%'
    AND LOWER(e.from_email) NOT LIKE '%resend.quinnmarketing%'
    AND LOWER(e.from_email) NOT LIKE '%smata.com%'
    AND LOWER(e.from_email) NOT LIKE '%bright-duggan%'
    AND TIMESTAMP(e.received_at) BETWEEN oa.window_start AND oa.window_end
),
path_a_outbound AS (
  SELECT oe.opportunity_id, e.message_id, 'Outbound Email' AS interaction_type,
    'A:email' AS link_path, e.from_name AS operator, e.subject, e.body_preview, e.received_at
  FROM opp_emails oe
  JOIN opp_anchors oa ON oe.opportunity_id = oa.opportunity_id
  JOIN `pttr-taskdata.ds_crm.raw_emails_sent` e
    ON LOWER(TRIM(e.to_email)) = oe.email
    AND LOWER(e.to_email) NOT LIKE '%message-media%'
    AND LOWER(e.to_email) NOT LIKE '%messagemedia%'
    AND LOWER(e.to_email) NOT LIKE '%myreceptionist%'
    AND LOWER(e.to_email) NOT LIKE '%inboundemail.aroflo%'
    AND LOWER(e.to_email) NOT LIKE '%resend.quinnmarketing%'
    AND LOWER(e.to_email) NOT LIKE '%smata.com%'
    AND LOWER(e.to_email) NOT LIKE '%bright-duggan%'
    AND NOT LOWER(e.to_email) LIKE '%aroflo%'
    AND TIMESTAMP(e.received_at) BETWEEN oa.window_start AND oa.window_end
),
-- Path B: JN in subject/body (inbound + outbound)
path_b_inbound AS (
  SELECT oj.opportunity_id, e.message_id,
    CASE WHEN LOWER(e.from_email) LIKE '%@mrwasher%' OR LOWER(e.from_email) LIKE '%plumber%'
      OR LOWER(e.from_email) LIKE '%electrician%' THEN 'Internal Email' ELSE 'Inbound Email' END AS interaction_type,
    'B:JN' AS link_path, e.from_name AS operator, e.subject, e.body_preview, e.received_at
  FROM opp_jobnumbers oj
  JOIN opp_anchors oa ON oj.opportunity_id = oa.opportunity_id
  JOIN `pttr-taskdata.ds_crm.raw_emails_received` e
    ON (e.subject LIKE CONCAT('%', oj.jn, '%') OR e.body_text LIKE CONCAT('%', oj.jn, '%'))
    AND LOWER(e.from_email) NOT LIKE '%message-media%'
    AND LOWER(e.from_email) NOT LIKE '%messagemedia%'
    AND LOWER(e.from_email) NOT LIKE '%myreceptionist%'
    AND LOWER(e.from_email) NOT LIKE '%inboundemail.aroflo%'
    AND LOWER(e.from_email) NOT LIKE '%resend.quinnmarketing%'
    AND LOWER(e.from_email) NOT LIKE '%smata.com%'
    AND LOWER(e.from_email) NOT LIKE '%bright-duggan%'
    AND TIMESTAMP(e.received_at) BETWEEN oa.window_start AND oa.window_end
),
path_b_outbound AS (
  SELECT oj.opportunity_id, e.message_id, 'Outbound Email' AS interaction_type,
    'B:JN' AS link_path, e.from_name AS operator, e.subject, e.body_preview, e.received_at
  FROM opp_jobnumbers oj
  JOIN opp_anchors oa ON oj.opportunity_id = oa.opportunity_id
  JOIN `pttr-taskdata.ds_crm.raw_emails_sent` e
    ON (e.subject LIKE CONCAT('%', oj.jn, '%') OR e.body_text LIKE CONCAT('%', oj.jn, '%'))
    AND NOT LOWER(e.to_email) LIKE '%aroflo%'
    AND TIMESTAMP(e.received_at) BETWEEN oa.window_start AND oa.window_end
),
ab_combined AS (
  SELECT DISTINCT opportunity_id, message_id, interaction_type, link_path, operator, subject, body_preview, received_at
  FROM (
    SELECT * FROM path_b_inbound
    UNION ALL SELECT * FROM path_b_outbound
    UNION ALL SELECT ai.* FROM path_a_inbound ai LEFT JOIN path_b_inbound bi ON ai.message_id = bi.message_id WHERE bi.message_id IS NULL
    UNION ALL SELECT ao.* FROM path_a_outbound ao LEFT JOIN path_b_outbound bo ON ao.message_id = bo.message_id WHERE bo.message_id IS NULL
  )
),
-- Path C: subject-thread expansion — VERBATIM from interactions/route.ts (sql.ts:348-384).
-- Normalise subject (strip RE:/FW: prefixes), match against ab_combined subjects,
-- require >15 chars and not in stop-list. Scoped per opportunity_id to prevent
-- cross-opp contamination (the route runs per-opp; the materialised version must
-- replicate that scoping via the opportunity_id column on ab_subjects).
ab_subjects AS (
  SELECT DISTINCT opportunity_id,
    TRIM(REGEXP_REPLACE(subject, r'^(?:RE:|Re:|FW:|Fw:|Fwd:|fwd:)\s*', '')) AS norm_subject
  FROM ab_combined
  WHERE subject IS NOT NULL
    AND LENGTH(TRIM(REGEXP_REPLACE(subject, r'^(?:RE:|Re:|FW:|Fw:|Fwd:|fwd:)\s*', ''))) > 15
    AND LOWER(TRIM(REGEXP_REPLACE(subject, r'^(?:RE:|Re:|FW:|Fw:|Fwd:|fwd:)\s*', ''))) NOT IN (
      'quote', 'hi', 'hello', 'thanks', 'thank you', 'hot water', 'plumbing', 'electrical',
      'urgent', 'booking', 'invoice', 'receipt', 'confirmation', 'appointment',
      'job update', 'work order', 'enquiry', 'inquiry', 'new enquiry', 'new lead',
      'fw:', 'fwd:', 're:', '',
      -- ──────────────────────────────────────────────────────────────────
      -- EXTENDED STOP-LIST (materialised set-based only — NOT in the per-opp route).
      --
      -- WHY these exist: the per-opp route (interactions/route.ts, sql.ts:348-384)
      -- runs Path C with @oppTimestamp scoping one opp at a time. A generic subject
      -- like "PTTR website form submission" only matches that one opp's Path A/B
      -- emails, producing a handful of thread replies. When materialised across ALL
      -- 38k opps in one query, the same generic subject matches thousands of
      -- Path A/B emails globally, pulling in every "RE: PTTR website form submission"
      -- in the mailbox → 59,575 rows, 327/opp worst case (verified Jun 2026).
      --
      -- These entries block subjects that are common across many opps. They are NOT
      -- "cleanup" candidates — removing any entry reintroduces the cross-opp explosion.
      -- The original route stop-list (above) stays verbatim; these are additive.
      -- ──────────────────────────────────────────────────────────────────
      'pttr website form submission', 'new ettr website form', 'ettr website job booking',
      'pttr web enquiry', 'emergency plumbing', 'non urgent messages',
      'copy of page message (to 510892)', 'emails from 409090', 'messages for 510892',
      'messages for 409090', 'thanks for reaching out!', 'ettr website question',
      'emergency electrical', 'mr washer website new entry: book online',
      'mr washer website new entry: make an enquiry', 'your job booking',
      'new entry: bdttr ask a question'
    )
    -- Also exclude pager-ID subjects (e.g. "Messages for D82159159", "emails from 409090")
    AND NOT REGEXP_CONTAINS(LOWER(TRIM(REGEXP_REPLACE(subject, r'^(?:RE:|Re:|FW:|Fw:|Fwd:|fwd:)\s*', ''))),
      r'^(messages for |emails from |copy of page message)')
),
path_c_inbound AS (
  SELECT s.opportunity_id, e.message_id,
    CASE WHEN LOWER(e.from_email) LIKE '%@mrwasher%' OR LOWER(e.from_email) LIKE '%plumber%'
      OR LOWER(e.from_email) LIKE '%electrician%' THEN 'Internal Email' ELSE 'Inbound Email' END AS interaction_type,
    'C:thread' AS link_path, e.from_name AS operator, e.subject, e.body_preview, e.received_at
  FROM ab_subjects s
  JOIN opp_anchors oa ON s.opportunity_id = oa.opportunity_id
  JOIN `pttr-taskdata.ds_crm.raw_emails_received` e
    ON TRIM(REGEXP_REPLACE(e.subject, r'^(?:RE:|Re:|FW:|Fw:|Fwd:|fwd:)\s*', '')) = s.norm_subject
    AND LOWER(e.from_email) NOT LIKE '%message-media%'
    AND LOWER(e.from_email) NOT LIKE '%messagemedia%'
    AND LOWER(e.from_email) NOT LIKE '%myreceptionist%'
    AND LOWER(e.from_email) NOT LIKE '%inboundemail.aroflo%'
    AND LOWER(e.from_email) NOT LIKE '%resend.quinnmarketing%'
    AND LOWER(e.from_email) NOT LIKE '%smata.com%'
    AND LOWER(e.from_email) NOT LIKE '%bright-duggan%'
    AND TIMESTAMP(e.received_at) BETWEEN oa.window_start AND oa.window_end
  QUALIFY ROW_NUMBER() OVER (PARTITION BY s.opportunity_id, e.message_id ORDER BY e.received_at) = 1
),
path_c_inbound_deduped AS (
  SELECT ci.* FROM path_c_inbound ci
  LEFT JOIN ab_combined ab ON ci.opportunity_id = ab.opportunity_id AND ci.message_id = ab.message_id
  WHERE ab.message_id IS NULL
),
path_c_outbound AS (
  SELECT s.opportunity_id, e.message_id, 'Outbound Email' AS interaction_type,
    'C:thread' AS link_path, e.from_name AS operator, e.subject, e.body_preview, e.received_at
  FROM ab_subjects s
  JOIN opp_anchors oa ON s.opportunity_id = oa.opportunity_id
  JOIN `pttr-taskdata.ds_crm.raw_emails_sent` e
    ON TRIM(REGEXP_REPLACE(e.subject, r'^(?:RE:|Re:|FW:|Fw:|Fwd:|fwd:)\s*', '')) = s.norm_subject
    AND NOT LOWER(e.to_email) LIKE '%aroflo%'
    AND TIMESTAMP(e.received_at) BETWEEN oa.window_start AND oa.window_end
  QUALIFY ROW_NUMBER() OVER (PARTITION BY s.opportunity_id, e.message_id ORDER BY e.received_at) = 1
),
path_c_outbound_deduped AS (
  SELECT co.* FROM path_c_outbound co
  LEFT JOIN ab_combined ab3 ON co.opportunity_id = ab3.opportunity_id AND co.message_id = ab3.message_id
  WHERE ab3.message_id IS NULL
),
outlook_all AS (
  SELECT opportunity_id, message_id, interaction_type, link_path, operator, subject, body_preview, received_at
  FROM ab_combined
  UNION ALL SELECT * FROM path_c_inbound_deduped
  UNION ALL SELECT * FROM path_c_outbound_deduped
),
outlook_emails AS (
  SELECT
    opportunity_id,
    message_id AS interaction_id,
    CAST(NULL AS INT64) AS lead_id,
    interaction_type,
    CONCAT('outlook_', link_path) AS touch_source,
    DATETIME(received_at, 'Australia/Sydney') AS interaction_datetime,
    operator AS interaction_operator,
    CAST(NULL AS INT64) AS interaction_duration_seconds,
    LEFT(COALESCE(CONCAT('[', link_path, '] ', subject), body_preview, ''), 300) AS interaction_summary,
    CAST(NULL AS STRING) AS call_id,
    CAST(NULL AS STRING) AS called_did_label,
    CASE WHEN interaction_type LIKE '%Outbound%' THEN 'email_sent' ELSE 'email_received' END AS body_source,
    message_id AS body_id
  FROM outlook_all
),

-- ═══════════════════════════════════════════════════════════════════════
-- DEDUP + COMBINE
-- ═══════════════════════════════════════════════════════════════════════
-- Forms dedup against WC interactions (same event within 90s)
forms_deduped AS (
  SELECT fs.* FROM form_submissions fs
  LEFT JOIN wc_interactions wi
    ON fs.opportunity_id = wi.opportunity_id
    AND ABS(TIMESTAMP_DIFF(CAST(wi.interaction_datetime AS TIMESTAMP), CAST(fs.interaction_datetime AS TIMESTAMP), SECOND)) <= 90
  WHERE wi.interaction_datetime IS NULL
),
-- Email threads dedup against WC interactions
threads_deduped AS (
  SELECT etr.* FROM email_thread_replies etr
  LEFT JOIN wc_interactions wi
    ON etr.opportunity_id = wi.opportunity_id
    AND ABS(TIMESTAMP_DIFF(CAST(wi.interaction_datetime AS TIMESTAMP), CAST(etr.interaction_datetime AS TIMESTAMP), SECOND)) <= 90
  WHERE wi.interaction_datetime IS NULL
),
-- Phone calls dedup against WC interactions (same call_id)
wc_call_ids AS (
  SELECT DISTINCT call_id FROM wc_interactions WHERE call_id IS NOT NULL
),
phone_calls_deduped AS (
  SELECT pc.* FROM phone_calls pc
  LEFT JOIN wc_call_ids wci ON pc.call_id = wci.call_id
  WHERE wci.call_id IS NULL
),
-- Outlook dedup against all prior sources
prior_ids AS (
  SELECT DISTINCT interaction_id FROM wc_interactions WHERE interaction_id IS NOT NULL
  UNION DISTINCT SELECT DISTINCT interaction_id FROM forms_deduped WHERE interaction_id IS NOT NULL
  UNION DISTINCT SELECT DISTINCT interaction_id FROM threads_deduped WHERE interaction_id IS NOT NULL
  UNION DISTINCT SELECT DISTINCT interaction_id FROM ohq_emails WHERE interaction_id IS NOT NULL
  UNION DISTINCT SELECT DISTINCT interaction_id FROM sms_threads WHERE interaction_id IS NOT NULL
  UNION DISTINCT SELECT DISTINCT interaction_id FROM task_emails WHERE interaction_id IS NOT NULL
),
outlook_deduped AS (
  SELECT oe.* FROM outlook_emails oe
  LEFT JOIN prior_ids pi ON oe.interaction_id = pi.interaction_id
  WHERE pi.interaction_id IS NULL
),
-- Final union
combined AS (
  SELECT * FROM wc_interactions
  UNION ALL SELECT * FROM phone_calls_deduped
  UNION ALL SELECT * FROM threads_deduped
  UNION ALL SELECT * FROM forms_deduped
  UNION ALL SELECT * FROM ohq_emails
  UNION ALL SELECT * FROM sms_threads
  UNION ALL SELECT * FROM task_emails
  UNION ALL SELECT * FROM outlook_deduped
),

-- ═══════════════════════════════════════════════════════════════════════
-- WC FLAGS: carry spam/test from all_leads_enriched per opportunity
-- ═══════════════════════════════════════════════════════════════════════
opp_wc_flags AS (
  SELECT o.opportunity_id, ale.spam AS wc_spam, ale.is_test_lead AS wc_is_test
  FROM `pttr-taskdata.ds_crm.opportunities` o
  JOIN `pttr-taskdata.gd_WhatConverts.all_leads_enriched` ale ON o.wc_lead_id = ale.lead_id
  WHERE o.wc_lead_id IS NOT NULL
),

-- ═══════════════════════════════════════════════════════════════════════
-- DETERMINISTIC GATE: stage determination from facts (per t7_taxonomy_spec.md)
-- One gate_stage per opportunity, denormalized onto every touch row.
-- Fences enforced in code: JN→Booked; no-JN→never Booked; invoiced>0→C&I.
-- ═══════════════════════════════════════════════════════════════════════
-- Content check: does the opp have any usable content in its touches?
opp_has_content AS (
  SELECT opportunity_id,
    LOGICAL_OR(
      (interaction_summary IS NOT NULL AND LENGTH(interaction_summary) > 10)
      OR body_source IN ('call', 'email_received', 'email_sent', 'wc_form', 'wc_call')
    ) AS has_content
  FROM combined
  GROUP BY opportunity_id
),
-- Invoice: the ONLY determined-complete test (status string irrelevant)
opp_invoice AS (
  SELECT CAST(jobnumber AS STRING) AS jobnumber, invoiced_total_ex
  FROM `pttr-taskdata.ds_aroflo.vw_job_invoiced`
  WHERE invoiced_total_ex > 0
),
-- Account billing edge case: Archived + $0 + Account customer_type
opp_account_archived AS (
  SELECT DISTINCT CAST(tc.jobnumber AS STRING) AS jobnumber
  FROM `pttr-taskdata.ds_aroflo.tasks_complete` tc
  WHERE tc.job_status = 'Archived' AND tc.customer_type = 'Account'
),
-- Gate computation: one row per opportunity
opp_gate AS (
  SELECT
    o.opportunity_id,
    CASE
      -- Step 1: JN + invoiced > 0 → Completed and Invoiced (DETERMINED)
      WHEN o.jobnumber IS NOT NULL AND inv.invoiced_total_ex IS NOT NULL
        THEN 'determined:Completed and Invoiced'
      -- Account billing review: JN + Archived + Account + $0
      WHEN o.jobnumber IS NOT NULL AND act.jobnumber IS NOT NULL AND inv.invoiced_total_ex IS NULL
        THEN 'determined:account_billing_review'
      -- Step 2: JN exists → Booked (T7 picks within-Booked sub)
      WHEN o.jobnumber IS NOT NULL
        THEN 'judgement:Booked'
      -- Step 3: Unanswered Call (call-type, no answered call, no content)
      WHEN le.lead_type = 'call'
        AND COALESCE(o.has_answered_call, FALSE) = FALSE
        AND NOT COALESCE(oc.has_content, FALSE)
        THEN 'determined:Not Captured / Unanswered Call'
      -- Step 4: Dropped Call (answered, <20s, no content)
      WHEN COALESCE(o.has_answered_call, FALSE) = TRUE
        AND COALESCE(o.max_duration_sec, 0) < 20
        AND NOT COALESCE(oc.has_content, FALSE)
        THEN 'determined:Not Captured / Dropped Call'
      -- Step 6: Unable to Classify (touch exists, no content, no JN)
      WHEN COALESCE(oc.has_content, FALSE) = FALSE
        THEN 'determined:Unable to Classify'
      -- Step 7: Content exists, no JN → T7 judgement (NQ/NB)
      ELSE 'judgement:NQ/NB'
    END AS gate_stage
  FROM `pttr-taskdata.ds_crm.opportunities` o
  LEFT JOIN `pttr-taskdata.ds_crm.vw_lead_enriched` le ON o.opportunity_id = le.opportunity_id
  LEFT JOIN opp_has_content oc ON o.opportunity_id = oc.opportunity_id
  LEFT JOIN opp_invoice inv ON CAST(o.jobnumber AS STRING) = inv.jobnumber
  LEFT JOIN opp_account_archived act ON CAST(o.jobnumber AS STRING) = act.jobnumber
)

-- ═══════════════════════════════════════════════════════════════════════
-- FINAL OUTPUT: one row per touch per opportunity
-- ═══════════════════════════════════════════════════════════════════════
SELECT
  c.opportunity_id,
  c.interaction_id,
  c.lead_id,
  c.interaction_type,
  c.touch_source,
  c.interaction_datetime,
  DATE(c.interaction_datetime) AS interaction_date,
  FORMAT_DATETIME('%H:%M', c.interaction_datetime) AS interaction_time,
  c.interaction_operator,
  c.interaction_duration_seconds,
  c.interaction_summary,
  c.call_id,
  c.called_did_label,
  c.body_source,
  c.body_id,
  COALESCE(f.wc_spam, FALSE) AS wc_spam,
  COALESCE(f.wc_is_test, FALSE) AS wc_is_test,
  g.gate_stage
FROM combined c
LEFT JOIN opp_wc_flags f ON c.opportunity_id = f.opportunity_id
LEFT JOIN opp_gate g ON c.opportunity_id = g.opportunity_id
-- Deduplicate: same interaction_id on same opportunity → keep first by touch_source priority
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY c.opportunity_id, c.interaction_id
  ORDER BY
    CASE c.touch_source
      WHEN 'wc_interaction' THEN 1
      WHEN 'phone_call' THEN 2
      WHEN 'wc_form' THEN 3
      WHEN 'email_form' THEN 4
      WHEN 'ohq' THEN 5
      WHEN 'sms' THEN 6
      WHEN 'task_email' THEN 7
      ELSE 10
    END
) = 1
;
