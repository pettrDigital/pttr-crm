-- vw_leads_unified v3: multi-source spine with PM exclusion
-- Changes from v2: PM/Account phone exclusion, remove synthetic phone, keep answered as raw string
CREATE OR REPLACE VIEW `pttr-taskdata.ds_crm.vw_leads_unified` AS
WITH
-- Internal phone detection (>=10 outbound, 0 AroFlo jobs)
outbound_counts AS (
  SELECT rc_out.norm_callee_phone AS phone, COUNT(*) AS outbound_cnt
  FROM `pttr-taskdata.ds_crm.raw_calls` rc_out
  WHERE rc_out.direction = 'Outgoing' AND rc_out.norm_callee_phone IS NOT NULL AND rc_out.norm_callee_phone != ''
  GROUP BY 1 HAVING COUNT(*) >= 10
),
job_phones AS (
  SELECT DISTINCT phone FROM (
    SELECT norm_client_mobile AS phone FROM `pttr-taskdata.ds_aroflo.tasks_complete` WHERE norm_client_mobile IS NOT NULL AND norm_client_mobile != ''
    UNION DISTINCT
    SELECT id_phone FROM `pttr-taskdata.ds_aroflo.tasks_complete` WHERE id_phone IS NOT NULL AND id_phone != ''
  )
),
internal_phones AS (
  SELECT oc.phone FROM outbound_counts oc LEFT JOIN job_phones jp ON oc.phone = jp.phone WHERE jp.phone IS NULL
),

-- PM/Account-only phones: phones that ONLY appear on Account-type jobs
account_only_phones AS (
  SELECT DISTINCT phone FROM (
    SELECT norm_client_mobile AS phone FROM `pttr-taskdata.ds_aroflo.tasks_complete` WHERE customer_type = 'Account' AND norm_client_mobile IS NOT NULL AND norm_client_mobile != ''
    UNION DISTINCT
    SELECT id_phone FROM `pttr-taskdata.ds_aroflo.tasks_complete` WHERE customer_type = 'Account' AND id_phone IS NOT NULL AND id_phone != ''
  )
  EXCEPT DISTINCT
  SELECT phone FROM (
    SELECT norm_client_mobile AS phone FROM `pttr-taskdata.ds_aroflo.tasks_complete` WHERE customer_type != 'Account' AND norm_client_mobile IS NOT NULL AND norm_client_mobile != ''
    UNION DISTINCT
    SELECT id_phone FROM `pttr-taskdata.ds_aroflo.tasks_complete` WHERE customer_type != 'Account' AND id_phone IS NOT NULL AND id_phone != ''
  )
),

wc_calls AS (
  SELECT lead_id AS wc_lead_id, phone_norm AS wc_phone,
    TIMESTAMP(lead_datetime, 'Australia/Sydney') AS wc_timestamp,
    channel AS wc_channel, lead_source AS wc_source, lead_medium AS wc_medium,
    lead_campaign AS wc_campaign, lead_keyword AS wc_keyword, profile AS wc_profile,
    tracking_number AS wc_tracking_number,
    contact_name AS wc_contact_name, email AS wc_email
  FROM `pttr-taskdata.ds_crm.vw_leads` WHERE channel = 'Call'
),

