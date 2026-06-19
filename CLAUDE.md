@AGENTS.md

# CRM Data Pipeline — Reference

> **BEFORE matching, classification, or exclusion work**: read §17 (Settled
> Decisions — Do Not Re-Derive). These rules were validated with evidence and
> cost hours to establish. Re-deriving them wastes time and risks regression.
> Key sections: exclusion-by-list-only (the Aaron rule), facts-in-pre-passes
> (architectural principle), T7.2 validated config, WC reconciliation standard.

## §1 Business Context

**PETTR** (Plumber To The Rescue / Electrician To The Rescue) — owner-operator:
Ric Gordon. Trade services (plumbing + electrical) in Sydney, Australia.

Two business lines with separate marketing but shared operations:
- **PTTR** — Plumber to the Rescue (brand: Mr Washer)
- **ETTR** — Electrician to the Rescue

Two customer types:
- **COD** (Cash on Delivery) — residential leads from advertising. This is
  the marketing funnel the CRM tracks.
- **Account** (Property Management / Strata) — contractual work with no
  marketing spend. EXCLUDED from the COD lead funnel.

## §2 GCP Infrastructure

- **Project**: `pttr-taskdata`
- **Region**: `australia-southeast1` (project default)
- **BigQuery datasets** (all **US multi-region**, not australia-southeast1):
  - `ds_crm` — CRM views, lookup tables, materialized opportunity table
  - `ds_aroflo` — AroFlo job management data
  - `ds_GoogleAds` — Google Ads data transfer (Supermetrics)
  - `gd_WhatConverts` — call/lead tracking (WhatConverts API)
- **Secrets**: GCP Secret Manager (never read local secrets files)
- **BigQuery commands** must use `--location=US`
- **Firestore**: lives in project **`pettr-data`** (Firebase), NOT `pttr-taskdata`.
  The GCP Cloud Firestore API is **disabled** on pttr-taskdata — you MUST use
  `firebase-admin` (Firebase path), not `google-cloud-firestore`, to reach
  Firestore from pttr-taskdata services.
  - Secret `firebase-admin-sa` (in pttr-taskdata Secret Manager) contains the
    pettr-data Firebase admin service-account JSON
    (`firebase-adminsdk-fbsvc@pettr-data.iam.gserviceaccount.com`).
  - The orchestrator's `_get_firestore_db()` reads this secret and initialises
    `firebase-admin`. If the secret is missing, the after-hours auto-classify
    step fails.
  - The CRM app (Next.js) uses its own Firebase Admin credentials via env vars
    (`FIREBASE_ADMIN_PRIVATE_KEY`, `FIREBASE_ADMIN_CLIENT_EMAIL`).

## §3 Data Sources + Call Routing — BUILT

### 8x8 PBX (raw_calls / raw_recordings / call_transcripts)
- All inbound/outbound calls route through 8x8 PBX `reliancecommunica977`
- One CDR per call, no leg dedup needed (confirmed)
- **After-hours calls DO forward through 8x8** — BUILT, confirmed: 98.4% of
  answering-service emails (435/442, Dec–May) have a matching 8x8 call within
  ±5 seconds. The call spine is complete after-hours. The 7 with no matching
  call are the rare exception (routed through non-8x8 channel → mint as leads).
- Recordings ingestion began ~2 Apr 2026; no 8x8 transcripts before that date
- `raw_calls`: 72K rows, Apr 2024–present. `answered` = "Answered" / "-"
- `call_transcripts`: 3.1K rows, Apr 2026–present
- **Recording gap (~25% of answered inbound calls have no recording)**:
  - Root cause: calls that overflow/forward to external mobiles via ring-group
    overflow or follow-me rules (primarily DID 751 "Mr Washer - Temp", DID 750
    "Mr Washer Generic", and forwarding DIDs like 726) leave the 8x8 PBX.
    Recording is per-extension — an external forward creates no internal call
    leg, no recording trigger, and no Storage API object.
  - Confirmed via direct 8x8 Storage API test: 0/20 diverse gap call_ids
    (different callers, DIDs, dates, talk times up to 4m42s) returned a
    recording. 92.7% zero-leg rate on unrecorded calls vs 1.9% on recorded.
  - This is an **8x8 routing/config issue**, NOT a CRM ingestion bug, NOT
    recoverable by our code. Capture ceiling is ~75% under current routing.
    Transcription rate of recorded calls: ~93% (Whisper).
  - **Known minor bug** (not yet fixed): recording ingest (`pettr-recordings-
    backfill` Cloud Run Job) advances watermark on transient 8x8 500 errors
    without retry (6 occurrences in 30 days). Low impact — 8x8 purges the
    objects before any recovery attempt. Should add retry-before-advance.
  - **Implication for T7/UI**: a call with no transcript is often a genuine
    source absence (forwarded-to-mobile), not a pipeline failure. Treat as
    a normal touch with metadata only (caller phone, DID, duration, operator
    from CDR) — do not classify as "missing data."

### WhatConverts (gd_WhatConverts.all_leads_enriched / all_leads_classified)
- Tracks calls + web forms via tracking numbers and form integrations
- `all_leads_enriched`: 1,245 rows. Carries `lp_gad_campaignid`, `gclid`,
  `norm_phone`, `norm_email`, `profile` (PTTR/ETTR)
- `all_leads_classified`: adds `lead_class`, `is_booking`, `is_converted_job`
  etc. from WC classification rules

### AroFlo (ds_aroflo)
- `tasks_complete`: 73K jobs. Curated view with `customer_type`, `status`,
  `job_status`, `task_invoices_total_ex`, `norm_client_*` contact fields
- `tasks_deduped`: raw task record with 72 cols. Key: `contact_userid` →
  `contacts_deduped.userid` for task-level customer mobile/email
- `contacts_deduped`: customer contacts (mobile, email) linked via `userid`
- `locations_deduped`: site contacts (`SitePhone`, `SiteEmail`, `SiteContact`)

### Google Ads (ds_GoogleAds)
- Supermetrics data transfer. Account `8436890791`
- `ads_Campaign_8436890791`: campaign metadata (name, type, status)
- `ads_CampaignStats_8436890791`: daily spend/clicks/conversions

### Outlook / MS Graph (ds_crm.raw_emails_received / raw_emails_sent)
- Inbound emails: 74K rows from Jan 2018
- Used for: form-lead parsing (§6), answering-service enrichment (§8)

