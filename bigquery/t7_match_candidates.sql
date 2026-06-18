-- t7_match_candidates.sql — Stage 1: Candidate Generation for T7-MATCH
-- Per §5.3 of PETTR_CRM_DATA_SPEC.md (commit 6ca94b2).
-- Deterministic SQL. No AI. Produces candidates with pre-computed PHONE_MATCH / EMAIL_MATCH.
--
-- ELIGIBLE LEADS: gap_based, gate_stage = judgement:NQ/NB, full_content > 50 chars,
--   phone NOT on 10+ Account job descriptions (conflation guard), WC leads only.
-- CANDIDATES: same service, forward 0 to +30d, up to 15 per lead by date proximity.
--   HYBRID: detected mislabels get 15 same-trade + 15 other-trade (per-bucket rn).
-- PRE-COMPUTED: PHONE_MATCH and EMAIL_MATCH booleans per candidate.

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 1: Eligible leads
-- ═══════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE t7m_eligible_leads AS
WITH
-- Conflation guard: phones on 10+ Account job descriptions
conflated_phones AS (
  SELECT phone FROM (
    SELECT gp.phone, COUNT(DISTINCT td.jobnumber) AS desc_count
    FROM (SELECT DISTINCT phone FROM `pttr-taskdata.ds_crm.opportunities`
          WHERE opp_type = 'gap_based' AND phone IS NOT NULL) gp
    JOIN `pttr-taskdata.ds_aroflo.tasks_deduped` td
      ON REPLACE(REPLACE(td.description, ' ', ''), '&nbsp;', '')
         LIKE CONCAT('%', SUBSTR(gp.phone, 4), '%')
    JOIN `pttr-taskdata.ds_aroflo.tasks_complete` tc ON td.jobnumber = tc.jobnumber
    WHERE tc.customer_type = 'Account'
    GROUP BY gp.phone
  ) WHERE desc_count >= 10
),
-- Leads with matchable signal: content with problem keywords, OR identity
-- signals (name/phone/email/suburb) from enriched view. Replaces the prior
-- LENGTH(full_content) > 50 filter which wrongly excluded identity-rich
-- short leads (phone+email bundles) while passing signal-free greeting text.
leads_with_signal AS (
  -- Has problem-keyword content (greeting-stripped)
  SELECT DISTINCT lt.opportunity_id
  FROM `pttr-taskdata.ds_crm.lead_timeline` lt
  WHERE lt.gate_stage = 'judgement:NQ/NB'
    AND lt.full_content IS NOT NULL
    AND LENGTH(lt.full_content) > 10
    AND REGEXP_CONTAINS(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(LOWER(lt.full_content),
            r'(thank you for (calling|contacting|choosing)[^.]*\.?\s*)', ''),
          r'(welcome to\s+(plumb|electri)[^.]*\.?\s*)', ''),
        r'((you.ve (called|reached|contacted)\s+(plumb|electri))[^.]*\.?\s*)', ''),
      r'(plumb|electri|tap|drain|toilet|leak|water|pipe|sewer|blocked|power|switch|light|circuit|breaker|fuse|fan|smoke|shower|bath|sink|hot|repair|fix|install|replace|broken|fault|damage|flood|drip)')
  UNION DISTINCT
  -- Has identity signal (phone/name/email/suburb) — catches leads with
  -- no content but real identity signals
  SELECT DISTINCT o.opportunity_id
  FROM `pttr-taskdata.ds_crm.opportunities` o
  WHERE o.phone IS NOT NULL
  UNION DISTINCT
  SELECT DISTINCT le.opportunity_id
  FROM `pttr-taskdata.ds_crm.vw_lead_enriched` le
  WHERE le.contact_name IS NOT NULL AND le.contact_name != ''
  UNION DISTINCT
  SELECT DISTINCT le.opportunity_id
  FROM `pttr-taskdata.ds_crm.vw_lead_enriched` le
  WHERE le.email IS NOT NULL AND le.email != ''
  UNION DISTINCT
  SELECT DISTINCT le.opportunity_id
  FROM `pttr-taskdata.ds_crm.vw_lead_enriched` le
  WHERE le.suburb IS NOT NULL AND le.suburb != ''
),
-- Gate filter: must have NQ/NB gate stage
has_nqnb_gate AS (
  SELECT DISTINCT lt.opportunity_id
  FROM `pttr-taskdata.ds_crm.lead_timeline` lt
  WHERE lt.gate_stage = 'judgement:NQ/NB'
)
SELECT DISTINCT  -- DISTINCT: guards against vw_lead_enriched fanout (4 opps have dupes)
  o.opportunity_id,
  o.phone AS lead_phone,
  DATE(o.opportunity_timestamp) AS lead_date,
  le.service,
  le.contact_name AS lead_name,
  le.suburb AS lead_suburb
