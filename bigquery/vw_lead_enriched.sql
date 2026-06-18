-- vw_lead_enriched v4: lean read surface + revenue model
-- answered = raw_calls.answered (call connected), captured = answered AND duration>=20s
-- Revenue model: three fields per job (invoiced_amount / estimated_sales / revenue),
-- cluster-summed to opportunity grain. Per-job ladder applied FIRST, then summed.
-- classification fields all NULL (populated later by 836-import + AI + Firestore)
CREATE OR REPLACE VIEW `pttr-taskdata.ds_crm.vw_lead_enriched` AS

-- ====== INV NOTE PARSER (Option A: sum distinct invoice numbers) ======
-- Frances's template: "INV {n} ${X.XX} incl GST - Paid {method}"
-- Parse INV number, take max amount per distinct invoice (collapses partial-payment
-- lines), sum across distinct invoices (handles multi-invoice jobs). ÷1.1 for ex-GST.
WITH inv_parsed AS (
  SELECT
    n.jobnumber,
    REGEXP_EXTRACT(n.note_clean, r'(?i)(?:part\s+)?inv\s*(\d{6,8})') AS inv_number,
    SAFE_CAST(REPLACE(REGEXP_EXTRACT(n.note_clean,
      r'(?i)(?:part\s+)?inv\s*\d{6,8}\s+\$\s*(\d[\d,]*\.\d{2})\s+incl\s+gst'), ',', '') AS FLOAT64) AS inv_incl
  FROM `pttr-taskdata.ds_aroflo.task_notes_deduped` n
  WHERE REGEXP_CONTAINS(LOWER(n.note_clean), r'inv\s*\d{6,8}\s+\$')
    AND REGEXP_CONTAINS(LOWER(n.note_clean), r'incl\s+gst')
),
inv_per_invoice AS (
  SELECT jobnumber, inv_number, MAX(inv_incl) AS inv_max_incl
  FROM inv_parsed
  WHERE inv_incl > 0
  GROUP BY jobnumber, inv_number
),
inv_per_job AS (
  SELECT jobnumber, ROUND(SUM(inv_max_incl) / 1.1, 2) AS inv_note_ex
  FROM inv_per_invoice
  GROUP BY jobnumber
),

-- ====== LABOUR NOTE PARSER (keyword-anchored, ex-GST) ======
-- Tech labour notes: "$X+gst" / "$X plus gst". Amount is already ex-GST.
-- Keyword-anchor: pick amount adjacent to collected/paid/banked/eft/cash/card.
-- Fix space-broken numbers ("$13 84" → "$1384"). Exclude <$50. Latest workdate.
labour_notes_fixed AS (
  SELECT
    task_jobnumber AS jobnumber,
    workdate,
    endtime,
    -- Fix space-broken numbers: "$13 84" → "$1384"
    REGEXP_REPLACE(note, r'\$(\d{1,2})\s(\d{2,3})', '$\\1\\2') AS note_fixed
  FROM `pttr-taskdata.ds_aroflo.tasklabours_raw`
  WHERE REGEXP_CONTAINS(LOWER(note), r'\+\s*gst|plus\s*gst')
    AND REGEXP_CONTAINS(note, r'\$\s*\d')
),
labour_parsed AS (
  SELECT jobnumber, workdate, endtime,
    COALESCE(
      -- 1. "collected/paid/banked {0-3 words} $X +gst"
      SAFE_CAST(REPLACE(REGEXP_EXTRACT(note_fixed,
        r'(?i)(?:collected|paid|banked)\s+(?:\w+\s+){0,3}\$\s*(\d[\d,]*\.?\d{0,2})\s*(?:\+\s*gst|plus\s*gst)')
        , ',', '') AS FLOAT64),
      -- 2. "$X+gst eft/cash/card" (amount followed by payment method)
      SAFE_CAST(REPLACE(REGEXP_EXTRACT(note_fixed,
        r'(?i)\$\s*(\d[\d,]*\.?\d{0,2})\s*(?:\+\s*gst|plus\s*gst)\s+(?:eft|cash|card|visa|cc|mc|mastercard|amex)')
        , ',', '') AS FLOAT64),
      -- 3. Last "$X+gst" in note (techs write quotes first, collected last)
      SAFE_CAST(REPLACE(REGEXP_EXTRACT(note_fixed,
        r'(?i).*\$\s*(\d[\d,]*\.?\d{0,2})\s*(?:\+\s*gst|plus\s*gst)')
        , ',', '') AS FLOAT64)
    ) AS labour_amount
  FROM labour_notes_fixed
),
labour_ranked AS (
  SELECT jobnumber, labour_amount,
    ROW_NUMBER() OVER (PARTITION BY jobnumber ORDER BY workdate DESC, endtime DESC) AS rn
  FROM labour_parsed
  WHERE labour_amount >= 50
),
labour_per_job AS (
  SELECT jobnumber, labour_amount FROM labour_ranked WHERE rn = 1
),