## §4 Lookup Tables — BUILT

### ds_crm.lkp_did_trade
Editable. Maps 8x8 DID extensions to trade + internal flag.
- `did` STRING, `trade` STRING (PTTR/ETTR/Unknown/Staff), `label` STRING,
  `is_internal` BOOL
- 113 rows. 0 unknowns among external DIDs. DID 797 "Tradesmen" = internal.
- "Mixed" label retired — the only genuinely mixed external DID (796) is
  trade='Unknown' for manual confirmation.

### ds_crm.lkp_campaign
Editable. Maps Google Ads campaign_id to type + division.
- `campaign_id` STRING, `campaign_name` STRING,
  `campaign_type` STRING (Quinn-Suburb / Quinn-Smart / Supercharge-Suburb /
  Brand / Pmax / Retargeting / Organic / Unknown),
  `division` STRING (Plumbing / Electrical / Other)
- 455 rows. 0 Unknown campaigns (22128205877 confirmed as Pmax/Plumbing).

## §5 The Spine: vw_leads_unified — BUILT

Multi-source event spine. `source_type ∈ {call, form, email}`.

**Source file**: `bigquery/vw_leads_unified.sql`

### Calls (source_type = 'call')
- From `raw_calls`, direction = Incoming
- Excludes: test numbers, internal phones (≥10 outbound + 0 AroFlo jobs),
  `is_internal = TRUE` DIDs (via lkp_did_trade), account-only phones
  (PM/strata), DID 721 (Strata Account)
- WC matching: ±5s timestamp + phone → enriches with channel/source/medium/
  campaign/keyword/profile
- `call_outcome`: missed (0s) / dropped (<20s) / connected (≥20s)

### WC Forms (source_type = 'form')
- From `vw_leads` WHERE channel = 'Form'
- Phone normalized to E.164; NULL if no valid AU phone (no synthetic hack)

### Email Forms (source_type = 'email') — BUILT
- Parsed from `raw_emails_received`. Sender-agnostic detection by template
  shape (field patterns in body text), NOT sender address.
- **Three tiers**:
  - **Tier 1 Quinn PAID** — `gad_campaignid` + `gclid` in body → campaign from
    `lkp_campaign` (Quinn-Suburb / Quinn-Smart), source=google, medium=cpc.
    Keeps gclid, keyword, suburb.
  - **Tier 2 Quinn ORGANIC** — `LP Suburb:` / `LP Service:` / `Page URL:`
    without gclid → channel='Organic - Landing Page', source=direct.
  - **Tier 3 WPForms** — `My name is` / `My phone number is` patterns →
    channel='Website Form', source='Direct / Website Form'. Profile from
    sender (brand = attribution ceiling; do NOT infer paid/organic).
- Excludes: RE:/FW: CSR threads, test campaigns (`...(Temp) Test`), test
  submissions.
- Phone extraction handles: `Phone*:`, `Phone:`, `My phone number is...`,
  bare digits. HTML entities (`&nbsp;`) stripped before matching.
- Quinn LP forms arrived via `jobs@electriciantotherescue.com.au` (pre-late-
  Apr) then `leads@resend.quinnmarketing.com.au` (post switchover). Both
  detected by template shape, not sender.
- All tiers dedup against calls/WC/jobs through the 30-day connected-component
  graph. No double-ingestion.

## §6 Email Sender Classification — BUILT

Previously "jobs@ = internal, exclude." Replaced with tiered logic:

| Sender | Content | Action |
|---|---|---|
| `jobs@plumbertotherescue.com.au` | Form submissions (PTTR) + CSR threads | **Parse forms** (§5 Tier 3); exclude RE:/FW: |
| `jobs@electriciantotherescue.com.au` | Form submissions (ETTR) + CSR threads | **Parse forms** (§5 Tier 3 + Tier 1/2 Quinn); exclude RE:/FW: |
| `leads@resend.quinnmarketing.com.au` | Quinn LP forms (both brands) | **Parse forms** (§5 Tier 1/2) |
| `noreply@myreceptionist.com.au` | OfficeHQ answering-service messages | **Enrichment** on matched 8x8 call (98.4% match rate). NOT a standalone lead. |
| `vodafone@myreceptionist.com.au` | Same (Vodafone pager, ended Jan 2026) | **Enrichment** on matched call |
| `noreply@message-media.com` | SMS reply notifications | **Exclude** (noise) |
| `maintenance@bright-duggan.com.au` | Strata/PM work orders | **Exclude** (Account work) |
| `noreply@smata.com` | Strata/PM | **Exclude** |
| Other strata/PM domains | urbanise, morethanstrata, precise.property, nswstrata, stratachoice | **Exclude** |

## §7 Opportunity Clustering — BUILT

**Table**: `ds_crm.opportunities` (materialized by `bigquery/build_opportunities.sql`)
**View**: `ds_crm.vw_opportunities` = `SELECT * FROM ds_crm.opportunities`

### Connected-Component Graph
Identity is phone OR email. Two events are the same opportunity if, within a
30-day window, they share a normalized phone or email. Matching is transitive
(A shares phone with B, B shares email with C → A+B+C = one opportunity).

### Graph Nodes
- **Spine events**: calls (connected + dropped + missed) + WC forms + email forms
- **AroFlo COD jobs**: client-level, task-contact-level, site-level, AND
  description-extracted contacts all feed the graph.

### Contact Hierarchy for Jobs (priority order)
1. Task contact mobile/email (`contacts_deduped.mobile/email` via
   `tasks_deduped.contact_userid → contacts_deduped.userid`)
2. Location site (`tasks_deduped.location_SitePhone/SiteEmail`)
3. Client level (`tasks_complete.id_phone/norm_client_phone/norm_client_email`)
4. Description free-text extraction (regex on task description; only when
   all structured levels are null). Handles `Phone:`, `Caller ID:`,
   `Contact: {name} (M) {num}`, `m) {num}`.

Note: `contactname` / `contactphone` on tasks_deduped = CSR/staff, NOT
customer. Exclude the 8583-xxxx extension range.

### Exclusions
- Account/PM jobs (`customer_type = 'Account'`)
- Account-only phones (phones appearing ONLY on Account-type jobs)
- Test clients (`client_name LIKE '%test%'`)

### opportunity_id (deterministic, idempotent)
- `J-{min_jobnumber}` when cluster contains an AroFlo job
- `G-{MD5(component_id | phones | emails)}` otherwise
- Tiebreaker on job rank: `ORDER BY date_distance, jobnumber`