FROM `pttr-taskdata.ds_crm.opportunities` o
JOIN `pttr-taskdata.ds_crm.vw_lead_enriched` le ON o.opportunity_id = le.opportunity_id
JOIN has_nqnb_gate g ON o.opportunity_id = g.opportunity_id
JOIN leads_with_signal lws ON o.opportunity_id = lws.opportunity_id
WHERE o.opp_type = 'gap_based'
  AND o.jobnumber IS NULL
  AND o.wc_lead_id IS NOT NULL  -- WC leads only per §5.3 scope
  AND (o.phone IS NULL OR o.phone NOT IN (SELECT phone FROM conflated_phones));

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 1b: Mislabel detector — flag leads whose content describes the
--   OTHER trade (greeting + signature stripped). These get an extra
--   15 other-trade candidates (hybrid bucket).
-- ═══════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE t7m_mislabel_flags AS
WITH lead_text AS (
  SELECT el.opportunity_id, el.service,
    STRING_AGG(
      LOWER(REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(lt.full_content,
              -- Strip greetings: "thank you for calling/contacting/choosing [brand]..."
              r'(?i)(thank you for (calling|contacting|choosing)[^.]*\.?\s*)', ''),
            -- Strip "welcome to [brand]..."
            r'(?i)(welcome to\s+(plumb|electri)[^.]*\.?\s*)', ''),
          -- Strip "you've called/reached/contacted [brand]..."
          r'(?i)((you.ve (called|reached|contacted)\s+(plumb|electri))[^.]*\.?\s*)', ''),
        -- Strip "Plumber & Electrician To The Rescue" signature blocks
        r'(?i)(plumb\w*\s*[&and]+\s*electri\w*\s*to\s*the\s*rescue[^\n]*)', '')),
      ' ') AS stripped_text
  FROM t7m_eligible_leads el
  JOIN `pttr-taskdata.ds_crm.lead_timeline` lt ON el.opportunity_id = lt.opportunity_id
  WHERE lt.full_content IS NOT NULL
  GROUP BY el.opportunity_id, el.service
)
SELECT opportunity_id, service,
  -- TRUE when content has OTHER-trade keywords and NO own-trade keywords
  TRUE AS is_mislabel
FROM lead_text
WHERE
  (service IN ('ETTR', 'Electrical')
    AND REGEXP_CONTAINS(stripped_text,
      r'(plumb|tap|drain|toilet|leak|water.?heat|hot.?water|pipe|sewer|blocked|cistern|shower|bath|sink)')
    AND NOT REGEXP_CONTAINS(stripped_text,
      r'(electri|power.?point|switch|light|wir|circuit|breaker|fuse|socket|meter.?box|safety.?switch|smoke.?alarm|fan|downlight)'))
  OR
  (service IN ('PTTR', 'Plumbing')
    AND REGEXP_CONTAINS(stripped_text,
      r'(electri|power.?point|switch|light|wir|circuit|breaker|fuse|socket|meter.?box|safety.?switch|smoke.?alarm|fan|downlight)')
    AND NOT REGEXP_CONTAINS(stripped_text,
      r'(plumb|tap|drain|toilet|leak|water.?heat|hot.?water|pipe|sewer|blocked|cistern|shower|bath|sink)'));

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 2: Lead phones (primary + content-extracted)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE t7m_lead_phones AS
-- Primary phone
SELECT opportunity_id, lead_phone AS phone
FROM t7m_eligible_leads
WHERE lead_phone IS NOT NULL
UNION DISTINCT
-- Content-extracted phones (non-primary 04XX from lead_timeline.full_content)
SELECT el.opportunity_id,
  CONCAT('+61', SUBSTR(REGEXP_REPLACE(pm, r'[\s\-]', ''), 2)) AS phone
