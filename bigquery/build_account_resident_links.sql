-- =============================================================================
-- build_account_resident_links.sql
-- §5.1 Account/Resident-Phone Link Tier
--
-- Links COD gap-based leads to Account jobs where the resident's 04XX mobile
-- appears in the Account job's task_description.
--
-- EXTRACTION: any 10-digit 04XX mobile in task_description, GUARDED by:
--   - Keyword exclusion: Agent, Manager, (BM), BM, B/M, Real Estate,
--     Property Manager within 50 chars BEFORE the phone → excluded
--   - Description-level frequency: phone appearing in 3+ different Account
--     job descriptions → excluded (building-manager / site-contact pattern)
--
-- THREE CONSTRAINTS (all required):
--   1. UNIQUE caller phone only — phones appearing as structured client phone
--      on 3+ distinct Account clients are excluded (strata office lines).
--      Keyword + frequency guards exclude manager/agent phones at the
--      description level.
--   2. 30-day FORWARD window — job requestdate must be within 30 days
--      AFTER the lead date.
--   3. Flag is_account=TRUE + exclude_from_analysis=TRUE, keyed by
--      opportunity_id + jobnumber.
--
-- Idempotent: safe to re-run. Uses MERGE to upsert.
-- Does NOT touch build_opportunities.sql or the orchestrator.
-- =============================================================================

-- Step 0: Add columns to crm_account_exclusions if they don't exist.
-- BQ DDL: ALTER TABLE ADD COLUMN IF NOT EXISTS is safe to re-run.
ALTER TABLE `pttr-taskdata.ds_crm.crm_account_exclusions`
  ADD COLUMN IF NOT EXISTS jobnumber STRING,
  ADD COLUMN IF NOT EXISTS matched_phone STRING,
  ADD COLUMN IF NOT EXISTS account_client STRING,
  ADD COLUMN IF NOT EXISTS match_tier STRING,
  ADD COLUMN IF NOT EXISTS invoiced_ex FLOAT64,
  ADD COLUMN IF NOT EXISTS days_lead_to_job INT64;

-- Step 1: Build the candidate match set in a temp table.
CREATE TEMP TABLE resident_phone_matches AS

WITH
-- ─── Constraint 1a: Structured shared-line exclusion (3+ distinct clients) ───
shared_line_phones AS (
  SELECT phone
  FROM (
    SELECT phone, COUNT(DISTINCT client_name) AS client_count
    FROM (
      SELECT norm_client_phone AS phone, client_name
        FROM `pttr-taskdata.ds_aroflo.tasks_complete`
       WHERE customer_type = 'Account'
         AND norm_client_phone IS NOT NULL AND norm_client_phone != ''
      UNION ALL
      SELECT norm_client_mobile, client_name
        FROM `pttr-taskdata.ds_aroflo.tasks_complete`
       WHERE customer_type = 'Account'
         AND norm_client_mobile IS NOT NULL AND norm_client_mobile != ''
      UNION ALL
      SELECT id_phone, client_name
        FROM `pttr-taskdata.ds_aroflo.tasks_complete`
       WHERE customer_type = 'Account'
         AND id_phone IS NOT NULL AND id_phone != ''
    )
    GROUP BY phone
  )
  WHERE client_count >= 3
),

-- ─── Guarded-broad extraction: any 04XX mobile from Account job descriptions ───
-- Extract all 04XX 10-digit mobiles (handles spaces, dashes, no separator)
all_04_raw AS (
  SELECT
    td.jobnumber,
    tc.requested_date_parsed AS job_date,
    tc.client_name,
    td.description,
    phone_match AS phone_raw,
    CONCAT('+61', SUBSTR(REGEXP_REPLACE(phone_match, r'[\s\-]', ''), 2))
      AS resident_phone
  FROM `pttr-taskdata.ds_aroflo.tasks_complete` tc
  JOIN `pttr-taskdata.ds_aroflo.tasks_deduped` td
    ON tc.jobnumber = td.jobnumber,
  UNNEST(REGEXP_EXTRACT_ALL(td.description,
    r'(04[\d][\d][\s\-]?[\d][\d][\d][\s\-]?[\d][\d][\d])'
  )) AS phone_match
  WHERE tc.customer_type = 'Account'
    AND LENGTH(REGEXP_REPLACE(phone_match, r'[\s\-]', '')) = 10
),

-- ─── Keyword exclusion guard ───
-- Check 50 chars BEFORE the phone in the description.
-- Exclude if preceding context contains: Agent, Manager, (BM), BM, B/M,
-- Real Estate, Property Manager.
with_context AS (
  SELECT
    jobnumber,
    job_date,
    client_name,
    resident_phone,
    phone_raw,
    CASE
      WHEN STRPOS(description, phone_raw) > 50
        THEN SUBSTR(description,
               STRPOS(description, phone_raw) - 50, 50)
      WHEN STRPOS(description, phone_raw) > 0
        THEN SUBSTR(description,
               1, STRPOS(description, phone_raw) - 1)
      ELSE ''
    END AS before_50
  FROM all_04_raw
),

keyword_filtered AS (
  SELECT jobnumber, job_date, client_name, resident_phone
  FROM with_context
  WHERE NOT REGEXP_CONTAINS(
    IFNULL(before_50, ''),
    r'(?i)(?:\bAgent\b|\bManager\b|\(BM\)|\bBM\s|\bB/M\b|Real\s*Estate|Property\s*Manager)'
  )
),