inbound_calls AS (
  SELECT rc.call_id, rc.start_time, rc.norm_caller_phone, rc.caller,
    rc.callee, rc.callee_name, rc.talk_time, rc.answered, rc.missed,
    CASE WHEN rc.talk_time IS NOT NULL AND REGEXP_CONTAINS(rc.talk_time, r'^\d{2}:\d{2}:\d{2}$')
      THEN CAST(SPLIT(rc.talk_time, ':')[OFFSET(0)] AS INT64)*3600 + CAST(SPLIT(rc.talk_time, ':')[OFFSET(1)] AS INT64)*60 + CAST(SPLIT(rc.talk_time, ':')[OFFSET(2)] AS INT64)
      ELSE 0 END AS duration_sec,
    CASE WHEN EXTRACT(DAYOFWEEK FROM DATETIME(rc.start_time, 'Australia/Sydney')) BETWEEN 2 AND 6
      AND EXTRACT(HOUR FROM DATETIME(rc.start_time, 'Australia/Sydney')) >= 7
      AND EXTRACT(HOUR FROM DATETIME(rc.start_time, 'Australia/Sydney')) < 17
      THEN TRUE ELSE FALSE END AS is_business_hours,
    CASE rc.callee
      WHEN '754' THEN 'Paid Search (untracked DID)' WHEN '753' THEN 'Paid Search (untracked DID)'
      WHEN '717' THEN 'Web DID' WHEN '712' THEN 'Web DID' WHEN '733' THEN 'Web DID'
      ELSE 'Direct' END AS direct_subtype
  FROM `pttr-taskdata.ds_crm.raw_calls` rc
  LEFT JOIN `pttr-taskdata.ds_crm.test_numbers` tn ON rc.norm_caller_phone = tn.phone_e164
  LEFT JOIN internal_phones ip ON rc.norm_caller_phone = ip.phone
  LEFT JOIN `pttr-taskdata.ds_crm.lkp_did_trade` lkp ON rc.callee = lkp.did
  LEFT JOIN account_only_phones aop ON rc.norm_caller_phone = aop.phone
  WHERE rc.direction = 'Incoming'
    AND rc.callee != '721'
    AND rc.norm_caller_phone IS NOT NULL AND rc.norm_caller_phone != ''
    AND tn.phone_e164 IS NULL
    AND ip.phone IS NULL
    -- Exclude genuinely internal DIDs (797 Tradesmen, ONA variants) but ALLOW
    -- staff extensions (3xx) — inbound calls to a CSR are real customer calls
    AND rc.callee != '797'
    AND rc.callee NOT LIKE 'ONA%'
    AND rc.callee NOT LIKE 'RingGroup%'
    AND aop.phone IS NULL  -- exclude PM/Account-only phones
),

call_with_wc AS (
  SELECT ic.*, wc.wc_lead_id, wc.wc_channel, wc.wc_source, wc.wc_medium,
    wc.wc_campaign, wc.wc_keyword, wc.wc_profile, wc.wc_tracking_number,
    wc.wc_contact_name, wc.wc_email,
    ROW_NUMBER() OVER (PARTITION BY ic.call_id ORDER BY ABS(TIMESTAMP_DIFF(ic.start_time, wc.wc_timestamp, SECOND))) AS wc_rank
  FROM inbound_calls ic
  LEFT JOIN wc_calls wc ON wc.wc_phone = ic.norm_caller_phone
    AND wc.wc_timestamp BETWEEN TIMESTAMP_SUB(ic.start_time, INTERVAL 5 SECOND) AND TIMESTAMP_ADD(ic.start_time, INTERVAL 5 SECOND)
),

call_rows AS (
  SELECT call_id AS lead_id, 'call' AS source_type, norm_caller_phone AS phone,
    start_time AS lead_timestamp, DATETIME(start_time, 'Australia/Sydney') AS lead_timestamp_sydney,
    duration_sec, callee AS queue_ext, callee_name AS queue_name, is_business_hours,
    CASE WHEN wc_lead_id IS NOT NULL THEN 'whatconverts' ELSE 'direct_did' END AS attribution_source,
    wc_lead_id, COALESCE(wc_channel, 'Direct / Untracked') AS channel,
    COALESCE(wc_source, 'direct') AS source, COALESCE(wc_medium, '(none)') AS medium,
    wc_campaign AS campaign, wc_keyword AS keyword, wc_profile AS profile,
    wc_tracking_number AS tracking_number,
    CASE WHEN wc_lead_id IS NULL THEN direct_subtype END AS direct_subtype,
    CASE WHEN duration_sec = 0 THEN 'missed' WHEN duration_sec < 20 THEN 'dropped' ELSE 'connected' END AS call_outcome,
    answered, missed, talk_time,
    wc_contact_name AS contact_name,
    wc_email AS email,
    CAST(NULL AS STRING) AS form_suburb,
    CAST(NULL AS STRING) AS form_address,
    CAST(NULL AS STRING) AS form_problem
  FROM call_with_wc WHERE wc_rank = 1 OR wc_lead_id IS NULL
),