-- ====== MULTI-VISIT FLAG (labour notes with 2+ distinct work dates) ======
labour_multi_visit AS (
  SELECT task_jobnumber AS jobnumber, TRUE AS is_multi_visit
  FROM `pttr-taskdata.ds_aroflo.tasklabours_raw`
  WHERE REGEXP_CONTAINS(LOWER(note), r'\+\s*gst|plus\s*gst')
    AND REGEXP_CONTAINS(note, r'\$\s*\d')
  GROUP BY task_jobnumber
  HAVING COUNT(DISTINCT workdate) > 1
),

-- ====== PER-JOB REVENUE MODEL ======
-- Applied per job FIRST, then cluster-summed to opportunity.
-- Trust order: invoiced_amount > inv_note > labour_note
-- revenue = COALESCE(NULLIF(invoiced, 0), estimate)
job_revenue AS (
  SELECT
    tc.jobnumber,
    -- Use corrected invoice sum from vw_job_invoiced (not task_invoices_total_ex,
    -- which is wrong for multi-invoice jobs — carries one invoice, not the net).
    ji.invoiced_total_ex AS invoiced_amount,
    CASE
      WHEN COALESCE(ji.invoiced_total_ex, 0) > 0 THEN NULL
      WHEN inv.inv_note_ex > 0 THEN inv.inv_note_ex
      WHEN lab.labour_amount >= 50 THEN lab.labour_amount
      ELSE NULL
    END AS estimated_sales,
    CASE
      WHEN COALESCE(ji.invoiced_total_ex, 0) > 0 THEN NULL
      WHEN inv.inv_note_ex > 0 THEN 'inv_note'
      WHEN lab.labour_amount >= 50 THEN 'labour_note'
      ELSE NULL
    END AS revenue_source,
    COALESCE(
      NULLIF(ji.invoiced_total_ex, 0),
      inv.inv_note_ex,
      CASE WHEN lab.labour_amount >= 50 THEN lab.labour_amount END
    ) AS revenue,
    CASE
      WHEN COALESCE(ji.invoiced_total_ex, 0) > 0 THEN 'invoiced'
      WHEN inv.inv_note_ex > 0 THEN 'inv_note'
      WHEN lab.labour_amount >= 50 THEN 'labour_note'
      ELSE 'pending'
    END AS revenue_basis,
    COALESCE(mv.is_multi_visit, FALSE) AS multi_visit_flag
  FROM `pttr-taskdata.ds_aroflo.tasks_complete` tc
  LEFT JOIN `pttr-taskdata.ds_aroflo.vw_job_invoiced` ji ON tc.jobnumber = ji.jobnumber
  LEFT JOIN inv_per_job inv ON tc.jobnumber = inv.jobnumber
  LEFT JOIN labour_per_job lab ON tc.jobnumber = lab.jobnumber
  LEFT JOIN labour_multi_visit mv ON tc.jobnumber = mv.jobnumber
  WHERE tc.customer_type = 'COD'
),