-- ─── Description-level frequency guard ───
-- Phones appearing in 3+ different Account job descriptions are excluded
-- (building-manager / site-contact pattern, e.g. Karl Reid).
desc_freq_exclusions AS (
  SELECT resident_phone
  FROM keyword_filtered
  GROUP BY resident_phone
  HAVING COUNT(DISTINCT jobnumber) >= 3
),

-- ─── Apply all exclusions and deduplicate ───
account_phones AS (
  SELECT DISTINCT jobnumber, job_date, client_name, resident_phone
  FROM keyword_filtered
  WHERE resident_phone NOT IN (SELECT phone FROM shared_line_phones)
    AND resident_phone NOT IN (SELECT resident_phone FROM desc_freq_exclusions)
),

-- ─── COD gap-based leads ───
cod_leads AS (
  SELECT
    opportunity_id,
    phone,
    DATE(opportunity_timestamp) AS lead_date
  FROM `pttr-taskdata.ds_crm.opportunities`
  WHERE phone IS NOT NULL
    AND opp_type = 'gap_based'
),

-- ─── Constraint 2: 30-day forward window join ───
raw_matches AS (
  SELECT
    cl.opportunity_id,
    cl.phone          AS lead_phone,
    cl.lead_date,
    ap.jobnumber,
    ap.job_date,
    ap.client_name,
    DATE_DIFF(ap.job_date, cl.lead_date, DAY) AS days_lead_to_job
  FROM cod_leads cl
  JOIN account_phones ap
    ON cl.phone = ap.resident_phone
   AND ap.job_date >= cl.lead_date
   AND ap.job_date <= DATE_ADD(cl.lead_date, INTERVAL 30 DAY)
),

-- Pick nearest job per lead (tiebreak: earliest job date, then lowest JN)
ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY opportunity_id
      ORDER BY days_lead_to_job, jobnumber
    ) AS rn
  FROM raw_matches
)

SELECT
  r.opportunity_id,
  r.lead_phone      AS matched_phone,
  r.lead_date,
  r.jobnumber,
  r.job_date,
  r.client_name     AS account_client,
  r.days_lead_to_job,
  COALESCE(inv.invoiced_total_ex, 0) AS invoiced_ex
FROM ranked r
LEFT JOIN `pttr-taskdata.ds_aroflo.vw_job_invoiced` inv
  ON r.jobnumber = inv.jobnumber
WHERE r.rn = 1;


-- Step 2: MERGE into crm_account_exclusions.
-- - Net-new rows: INSERT with full detail.
-- - Existing rows (already excluded): UPDATE to add/refresh jobnumber + details.
MERGE `pttr-taskdata.ds_crm.crm_account_exclusions` AS tgt
USING resident_phone_matches AS src
  ON tgt.opportunity_id = src.opportunity_id
WHEN MATCHED THEN UPDATE SET
  tgt.jobnumber        = src.jobnumber,
  tgt.matched_phone    = src.matched_phone,
  tgt.account_client   = src.account_client,
  tgt.match_tier       = 'auto:resident_phone_tier',
  tgt.invoiced_ex      = src.invoiced_ex,
  tgt.days_lead_to_job = src.days_lead_to_job,
  tgt.synced_at        = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (
  opportunity_id, is_account, provenance, synced_at,
  jobnumber, matched_phone, account_client, match_tier, invoiced_ex, days_lead_to_job
) VALUES (
  src.opportunity_id, TRUE, 'auto:resident_phone_tier', CURRENT_TIMESTAMP(),
  src.jobnumber, src.matched_phone, src.account_client, 'auto:resident_phone_tier',
  src.invoiced_ex, src.days_lead_to_job
);


-- Step 3: Reconciliation — flag existing sms_jn_tier entries that did NOT match
-- under these rules. Output for review, do NOT delete.
SELECT
  e.opportunity_id,
  o.phone,
  DATE(o.opportunity_timestamp) AS lead_date,
  e.provenance,
  CASE
    WHEN rpm.opportunity_id IS NOT NULL THEN 'ALSO_MATCHED_NEW_RULES'
    ELSE 'SMS_JN_ONLY — review'
  END AS reconciliation_status
FROM `pttr-taskdata.ds_crm.crm_account_exclusions` e
JOIN `pttr-taskdata.ds_crm.opportunities` o
  ON e.opportunity_id = o.opportunity_id
LEFT JOIN resident_phone_matches rpm
  ON e.opportunity_id = rpm.opportunity_id
WHERE e.provenance = 'auto:sms_jn_tier'
ORDER BY reconciliation_status, lead_date;


-- Step 4: Audit — shared-line phones excluded (for log).
SELECT
  phone,
  STRING_AGG(DISTINCT client_name, ', ' ORDER BY client_name) AS client_names,
  COUNT(DISTINCT client_name) AS client_count
FROM (
  SELECT norm_client_phone AS phone, client_name
    FROM `pttr-taskdata.ds_aroflo.tasks_complete`
   WHERE customer_type = 'Account' AND norm_client_phone IS NOT NULL
  UNION ALL
  SELECT norm_client_mobile, client_name
    FROM `pttr-taskdata.ds_aroflo.tasks_complete`
   WHERE customer_type = 'Account' AND norm_client_mobile IS NOT NULL
  UNION ALL
  SELECT id_phone, client_name
    FROM `pttr-taskdata.ds_aroflo.tasks_complete`
   WHERE customer_type = 'Account' AND id_phone IS NOT NULL
)
WHERE phone IS NOT NULL AND phone != ''
GROUP BY phone
HAVING COUNT(DISTINCT client_name) >= 3
ORDER BY client_count DESC;