-- WC calls with no matching 8x8 CDR — these are real leads that would otherwise
-- be missing from the spine entirely. 94 as of 2026-06-21. Includes the 3
-- spine_gap leads from the reconciliation manifest. Uses the same column shape
-- as call_rows so the UNION ALL works.
wc_only_calls AS (
  SELECT
    CAST(wc.lead_id AS STRING) AS lead_id,
    'call' AS source_type,
    wc.phone_norm AS phone,
    TIMESTAMP(wc.lead_datetime, 'Australia/Sydney') AS lead_timestamp,
    wc.lead_datetime AS lead_timestamp_sydney,
    0 AS duration_sec,
    CAST(NULL AS STRING) AS queue_ext,
    CAST(NULL AS STRING) AS queue_name,
    CASE WHEN EXTRACT(DAYOFWEEK FROM wc.lead_datetime) BETWEEN 2 AND 6
      AND EXTRACT(HOUR FROM wc.lead_datetime) >= 7 AND EXTRACT(HOUR FROM wc.lead_datetime) < 17
      THEN TRUE ELSE FALSE END AS is_business_hours,
    'whatconverts' AS attribution_source,
    wc.lead_id AS wc_lead_id,
    COALESCE(wc.channel, 'Direct / Untracked') AS channel,
    COALESCE(wc.lead_source, 'direct') AS source,
    COALESCE(wc.lead_medium, '(none)') AS medium,
    wc.lead_campaign AS campaign,
    wc.lead_keyword AS keyword,
    wc.profile,
    wc.tracking_number,
    CAST(NULL AS STRING) AS direct_subtype,
    'unknown' AS call_outcome,  -- no 8x8 CDR = can't determine outcome
    CAST(NULL AS STRING) AS answered,
    CAST(NULL AS STRING) AS missed,
    CAST(NULL AS STRING) AS talk_time,
    wc.contact_name,
    wc.email,
    CAST(NULL AS STRING) AS form_suburb,
    CAST(NULL AS STRING) AS form_address,
    CAST(NULL AS STRING) AS form_problem
  FROM `pttr-taskdata.ds_crm.vw_leads` wc
  LEFT JOIN `pttr-taskdata.ds_crm.test_numbers` tn ON wc.phone_norm = tn.phone_e164
  WHERE wc.channel = 'Call'
    AND tn.phone_e164 IS NULL  -- not a test number
    AND NOT EXISTS (
      SELECT 1 FROM call_rows cr WHERE cr.wc_lead_id = wc.lead_id
    )
),

form_rows AS (
  SELECT
    CAST(lead_id AS STRING) AS lead_id,
    'form' AS source_type,
    CASE WHEN phone_norm IS NOT NULL AND REGEXP_CONTAINS(phone_norm, r'^\+61[2-9]') THEN phone_norm ELSE NULL END AS phone,
    TIMESTAMP(lead_datetime, 'Australia/Sydney') AS lead_timestamp,
    lead_datetime AS lead_timestamp_sydney,
    0 AS duration_sec,
    CAST(NULL AS STRING) AS queue_ext, CAST(NULL AS STRING) AS queue_name,
    CASE WHEN EXTRACT(DAYOFWEEK FROM lead_datetime) BETWEEN 2 AND 6
      AND EXTRACT(HOUR FROM lead_datetime) >= 7 AND EXTRACT(HOUR FROM lead_datetime) < 17
      THEN TRUE ELSE FALSE END AS is_business_hours,
    'whatconverts' AS attribution_source,
    lead_id AS wc_lead_id, 'Form' AS channel,
    lead_source AS source, lead_medium AS medium,
    lead_campaign AS campaign, lead_keyword AS keyword,
    profile, tracking_number,
    CAST(NULL AS STRING) AS direct_subtype,
    'form_submit' AS call_outcome,
    CAST(NULL AS STRING) AS answered, CAST(NULL AS STRING) AS missed, CAST(NULL AS STRING) AS talk_time,
    contact_name, email,
    CAST(NULL AS STRING) AS form_suburb,
    CAST(NULL AS STRING) AS form_address,
    CAST(NULL AS STRING) AS form_problem
  FROM `pttr-taskdata.ds_crm.vw_leads` WHERE channel = 'Form'
),

