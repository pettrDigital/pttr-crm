-- PARKED — not yet applied. Parallel dedup to vw_job_invoiced.dedup.sql; fixes the
-- same approved/processed same-invoicenumber double-count in the job_gross CTE
-- (JN 140927, $596). Apply together with vw_job_invoiced.dedup.sql via table-level
-- replacement, then re-run cascade. NOTE: vw_job_revenue is an independent revenue
-- surface (net model) — keep in sync with vw_job_invoiced's dedup or the two will drift.
--
-- vw_job_revenue: Per-job revenue model with cross-task credit linking.
--
-- Layers on top of vw_job_invoiced (unchanged). vw_job_invoiced sums invoices
-- per task_jobnumber including same-task credits. This view adds CROSS-task
-- credit linking: when AroFlo creates a NEW task with a negative invoice to
-- credit an archived job, this view attributes that credit back to the parent.
--
-- PARENT-LINKING CASCADE (cheapest reliable method first, ABSTAIN on ambiguity):
--   T1: strict "credit note against JN \d+"
--   T2: widened JN regex (jn#, j/n, job no, "created from JN", "ref JN/job",
--       HTML entity stripping)
--   T3: invoice-number trace → invoices_deduped.invoicenumber → task_jobnumber
--   T4: client + 60-day window match — ONLY when exactly 1 candidate parent
--   Abstain: ~15 credits / ~$3,476 (4.3% of credit volume) — unattributed
--
-- CREDIT TYPING (keyword on credit task description):
--   bad_debt:  "bad debt", "write off", "writing off"
--   refund:    "refund"
--   discount:  "discount", "goodwill", "price adjust"
--   other:     none of the above (unclassified, held for review)
--
-- REVENUE MODEL per job:
--   gross_revenue  = SUM of positive invoices on the job
--   refunds        = linked refund credits (negative, netted)
--   discounts      = linked discount credits (negative, netted)
--   bad_debt       = linked bad-debt credits (negative, tracked separately)
--   net_revenue    = gross_revenue - refunds - discounts
--                    (bad_debt NOT subtracted — P&L: earned revenue,
--                     uncollected = separate bad-debt expense line)
--   credit_unlinked stays at portfolio level (abstain bucket, not per-job)
--
-- DOWNSTREAM IMPACT: This view is additive. Nothing currently reading
-- vw_job_invoiced changes. vw_economics and reconciliation switch to
-- net_revenue as a separate follow-up step.

CREATE OR REPLACE VIEW `pttr-taskdata.ds_crm.vw_job_revenue` AS

WITH
-- ─────────────────────────────────────────────────────────────────
-- Step 1: Identify all cross-task credit candidates
-- A credit candidate is a COD task with a negative invoice whose
-- description mentions credit/refund activity.
-- ─────────────────────────────────────────────────────────────────
credit_candidates AS (
  SELECT
    t.jobnumber AS credit_jn,
    -- Strip HTML tags and common entities for cleaner regex matching
    REGEXP_REPLACE(t.description, r'&nbsp;|&#39;|&amp;|&quot;|<[^>]+>', ' ') AS desc_clean,
    t.description AS desc_raw,
    tc.client_name,
    SAFE_CAST(i.totalex AS FLOAT64) AS credit_amount,
    i.dateinvoiced AS credit_date
  FROM `pttr-taskdata.ds_aroflo.tasks_deduped` t
  JOIN `pttr-taskdata.ds_aroflo.tasks_complete` tc ON t.jobnumber = tc.jobnumber
  JOIN `pttr-taskdata.ds_aroflo.invoices_deduped` i
    ON t.jobnumber = i.task_jobnumber
    AND i.status IN ('processed', 'approved')
  WHERE SAFE_CAST(i.totalex AS FLOAT64) < 0
    AND tc.customer_type = 'COD'
    AND REGEXP_CONTAINS(t.description, r'(?i)credit\s+note|refund|credit\s+against')
),