### Implementation
5-round label propagation in a BigQuery scripted job (~50s). Too complex for a
view; materialized as a table. Re-run is idempotent (CREATE OR REPLACE).

### Lead-Counting Invariant (RULE)
The **opportunity is the unit of lead counting**. All WC touches, 8x8 calls,
and form submissions within a cluster are **interactions** — never separate
leads. Opportunity boundaries are set by a **30-day consecutive-silence gap**
(measured between successive touches, not first-to-last). A customer
contacting repeatedly with no 30-day gap = one opportunity, many interactions.
A gap of >30 days between consecutive touches = a new opportunity.

- **Volume / funnel metrics** MUST count `COUNT(DISTINCT opportunity_id)`, never
  WC touch count or array length.
- **The interaction timeline** surfaces ALL touches (every WC lead, every 8x8
  call, every form) as individual interactions — this is content surfacing, not
  lead counting.
- **`wc_lead_id`** (scalar) = the primary WC touch, derived as first-touch from
  `wc_leads[0]`. Used for single-value displays and WC joins. The derivation is
  swappable (e.g. nearest-to-job) without a rebuild.
- **`wc_leads`** (array) = the lossless record of all WC-linked events in the
  cluster:
  `ARRAY<STRUCT<wc_lead_id, source, medium, keyword, campaign, channel, event_ts>>`
  Ordered by event_ts. One struct per WC touch.

### Key Fields
`opportunity_id`, `phone`, `jobnumber`, `all_jobnumbers`, `job_count`,
`call_count`, `form_count`, `max_duration_sec`, `opp_type` (job_matched /
gap_based / no_inbound), `channel`, `source`, `medium`, `campaign`, `keyword`,
`profile`, `wc_lead_id` (derived primary), `wc_leads` (array, lossless),
`matched_phones`, `matched_emails`,
`is_no_inbound_enquiry`, `has_answered_call`, `is_existing_customer`

## §8 Answering-Service Emails — BUILT (enrichment on vw_lead_enriched)

OfficeHQ emails carry structured customer data (name, phone, address, problem,
Caller ID) for after-hours calls. Confirmed as enrichment on existing 8x8 calls
(98.4% match rate). NOT a standalone lead source.

**Built**: contact name, email, and suburb from OfficeHQ pager emails are
resolved as FALLBACK fields in `vw_lead_enriched` — they appear in the
`contact_name`, `email`, and `suburb` COALESCE chains when no WC/AroFlo/prior-
client data exists. Matched by phone (E.164 or 0-prefix in body) within 10 min
of opportunity timestamp.

**Still planned (not yet built)**:
- Full content store (problem description, address detail) keyed by
  opportunity_id, linked on detail page + available to the AI classifier
- **HIGH VALUE PRE-APRIL**: no 8x8 transcripts exist before ~Apr 30, so the
  answering-service email is the only content for Dec–March after-hours calls —
  it is the pre-transcript classification substitute

## §9 Lean Read Surface: vw_lead_enriched — BUILT (v4)

One row per opportunity. Joins opportunities + lookups + AroFlo outcome +
attribution + revenue model.

**Source file**: `bigquery/vw_lead_enriched.sql` (v4, deployed)

### Profile Resolution Ladder (auditable via `profile_source`)
1. **Manual override** — human sets PTTR/ETTR via `/api/leads/[id]/classify`
   (`profile_override` + `profile_overridden_at` in Firestore). Wins over all
   auto-resolution; applied at API read time.
2. Unambiguous DID → trade (from lkp_did_trade)
3. WC profile ("Plumber to the Rescue" / "Electrician to the Rescue")
4. AroFlo job task_type (contains "Plumb" or "Electri")
5. 'Unknown (confirm)' — unresolved

### answered vs captured (distinct)
- `answered` = `raw_calls.answered = 'Answered'` (PBX says call connected)
- `captured` = `answered AND max_duration_sec >= 20` (meaningful conversation)
- Forms: both NULL
- `first_response_minutes` — field exists in output, currently always NULL
  (placeholder for future response-time tracking)

### completed (rules-based)
- `TRUE` if ANY job in the cluster is `job_status IN ('Completed', 'Archived')`
  (Archived = completed per AroFlo semantics; both count)
- Multi-job clusters: checked via `LOGICAL_OR` across all jobs
- Single-job: checks the primary job directly

### Campaign Attribution (with Quinn LP fallback)
- Primary: `wc.lp_gad_campaignid → lkp_campaign`
- Fallback: `opportunity.campaign → lkp_campaign` (for Quinn paid forms
  where WC has no record but the email carries the gad_campaignid)

### Revenue Model — BUILT (v4)

Three fields per job, cluster-summed to opportunity grain. Per-job ladder
applied FIRST, then summed (so a mixed cluster sums each job at its own basis).

**Fields**:
- `invoiced_amount` — from `ds_aroflo.vw_job_invoiced` (line-level invoice sum,
  replaces `task_invoices_total_ex` which was wrong for multi-invoice jobs).
  Cluster-summed. The truth; never overwritten by estimates.
- `estimated_sales` — best note-bridge value when not yet invoiced. NULL when
  invoiced > 0. Tagged by `revenue_source` (inv_note / labour_note).
- `revenue` — **derived reporting field**: `COALESCE(NULLIF(invoiced_amount, 0),
  estimated_sales)`. Invoiced always wins; when invoice later lands, revenue
  auto-flips from estimate to actual. No double-count.
- `revenue_basis` — invoiced / inv_note / labour_note / override / pending
- `revenue_source` — NULL when invoiced, else source tag
- `multi_visit_flag` — TRUE when labour note has 2+ distinct work dates
  (possible partial amount)
- `job_value` — backward-compatible alias for `revenue`

**Trust order** (per job, before cluster-sum):
1. `invoiced_amount > 0` → use invoiced (actual always wins)
2. Manual task-value override (Firestore `crm_job_value_overrides`) → highest
   estimate trust (applied at API read time, not in BQ view)
3. INV note (Frances) → `revenue_source = 'inv_note'`
4. Tech labour note → `revenue_source = 'labour_note'`
5. NULL → `revenue_basis = 'pending'`