-- === FORM-TWIN HYDRATION ===
-- WPForms strips phone/email from WC leads, but the same submission arrives as a
-- parsed jobs@ email that DOES carry them. Match by first-name + ≤5 min window
-- and hydrate the WC form with the twin's phone and email.
-- This lets phoneless WC forms cluster with their AroFlo jobs deterministically.
-- Guard: only hydrate unique matches (no collisions).
--
-- Note: uses raw_emails_received directly (not email_form_parsed, which is defined
-- later in CTE order). Parses name/phone/email inline.
form_twin_candidates AS (
  SELECT
    received_at,
    -- Parse name from email body (same regex as email_form_parsed)
    TRIM(COALESCE(
      REGEXP_EXTRACT(
        REGEXP_REPLACE(REGEXP_REPLACE(body_text, r'<[^>]+>', ' '), r'&[a-zA-Z]+;|&#\d+;', ' '),
        r'(?i)My name is\.{0,3}\s+(.+?)(?:\s+(?:My Problem|I want|My phone|How can))'
      ),
      REGEXP_EXTRACT(
        REGEXP_REPLACE(REGEXP_REPLACE(body_text, r'<[^>]+>', ' '), r'&[a-zA-Z]+;|&#\d+;', ' '),
        r'(?i)Name\*?:?\s+(.+?)(?:\s+(?:Phone|Email|Address|Postcode|Suburb|How Can|Message|LP ))'
      ),
      REGEXP_EXTRACT(
        REGEXP_REPLACE(REGEXP_REPLACE(body_text, r'<[^>]+>', ' '), r'&[a-zA-Z]+;|&#\d+;', ' '),
        r'(?i)Name\*?:?\s+([^\n\r]{2,30})'
      )
    )) AS twin_name,
    -- Parse phone
    COALESCE(
      REGEXP_EXTRACT(
        REGEXP_REPLACE(REGEXP_REPLACE(body_text, r'<[^>]+>', ' '), r'&[a-zA-Z]+;|&#\d+;', ' '),
        r'(?i)(?:Phone\*?:?|phone number is\.{0,3})\s*(\+?[\d\s\-\(\)]{8,15})'
      ),
      REGEXP_EXTRACT(
        REGEXP_REPLACE(REGEXP_REPLACE(body_text, r'<[^>]+>', ' '), r'&[a-zA-Z]+;|&#\d+;', ' '),
        r'(?i)Phone\s+(\d[\d\s\-]{7,14})'
      )
    ) AS twin_raw_phone,
    -- Parse email
    COALESCE(
      REGEXP_EXTRACT(LOWER(
        REGEXP_REPLACE(REGEXP_REPLACE(body_text, r'<[^>]+>', ' '), r'&[a-zA-Z]+;|&#\d+;', ' ')
      ), r'(?:email\*?:?|email is\.{0,3})\s*([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})'),
      REGEXP_EXTRACT(LOWER(
        REGEXP_REPLACE(REGEXP_REPLACE(body_text, r'<[^>]+>', ' '), r'&[a-zA-Z]+;|&#\d+;', ' ')
      ), r'(?:email)\s+([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})')
    ) AS twin_email
  FROM `pttr-taskdata.ds_crm.raw_emails_received`
  WHERE received_at >= '2025-11-01'
    AND from_email IN ('jobs@plumbertotherescue.com.au', 'jobs@electriciantotherescue.com.au',
      'jobs@mrwasher.com.au', 'leads@resend.quinnmarketing.com.au')
    AND subject NOT LIKE 'RE:%' AND subject NOT LIKE 'Re:%'
    AND subject NOT LIKE 'FW:%' AND subject NOT LIKE 'Fw:%'
    AND (
      body_text LIKE '%gad_campaignid=%' OR body_text LIKE '%LP Suburb:%'
      OR body_text LIKE '%LP Service:%'
      OR (body_text LIKE '%utm_source:%' AND body_text LIKE '%Page URL:%')
      OR (body_text LIKE '%hq:%' AND body_text LIKE '%service:%' AND from_email LIKE '%quinn%')
      OR subject LIKE '%PTTR website form submission%'
      OR subject LIKE '%ETTR Website Job Booking%'
      OR subject LIKE '%ETTR Website Question%'
      OR subject LIKE '%New ETTR Website Form%'
    )
),
form_twin_unique AS (
  SELECT *,
    LOWER(TRIM(SPLIT(INITCAP(TRIM(twin_name)), ' ')[SAFE_OFFSET(0)])) AS twin_first_name,
    -- Normalize phone to E.164
    CASE
      WHEN REGEXP_CONTAINS(REGEXP_REPLACE(COALESCE(twin_raw_phone, ''), r'[^0-9]', ''), r'^61[2-9]')
        THEN CONCAT('+', REGEXP_REPLACE(twin_raw_phone, r'[^0-9]', ''))
      WHEN REGEXP_CONTAINS(REGEXP_REPLACE(COALESCE(twin_raw_phone, ''), r'[^0-9]', ''), r'^0[2-9]')
        THEN CONCAT('+61', SUBSTR(REGEXP_REPLACE(twin_raw_phone, r'[^0-9]', ''), 2))
      ELSE NULL
    END AS twin_phone
  FROM form_twin_candidates
  WHERE twin_name IS NOT NULL AND TRIM(twin_name) != ''
),