-- ─────────────────────────────────────────────────────────────────
-- Step 2: Apply extraction tiers T1–T3 (deterministic, text-based)
-- ─────────────────────────────────────────────────────────────────
with_extractions AS (
  SELECT *,
    -- T1: strict "credit note against/for JN######"
    REGEXP_EXTRACT(desc_clean,
      r'(?i)credit\s+(?:note\s+)?(?:against|for)\s+(?:JN|job\s*(?:no?\.?)?\s*)(\d{4,7})'
    ) AS t1_jn,
    -- T2: widened JN variants (on HTML-stripped text)
    COALESCE(
      REGEXP_EXTRACT(desc_clean, r'(?i)(?:JN\s*#?\s*)(\d{4,7})'),
      REGEXP_EXTRACT(desc_clean, r'(?i)j/n\s*(\d{4,7})'),
      REGEXP_EXTRACT(desc_clean, r'(?i)job\s*no\.?\s*#?\s*(\d{4,7})'),
      REGEXP_EXTRACT(desc_clean, r'(?i)created\s+from\s+JN\s*(\d{4,7})'),
      REGEXP_EXTRACT(desc_clean, r'(?i)ref\s+(?:JN\s*)?(\d{4,7})'),
      REGEXP_EXTRACT(desc_clean, r'(?i)ref\s+job\s*(\d{4,7})')
    ) AS t2_jn,
    -- T3: invoice number → look up later
    COALESCE(
      REGEXP_EXTRACT(desc_clean, r'(?i)inv(?:oice)?\s*(?:no\.?\s*(?:#\s*)?)?(\d{4,7})'),
      REGEXP_EXTRACT(desc_clean, r'(?i)invoice\s+(?:number\s+)?#?\s*(\d{4,7})')
    ) AS t3_inv_ref
  FROM credit_candidates
),

-- ─────────────────────────────────────────────────────────────────
-- Step 3: Resolve T1/T2 to validated parent JN (must exist in tasks)
-- ─────────────────────────────────────────────────────────────────
t1t2_resolved AS (
  SELECT
    e.credit_jn,
    e.desc_clean,
    e.client_name,
    e.credit_amount,
    e.credit_date,
    e.t3_inv_ref,
    COALESCE(e.t1_jn, e.t2_jn) AS extracted_jn,
    CASE
      WHEN e.t1_jn IS NOT NULL THEN 'T1'
      WHEN e.t2_jn IS NOT NULL THEN 'T2'
    END AS jn_tier,
    parent.jobnumber AS t1t2_parent_jn
  FROM with_extractions e
  LEFT JOIN `pttr-taskdata.ds_aroflo.tasks_deduped` parent
    ON COALESCE(e.t1_jn, e.t2_jn) = parent.jobnumber
),

-- ─────────────────────────────────────────────────────────────────
-- Step 4: T3 — invoice number trace for residual
-- ─────────────────────────────────────────────────────────────────
t3_resolved AS (
  SELECT
    r.credit_jn,
    r.desc_clean,
    r.client_name,
    r.credit_amount,
    r.credit_date,
    r.t1t2_parent_jn,
    r.jn_tier,
    inv.task_jobnumber AS t3_parent_jn
  FROM t1t2_resolved r
  LEFT JOIN `pttr-taskdata.ds_aroflo.invoices_deduped` inv
    ON r.t3_inv_ref = inv.invoicenumber
    AND inv.status IN ('processed', 'approved')
    -- Only use T3 when T1/T2 didn't resolve
    AND r.t1t2_parent_jn IS NULL
  WHERE r.t3_inv_ref IS NOT NULL OR r.t1t2_parent_jn IS NOT NULL OR r.t1t2_parent_jn IS NULL
),

-- ─────────────────────────────────────────────────────────────────
-- Step 5: Combine T1-T3 results; identify T4 residual
-- ─────────────────────────────────────────────────────────────────
post_t3 AS (
  SELECT
    credit_jn,
    desc_clean,
    client_name,
    credit_amount,
    credit_date,
    COALESCE(t1t2_parent_jn, t3_parent_jn) AS parent_jn,
    CASE
      WHEN t1t2_parent_jn IS NOT NULL THEN jn_tier
      WHEN t3_parent_jn IS NOT NULL THEN 'T3'
      ELSE NULL
    END AS link_tier
  FROM t3_resolved
),

-- ─────────────────────────────────────────────────────────────────
-- Step 6: T4 — client + 60-day window match (residual only)
-- Match credit to same-client COD jobs with positive invoices within
-- 60 days before the credit. Link ONLY if exactly 1 candidate.
-- ─────────────────────────────────────────────────────────────────
t4_candidates AS (
  SELECT
    p.credit_jn,
    tc2.jobnumber AS candidate_parent_jn,
    COUNT(*) OVER (PARTITION BY p.credit_jn) AS candidate_count
  FROM post_t3 p
  JOIN `pttr-taskdata.ds_aroflo.tasks_complete` tc2
    ON p.client_name = tc2.client_name
    AND tc2.jobnumber != p.credit_jn
    AND tc2.customer_type = 'COD'
  JOIN `pttr-taskdata.ds_aroflo.invoices_deduped` i2
    ON tc2.jobnumber = i2.task_jobnumber
    AND i2.status IN ('processed', 'approved')
    AND SAFE_CAST(i2.totalex AS FLOAT64) > 0
    AND i2.dateinvoiced <= p.credit_date
    AND DATE_DIFF(
          PARSE_DATE('%Y/%m/%d', p.credit_date),
          PARSE_DATE('%Y/%m/%d', i2.dateinvoiced),
          DAY
        ) <= 60
  WHERE p.parent_jn IS NULL
    AND p.client_name != 'MISC COD'
),