**INV Note Parser** (`task_notes_deduped.note_clean`):
- Matches Frances's template: `INV {n} ${X.XX} incl GST - Paid {method}`
- **Option A**: parse INV number from each note, take MAX amount per distinct
  invoice number (collapses partial-payment lines), SUM across distinct invoices
  (handles multi-invoice jobs). ÷1.1 for ex-GST.
- Excludes $0 ("Paid No work").
- Validated: **96% within 1%** of invoiced_ex on 99 jobs with both.

**Labour Note Parser** (`tasklabours_raw.note`):
- Matches `$X+gst` / `$X plus gst`. Amount is **already ex-GST** — use as-is.
- **Keyword-anchored**: picks $ amount adjacent to collected/paid/banked/eft/
  cash/card — NOT the max number. Fixes quote-embedded-in-note overstatement
  (e.g. "quoted $2485+gst ... collected $705" takes $705).
- Fix space-broken numbers: `$13 84` → `$1384`.
- Exclude <$50. Latest workdate entry per job.
- Validated: **86% within 1%** of invoiced_ex on 338 invoiced jobs.

**Cluster-sum logic** (`cluster_revenue` CTE):
- Multi-job opps: UNNEST `all_jobnumbers`, LEFT JOIN `job_revenue`, SUM per
  opportunity. Each job contributes at its own basis.
- Single-job opps: `pj_rev` (per-job revenue) joined directly.
- `revenue_basis` at cluster level: if ANY job is invoiced → 'invoiced'.

**WhatConverts sales_value — cross-check only**:
- WC is accurate WHERE it tracks: 91% exact match on like-for-like leads,
  10% total variance (add-on work / return visits).
- But WC covers only ~21% of booked opps (153 of 714). The $465K gap is
  unattributed organic/direct bookings WC never saw.
- **AroFlo-bridged `revenue` is the revenue truth.** WC sales_value is useful
  only as a paid-campaign validation.

### Funnel Stage Taxonomy — Two Workstreams

**DATA-DRIVEN (objective, no human judgment):**
- Not Captured (dropped/missed/unanswered — `raw_calls.answered`)
- Captured (answered AND ≥20s)
- Booked (tied to ≥1 AroFlo job; clustering-aware)
- Paid Job (Completed + `revenue > 0`, includes note-bridged revenue)
- Job Complete (Completed but no revenue yet)
- Revenue vs spend / ROAS per paid segment (`vw_economics`)

**QUALITATIVE (Firestore overrides, merged at API read time):**
- `quotable`, `loss_reason`, `csr_quality`, `disposition`, `lead_class`
- All NULL in `vw_lead_enriched` — populated by manual classification +
  (future) AI + Firestore overrides at read time
- No rate that divides by a qualitative field (e.g. booking-rate-vs-quotable)
  can be computed until classification coverage is sufficient

## §9a Classification System — BUILT

### Funnel Taxonomy (locked, UI + Firestore)

| Stage | Sub-Statuses |
|---|---|
| **Not Captured** | Missed Call (auto, CDR-fact-first), Dropped Call (auto, reception-failure transcript), Unable to Classify |
| **Not Quotable** | Outside Service Area, Service Not Provided, Strata Issue, Spam, Customer Inquiry Only, Wrong Number / Contact Details, Technical Error |
| **Pending** | Pending (with `pending_since` timestamp) |
| **Not Booked** | Customer Unresponsive, Booked Elsewhere, Tenant / Strata Referral, Price / Minimum Call Out, Capacity / Scheduling, Wanted Quote Over Phone, Customer Resolved, Other (requires free-text note) |
| **Booked** | Job Pending (auto), Job Complete (auto), Booking Cancelled, Quote Only, Unable to Complete Job - Out of Scope |

Auto-detected sub-statuses (from BQ objective fields) are shown with a `●`
indicator. Human overrides always replace auto-detection.

### Special Statuses
- **Unable to Classify** (`exclude_from_analysis = TRUE`): removes lead from
  all funnel denominators and rate calculations
- **Pending** (`pending_since` timestamp): marks leads needing follow-up;
  converted from Firestore `_seconds` to ISO string at API read time

### After-Hours Gap Auto-Classification
- Runs as orchestrator step (NOT page-load), daily after opportunities rebuild
- **Rules**: `is_after_hours_gap = TRUE` (no WC, no job, no contact, no
  recording, no OHQ email) AND `captured = FALSE` → Not Captured / Dropped Call
- `is_after_hours_gap AND captured = TRUE` → Not Booked / Customer Unresponsive
  (auto-placed in UI via `getAutoPlacement`)
- **Guard**: NEVER overwrites human overrides. Only writes when no Firestore doc
  exists OR existing doc was auto-written (`updated_by` starts with `auto_rule:`)
- Tagged `updated_by = 'auto_rule:ah_gap_short'`

### CSR Review (independent of classification)
Categories: Failed to Book Job, Customer Service Issue, Complaint, Other
(requires free-text note). Saved as `requires_csr_review`, `csr_review_category`,
`csr_review_note` in Firestore.

### Account Attribution
- **Flag**: links lead to an AroFlo Account (search → select → optional contact)
- Sets `is_account = TRUE`, `funnel_stage = 'Account'`,
  `exclude_from_analysis = TRUE`
- On-demand contact refresh from AroFlo (`/api/contacts/refresh`)
- Unflag via DELETE removes all account fields

### Legacy Value Migration (on read)
- `'CSR Failure'` → `'Customer Unresponsive'` + `requires_csr_review = TRUE`
- `'Lost / Unresponsive'` → `'Customer Unresponsive'`

## §9b CRM Architecture — Override Precedence

### Data Flow
1. **BigQuery** (`vw_lead_enriched`): objective fields (answered, captured,
   completed, revenue, funnel_stage, is_after_hours_gap)
2. **Firestore** (`crm_lead_overrides`): human/auto classification overrides
   (stage, sub_status, loss_reason, exclude_from_analysis, is_account, etc.)
3. **API merge** (`/api/leads`): batch-reads Firestore, applies overrides on
   top of BQ data, returns merged Lead objects

### Override Precedence (highest → lowest)
1. **Objective AroFlo facts** always win: if BQ says `booking_status = 'Booked'`
   or `completed = TRUE`, override "Unable to Classify" is cleared
2. **Account flag** forces `funnel_stage = 'Account'` +
   `exclude_from_analysis = TRUE`
3. **Manual job link** (`manual_job_number`): promotes unlinked inbound to
   Booked/Paid Job based on linked job status. **Dedup rule**: when a job is
   manually linked to a lead, any `no_inbound` opportunity (`J-{jobnumber}`)
   for that same job is suppressed from the leads list to prevent double-counting.
