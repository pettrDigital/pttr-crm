-- PARKED — not yet applied. Replaces vw_job_invoiced to dedup the
-- approved/processed same-invoicenumber double-count (JN 140927, $596).
-- Apply via table-level view replacement, not in-place edit.
-- Re-run cascade after applying.
--
-- Change: dedup by (task_jobnumber, invoicenumber) before summing.
-- When the same invoicenumber appears under multiple invoiceids on the
-- same job (e.g. approved then reissued as processed), keep only the
-- most-final status: processed > approved. A job whose only invoice is
-- approved still counts (not dropped).
--
-- invoicenumber is NOT globally unique across jobs (25 confirmed cross-job
-- collisions). The dedup key MUST include task_jobnumber.
CREATE OR REPLACE VIEW `pttr-taskdata.ds_aroflo.vw_job_invoiced` AS
WITH deduped AS (
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
)
SELECT
  task_jobnumber AS jobnumber,
  ROUND(SUM(SAFE_CAST(totalex AS FLOAT64)), 2) AS invoiced_total_ex,
  COUNT(*) AS invoice_count,
  COUNTIF(SAFE_CAST(totalex AS FLOAT64) < 0) AS credit_note_count
FROM deduped
WHERE rn = 1
GROUP BY task_jobnumber;