form_rows_hydrated AS (
  SELECT
    fr.lead_id, fr.source_type,
    COALESCE(fr.phone, twin.twin_phone) AS phone,
    fr.lead_timestamp, fr.lead_timestamp_sydney,
    fr.duration_sec, fr.queue_ext, fr.queue_name, fr.is_business_hours,
    fr.attribution_source, fr.wc_lead_id, fr.channel,
    fr.source, fr.medium, fr.campaign, fr.keyword, fr.profile, fr.tracking_number,
    fr.direct_subtype, fr.call_outcome, fr.answered, fr.missed, fr.talk_time,
    COALESCE(fr.contact_name, wc_ale.best_name) AS contact_name,
    COALESCE(fr.email, twin.twin_email) AS email,
    fr.form_suburb, fr.form_address, fr.form_problem
  FROM form_rows fr
  LEFT JOIN (
    SELECT CAST(lead_id AS STRING) AS lead_id,
      COALESCE(NULLIF(TRIM(contact_name), ''), NULLIF(TRIM(form_my_name), '')) AS best_name
    FROM `pttr-taskdata.gd_WhatConverts.all_leads_enriched`
    WHERE spam = FALSE AND is_test_lead = FALSE
  ) wc_ale ON fr.lead_id = wc_ale.lead_id AND (fr.contact_name IS NULL OR TRIM(fr.contact_name) = '')
  LEFT JOIN (
    -- Deduplicate: only take twins with exactly one candidate per first-name + minute bucket
    SELECT * FROM (
      SELECT *,
        COUNT(*) OVER (PARTITION BY twin_first_name, TIMESTAMP_TRUNC(received_at, MINUTE)) AS candidates
      FROM form_twin_unique
    ) WHERE candidates = 1
  ) twin
    ON (fr.phone IS NULL OR fr.phone = '')
    AND COALESCE(fr.contact_name, wc_ale.best_name) IS NOT NULL
    AND LOWER(TRIM(SPLIT(COALESCE(fr.contact_name, wc_ale.best_name), ' ')[SAFE_OFFSET(0)])) = twin.twin_first_name
    AND twin.twin_first_name != ''
    AND ABS(TIMESTAMP_DIFF(twin.received_at, fr.lead_timestamp, SECOND)) <= 300
),