4. **Human override** (Firestore stage/sub_status)
5. **Auto-classification** (orchestrator `auto_rule:*`)
6. **BQ default** (objective `funnel_stage`)

### Orchestrator (Cloud Function: `aroflo-daily-orchestrator`)
- Runs daily. Steps include AroFlo data sync, opportunities rebuild
  (`build_opportunities.sql` = step 14 equivalent), then after-hours gap
  auto-classify
- Uses `firebase-admin-sa` secret to reach Firestore in `pettr-data` project
- If secret is missing, auto-classify step fails (non-fatal to orchestrator)

### Firestore Collections
- `crm_lead_overrides`: classification overrides, keyed by `opportunity_id`
- `crm_job_value_overrides`: manual job value overrides, keyed by `jobnumber`
- `crm_notes`: user-added notes, keyed by auto-ID
- `crm_account_notes`: account notes

## §10 Known Attribution Gaps (Website-Side)

Standing facts the CRM compensates for. Parallel website fixes noted.

### Quinn Landing Pages — No WC Snippet
- Live since 27 Feb 2026. Carry NO WhatConverts tracking snippet.
- 0/21 paid Quinn LP forms appeared in WC during Dec–May.
- **CRM compensation**: email form parser (§5 Tier 1) ingests the form email
  which carries full `gad_campaignid`/`gclid`/`utm_*` attribution.
- **Website fix needed**: add WC tracking to Quinn LPs.

### ETTR WPForms — Persistent WC Gap
- ~5 ETTR WordPress forms/month never reach WC (PTTR forms are fine post-Jan).
- **CRM compensation**: email form parser (§5 Tier 3) ingests them.
- **Website fix needed**: instrument all ETTR form types (Generic/Booking/
  Question) with WC snippet.

### WPForms Main-Site Plugin — No UTM Passthrough
- The WPForms plugin on plumbertotherescue.com.au and electriciantotherescue.
  com.au strips UTM/referrer/gclid at form submit.
- Main-site forms are brand-only attribution permanently until the plugin is
  reconfigured to pass through URL parameters.
- **CRM impact**: Tier 3 forms can only be attributed to "PTTR website" or
  "ETTR website", not to a specific campaign. This is a ceiling, not a bug.

## §11 Baseline + Reconciliation — BUILT

### Opportunity Baseline (Dec 2025 – May 2026)
- **2,558 opportunities** (current, post-OfficeHQ enrichment + expanded spine)
- WC attribution: ~21% of booked opps have WC sales_value
- No-inbound (AroFlo job, no matching call/form): 153
- **487 completed** opps; **372 Paid Job** (completed + revenue > 0)
- Original 329 completed-invoiced reconciliation preserved; +13 completed jobs
  newly promoted to Paid Job via note-bridged revenue

### Revenue Baseline (Dec 2025 – May 2026, booked opps)
- **Total revenue**: $660,222 (AroFlo-bridged)
  - Invoiced (hard): $529,477 (368 opps, 80%)
  - INV note (estimate): $95,715 (65 opps, 15%)
  - Labour note (estimate): $35,030 (26 opps, 5%)
  - Pending (no data): 255 opps
- **WC sales_value** (same opps): $194,978 — 30% of AroFlo-bridged
- Like-for-like (152 opps with both): AroFlo $213,839 vs WC $194,373 (+10%).
  91% exact match at lead level. WC's problem is coverage, not accuracy.

### Email Form Ingestion Impact — SETTLED
- 20 genuinely-new opportunities from email forms (no prior call/WC/job)
- +19 net baseline delta (20 new − 1 merge from email bridging)
- 25 former no-inbound job-opps reclassified to form-first (not new opps)
- Tier-1 detection: clean, no false positives (tawk/mrwasher excluded by
  sender allowlist + RE: filter)

### Quinn ROAS — SETTLED
- Quinn-Suburb/Quinn-Smart total attributed: 155 opportunities (Feb–May)
- Quinn ROAS adjustment from email form parsing: **+4 opps** (May 2026,
  all Plumbing/Smart — campaigns where WC call tracking wasn't yet capturing
  form-only visitors). For Feb–Apr, 28/28 paid Quinn forms merged into opps
  that WC had already attributed to the same Quinn campaign via the phone
  call. The form email is a forward-looking safety net, not a historical
  correction.
- "0/21 in WC" = no WC form record (customer often in WC via their call).
  28 of 33 Quinn-form-containing opps already had Quinn attribution from WC.

### Answer Rate vs Capture Rate (Dec–May, call-type opps)
- Answered (PBX connected): 94.0%
- Captured (answered + ≥20s): 83.2%
- Gap (10.8pp / 192 opps): calls that connected but lasted <20s

## §12 Build Status

### BUILT
- [x] Multi-source spine (call + WC form + email form), sender-agnostic
- [x] Tiered email form ingestion (Quinn Paid / Quinn Organic / WPForms)
- [x] Quinn paid recovery + April sender-transition fix
- [x] Connected-component opportunity clustering (phone OR email, 30 days)
- [x] AroFlo job contact hierarchy (task contact → site → client → description)
- [x] PM/Account exclusion from COD funnel
- [x] DID → trade lookup + campaign → type/division lookup
- [x] Profile resolution ladder (DID → WC → AroFlo → Unknown)
- [x] answered vs captured (distinct fields, correct semantics)
- [x] completed reconciliation (329/329 to AroFlo, preserved at 487/372)
- [x] After-hours 8x8 confirmation (98.4% match to answering-service emails)
- [x] Deterministic idempotent opportunity IDs
- [x] Drift alarm queries (DID + campaign lookup coverage)
- [x] Transcript coverage map (0% pre-April, 83% May)
- [x] Revenue model v4: three fields (invoiced/estimated/revenue), two parsers
      (INV note 96% accuracy, labour note 86%), cluster-summed, WC validated
- [x] OfficeHQ answering-service enrichment on vw_lead_enriched (name/email/suburb)
- [x] Classification taxonomy (5 stages, full sub-statuses) + Firestore overrides
- [x] After-hours gap auto-classification (orchestrator, human-override guard)
- [x] CSR review categories (independent of classification)
- [x] Account attribution flow (flag → account → contact → exclude from COD)
- [x] Manual job linking (promotes unlinked inbound to Booked/Paid Job)
- [x] Job value overrides (Firestore `crm_job_value_overrides`)
- [x] vw_economics: per-segment marketing economics (spend/leads/ROAS)
- [x] Operator resolution (call_legs → recordings → callee_name)
- [x] WC revenue validation: accurate where tracked (91% exact), but covers
      only 21% of booked opps — AroFlo-bridged is revenue truth
