-- vw_economics: per-segment marketing economics
-- Joins Google Ads spend → lkp_campaign → vw_lead_enriched opportunities
-- One row per: month × campaign_type × division × time_category
CREATE OR REPLACE VIEW `pttr-taskdata.ds_crm.vw_economics` AS
WITH
-- ====== SPEND SIDE ======
-- Hourly spend from Google Ads, split into BH/AH (Sydney time = Ads timezone)
spend_hourly AS (
  SELECT
    CAST(h.campaign_id AS STRING) AS campaign_id,
    FORMAT_DATE('%Y-%m', h.segments_date) AS month,
    CASE
      WHEN EXTRACT(DAYOFWEEK FROM h.segments_date) IN (1, 7) THEN 'After Hours'
      WHEN h.segments_hour >= 7 AND h.segments_hour < 17 THEN 'Business Hours'
      ELSE 'After Hours'
    END AS time_category,
    SUM(h.metrics_cost_micros) AS cost_micros,
    SUM(h.metrics_clicks) AS clicks,
    SUM(h.metrics_impressions) AS impressions
  FROM `pttr-taskdata.ds_GoogleAds.ads_HourlyCampaignStats_8436890791` h
  WHERE h.segments_date >= '2025-12-01'
  GROUP BY 1, 2, 3
),

spend_by_segment AS (
  SELECT
    s.month,
    COALESCE(lc.campaign_type, 'Unmapped') AS campaign_type,
    COALESCE(lc.division, 'Other') AS division,
    s.time_category,
    ROUND(SUM(s.cost_micros) / 1e6, 2) AS spend,
    SUM(s.clicks) AS clicks,
    SUM(s.impressions) AS impressions
  FROM spend_hourly s
  LEFT JOIN `pttr-taskdata.ds_crm.lkp_campaign` lc ON s.campaign_id = lc.campaign_id
  GROUP BY 1, 2, 3, 4
),

-- ====== LEAD SIDE ======
leads_by_segment AS (
  SELECT
    FORMAT_DATETIME('%Y-%m', le.created_at_sydney) AS month,
    COALESCE(le.campaign_type, 'Unattributed') AS campaign_type,
    CASE
      WHEN le.service = 'PTTR' THEN 'Plumbing'
      WHEN le.service = 'ETTR' THEN 'Electrical'
      ELSE COALESCE(le.division, 'Other')
    END AS division,
    CASE
      WHEN le.is_after_hours THEN 'After Hours'
      ELSE 'Business Hours'
    END AS time_category,
    COUNT(*) AS leads,
    COUNTIF(le.booking_status = 'Booked') AS bookings,
    COUNTIF(le.completed = TRUE) AS completions,
    ROUND(SUM(CASE WHEN le.completed = TRUE THEN COALESCE(le.job_value, 0) ELSE 0 END), 2) AS revenue,
    ROUND(SUM(COALESCE(le.job_value, 0)), 2) AS total_job_value,
    COUNTIF(le.answered = TRUE) AS answered,
    COUNTIF(le.captured = TRUE) AS captured
  FROM `pttr-taskdata.ds_crm.vw_lead_enriched` le
  GROUP BY 1, 2, 3, 4
),

-- ====== FULL OUTER JOIN: spend + leads ======
-- LEFT join from spend ensures spend-only segments show; UNION with lead-only segments
combined AS (
  SELECT
    COALESCE(s.month, l.month) AS month,
    COALESCE(s.campaign_type, l.campaign_type) AS campaign_type,
    COALESCE(s.division, l.division) AS division,
    COALESCE(s.time_category, l.time_category) AS time_category,
    COALESCE(s.spend, 0) AS spend,
    COALESCE(s.clicks, 0) AS clicks,
    COALESCE(s.impressions, 0) AS impressions,
    COALESCE(l.leads, 0) AS leads,
    COALESCE(l.bookings, 0) AS bookings,
    COALESCE(l.completions, 0) AS completions,
    COALESCE(l.revenue, 0) AS revenue,
    COALESCE(l.total_job_value, 0) AS total_job_value,
    COALESCE(l.answered, 0) AS answered,
    COALESCE(l.captured, 0) AS captured
  FROM spend_by_segment s
  FULL OUTER JOIN leads_by_segment l
    ON s.month = l.month
    AND s.campaign_type = l.campaign_type
    AND s.division = l.division
    AND s.time_category = l.time_category
)

SELECT
  month, campaign_type, division, time_category,
  -- Volume
  spend, clicks, impressions,
  leads, bookings, completions, revenue, total_job_value,
  answered, captured,
  -- Unit economics (NULL when denominator is 0, not div/0)
  CASE WHEN leads > 0 THEN ROUND(spend / leads, 2) END AS cpl,
  CASE WHEN bookings > 0 THEN ROUND(spend / bookings, 2) END AS cpb,
  CASE WHEN completions > 0 THEN ROUND(spend / completions, 2) END AS cpj,
  CASE WHEN spend > 0 THEN ROUND(revenue / spend, 2) END AS roas,
  ROUND(revenue - spend, 2) AS profit,
  -- Rates
  CASE WHEN leads > 0 THEN ROUND(bookings / leads * 100, 1) END AS booking_rate,
  CASE WHEN bookings > 0 THEN ROUND(completions / bookings * 100, 1) END AS completion_rate,
  CASE WHEN leads > 0 THEN ROUND(completions / leads * 100, 1) END AS conversion_rate,
  -- Flags
  CASE WHEN spend > 0 AND leads = 0 THEN TRUE ELSE FALSE END AS spend_no_leads
FROM combined
ORDER BY month, campaign_type, division, time_category;