t4_unique AS (
  SELECT DISTINCT credit_jn, candidate_parent_jn AS t4_parent_jn
  FROM t4_candidates
  WHERE candidate_count = 1
),

-- ─────────────────────────────────────────────────────────────────
-- Step 7: Final linked credits with parent JN and credit type
-- ─────────────────────────────────────────────────────────────────
linked_credits AS (
  SELECT
    p.credit_jn,
    p.credit_amount,
    COALESCE(p.parent_jn, t4.t4_parent_jn) AS parent_jn,
    COALESCE(
      p.link_tier,
      IF(t4.t4_parent_jn IS NOT NULL, 'T4', NULL)
    ) AS link_tier,
    -- Credit type classification
    CASE
      WHEN REGEXP_CONTAINS(p.desc_clean, r'(?i)bad\s+debt|write\s+off|writing\s+off')
        THEN 'bad_debt'
      WHEN REGEXP_CONTAINS(p.desc_clean, r'(?i)refund')
        THEN 'refund'
      WHEN REGEXP_CONTAINS(p.desc_clean, r'(?i)discount|goodwill|price\s+adjust')
        THEN 'discount'
      ELSE 'other'
    END AS credit_type
  FROM post_t3 p
  LEFT JOIN t4_unique t4 ON p.credit_jn = t4.credit_jn
),

-- ─────────────────────────────────────────────────────────────────
-- Step 8: Aggregate linked credits per parent job
-- ─────────────────────────────────────────────────────────────────
credits_per_parent AS (
  SELECT
    parent_jn AS jobnumber,
    ROUND(SUM(IF(credit_type = 'refund', credit_amount, 0)), 2) AS refunds,
    ROUND(SUM(IF(credit_type = 'discount', credit_amount, 0)), 2) AS discounts,
    ROUND(SUM(IF(credit_type = 'bad_debt', credit_amount, 0)), 2) AS bad_debt,
    ROUND(SUM(IF(credit_type = 'other', credit_amount, 0)), 2) AS other_credits,
    COUNT(*) AS linked_credit_count
  FROM linked_credits
  WHERE parent_jn IS NOT NULL
  GROUP BY parent_jn
),

-- ─────────────────────────────────────────────────────────────────
-- Step 9: Per-job gross from positive invoices only
-- DEDUPED by (task_jobnumber, invoicenumber) — same logic as
-- vw_job_invoiced.dedup.sql. Keeps most-final status per
-- invoice number (processed > approved).
-- ─────────────────────────────────────────────────────────────────
invoice_deduped AS (
  SELECT
    task_jobnumber,
    invoicenumber,
    totalex,
    status,
    ROW_NUMBER() OVER (
      PARTITION BY task_jobnumber, invoicenumber
      ORDER BY CASE status WHEN 'processed' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
               invoiceid
    ) AS rn
  FROM `pttr-taskdata.ds_aroflo.invoices_deduped`
  WHERE status IN ('processed', 'approved')
),

job_gross AS (
  SELECT
    task_jobnumber AS jobnumber,
    ROUND(SUM(IF(SAFE_CAST(totalex AS FLOAT64) > 0,
                 SAFE_CAST(totalex AS FLOAT64), 0)), 2) AS gross_revenue,
    ROUND(SUM(IF(SAFE_CAST(totalex AS FLOAT64) < 0,
                 SAFE_CAST(totalex AS FLOAT64), 0)), 2) AS same_task_credits,
    COUNT(*) AS invoice_count
  FROM invoice_deduped
  WHERE rn = 1
  GROUP BY task_jobnumber
)

-- ─────────────────────────────────────────────────────────────────
-- Final output: one row per job
-- ─────────────────────────────────────────────────────────────────
SELECT
  g.jobnumber,
  g.gross_revenue,
  g.same_task_credits,
  COALESCE(c.refunds, 0) AS refunds,
  COALESCE(c.discounts, 0) AS discounts,
  COALESCE(c.bad_debt, 0) AS bad_debt,
  COALESCE(c.other_credits, 0) AS other_credits,
  COALESCE(c.linked_credit_count, 0) AS linked_credit_count,
  -- net_revenue: gross + same-task credits + cross-task refunds + discounts
  -- bad_debt is NOT subtracted (P&L: earned revenue, separate expense line)
  -- other_credits are NOT subtracted (unclassified, held for review)
  ROUND(
    g.gross_revenue
    + g.same_task_credits
    + COALESCE(c.refunds, 0)
    + COALESCE(c.discounts, 0),
    2
  ) AS net_revenue,
  g.invoice_count
FROM job_gross g
LEFT JOIN credits_per_parent c ON g.jobnumber = c.jobnumber;