-- ====== CLUSTER-SUM: aggregate per-job revenue to opportunity ======
-- For multi-job clusters, each job contributes at its own basis.
-- E.g. 1 invoiced job + 1 labour-note job = sum of each.
cluster_revenue AS (
  SELECT
    o2.opportunity_id,
    ROUND(SUM(COALESCE(jr.invoiced_amount, 0)), 2) AS cluster_invoiced_amount,
    ROUND(SUM(COALESCE(jr.estimated_sales, 0)), 2) AS cluster_estimated_sales,
    ROUND(SUM(COALESCE(jr.revenue, 0)), 2) AS cluster_revenue,
    -- revenue_basis: if ANY job is invoiced → 'invoiced'; else highest-trust estimate
    CASE
      WHEN LOGICAL_OR(jr.revenue_basis = 'invoiced') THEN 'invoiced'
      WHEN LOGICAL_OR(jr.revenue_basis = 'inv_note') THEN 'inv_note'
      WHEN LOGICAL_OR(jr.revenue_basis = 'labour_note') THEN 'labour_note'
      ELSE 'pending'
    END AS cluster_revenue_basis,
    LOGICAL_OR(jr.multi_visit_flag) AS cluster_multi_visit_flag,
    LOGICAL_OR(tc2.job_status = 'Completed') AS any_completed
  FROM `pttr-taskdata.ds_crm.opportunities` o2,
    UNNEST(SPLIT(o2.all_jobnumbers, ',')) AS jn
  JOIN `pttr-taskdata.ds_aroflo.tasks_complete` tc2 ON TRIM(jn) = tc2.jobnumber
  LEFT JOIN job_revenue jr ON TRIM(jn) = jr.jobnumber
  WHERE o2.job_count > 1
  GROUP BY o2.opportunity_id
)

