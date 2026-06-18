-- t7_match_write.sql — Write path for T7-MATCH verdicts
-- No LLM. Takes CC-evaluated verdicts and writes flagged rows.
--
-- INPUTS: verdict structs embedded in the verdicts CTE below.
-- OUTPUTS:
--   Account matches → crm_account_exclusions (is_account, exclude_from_analysis, needs_audit)
--   COD matches     → crm_t7_match_queue (needs_audit)
--   Abstains        → nothing written
--
-- All rows written with needs_audit=TRUE — held out of dashboard/enriched/economics
-- until human audit clears the flag.
--
-- KEY STABILITY: keyed on matched_phone+jobnumber (survives opportunity_id rebuilds).
-- Idempotent: MERGE on stable keys — safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 1: Verdict input — replace this CTE with each batch's verdicts
-- ═══════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE t7w_verdicts AS
SELECT * FROM UNNEST(ARRAY<STRUCT<
  wc_lead_id INT64, jobnumber STRING, confidence FLOAT64,
  evidence STRING, corroboration STRING, abstain BOOL
>>[
  -- ──── FULL RUN (560 leads, 13 matches) — 2026-06-18 ────
  -- Fixed: email contamination removed, name/content/suburb signals added, SOUNDEX for spelling variants
  -- Matches (13)
  (208123762, '140652', 0.90, 'Name Ann + verbatim problem (leaking hose tap + blocked bathroom sink)', 'name+verbatim_problem', FALSE),
  (210835017, '140878', 0.92, 'Near-exact name (Peter Denham/Denholm) + Christmas 2025 offer corroboration', 'name+problem', FALSE),
  (214123961, '141030', 0.95, 'Exact reversed name (Janet Howse=Howse Janet) + problem (water heater+toilets)', 'name+problem', FALSE),
  (214127245, '141035', 0.97, 'Exact name (Filiz Archer) + phone + verbatim problem (kitchen sink+washers)', 'name+phone+verbatim_problem', FALSE),
  (215597161, '141183', 0.95, 'Phone match (Mary Laktaridis +61499540288) + name (Mary) + problem (blocked drain+exhaust fan)', 'phone+name+problem', FALSE),
  (215756822, '141193', 0.95, 'Exact name (Chris Kelsey=Kelsey Christopher) + verbatim problem (exhaust fan bathroom)', 'name+verbatim_problem', FALSE),
  (219035874, '141470', 0.93, 'Exact reversed name (Loretta Fong=Fong Loretta) + problem (power point) + service agreement', 'name+problem', FALSE),
  (221688028, '141556', 0.85, 'Business name (Oporto) + suburb (Erskineville) + problem (power/POS tripped)', 'name+suburb+problem', FALSE),
  (223847706, '141721', 0.85, 'Name (Helen) + problem (power board/powerpoints) + context (neighbour helping)', 'name+problem', FALSE),
  (230563333, '142192', 0.97, 'Exact name (Sophie Capelli) + verbatim problem (power point in kitchen)', 'name+verbatim_problem', FALSE),
  (232004696, '142270', 0.98, 'Phone+email match (Sarah Armstrong) + name (Sarah) + suburb (Elizabeth Bay)', 'phone+email+name+suburb', FALSE),
  (236286440, '142586', 0.97, 'Verbatim fingerprint (LED lights+drivers+garden+wall+switch covers) + name (Ben)', 'verbatim_problem+name', FALSE),
  (238745838, '142760', 0.90, 'Name (Claire=Clare Elias via SOUNDEX) + problem (sensor light removal/replacement)', 'name+problem', FALSE)
]);

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 2: Resolve opportunity context for matches
-- ═══════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE t7w_resolved AS
SELECT
  v.wc_lead_id,
  v.jobnumber,
  v.confidence,
  v.evidence,
  v.corroboration,
  o.opportunity_id,
  o.phone AS matched_phone,
  tc.customer_type,
  tc.client_name,
  COALESCE(inv.invoiced_total_ex, 0) AS invoiced_ex,
  DATE_DIFF(tc.requested_date_parsed, DATE(o.opportunity_timestamp), DAY) AS days_lead_to_job
FROM t7w_verdicts v
JOIN `pttr-taskdata.ds_crm.opportunities` o ON o.wc_lead_id = v.wc_lead_id
JOIN `pttr-taskdata.ds_aroflo.tasks_complete` tc ON v.jobnumber = tc.jobnumber
LEFT JOIN `pttr-taskdata.ds_aroflo.vw_job_invoiced` inv ON v.jobnumber = inv.jobnumber
WHERE v.abstain = FALSE
  AND v.confidence >= 0.8;

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 3a: Write Account matches → crm_account_exclusions
-- MERGE keyed on matched_phone + jobnumber (stable across rebuilds)
-- ═══════════════════════════════════════════════════════════════════════
MERGE `pttr-taskdata.ds_crm.crm_account_exclusions` T
USING (
  SELECT * FROM t7w_resolved
  WHERE customer_type = 'Account'
) S
ON COALESCE(T.matched_phone, '') = COALESCE(S.matched_phone, '')
  AND T.jobnumber = S.jobnumber
WHEN MATCHED THEN UPDATE SET
  opportunity_id = S.opportunity_id,
  is_account = TRUE,
  match_tier = 'auto:t7_match',
  t7_confidence = S.confidence,
  t7_evidence = S.evidence,
  invoiced_ex = S.invoiced_ex,
  days_lead_to_job = S.days_lead_to_job,
  needs_audit = TRUE,
  synced_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (
  opportunity_id, is_account, provenance, synced_at, jobnumber,
  matched_phone, account_client, match_tier, invoiced_ex,
  days_lead_to_job, needs_audit, t7_confidence, t7_evidence
) VALUES (
  S.opportunity_id, TRUE, 'auto:t7_match', CURRENT_TIMESTAMP(), S.jobnumber,
  S.matched_phone, S.client_name, 'auto:t7_match', S.invoiced_ex,
  S.days_lead_to_job, TRUE, S.confidence, S.evidence
);

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 3b: Write COD matches → crm_t7_match_queue
-- MERGE keyed on matched_phone + jobnumber (stable across rebuilds)
-- ═══════════════════════════════════════════════════════════════════════
MERGE `pttr-taskdata.ds_crm.crm_t7_match_queue` T
USING (
  SELECT * FROM t7w_resolved
  WHERE customer_type != 'Account'
) S
ON COALESCE(T.matched_phone, '') = COALESCE(S.matched_phone, '')
  AND T.jobnumber = S.jobnumber
WHEN MATCHED THEN UPDATE SET
  opportunity_id = S.opportunity_id,
  match_tier = 'auto:t7_match',
  t7_confidence = S.confidence,
  t7_evidence = S.evidence,
  t7_corroboration = S.corroboration,
  invoiced_ex = S.invoiced_ex,
  days_lead_to_job = S.days_lead_to_job,
  needs_audit = TRUE
WHEN NOT MATCHED THEN INSERT (
  opportunity_id, jobnumber, matched_phone, customer_type, client_name,
  match_tier, t7_confidence, t7_evidence, t7_corroboration,
  needs_audit, invoiced_ex, days_lead_to_job, created_at
) VALUES (
  S.opportunity_id, S.jobnumber, S.matched_phone, S.customer_type, S.client_name,
  'auto:t7_match', S.confidence, S.evidence, S.corroboration,
  TRUE, S.invoiced_ex, S.days_lead_to_job, CURRENT_TIMESTAMP()
);