- [x] Lead interaction timeline (8 sources): WC interactions, raw_calls (phone),
      email reply threads, form submissions, OfficeHQ pagers, MessageMedia SMS,
      AroFlo task emails, general Outlook correspondence (3 link paths: email
      match, JN-anchored, guarded subject-thread). Per-row defensive rendering.
- [x] Per-call WC transcript resolution (interaction detail joins via spine
      `call_id → wc_lead_id` mapping, not cluster primary)
- [x] WC transcript + full form content MATERIALISED into lead_timeline
      `full_content` column. WC primary, 8x8 fallback (COALESCE). Forms
      raised from 300→2000 chars. Readable by direct BQ query — no runtime
      hydration needed.
- [x] Call-disposition gate (Missed/Dropped): CDR-fact-first design.
      Missed Call = `has_answered_call = FALSE` (CDR primary, transcript
      reinforcing only). Pre-April transcript absence ≠ missed. Dropped =
      reception-failure language in transcript + no substantive exchange.
      Wrong Number = T7-judgement (NOT gate-determined — content-pattern-
      matching is judgement, not a fact-fence). Deployed rev 00025-qam.
      CRITICAL: never gate-determine from transcript absence — absence
      means "not recorded" pre-April, not "missed."
- [x] Leads search: matches PH-/WC-/EM-/JN- label + last-9-digit phone
- [x] SMS-JN linkage tier: 232 Account-flagged opps, $553K attributed, COD
      booking rate corrected via `crm_account_exclusions` table + getDashboardStats
      LEFT JOIN anti-join
- [x] WC reconciliation: 95.7% spine match, 38 gaps categorized, 1 genuine
      unique signal (Chris Kelsey, name-only T7 case)
- [x] Recording gap diagnosed: ~25% = mobile-forwarded calls, 8x8 routing issue,
      ~75% capture ceiling. See §3 note.

### PLANNED
- [x] **T7 INPUT FIX** — `full_content` column MATERIALISED into
      `lead_timeline` (commit below). WC call transcript + full form content
      readable by direct BQ query — no runtime hydration needed. Supersedes
      the TS-only fallback in `classify.ts`. Per-call resolution preserved
      (each touch gets its OWN WC transcript via ale.lead_id, not cluster
      primary). Coverage: 712/745 WC calls (95.6%), 373/373 forms (100%),
      952/18764 8x8-only calls (Whisper, May+ only). Form cap raised from
      300→2000 chars. VERIFIED readable by direct BQ query. Orchestrator
      deployed (rev 00023). Commits: see git log for build_lead_timeline.sql.
- [ ] **T7 deployment plumbing** — proposal queue (`action='proposed'` in
      `crm_lead_overrides`), confirm/reject UI, scheduler, residual feed.
- [ ] Funnel + economics DASHBOARD (discussion-paper layout) — headline rates,
      numbers-at-a-glance, per-campaign economics. Requires Firestore
      classification data for qualitative stages (Not Quotable / Not Booked).
      Spend reconciliation done (§11); UI build pending.
- [ ] **vw_accounts repoint** — uses banned `task_invoices_total_ex` (+$22,992
      overstatement across 7 clients). Repoint to `vw_job_invoiced` before any
      Account revenue is reported externally.
- [ ] **Recording ingest retry** — `pettr-recordings-backfill` advances watermark
      on transient 8x8 500 errors without retry (6 in 30d). Add retry-before-
      advance. Low priority (recordings purge before recovery).
- [ ] Interaction timeline on Job view (`/jobs/{id}`) — shared component with
      lead timeline. Join-key question (JN-only vs whole-opp) unresolved.
- [ ] **Dashboard booking rate definition** — the `getDashboardStats` Account-
      exclusion anti-join is committed and correct as one input, but the displayed
      rate's DENOMINATOR was never pinned to a single definition. AS-IS includes
      `no_inbound` jobs (100% booked by definition → inflates all-time to ~80%,
      meaningless). The true COD rate = `gap_based + job_matched` only, inbound,
      Account-excluded (~24% on 30d). Fix the dashboard rate query to exclude
      `no_inbound` from the denominator. Parked — not urgent.

### SETTLED (economics phase prerequisites)
- [x] Net-new counts tied out: 20 genuinely new, +19 baseline, ±1 from merge
- [x] Tier-1 false positive check: clean (tawk excluded by sender list)
- [x] Quinn ROAS wording: +4 real uplift, 28/28 Feb–Apr already WC-attributed
- [x] Revenue model validated: invoiced reconciles, note-bridge adds $131K
- [x] WC vs AroFlo variance closed: coverage gap, not accuracy gap

### BACKLOG / KNOWN ISSUES
- **WPForms UTM passthrough**: main-site forms strip UTM/gclid at submit.
  Tier 3 forms permanently brand-only attribution. Website plugin fix needed.
- **ETTR WPForms WC gap**: ~5/month never reach WC. CRM compensates via email
  parser. Website instrumentation fix needed.
- **Quinn LP WC snippet**: still missing. CRM compensates via Tier 1 email
  parser. Website fix needed.
- **task_invoices_total_ex replaced**: the AroFlo extract field was wrong for
  multi-invoice jobs (carried one invoice, not the net). Revenue now uses
  `ds_aroflo.vw_job_invoiced` which sums line-level invoices from
  `invoices_deduped` (status IN 'processed','approved'). 69 jobs corrected,
  +$109K net. All consumers migrated: vw_lead_enriched, queries.ts, route.ts,
  link-job, job-history, ai-classify-validate. The column alias
  `task_invoices_total_ex` is retained in query output for UI compatibility
  but now reads from `vw_job_invoiced`, not the broken AroFlo field.
- **Labour note parser outliers**: ~10% of matches on multi-visit jobs capture
  one visit's collection, not the full total. `multi_visit_flag` marks these.
  Not fixable without summing across visits (which double-counts when the
  tech re-states the running total).
- **Pending opps with no data** (312 of 714 booked): jobs where neither invoice
  nor any note carries a dollar amount. Mostly very recent or non-COD-flagged.
  Will self-resolve as invoicing catches up.