SELECT
  -- === Identity ===
  o.opportunity_id,
  o.opportunity_timestamp_sydney AS created_at_sydney,
  NOT COALESCE(o.is_business_hours, TRUE) AS is_after_hours,

  -- Profile resolution ladder
  CASE
    WHEN lkp_did.trade IN ('PTTR', 'ETTR') THEN lkp_did.trade
    WHEN o.profile = 'Plumber to the Rescue' THEN 'PTTR'
    WHEN o.profile = 'Electrician to the Rescue' THEN 'ETTR'
    WHEN o.job_task_type LIKE '%Plumb%' THEN 'PTTR'
    WHEN o.job_task_type LIKE '%Electri%' THEN 'ETTR'
    ELSE 'Unknown (confirm)'
  END AS service,
  CASE
    WHEN lkp_did.trade IN ('PTTR', 'ETTR') THEN 'did'
    WHEN o.profile IN ('Plumber to the Rescue', 'Electrician to the Rescue') THEN 'wc_profile'
    WHEN o.job_task_type LIKE '%Plumb%' OR o.job_task_type LIKE '%Electri%' THEN 'aroflo_job'
    ELSE 'unresolved'
  END AS profile_source,

  CASE
    WHEN o.opp_type = 'no_inbound' THEN 'direct_booking'
    WHEN o.channel IN ('Form', 'Website Form', 'Paid Search (Quinn LP)', 'Organic - Landing Page') THEN 'form'
    WHEN o.form_count > 0 AND o.call_count = 0 THEN 'form'
    ELSE 'call'
  END AS lead_type,

  COALESCE(
    NULLIF(CASE
      WHEN UPPER(TRIM(wc.contact_name)) IN ('AUSTRALIA','INTERNATIONAL','NEW ZEALAND','UNITED STATES','UNITED KINGDOM')
      THEN NULL ELSE INITCAP(TRIM(wc.contact_name)) END, ''),
    NULLIF(o.contact_name, ''),
    NULLIF(tc.client_name, ''),
    NULLIF(prior_client.client_name, ''),
    -- OfficeHQ answering-service fallback: extract customer name from pager email
    NULLIF(INITCAP(TRIM(ohq.ohq_name)), '')
  ) AS contact_name,
  o.phone,
  COALESCE(
    NULLIF(wc.norm_email, ''),
    NULLIF(tc.norm_client_email, ''),
    NULLIF(prior_client.norm_client_email, ''),
    NULLIF(LOWER(TRIM(ohq.ohq_email)), '')
  ) AS email,
  o.is_existing_customer,
  o.is_no_inbound_enquiry,

  -- Suburb (WC city → AroFlo suburb → task location → form-parsed → prior client → OHQ address)
  COALESCE(
    NULLIF(TRIM(wc.city), ''),
    NULLIF(TRIM(tc.address_suburb), ''),
    NULLIF(TRIM(td.location_suburb), ''),
    NULLIF(TRIM(REGEXP_EXTRACT(td.tasklocation_locationname, r',\s*([^,]+)$')), ''),
    ef.form_suburb,
    NULLIF(TRIM(prior_client.address_suburb), ''),
    -- Extract suburb from OHQ address (format: "street, Suburb STATE, Country")
    NULLIF(TRIM(REGEXP_EXTRACT(ohq.ohq_address, r',\s*([A-Za-z ]+)\s+(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT)')), '')
  ) AS suburb,

  -- Form-specific fields (email-parsed forms only)
  ef.form_address,
  ef.form_problem,

  -- === Attribution ===
  o.channel,
  o.source,
  o.medium,
  lkp_camp.campaign_type,
  lkp_camp.division,
  lkp_camp.campaign_name,
  o.keyword,
  o.wc_lead_id,
  o.matched_phones,
  o.matched_emails,

  -- === Interaction ===
  o.call_count,
  o.form_count,
  -- FIX 1: answered = call connected (from raw_calls.answered), NOT duration threshold
  CASE WHEN o.call_count > 0 THEN o.has_answered_call ELSE NULL END AS answered,
  -- captured = answered AND duration >= 20s (distinct from answered)
  CASE WHEN o.call_count > 0 THEN o.has_answered_call AND o.max_duration_sec >= 20 ELSE NULL END AS captured,
  CAST(NULL AS FLOAT64) AS first_response_minutes,

  -- Operator (first answering agent: call_legs → recordings → callee_name fallback)
  COALESCE(
    first_agent.callee_name,
    first_rec.operator_name,
    CASE WHEN REGEXP_CONTAINS(COALESCE(first_rc.callee_name, ''), r'^[A-Z][a-z]+ [A-Z][a-z]+$')
      AND first_rc.callee_name NOT IN ('Mr Washer Generic', 'Mr Washer Temp', 'Plumber Rescue',
        'Strata Account', 'Plumbing Rescue', 'Electrician Rescue', 'Plumber and Electrician to the Rescue')
      THEN first_rc.callee_name END
  ) AS operator,

  -- === Outcome (rules-based) ===
  o.jobnumber AS job_numbers,
  o.all_jobnumbers,
  o.job_count,
  CASE WHEN o.jobnumber IS NOT NULL THEN 'Booked' ELSE 'Not Booked' END AS booking_status,

  -- === Revenue model (per-job ladder applied first, then cluster-summed) ===
  -- invoiced_amount: from vw_job_invoiced (corrected line-level sum), cluster-summed.
  COALESCE(cr.cluster_invoiced_amount,
    ji.invoiced_total_ex) AS invoiced_amount,
  -- estimated_sales: note-bridge value when not yet invoiced (inv_note or labour_note).
  COALESCE(cr.cluster_estimated_sales,
    pj_rev.estimated_sales) AS estimated_sales,
  -- revenue (derived reporting field): invoiced wins, else estimate, else null.
  -- This is the field all economics (ROAS/profit/avg ticket) should read.
  COALESCE(cr.cluster_revenue,
    pj_rev.revenue) AS revenue,
  -- revenue_basis: invoiced / inv_note / labour_note / override / pending
  COALESCE(cr.cluster_revenue_basis,
    pj_rev.revenue_basis, 'pending') AS revenue_basis,
  -- revenue_source: NULL when invoiced (no estimate needed), else source tag
  pj_rev.revenue_source,
  -- multi_visit_flag: TRUE when labour note may capture partial (2+ work dates)
  COALESCE(cr.cluster_multi_visit_flag,
    pj_rev.multi_visit_flag, FALSE) AS multi_visit_flag,
  -- job_value: backward-compatible field = revenue (cluster-summed)
  COALESCE(cr.cluster_revenue,
    pj_rev.revenue) AS job_value,

  o.job_status,
  -- completed: TRUE if ANY job in the cluster is Completed (Archived or not)
  CASE
    WHEN o.job_count > 1 AND COALESCE(cr.any_completed, FALSE) THEN TRUE
    WHEN o.job_count <= 1 AND tc.job_status = 'Completed' THEN TRUE
    WHEN o.jobnumber IS NOT NULL THEN FALSE
    ELSE NULL
  END AS completed,

  -- === Objective funnel stage ===
  -- Uses revenue (which includes estimates) for Paid Job detection
  CASE
    WHEN o.job_count > 1 AND COALESCE(cr.any_completed, FALSE) THEN 'Paid Job'
    WHEN o.job_count <= 1 AND tc.job_status = 'Completed'
      AND COALESCE(pj_rev.revenue, 0) > 0 THEN 'Paid Job'
    WHEN o.job_count <= 1 AND tc.job_status = 'Completed' THEN 'Job Complete'
    WHEN o.jobnumber IS NOT NULL THEN 'Booked'
    WHEN o.call_count > 0 AND o.has_answered_call AND o.max_duration_sec >= 20 THEN 'Captured'
    WHEN o.call_count > 0 OR o.form_count > 0 THEN 'Not Captured'
    WHEN o.opp_type = 'no_inbound' AND o.jobnumber IS NOT NULL THEN 'Booked'
    ELSE 'Not Captured'
  END AS funnel_stage,

  -- === After-hours gap detection ===
  -- Segment (d): after-hours call with NO content at any source.
  -- Validated: 0% conversion rate across all historical gap calls.
  -- Used for auto-classification: <20s → Not Captured, ≥20s → Lost/Unresponsive.
  CASE
    WHEN NOT COALESCE(o.is_business_hours, TRUE)          -- after hours
      AND o.call_count > 0                                 -- is a call-type opp
      AND o.wc_lead_id IS NULL                             -- no WC match
      AND o.jobnumber IS NULL                              -- no linked job
      AND o.contact_name IS NULL                           -- no contact from any source (form, WC, AroFlo)
      AND NOT EXISTS (                                     -- no 8x8 recording
        SELECT 1 FROM `pttr-taskdata.ds_crm.raw_recordings` rr2
        JOIN `pttr-taskdata.ds_crm.raw_calls` rc2 ON rr2.call_id = rc2.call_id
        WHERE rc2.norm_caller_phone = o.phone
          AND rc2.start_time BETWEEN
            TIMESTAMP_SUB(o.opportunity_timestamp, INTERVAL 1 DAY)
            AND TIMESTAMP_ADD(o.opportunity_timestamp, INTERVAL 30 DAY)
      )
      AND NOT EXISTS (                                     -- no OHQ email with contact
        SELECT 1 FROM `pttr-taskdata.ds_crm.raw_emails_received` e
        WHERE LOWER(e.from_email) LIKE '%myreceptionist%'
          AND (
            -- Match E.164 format (+61...) in Caller ID field
            e.body_preview LIKE CONCAT('%', o.phone, '%')
            -- Match 0-prefix format (spaces stripped) in Phone field
            OR REPLACE(e.body_preview, ' ', '') LIKE CONCAT('%', REPLACE(o.phone, '+61', '0'), '%')
          )
          AND TIMESTAMP(e.received_at) BETWEEN
            TIMESTAMP_SUB(o.opportunity_timestamp, INTERVAL 1 MINUTE)
            AND TIMESTAMP_ADD(o.opportunity_timestamp, INTERVAL 10 MINUTE)
      )
    THEN TRUE
    ELSE FALSE
  END AS is_after_hours_gap,

  -- === Classification (all NULL) ===
  CAST(NULL AS STRING) AS disposition,
  CAST(NULL AS STRING) AS loss_reason,
  CAST(NULL AS STRING) AS csr_quality,
  CAST(NULL AS BOOL) AS quotable,
  CAST(NULL AS STRING) AS lead_class,
  CAST(NULL AS FLOAT64) AS confidence,
  CAST(NULL AS STRING) AS reasoning,
  CAST(NULL AS BOOL) AS needs_review,

  -- §6: Account flags from crm_account_exclusions
  COALESCE(acct_excl.is_account, FALSE) AS is_account,
  COALESCE(acct_excl.is_account, FALSE) AS exclude_from_analysis

