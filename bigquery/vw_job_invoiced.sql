-- vw_job_invoiced: Corrected per-job invoice totals from line-level invoices.
-- Replaces task_invoices_total_ex on tasks_complete, which is wrong for multi-invoice
-- jobs (carries one invoice, not the net of all). 69 jobs affected, ~$109K net.
-- Status filter: 'processed' + 'approved' (finalized invoices only).
-- Credit notes carry correct negative sign; voided/draft/in-progress excluded.
CREATE OR REPLACE VIEW `pttr-taskdata.ds_aroflo.vw_job_invoiced` AS
SELECT
  task_jobnumber AS jobnumber,
  ROUND(SUM(SAFE_CAST(totalex AS FLOAT64)), 2) AS invoiced_total_ex,
  COUNT(*) AS invoice_count,
  COUNTIF(SAFE_CAST(totalex AS FLOAT64) < 0) AS credit_note_count
FROM `pttr-taskdata.ds_aroflo.invoices_deduped`
WHERE status IN ('processed', 'approved')
GROUP BY task_jobnumber;