## §14 Revenue Rules (MUST follow)

### Revenue source of truth
- **Revenue = `ds_aroflo.vw_job_invoiced`** — summed line-level invoices from
  `invoices_deduped` (status IN 'processed','approved'). All values ex-GST.
- **NEVER** use WC `sale_value` (estimate at capture), quote notes, sell columns,
  or `task_invoices_total_ex` (broken for multi-invoice jobs) as revenue.
- WC `sale_value` is a comparison/reconciliation figure only, not revenue truth.

### Cross-task credit notes (NOT YET FIXED)
- AroFlo sometimes creates a NEW task with a negative invoice to credit an
  archived job. Pattern: description contains `"Credit Note against JN######"`.
- `vw_job_invoiced` does NOT net these across tasks — it sums invoices per
  task_jobnumber only. Result: the original job is overstated, the credit task
  shows phantom negative revenue.
- **~$208K linkable** via JN extraction from description (78% deterministic).
  Fix pending: net the credit against the original job in the view.

### Account-level billing gap
- ~20% of Account/Strata jobs have no per-job invoice — billed at the Account
  level (monthly statement). `vw_job_invoiced` returns NULL for these. This is
  structural, not a bug — per-job invoiced undercounts Account revenue by ~20%.

### Quote → Periodical revenue
- Some leads link to a $0 quote job; the real revenue is on the linked
  periodical task that the quote spawned. Follow the AroFlo linked-task
  relationship ("SEE LINKED TASK FOR APPROVAL" in description, or
  "master periodical has been created" in task notes) to find the revenue job.
  `revenue_job` field on Firestore overrides identifies which linked job to
  read revenue from.

## §15 Phone Format Gotchas

### MessageMedia SMS phones
- SMS reply notifications from `noreply@message-media.com` carry the sender
  phone in the subject: `"New SMS reply received from 61418963173"`.
- The number already includes the `61` country code. Correct normalization:
  `CONCAT('+', REGEXP_EXTRACT(subject, r'(\d{10,12})$'))` → `+61418963173`.
- **BUG FOUND**: `CONCAT('+61', ...)` produces `+6161418963173` (double-61).
  Any phone-join against these numbers silently returns zero matches. This
  hid a $430K linkage signal during the June 2026 reconciliation.
- **Rule**: always check the raw digits before prepending a country code.

## §16 Open Findings (to build)

### SMS-phone-match deterministic tier
- **206 unlinked COD opps → 151 Account jobs, $430K invoiced revenue.**
- Signal: resident calls COD line (creates a gap-based opp with their phone),
  job booked under Account (strata manager). Later, CSR texts the resident
  about access — SMS reply carries the resident's phone + the JN.
- Match: `SMS sender phone = opp phone` + `JN in SMS body = Account job`.
- Verified: 116 distinct phones, 0 shared-phone false links, 5/5 spot-checks
  confirmed same person.
- Implementation: parse JN from MessageMedia email body, match sender phone
  to unlinked opp, link with `is_account=TRUE` + `exclude_from_analysis=TRUE`.
- This is a T3-style deterministic rule, not AI inference.

### JN-from-email-body linkage tier
- Task emails (to `mrwasher_task+{code}@inboundemail.aroflo.com`) carry the
  JN in the subject. 316 of 507 inbound task emails have extractable JN.
- Sender email can match to an opp's email identity.
- Lower volume than SMS but same deterministic shape.

## §13 Key Files

| File | Purpose |
|---|---|
| `bigquery/vw_leads_unified.sql` | **Canonical** — deployed spine (call + form + email) |
| `bigquery/vw_lead_enriched.sql` | **Canonical** — deployed lean read surface + revenue model (v4) |
| `bigquery/vw_economics.sql` | **Canonical** — per-segment marketing economics view |
| `bigquery/build_opportunities.sql` | **Canonical** — materialized opportunity clustering script |
| `bigquery/view-definitions.sql` | Reference/audit copy of ALL BQ view DDL (not deployment source) |
| `bigquery/archive/` | Superseded versions (v1, v2, v3_view) — do not edit |
| `cloud-functions/aroflo-daily-orchestrator/main.py` | Orchestrator: data sync + opportunities rebuild + auto-classify |
| `cloud-functions/aroflo-daily-orchestrator/deploy.sh` | Deploy script — copies canonical SQL into function dir then deploys |

> **Deploy artifact — do not edit or commit:**
> `cloud-functions/aroflo-daily-orchestrator/build_opportunities.sql` is a **deploy artifact**
> generated by `deploy.sh` from the canonical `bigquery/build_opportunities.sql`. It is
> gitignored. Edit only the canonical copy; `deploy.sh` copies it into the function directory
> before every deploy. The two were intentionally de-duplicated (commit removing the tracked
> copy) to prevent drift.
| `src/components/leads/lead-classification.tsx` | Classification taxonomy UI (stages + sub-statuses) |
| `src/app/api/leads/route.ts` | Leads API: BQ + Firestore merge, override precedence |
| `src/app/api/leads/[id]/classify/route.ts` | Classification GET/POST endpoint |
| `src/app/api/jobs/[id]/value-override/route.ts` | Job value override GET/POST |
| `HANDOVER.md` | CRM app (Next.js) technical handover |

## §17 Settled Decisions — Do Not Re-Derive

These decisions were validated with evidence. They are STANDING RULES.
Do not re-derive, re-debate, or "improve" without explicit instruction.
Each carries a rationale — read it before proposing alternatives.

### §17.1 Exclusion List — BY-LIST-ONLY (the Aaron Rule)

**RULE**: Exclude leads and phones ONLY by explicit, maintained lists.
NEVER by heuristic (call frequency, outbound volume, pattern matching).

**Lists** (the ONLY exclusion authorities):
- `ds_crm.test_numbers` — 16 entries (10 staff mobiles, 4 test lines,
  1 strata partner, 1 owner). Spine excludes at `vw_leads_unified:63`.
- WC `is_test_lead` flag — WC's own test marker. Spine excludes at
  `vw_leads_unified:233`.
- Internal email domains: `@mrwasher.com.au`, `@electriciantotherescue.com.au`,
  `@plumbertotherescue.com.au` — excluded from EMAIL_MATCH precomputation
  in `t7_match_candidates.sql` STEP 3/6.