-- === EMAIL-BASED FORMS (Quinn LP + WPForms, parsed from raw_emails_received) ===
email_form_raw AS (
  SELECT
    message_id,
    received_at,
    DATETIME(received_at, 'Australia/Sydney') AS received_syd,
    from_email,
    subject,
    -- Strip HTML for parsing
    REGEXP_REPLACE(REGEXP_REPLACE(body_text, r'<[^>]+>', ' '), r'&[a-zA-Z]+;|&#\d+;', ' ') AS clean_body,
    body_text
  FROM `pttr-taskdata.ds_crm.raw_emails_received`
  WHERE received_at >= '2025-11-01'  -- go-forward from WC era
    AND from_email IN ('jobs@plumbertotherescue.com.au', 'jobs@electriciantotherescue.com.au',
      'jobs@mrwasher.com.au', 'leads@resend.quinnmarketing.com.au')
    AND subject NOT LIKE 'RE:%' AND subject NOT LIKE 'Re:%'
    AND subject NOT LIKE 'FW:%' AND subject NOT LIKE 'Fw:%'
    AND subject NOT LIKE '%Daily Message%'
    AND body_text NOT LIKE '%alex m%'
    AND subject NOT LIKE '%Test Suburb%' AND subject NOT LIKE '%Test Service%'
    -- Must be a form submission (Quinn LP OR WPForms), not internal CSR traffic
    AND (
      -- Quinn LP signals (template shape, sender-agnostic)
      body_text LIKE '%gad_campaignid=%'
      OR body_text LIKE '%LP Suburb:%'
      OR body_text LIKE '%LP Service:%'
      OR (body_text LIKE '%utm_source:%' AND body_text LIKE '%Page URL:%')
      OR (body_text LIKE '%hq:%' AND body_text LIKE '%service:%' AND from_email LIKE '%quinn%')
      -- WPForms signals
      OR subject LIKE '%PTTR website form submission%'
      OR subject LIKE '%ETTR Website Job Booking%'
      OR subject LIKE '%ETTR Website Question%'
      OR subject LIKE '%New ETTR Website Form%'
    )
),