FROM t7m_eligible_leads el
JOIN `pttr-taskdata.ds_crm.lead_timeline` lt ON el.opportunity_id = lt.opportunity_id,
UNNEST(REGEXP_EXTRACT_ALL(lt.full_content,
  r'(04[\d][\d][\s\-]?[\d][\d][\d][\s\-]?[\d][\d][\d])')) AS pm
WHERE lt.full_content IS NOT NULL
  AND LENGTH(REGEXP_REPLACE(pm, r'[\s\-]', '')) = 10;

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 3: Lead emails (from vw_lead_enriched + content-extracted)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE t7m_lead_emails AS
SELECT opportunity_id, LOWER(TRIM(email)) AS email
FROM (
  -- From enriched view
  SELECT el.opportunity_id, le.email
  FROM t7m_eligible_leads el
  JOIN `pttr-taskdata.ds_crm.vw_lead_enriched` le ON el.opportunity_id = le.opportunity_id
  WHERE le.email IS NOT NULL AND le.email != ''
  UNION DISTINCT
  -- From lead content (regex extract)
  SELECT el.opportunity_id,
    LOWER(REGEXP_EXTRACT(lt.full_content, r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'))
  FROM t7m_eligible_leads el
  JOIN `pttr-taskdata.ds_crm.lead_timeline` lt ON el.opportunity_id = lt.opportunity_id
  WHERE lt.full_content IS NOT NULL
    AND REGEXP_CONTAINS(lt.full_content, r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
)
WHERE email IS NOT NULL AND email != '';

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 4: Candidate jobs — hybrid buckets
--   ALL leads: 15 same-trade candidates (trade_bucket = 'same')
--   Mislabels only: +15 other-trade candidates (trade_bucket = 'other')
--   rn resets per bucket. Normal leads are byte-identical to prior logic.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE t7m_candidates AS
WITH
-- Bucket A: same-trade (ALL leads, unchanged)
same_trade AS (
  SELECT
    el.opportunity_id,
    tc.jobnumber,
    tc.client_name,
    tc.customer_type,
    tc.address_suburb AS job_suburb,
    tc.task_type AS job_task_type,
    tc.job_status,
    tc.requested_date_parsed AS job_date,
    DATE_DIFF(tc.requested_date_parsed, el.lead_date, DAY) AS days_fwd,
    COALESCE(inv.invoiced_total_ex, 0) AS invoiced_ex,
    SUBSTR(REGEXP_REPLACE(REGEXP_REPLACE(td.description, r'<[^>]+>', ' '),
      r'&[a-zA-Z]+;|&#\d+;', ' '), 1, 500) AS job_description,
    'same' AS trade_bucket,
    ROW_NUMBER() OVER (
      PARTITION BY el.opportunity_id
      ORDER BY DATE_DIFF(tc.requested_date_parsed, el.lead_date, DAY), tc.jobnumber
    ) AS rn
  FROM t7m_eligible_leads el
  JOIN `pttr-taskdata.ds_aroflo.tasks_complete` tc
    ON DATE_DIFF(tc.requested_date_parsed, el.lead_date, DAY) BETWEEN 0 AND 30
    AND ((el.service IN ('PTTR', 'Plumbing') AND tc.task_type LIKE '%Plumb%')
      OR (el.service IN ('ETTR', 'Electrical') AND tc.task_type LIKE '%Electri%'))
  JOIN `pttr-taskdata.ds_aroflo.tasks_deduped` td ON tc.jobnumber = td.jobnumber
  LEFT JOIN `pttr-taskdata.ds_aroflo.vw_job_invoiced` inv ON tc.jobnumber = inv.jobnumber
),
-- Bucket B: other-trade (ONLY mislabel-flagged leads)
other_trade AS (
  SELECT
    el.opportunity_id,
    tc.jobnumber,
    tc.client_name,
    tc.customer_type,
    tc.address_suburb AS job_suburb,
    tc.task_type AS job_task_type,
    tc.job_status,
    tc.requested_date_parsed AS job_date,
    DATE_DIFF(tc.requested_date_parsed, el.lead_date, DAY) AS days_fwd,
    COALESCE(inv.invoiced_total_ex, 0) AS invoiced_ex,
    SUBSTR(REGEXP_REPLACE(REGEXP_REPLACE(td.description, r'<[^>]+>', ' '),
      r'&[a-zA-Z]+;|&#\d+;', ' '), 1, 500) AS job_description,
    'other' AS trade_bucket,
    ROW_NUMBER() OVER (
      PARTITION BY el.opportunity_id
      ORDER BY DATE_DIFF(tc.requested_date_parsed, el.lead_date, DAY), tc.jobnumber
    ) AS rn
  FROM t7m_eligible_leads el
  JOIN t7m_mislabel_flags mf ON el.opportunity_id = mf.opportunity_id
  JOIN `pttr-taskdata.ds_aroflo.tasks_complete` tc
    ON DATE_DIFF(tc.requested_date_parsed, el.lead_date, DAY) BETWEEN 0 AND 30
    -- INVERTED service match: PTTR→Electrical, ETTR→Plumbing
    AND ((el.service IN ('PTTR', 'Plumbing') AND tc.task_type LIKE '%Electri%')
      OR (el.service IN ('ETTR', 'Electrical') AND tc.task_type LIKE '%Plumb%'))
  JOIN `pttr-taskdata.ds_aroflo.tasks_deduped` td ON tc.jobnumber = td.jobnumber
  LEFT JOIN `pttr-taskdata.ds_aroflo.vw_job_invoiced` inv ON tc.jobnumber = inv.jobnumber
)
SELECT * FROM same_trade WHERE rn <= 15
UNION ALL
SELECT * FROM other_trade WHERE rn <= 15;

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 5: Extract ALL phones from each candidate's identity bundle
-- ═══════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE t7m_candidate_phones AS
-- Structured phones
SELECT c.opportunity_id, c.jobnumber, tc.id_phone AS phone
FROM t7m_candidates c
JOIN `pttr-taskdata.ds_aroflo.tasks_complete` tc ON c.jobnumber = tc.jobnumber
WHERE tc.id_phone IS NOT NULL AND tc.id_phone != ''
UNION DISTINCT
SELECT c.opportunity_id, c.jobnumber, tc.norm_client_phone
FROM t7m_candidates c
JOIN `pttr-taskdata.ds_aroflo.tasks_complete` tc ON c.jobnumber = tc.jobnumber
WHERE tc.norm_client_phone IS NOT NULL AND tc.norm_client_phone != ''
UNION DISTINCT
SELECT c.opportunity_id, c.jobnumber, tc.norm_client_mobile
FROM t7m_candidates c
JOIN `pttr-taskdata.ds_aroflo.tasks_complete` tc ON c.jobnumber = tc.jobnumber
WHERE tc.norm_client_mobile IS NOT NULL AND tc.norm_client_mobile != ''
UNION DISTINCT
-- Contact mobile (via contact_userid → contacts_deduped)
SELECT c.opportunity_id, c.jobnumber,
  CASE WHEN LENGTH(REGEXP_REPLACE(cd.mobile, r'[^\d]', '')) = 10
    THEN CONCAT('+61', SUBSTR(REGEXP_REPLACE(cd.mobile, r'[^\d]', ''), 2))
  END
FROM t7m_candidates c
JOIN `pttr-taskdata.ds_aroflo.tasks_deduped` td ON c.jobnumber = td.jobnumber
JOIN `pttr-taskdata.ds_aroflo.contacts_deduped` cd
  ON CAST(td.contact_userid AS STRING) = CAST(cd.userid AS STRING)
WHERE cd.mobile IS NOT NULL AND cd.mobile != ''
UNION DISTINCT
-- Description phones (all 04XX, stripped)
SELECT c.opportunity_id, c.jobnumber,
  CONCAT('+61', SUBSTR(pm, 2))
FROM t7m_candidates c
JOIN `pttr-taskdata.ds_aroflo.tasks_deduped` td ON c.jobnumber = td.jobnumber,
UNNEST(REGEXP_EXTRACT_ALL(
  REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(td.description, r'<[^>]+>', ' '), r'&[a-zA-Z]+;|&#\d+;', ' '), ' ', ''),
  r'(04\d{8})')) AS pm
UNION DISTINCT
-- Task notes phones
SELECT c.opportunity_id, c.jobnumber,
  CONCAT('+61', SUBSTR(REGEXP_REPLACE(pm, r'[\s\-]', ''), 2))
FROM t7m_candidates c
JOIN `pttr-taskdata.ds_aroflo.task_notes_deduped` tn ON c.jobnumber = tn.jobnumber,
UNNEST(REGEXP_EXTRACT_ALL(tn.note_clean, r'(04\d\d[\s\-]?\d\d\d[\s\-]?\d\d\d)')) AS pm
WHERE LENGTH(REGEXP_REPLACE(pm, r'[\s\-]', '')) = 10
UNION DISTINCT
-- Labour notes phones
SELECT c.opportunity_id, c.jobnumber,
  CONCAT('+61', SUBSTR(REGEXP_REPLACE(pm, r'[\s\-]', ''), 2))
FROM t7m_candidates c
JOIN `pttr-taskdata.ds_aroflo.tasklabours_raw` tl ON c.jobnumber = tl.task_jobnumber,
UNNEST(REGEXP_EXTRACT_ALL(tl.note, r'(04\d\d[\s\-]?\d\d\d[\s\-]?\d\d\d)')) AS pm
WHERE tl.note IS NOT NULL AND LENGTH(REGEXP_REPLACE(pm, r'[\s\-]', '')) = 10
  AND (tl.deleted IS NULL OR tl.deleted != 'true');

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 6: Extract ALL emails from each candidate's identity bundle
-- ═══════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE t7m_candidate_emails AS
SELECT c.opportunity_id, c.jobnumber, LOWER(TRIM(email)) AS email
FROM t7m_candidates c
JOIN (
  -- Client email
  SELECT jobnumber, norm_client_email AS email
  FROM `pttr-taskdata.ds_aroflo.tasks_complete`
  WHERE norm_client_email IS NOT NULL AND norm_client_email != ''
  UNION DISTINCT
  -- Contact email
  SELECT td.jobnumber, LOWER(TRIM(cd.email))
  FROM `pttr-taskdata.ds_aroflo.tasks_deduped` td
  JOIN `pttr-taskdata.ds_aroflo.contacts_deduped` cd
    ON CAST(td.contact_userid AS STRING) = CAST(cd.userid AS STRING)
  WHERE cd.email IS NOT NULL AND cd.email != ''
  UNION DISTINCT
  -- Description emails
  SELECT td.jobnumber,
    LOWER(REGEXP_EXTRACT(
      REGEXP_REPLACE(REGEXP_REPLACE(td.description, r'<[^>]+>', ' '), r'&[a-zA-Z]+;|&#\d+;', ' '),
      r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'))
  FROM `pttr-taskdata.ds_aroflo.tasks_deduped` td
  WHERE REGEXP_CONTAINS(td.description, r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
) job_emails ON c.jobnumber = job_emails.jobnumber
WHERE email IS NOT NULL AND email != '';

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 7: Final output — candidates with pre-computed PHONE_MATCH / EMAIL_MATCH
-- ═══════════════════════════════════════════════════════════════════════
SELECT
  c.opportunity_id,
  c.jobnumber,
  c.client_name,
  c.customer_type,
  c.job_suburb,
  c.job_task_type,
  c.job_status,
  c.job_date,
  c.days_fwd,
  c.invoiced_ex,
  c.job_description,
  c.trade_bucket,
  c.rn AS candidate_rank,
  -- PRE-COMPUTED: does ANY lead phone match ANY candidate phone?
  EXISTS(
    SELECT 1 FROM t7m_lead_phones lp
    JOIN t7m_candidate_phones cp ON lp.phone = cp.phone
    WHERE lp.opportunity_id = c.opportunity_id AND cp.jobnumber = c.jobnumber
      AND cp.opportunity_id = c.opportunity_id
  ) AS phone_match,
  -- PRE-COMPUTED: does ANY lead email match ANY candidate email?
  EXISTS(
    SELECT 1 FROM t7m_lead_emails le
    JOIN t7m_candidate_emails ce ON le.email = ce.email
    WHERE le.opportunity_id = c.opportunity_id AND ce.jobnumber = c.jobnumber
      AND ce.opportunity_id = c.opportunity_id
  ) AS email_match
FROM t7m_candidates c
ORDER BY c.opportunity_id, c.trade_bucket, c.rn;