FROM `pttr-taskdata.ds_crm.opportunities` o
LEFT JOIN `pttr-taskdata.ds_crm.lkp_did_trade` lkp_did
  ON o.queue_ext = lkp_did.did
LEFT JOIN `pttr-taskdata.gd_WhatConverts.all_leads_enriched` wc
  ON o.wc_lead_id = wc.lead_id
LEFT JOIN `pttr-taskdata.ds_crm.lkp_campaign` lkp_camp
  ON COALESCE(wc.lp_gad_campaignid, o.campaign) = lkp_camp.campaign_id
LEFT JOIN `pttr-taskdata.ds_aroflo.tasks_complete` tc
  ON o.jobnumber = tc.jobnumber
LEFT JOIN `pttr-taskdata.ds_aroflo.vw_job_invoiced` ji
  ON o.jobnumber = ji.jobnumber
LEFT JOIN `pttr-taskdata.ds_aroflo.tasks_deduped` td
  ON o.jobnumber = td.jobnumber
-- Per-job revenue model (single-job opps)
LEFT JOIN job_revenue pj_rev ON o.jobnumber = pj_rev.jobnumber
-- Cluster-summed revenue (multi-job opps): per-job ladder applied first, then summed
LEFT JOIN cluster_revenue cr ON o.opportunity_id = cr.opportunity_id
-- Operator: first answering agent on the opportunity's earliest call
-- Join raw_calls by phone + timestamp (opportunity_timestamp = first call's start_time for call-first opps)
LEFT JOIN `pttr-taskdata.ds_crm.raw_calls` first_rc
  ON first_rc.norm_caller_phone = o.phone
  AND ABS(TIMESTAMP_DIFF(first_rc.start_time, o.opportunity_timestamp, SECOND)) < 2
  AND first_rc.direction = 'Incoming'
LEFT JOIN (
  SELECT parent_call_id,
    ARRAY_AGG(callee_name ORDER BY TIMESTAMP_DIFF(disconnected_time, start_time, SECOND) DESC LIMIT 1)[OFFSET(0)] AS callee_name
  FROM `pttr-taskdata.ds_crm.raw_call_legs`
  WHERE answered = 'Answered' AND direction = 'Internal'
    AND parent_call_id IS NOT NULL
    AND callee NOT LIKE 'CallForking%' AND callee NOT LIKE 'RingGroup%' AND callee NOT LIKE 'AutoAttendant%'
    AND REGEXP_CONTAINS(callee_name, r'^[A-Z][a-z]+ [A-Z][a-z]+$')
    AND callee_name NOT IN ('Mr Washer Generic', 'Mr Washer Temp', 'Plumber Rescue')
  GROUP BY parent_call_id
) first_agent ON first_rc.call_id = first_agent.parent_call_id
LEFT JOIN (
  SELECT call_id,
    ARRAY_AGG(operator_name ORDER BY operator_name LIMIT 1)[OFFSET(0)] AS operator_name
  FROM `pttr-taskdata.ds_crm.raw_recordings`
  WHERE operator_name IS NOT NULL AND operator_name != ''
  GROUP BY call_id
) first_rec ON first_rc.call_id = first_rec.call_id
-- Email-form fields (form_suburb, form_address, form_problem)
-- Email-form fields (form_suburb, form_address, form_problem) — one per opp
LEFT JOIN (
  SELECT phone, lead_timestamp, form_suburb, form_address, form_problem,
    ROW_NUMBER() OVER (PARTITION BY phone ORDER BY lead_timestamp) AS rn
  FROM `pttr-taskdata.ds_crm.vw_leads_unified`
  WHERE source_type = 'email'
    AND (form_suburb IS NOT NULL OR form_address IS NOT NULL OR form_problem IS NOT NULL)
) ef ON ef.phone = o.phone
  AND ABS(TIMESTAMP_DIFF(ef.lead_timestamp, o.opportunity_timestamp, SECOND)) < 2592000
  AND ef.rn = 1
-- Existing-client resolution: when is_existing_customer but no job linked to this opp,
-- resolve the client name/email/suburb from their most recent prior job.
-- Uses the SAME phone match as is_existing_customer (id_phone + norm_client_mobile).
LEFT JOIN (
  SELECT phone, client_name, norm_client_email, address_suburb,
    ROW_NUMBER() OVER (PARTITION BY phone ORDER BY requested_date_parsed DESC) AS rn
  FROM (
    SELECT id_phone AS phone, client_name, norm_client_email, address_suburb, requested_date_parsed
    FROM `pttr-taskdata.ds_aroflo.tasks_complete`
    WHERE id_phone IS NOT NULL AND id_phone != '' AND customer_type = 'COD'
    UNION ALL
    SELECT norm_client_mobile, client_name, norm_client_email, address_suburb, requested_date_parsed
    FROM `pttr-taskdata.ds_aroflo.tasks_complete`
    WHERE norm_client_mobile IS NOT NULL AND norm_client_mobile != '' AND customer_type = 'COD'
  )
  WHERE client_name IS NOT NULL AND LOWER(client_name) NOT LIKE '%test%'
    AND LOWER(client_name) NOT IN ('misc cod', 'misc plumbing', 'misc electrical')
) prior_client ON prior_client.phone = o.phone AND prior_client.rn = 1
-- OfficeHQ answering-service email: extract customer name/email/address from pager text.
-- Matched by phone in body (E.164 or 0-prefix) within 10 min of opportunity timestamp.
LEFT JOIN (
  SELECT
    e.received_at,
    REGEXP_EXTRACT(e.body_preview, r'(?:PLUMBING\s*-\s*Customer Name|ELECTRICAL\s*Customer Name|(?:Owner or Tenant\)\s*)?Full Name)\s*:\s*([^\r\n]+)') AS ohq_name,
    CASE
      WHEN LOWER(TRIM(REGEXP_EXTRACT(e.body_preview, r'Email\s*Address\s*:\s*([^\r\n]+)')))
        IN ('declined', 'declined.', 'not provided', 'did not obtain - sorry', 'not obtained', '')
      THEN NULL
      ELSE REGEXP_EXTRACT(e.body_preview, r'Email\s*Address\s*:\s*([^\r\n]+)')
    END AS ohq_email,
    REGEXP_EXTRACT(e.body_preview, r'(?:Full address|Address)\s*:\s*([^\r\n]+)') AS ohq_address,
    -- Extract phone from Caller ID or Phone field for matching
    COALESCE(
      REGEXP_EXTRACT(e.body_preview, r'Caller\s*ID\s*:\s*(\+\d+)'),
      CONCAT('+61', SUBSTR(REGEXP_REPLACE(REGEXP_EXTRACT(e.body_preview, r'(?:Phone Number|Phone)\s*:\s*([\d\s]+)'), r'\s', ''), 2))
    ) AS match_phone
  FROM `pttr-taskdata.ds_crm.raw_emails_received` e
  WHERE LOWER(e.from_email) LIKE '%myreceptionist%'
) ohq ON ohq.match_phone = o.phone
  AND TIMESTAMP(ohq.received_at) BETWEEN
    TIMESTAMP_SUB(o.opportunity_timestamp, INTERVAL 1 MINUTE)
    AND TIMESTAMP_ADD(o.opportunity_timestamp, INTERVAL 10 MINUTE)
  AND ohq.ohq_name IS NOT NULL
-- §6: Account flags
LEFT JOIN `pttr-taskdata.ds_crm.crm_account_exclusions` acct_excl
  ON o.opportunity_id = acct_excl.opportunity_id
  AND NOT (acct_excl.match_tier = 'auto:t7_match' AND COALESCE(acct_excl.needs_audit, FALSE) = TRUE);