email_form_parsed AS (
  SELECT
    message_id,
    received_at,
    received_syd,
    from_email,
    subject,

    -- Tier detection (by template shape)
    CASE
      WHEN body_text LIKE '%gad_campaignid=%' AND body_text LIKE '%gclid=%' THEN 'quinn_paid'
      WHEN body_text LIKE '%LP Suburb:%' OR body_text LIKE '%LP Service:%' THEN 'quinn_organic'
      WHEN body_text LIKE '%utm_source:%' AND body_text LIKE '%Page URL:%' AND body_text NOT LIKE '%gclid=%' THEN 'quinn_organic'
      WHEN body_text LIKE '%hq:%' AND body_text LIKE '%service:%' AND from_email LIKE '%quinn%' THEN 'quinn_organic'
      ELSE 'wpforms'
    END AS email_tier,

    -- Contact name (stop at next field label: Phone/Email/Address/Suburb/My Problem/How Can)
    TRIM(COALESCE(
      REGEXP_EXTRACT(clean_body, r'(?i)My name is\.{0,3}\s+(.+?)(?:\s+(?:My Problem|I want|My phone|How can))'),
      REGEXP_EXTRACT(clean_body, r'(?i)Name\*?:?\s+(.+?)(?:\s+(?:Phone|Email|Address|Postcode|Suburb|How Can|Message|LP ))'),
      REGEXP_EXTRACT(clean_body, r'(?i)Name\*?:?\s+([^\n\r]{2,30})')
    )) AS raw_name,

    -- Phone extraction
    COALESCE(
      REGEXP_EXTRACT(clean_body, r'(?i)(?:Phone\*?:?|phone number is\.{0,3})\s*(\+?[\d\s\-\(\)]{8,15})'),
      REGEXP_EXTRACT(clean_body, r'(?i)Phone\s+(\d[\d\s\-]{7,14})')
    ) AS raw_phone,

    -- Email extraction
    COALESCE(
      REGEXP_EXTRACT(LOWER(clean_body), r'(?:email\*?:?|email is\.{0,3})\s*([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})'),
      REGEXP_EXTRACT(LOWER(clean_body), r'(?:email)\s+([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})')
    ) AS extracted_email,

    -- Address / suburb
    TRIM(COALESCE(
      REGEXP_EXTRACT(clean_body, r'(?i)(?:My add?ress is\.{0,3}|Address\*?:?)\s+(.+?)(?:\s+(?:Sent from|My phone|My email|Postcode|LP |Page URL))'),
      REGEXP_EXTRACT(clean_body, r'(?i)(?:My add?ress is\.{0,3}|Address\*?:?)\s+([^\n\r]{3,60})')
    )) AS form_address,

    TRIM(COALESCE(
      REGEXP_EXTRACT(clean_body, r'(?i)(?:LP Suburb|Suburb)\*?:?\s+([^\n\r]{2,40})'),
      REGEXP_EXTRACT(clean_body, r'(?i)Postcode\*?:?\s+(\d{4})')
    )) AS form_suburb,

    -- Problem / message
    TRIM(COALESCE(
      REGEXP_EXTRACT(clean_body, r'(?i)My Problem is\.{0,3}\s+(.+?)(?:\s+(?:I want|My phone|Sent from))'),
      REGEXP_EXTRACT(clean_body, r'(?i)My problem is\.{0,3}\s+(.+?)(?:\s+(?:I want|My phone|Sent from))'),
      REGEXP_EXTRACT(clean_body, r'(?i)How Can We Help\*?:?\s+(.+?)(?:\s+(?:LP |Postcode|Page URL|suburb|service))'),
      REGEXP_EXTRACT(clean_body, r'(?i)Message\s+(.+?)(?:\s+(?:Page URL|hq|Call\s))'),
      REGEXP_EXTRACT(clean_body, r'(?i)My question is\.{0,3}\s+(.+?)(?:\s+(?:My phone|Sent from))')
    )) AS form_problem,

    -- Quinn attribution fields
    REGEXP_EXTRACT(body_text, r'gad_campaignid=(\d+)') AS gad_campaignid,
    REGEXP_EXTRACT(body_text, r'gclid=([^\s&"#]+)') AS gclid,
    COALESCE(
      REGEXP_EXTRACT(clean_body, r'utm_source:\s*(\S+)'),
      REGEXP_EXTRACT(body_text, r'utm_source=([^&\s"]+)')
    ) AS utm_source,
    COALESCE(
      REGEXP_EXTRACT(clean_body, r'utm_medium:\s*(\S+)'),
      REGEXP_EXTRACT(body_text, r'utm_medium=([^&\s"]+)')
    ) AS utm_medium,
    COALESCE(
      REGEXP_EXTRACT(clean_body, r'utm_term:\s*([^\n\r-]+)'),
      REGEXP_EXTRACT(body_text, r'utm_term=([^&\s"]+)')
    ) AS utm_term,

    -- Suburb / service (Quinn LP fields)
    COALESCE(
      REGEXP_EXTRACT(clean_body, r'LP Suburb:\s*([^\n\r]+)'),
      REGEXP_REPLACE(REGEXP_EXTRACT(body_text, r'hq=([^&\s"]+)'), r'%20', ' '),
      REGEXP_EXTRACT(clean_body, r'suburb:\s*([^\n\r]+)'),
      REGEXP_EXTRACT(clean_body, r'Hq:\s*([^\n\r]+)')
    ) AS lp_suburb,
    COALESCE(
      REGEXP_EXTRACT(clean_body, r'LP Service:\s*([^\n\r]+)'),
      REGEXP_REPLACE(REGEXP_EXTRACT(body_text, r'keyword=([^&\s"]+)'), r'%20', ' '),
      REGEXP_EXTRACT(clean_body, r'service:\s*([^\n\r]+)')
    ) AS lp_service,

    -- Profile from sender or service field
    CASE
      WHEN from_email LIKE '%plumber%' OR from_email LIKE '%mrwasher%' THEN 'Plumber to the Rescue'
      WHEN from_email LIKE '%electrician%' THEN 'Electrician to the Rescue'
      WHEN LOWER(COALESCE(
        REGEXP_EXTRACT(clean_body, r'LP Service:\s*([^\n\r]+)'),
        REGEXP_REPLACE(REGEXP_EXTRACT(body_text, r'keyword=([^&\s"]+)'), r'%20', ' '),
        REGEXP_EXTRACT(clean_body, r'service:\s*([^\n\r]+)')
      )) LIKE '%electri%' THEN 'Electrician to the Rescue'
      WHEN LOWER(COALESCE(
        REGEXP_EXTRACT(clean_body, r'LP Service:\s*([^\n\r]+)'),
        REGEXP_REPLACE(REGEXP_EXTRACT(body_text, r'keyword=([^&\s"]+)'), r'%20', ' '),
        REGEXP_EXTRACT(clean_body, r'service:\s*([^\n\r]+)')
      )) LIKE '%plumb%' THEN 'Plumber to the Rescue'
      WHEN from_email LIKE '%quinn%' AND subject LIKE '%New lead:%' THEN 'Electrician to the Rescue'
      WHEN from_email LIKE '%quinn%' AND subject LIKE '%New Lead:%' THEN 'Plumber to the Rescue'
      ELSE NULL
    END AS email_profile

  FROM email_form_raw
  WHERE -- Exclude test submissions
    clean_body NOT LIKE '%test%'
    AND subject NOT LIKE '%Matt Tyson%'
),