- `lkp_did_trade.is_internal` — 10+ staff DIDs marked internal. Used for
  `is_internal_did` on `lead_timeline` and the NJR pre-pass.
- Internal phone range: 8583-xxxx extensions (CSR/staff, not customer).
- Account-only phones: phones appearing ONLY on Account-type jobs
  (excluded from COD spine, not from the system entirely).

**WHY BY-LIST-ONLY**: The retired heuristic "≥10 outbound + 0 AroFlo jobs =
internal" wrongly excluded Aaron Simpson, a real high-volume property manager
who made many calls but wasn't staff. Volume ≠ internal. The heuristic was
replaced by the explicit list after the Aaron incident. Any future exclusion
proposal that uses frequency/volume/pattern as a proxy for "internal" must
be rejected — add the specific phone/email to the list instead.

**ADDING TO THE LIST**: manual only. Add the specific phone/email/DID to
`test_numbers` or `lkp_did_trade` with a note and reason. The list is
small (16 entries) and slow-growing — this is by design.

### §17.2 Architectural Principle — Facts in Pre-Passes, Not AI

**RULE**: If a classification decision can be checked against structured data
(a column value, a row existence, a count), it MUST be a deterministic
pre-pass. Do NOT ask the AI model to check facts against the timeline.

**Evidence**: T7.2 ignored the committed CU/NFUR rule 50 times. The rule was
explicit ("REQUIRES POSITIVE EVIDENCE: visible outbound"), the prompt was
correct, the model still picked CU on leads with no outbound. Moving the
check to a deterministic pre-pass (`has_outbound` boolean from timeline
query) eliminated the entire 50-error category mechanically.

**Current pre-passes** (all deterministic, no AI):
- `has_outbound` → CU removed from allowed set when FALSE (commit `0b1a78e`)
- `has_internal_touch` → NJR removed when FALSE (commit `b8d6d03`)
- `gate_stage` → determined stages skip AI entirely (build_lead_timeline.sql)
- `applyPaymentRegex` → payment/not-proceeding patterns on Booked:$0 leads

**The test**: "Could a SQL query answer this?" If yes → pre-pass, not prompt.
The model is good at reading conversational intent (why didn't they book?).
The model is bad at checking structured properties (does outbound exist?
how many touches? is the DID internal?).

### §17.3 T7.2 Validated Configuration (locked 2026-06-18)

- **Prompt**: flat decision rules (NOT layered — 3-layer restructuring
  regressed SNP 61%→28%, reverted). Committed `4fa36bc`.
- **Definition fixes**: Spam includes apprentice/employment seekers.
  NJR = internal staff ONLY.
- **Pre-passes**: CU/NFUR (`has_outbound`), NJR (`has_internal_touch`),
  payment regex (Booked:$0).
- **Content**: full uncapped (`formatClassifierPromptFull`). Capped version
  (`formatClassifierPrompt`) is API-only — drops deciding signals on 2 of 4
  tested hard cases.
- **Confidence routing**: ≥0.70 auto-classify (95.2% accuracy on 84.5% of
  leads), <0.70 human review (15.5% of leads).
- **Measured**: 89.1% on 367 GT. See `t7_taxonomy_spec.md §10`.

**Failed experiment** (do not repeat): 3-layer prompt restructuring (c803de9)
lowered overall accuracy and gutted SNP by making CU/NFUR a "residual" that
uncertain leads dumped into. The pre-pass approach is architecturally superior.

### §17.4 T7.1→T7.2 Wiring (deployed 2026-06-19)

- **Deployed**: orchestrator rev 00031/00032 (`deploy.sh` run, artifacts
  verified). `build_opportunities.sql` + `build_lead_timeline.sql` both
  contain the propagation code.
- **Account JN propagation**: `auto:t7_match` added to §6 tier filter.
- **COD JN propagation**: post-graph UPDATE keyed on `wc_lead_id + jobnumber`
  (stable — `matched_phone` is NULL for 8 of 10 COD matches).
- **Idempotency**: proven across 2 consecutive orchestrator rebuilds.
  13 matches survived both. Same JNs, same gate_stages, no dupes.
- **Run order**: build_opportunities (with propagation) → build_lead_timeline
  (gate reads JN) → lead_gate. Sequential, `job.result()` blocks between.
- **Metric guard**: `getDashboardStats` reports `bookings_confirmed` (excludes
  `review_recommended`) vs `bookings_total`. Delta = T7.1 uplift, visible.
- **DEPLOY GAP WARNING**: committed canonical SQL ≠ deployed artifact until
  `deploy.sh` runs. A rebuild with stale artifacts silently reverts in-flight
  work. Always deploy before relying on code committed since last deploy.

### §17.5 WC Reconciliation Standard

- **Population**: full CSV, zero unexplained gaps. Every lead is compared
  or has a proven reason for exclusion (test lead, no identity, pre-period).
- **Join**: `wc_lead_id` (exact) OR `phone E.164` (within 30d) OR `email`
  (within 30d). NOT primary wc_lead_id only — secondary WC touches on the
  same opportunity must match via phone/email fallback.
- **Test exclusion**: by-list-only (§17.1). Indicators: `@mrwasher.com.au`
  email, phone=`123`, `is_test_lead=TRUE`, `test_numbers` table, Quinn
  marketing test submissions (`matt@quinnmarketing.com.au` + "test").
- **Every lead**: compared-or-explained. No "~287 gap, probably outside
  date range." Decompose to: matched, test-excluded, no-identity, spine-gap
  (single-digit), known recording gap, pre-period. The genuine gap is an
  exact number with per-lead evidence.

### §17.6 Company Email Exclusion (T7.1 candidate gen)

Exclude these domains from PHONE_MATCH/EMAIL_MATCH precomputation in
`t7_match_candidates.sql` STEP 3 (lead emails) and STEP 6 (candidate
emails). These fire false EMAIL_MATCH when the same company address
appears in both lead content and job descriptions:

`@mrwasher.com.au`, `@electriciantotherescue.com.au`,
`@plumbertotherescue.com.au`, `@inboundemail.aroflo.com`,
`@notifications.aroflo.com`, `@replies.aroflo.com`, `@aroflo.com`,
`@resend.quinnmarketing.com.au`, `@tawk.email`,
`@blockeddrainstotherescue.com.au`

6 false EMAIL_MATCH signals were eliminated by this exclusion (commit
`5ea5c93`). The exclusion is on BOTH sides (lead and candidate) to
prevent the company email from matching itself.