email_rows AS (
  SELECT
    CONCAT('email-', message_id) AS lead_id,
    'email' AS source_type,
    -- Normalize phone
    CASE
      WHEN REGEXP_CONTAINS(REGEXP_REPLACE(COALESCE(raw_phone, ''), r'[^0-9]', ''), r'^61[2-9]')
        THEN CONCAT('+', REGEXP_REPLACE(raw_phone, r'[^0-9]', ''))
      WHEN REGEXP_CONTAINS(REGEXP_REPLACE(COALESCE(raw_phone, ''), r'[^0-9]', ''), r'^0[2-9]')
        THEN CONCAT('+61', SUBSTR(REGEXP_REPLACE(raw_phone, r'[^0-9]', ''), 2))
      WHEN REGEXP_CONTAINS(REGEXP_REPLACE(COALESCE(raw_phone, ''), r'[^0-9]', ''), r'^[4][0-9]{8}$')
        THEN CONCAT('+61', REGEXP_REPLACE(raw_phone, r'[^0-9]', ''))
      ELSE NULL
    END AS phone,
    received_at AS lead_timestamp,
    received_syd AS lead_timestamp_sydney,
    0 AS duration_sec,
    CAST(NULL AS STRING) AS queue_ext,
    CAST(NULL AS STRING) AS queue_name,
    CASE WHEN EXTRACT(DAYOFWEEK FROM received_syd) BETWEEN 2 AND 6
      AND EXTRACT(HOUR FROM received_syd) >= 7 AND EXTRACT(HOUR FROM received_syd) < 17
      THEN TRUE ELSE FALSE END AS is_business_hours,
    CASE WHEN email_tier = 'quinn_paid' THEN 'quinn_lp' ELSE 'email_form' END AS attribution_source,
    CAST(NULL AS INT64) AS wc_lead_id,
    CASE
      WHEN email_tier = 'quinn_paid' THEN 'Paid Search (Quinn LP)'
      WHEN email_tier = 'quinn_organic' THEN 'Organic - Landing Page'
      ELSE 'Website Form'
    END AS channel,
    CASE WHEN email_tier = 'quinn_paid' THEN COALESCE(utm_source, 'google') ELSE 'direct' END AS source,
    CASE WHEN email_tier = 'quinn_paid' THEN COALESCE(utm_medium, 'cpc') ELSE '(none)' END AS medium,
    gad_campaignid AS campaign,
    COALESCE(TRIM(utm_term), TRIM(lp_service)) AS keyword,
    email_profile AS profile,
    CAST(NULL AS STRING) AS tracking_number,
    CAST(NULL AS STRING) AS direct_subtype,
    'form_submit' AS call_outcome,
    CAST(NULL AS STRING) AS answered,
    CAST(NULL AS STRING) AS missed,
    CAST(NULL AS STRING) AS talk_time,
    INITCAP(TRIM(raw_name)) AS contact_name,
    extracted_email AS email,
    form_suburb,
    form_address,
    form_problem
  FROM email_form_parsed
  -- Exclude email-parsed forms that duplicate a WC form (same name + ±60s).
  -- The WC version has better attribution; the email copy would create a split opp.
  -- Uses the hydrated form rows so the name comparison works even when vw_leads had NULL.
  WHERE NOT EXISTS (
    SELECT 1 FROM form_rows_hydrated fr
    WHERE fr.contact_name IS NOT NULL
      AND LOWER(TRIM(fr.contact_name)) = LOWER(TRIM(INITCAP(TRIM(email_form_parsed.raw_name))))
      AND ABS(TIMESTAMP_DIFF(
        fr.lead_timestamp,
        email_form_parsed.received_at,
        SECOND
      )) <= 60
  )
)

SELECT * FROM call_rows
UNION ALL
SELECT * FROM wc_only_calls
UNION ALL
SELECT * FROM form_rows_hydrated
UNION ALL
SELECT * FROM email_rows;
