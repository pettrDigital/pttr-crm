# PETTR CRM — Data Ingestion, Matching & Classification Spec

**Status:** CANONICAL (v3). Single source of truth for *what data is ingested, in what priority, how leads match to jobs, and how the gate + classification work.* Every build is checked against this spec. Nothing is "done" until verified at all three layers (S0).

**Why this exists:** Decisions kept getting made in conversation, half-built, and silently dropped -- then re-discovered sessions later (WC transcripts built in the runtime layer but not the materialised table; the false-Unanswered gate; the strata caller-in-description match miss; the Account-exclusion funnel gap). This spec ends that by stating each decision *and* the layer it must live in *and* a verification.

**Owner:** Ric Gordon. **Last structural update:** June 2026 (v3 merge).

> **NEXT STEP after this spec is locked:** CC audits the live system field-by-field and tier-by-tier against this spec -- marking each green/red at all three layers with a verification query, and interrogating it against what we asked for in the working sessions. The spec is the checklist; the audit fills it in.

---

## S0. The Three-Layer Rule (read this first)

A data point or rule is only **DONE** when green at all three layers. "Committed" != "live." Most recurring bugs were something green at one layer and red at another while looking finished.

| Layer | Meaning | How it fails silently |
|---|---|---|
| **1. INGESTED** | Raw data arrives complete from source into raw BQ tables | API returns partial data; a field is never pulled |
| **2. MATERIALISED** | Written into the table the classifier AND validators read directly (`lead_timeline`, `lead_gate`), as actual content -- NOT a pointer | Logic built into runtime TS (`classify.ts` hydration) but never into `build_lead_timeline.sql`, so anything reading BQ directly is blind |
| **3. ORCHESTRATED** | The deployed Cloud Function rebuilds it nightly, so it persists | Committed to SQL but `deploy.sh` not run -> next nightly reverts to old revision |

**Verification rule:** every data point in S2 and rule in S4/S5 carries a **verification query** that can be re-run to prove it is live at layer 2. A claim you cannot re-run is not verified. Treat CC "validated / passed / N-of-N" as NOT credible unless the test was genuinely blind (the answer was withheld from the thing being tested).

---

## S1. Sources of Truth & System Inventory

### S1.1 System Ownership

| System | Owns (authoritative for) | Identifier |
|---|---|---|
| **AroFlo** | Jobs, job status, invoices, labour notes, task descriptions, task notes. SOURCE OF TRUTH for everything job/revenue. | `task_jobnumber` (JN) |
| **8x8** | Telephony CDR (answered/duration/direction), call recordings/transcripts (from ~April 2026) | `call_id`, call legs |
| **WhatConverts (WC)** | Lead attribution, **call transcripts (from ~Nov 2025)**, form submissions, recordings | `wc_lead_id` |
| **Quinn Marketing** | Form leads delivered via email to `jobs@mrwasher.com.au` | email twin |
| **MessageMedia** | SMS (inbound/outbound) | phone |
| **OfficeHQ / MyReceptionist (OHQ)** | After-hours answering service; takes message, forwards to tech mobile (**UNTRACKED**) | OHQ touch rows |
| **Microsoft Outlook** | `jobs@` mailbox (3 paths: A:email, B:JN-tagged, C:thread) | email |

### S1.2 Business Context

**PETTR** (Plumber To The Rescue / Electrician To The Rescue) -- owner-operator: Ric Gordon. Trade services (plumbing + electrical) in Sydney, Australia.

Two business lines with separate marketing but shared operations:
- **PTTR** -- Plumber to the Rescue (brand: Mr Washer)
- **ETTR** -- Electrician to the Rescue

Two customer types:
- **COD** (Cash on Delivery) -- residential leads from advertising. This is the marketing funnel the CRM tracks.
- **Account** (Property Management / Strata) -- contractual work with no marketing spend. EXCLUDED from the COD lead funnel.

### S1.3 GCP Infrastructure

**BQ project:** `pttr-taskdata`. **Datasets:** `ds_aroflo`, `ds_crm`, `gd_WhatConverts`, `ds_GoogleAds` (all **US multi-region**, not australia-southeast1). **Overrides/write-layer:** Firestore. **Auth:** Firebase (Google sign-in).

- **Region**: `australia-southeast1` (project default)
- **Secrets**: GCP Secret Manager (never read local secrets files)
- **BigQuery commands** must use `--location=US`
- **Firestore**: lives in project **`pettr-data`** (Firebase), NOT `pttr-taskdata`. The GCP Cloud Firestore API is **disabled** on pttr-taskdata -- you MUST use `firebase-admin` (Firebase path), not `google-cloud-firestore`, to reach Firestore from pttr-taskdata services.
  - Secret `firebase-admin-sa` (in pttr-taskdata Secret Manager) contains the pettr-data Firebase admin service-account JSON (`firebase-adminsdk-fbsvc@pettr-data.iam.gserviceaccount.com`).
  - The orchestrator's `_get_firestore_db()` reads this secret and initialises `firebase-admin`. If the secret is missing, the after-hours auto-classify step fails.
  - The CRM app (Next.js) uses its own Firebase Admin credentials via env vars (`FIREBASE_ADMIN_PRIVATE_KEY`, `FIREBASE_ADMIN_CLIENT_EMAIL`).

### S1.4 Standing Rules (do not re-litigate)

- Revenue is ALWAYS `vw_job_invoiced`, line-summed ex-GST, column `invoiced_total_ex`. Never quote notes, pre-aggregated fields, or WC `sale_value`. Show token math.
- Never edit BigQuery views -- changes go to underlying tables.
- All times Australia/Sydney.
- `~/crm-build` is source of truth (NOT the OneDrive copy -- spaces in path hang Next.js).
- "Zero results" is a silent-bug suspect, not proof of absence. A signal only means something once the signal *could have existed* (pre-April transcript-absence != unanswered call; pre-close-out invoice-absence != not-completed).
- Phone format: normalise to E.164 `+61...`. The `+6161...` double-prefix bug has hidden $430K+ in attributable revenue. Always normalise.
- All BQ rows -> `JSON.parse(JSON.stringify(rows))` before Next.js client components. Dates arrive as `{value: "..."}`.

### S1.5 Phone Format Gotchas

**MessageMedia SMS phones**: SMS reply notifications from `noreply@message-media.com` carry the sender phone in the subject: `"New SMS reply received from 61418963173"`. The number already includes the `61` country code. Correct normalization: `CONCAT('+', REGEXP_EXTRACT(subject, r'(\d{10,12})$'))` -> `+61418963173`.

**BUG (found June 2026)**: `CONCAT('+61', ...)` produces `+6161418963173` (double-61). Any phone-join against these numbers silently returns zero matches. This hid a $430K linkage signal during the June 2026 reconciliation.

**Rule**: always check the raw digits before prepending a country code.

### S1.6 Lookup Tables -- BUILT

#### ds_crm.lkp_did_trade
Editable. Maps 8x8 DID extensions to trade + internal flag.
- `did` STRING, `trade` STRING (PTTR/ETTR/Unknown/Staff), `label` STRING, `is_internal` BOOL
- 113 rows. 0 unknowns among external DIDs. DID 797 "Tradesmen" = internal.
- "Mixed" label retired -- the only genuinely mixed external DID (796) is trade='Unknown' for manual confirmation.

#### ds_crm.lkp_campaign
Editable. Maps Google Ads campaign_id to type + division.
- `campaign_id` STRING, `campaign_name` STRING, `campaign_type` STRING (Quinn-Suburb / Quinn-Smart / Supercharge-Suburb / Brand / Pmax / Retargeting / Organic / Unknown), `division` STRING (Plumbing / Electrical / Other)
- 455 rows. 0 Unknown campaigns (22128205877 confirmed as Pmax/Plumbing).

---

## S2. Ingestion Inventory -- Every Data Point

The authoritative list of what MUST reach the classifier/timeline. A field is not "ingested" until materialised into `lead_timeline` as content (layer 2) AND orchestrated (layer 3).

### S2.1 Data Sources + Call Routing -- BUILT

#### 8x8 PBX (raw_calls / raw_recordings / call_transcripts)
- All inbound/outbound calls route through 8x8 PBX `reliancecommunica977`
- One CDR per call, no leg dedup needed (confirmed)
- **After-hours calls DO forward through 8x8** -- BUILT, confirmed: 98.4% of answering-service emails (435/442, Dec-May) have a matching 8x8 call within +/-5 seconds. The call spine is complete after-hours. The 7 with no matching call are the rare exception (routed through non-8x8 channel -> mint as leads).
- Recordings ingestion began ~2 Apr 2026; no 8x8 transcripts before that date
- `raw_calls`: 72K rows, Apr 2024-present. `answered` = "Answered" / "-"
- `call_transcripts`: 3.1K rows, Apr 2026-present
- **Recording gap vs Opportunity gap -- TWO SEPARATE QUESTIONS**:
  - **RECORDING (transcript/audio): UNRECOVERABLE for mobile-forwarded calls.** ~25% of answered inbound calls have no recording. Root cause: calls that overflow/forward to external mobiles leave the 8x8 PBX -- no internal call leg, no recording trigger, no Storage API object. Confirmed 0/20 via direct 8x8 Storage API test. 92.7% zero-leg rate on unrecorded calls. This is an 8x8 routing/config issue, NOT recoverable by our code. Capture ceiling ~75% under current routing. The transcript is genuinely gone -- treat as a normal touch with metadata only (caller phone, DID, duration, operator from CDR), not "missing data."
  - **OPPORTUNITY (the lead): COVERED via connected-component clustering.** Call spine events source from 8x8 CDRs, but the OPPORTUNITY is created by clustering on phone -- so a forwarded call with no 8x8 CDR still lands in the correct opportunity IF the caller made any other trackable touch (form, different call, email). Verified 2026-06-19: ALL 675 WC call leads (Dec-Jun, unique, non-test) have an opportunity. 602 matched 8x8 directly; 73 had no/mismatched 8x8 CDR but clustered into existing opportunities via their phone number. The only true orphans are callers whose SOLE touch was one mobile-forwarded call with no phone captured (~3 leads).
  - **WC-as-first-class-call-source**: would NOT change coverage (clustering already handles it). Would improve TIMING (opp created from WC call immediately vs waiting for clustering) and fix the ~3 phone-capture-failure orphans. Minor correctness item, NOT a coverage fix. Deferred.
  - **Known minor bug** (not yet fixed): recording ingest advances watermark on transient 8x8 500 errors without retry (6 in 30d). Low impact.
  - **Spine backlog**: WC->8x8 match window is +/-5s. 23 leads (Dec-Jun CSV) have a WC call and an 8x8 CDR for the same phone but the timestamps differ by >5s. Widening the window recovers these (and likely more across full history). Logged, not yet built.

#### WhatConverts (gd_WhatConverts.all_leads_enriched / all_leads_classified)
- Tracks calls + web forms via tracking numbers and form integrations
- `all_leads_enriched`: 1,245 rows. Carries `lp_gad_campaignid`, `gclid`, `norm_phone`, `norm_email`, `profile` (PTTR/ETTR)
- `all_leads_classified`: adds `lead_class`, `is_booking`, `is_converted_job` etc. from WC classification rules

#### AroFlo (ds_aroflo)
- `tasks_complete`: 73K jobs. Curated view with `customer_type`, `status`, `job_status`, `task_invoices_total_ex`, `norm_client_*` contact fields
- `tasks_deduped`: raw task record with 72 cols. Key: `contact_userid` -> `contacts_deduped.userid` for task-level customer mobile/email
- `contacts_deduped`: customer contacts (mobile, email) linked via `userid`
- `locations_deduped`: site contacts (`SitePhone`, `SiteEmail`, `SiteContact`)

#### Google Ads (ds_GoogleAds)
- Supermetrics data transfer. Account `8436890791`
- `ads_Campaign_8436890791`: campaign metadata (name, type, status)
- `ads_CampaignStats_8436890791`: daily spend/clicks/conversions

#### Outlook / MS Graph (ds_crm.raw_emails_received / raw_emails_sent)
- Inbound emails: 74K rows from Jan 2018
- Used for: form-lead parsing (S2.5), answering-service enrichment (S2.8)

### S2.2 Call content

| Data point | Source field | Must reach | Rule | Verify |
|---|---|---|---|---|
| **Call transcript** | WC `call_transcription` (primary) -> 8x8 `full_transcript` (fallback) | `lead_timeline.full_content` as TEXT (not pointer) | `COALESCE(wc.call_transcription, ct.full_transcript)` -- **WC PRIMARY**. Per-call resolution: each call touch -> its OWN `wc_lead_id`/`call_id`, never cluster primary. | `SELECT LENGTH(full_content) FROM lead_timeline WHERE opp=219552891` -> ~9,388 |
| **Call CDR facts** | 8x8 `has_answered_call`, duration, direction | structured fields on touch | CDR is AUTHORITY for answered/unanswered -- never inferred from transcript presence | `has_answered_call` present per touch |
| **Call duration** | 8x8 (primary) -> WC `call_duration_seconds` (fallback) | structured | minor | duration present |

**Coverage boundaries (gate what "no content" means):**
- WC transcripts: from **~Nov 2025**. 8x8 transcripts: from **~April 2026** (~25% of post-April calls still missing -- forwarded/after-hours/overflow bypass 8x8 per-extension recording).
- **Before these dates, absence of transcript = "not recorded," NOT "unanswered/no-content."** Any rule keying on transcript-absence MUST gate on the recording era. (This bug mislabelled 4,732 answered calls as Unanswered.)

### S2.3 Form content

| Data point | Source field | Must reach | Rule | Verify |
|---|---|---|---|---|
| **Form full content** | WC `additional_fields_json` (Name/Phone/Email/Address/Problem/Intent) -> `form_my_problem` fallback | `lead_timeline.full_content` | **Cap 2000 chars** (was 300, truncated 95/373). Problem description must NOT be cut. | `LENGTH(full_content)` on a known long form -> full |

### S2.4 Job content (AroFlo) -- incl. invoice detail

| Data point | Source field | Must reach | Rule | Verify |
|---|---|---|---|---|
| **Task description** | AroFlo task description | classifier input + UI | FULL text, no truncation, formatting/highlight preserved where meaningful (CODE RED / commercial-rate flags). **Contains caller name/phone on strata/account jobs -- see S5.1.** | source-vs-CRM char match on a known job |
| **Labour notes** | AroFlo labour notes (ALL lines, ALL resources) | classifier input + UI | FULL text, ALL lines. The Completed+$0 payment-regex reads these -- truncation hides payment/outcome language (the JN141655 "cut at 'and mini'" bug). | raw labour-row count = CRM count; full text present |
| **Task notes** | AroFlo task notes (Frances/Katrina/Mario internal) | classifier input + UI | FULL text, all authors. **These changed a classification: J-141987 was Booking Cancelled but notes/emails showed a price was quoted -> Quote Only. Missing notes alter outcomes, not just display.** | source-vs-CRM match |
| **Job facts** | `jobnumber`; `job_status` (curated `tasks_complete` -- NOT `tasks_deduped.status` which always reads "Archived"); `customer_type`; `credit_note_count` | structured gate fields | gate keys off these | facts present per job |
| **Invoice -- amount** | `vw_job_invoiced.invoiced_total_ex` (line-summed ex-GST) | structured | THE revenue figure | amount present |
| **Invoice -- detail** | `invoices_deduped`: `invoicenumber`, status (processed/approved), invoice date, per-line detail | structured + available to classifier | Needed for: (a) credit-note cascade T3 trace (`invoicenumber -> task_jobnumber`, S8); (b) the Invoice-Pending vs Completed-and-Invoiced distinction (does an invoice RECORD exist vs money-collected-not-yet-invoiced). | invoice number + status present for a known job |

### S2.5 The Spine: vw_leads_unified -- BUILT

Multi-source event spine. `source_type IN {call, form, email}`.

**Source file**: `bigquery/vw_leads_unified.sql`

#### Calls (source_type = 'call')
- From `raw_calls`, direction = Incoming
- Excludes: test numbers, internal phones (>=10 outbound + 0 AroFlo jobs), `is_internal = TRUE` DIDs (via lkp_did_trade), account-only phones (PM/strata), DID 721 (Strata Account)
- WC matching: +/-5s timestamp + phone -> enriches with channel/source/medium/campaign/keyword/profile
- `call_outcome`: missed (0s) / dropped (<20s) / connected (>=20s)

#### WC Forms (source_type = 'form')
- From `vw_leads` WHERE channel = 'Form'
- Phone normalized to E.164; NULL if no valid AU phone (no synthetic hack)

#### Email Forms (source_type = 'email') -- BUILT
- Parsed from `raw_emails_received`. Sender-agnostic detection by template shape (field patterns in body text), NOT sender address.
- **Three tiers**:
  - **Tier 1 Quinn PAID** -- `gad_campaignid` + `gclid` in body -> campaign from `lkp_campaign` (Quinn-Suburb / Quinn-Smart), source=google, medium=cpc. Keeps gclid, keyword, suburb.
  - **Tier 2 Quinn ORGANIC** -- `LP Suburb:` / `LP Service:` / `Page URL:` without gclid -> channel='Organic - Landing Page', source=direct.
  - **Tier 3 WPForms** -- `My name is` / `My phone number is` patterns -> channel='Website Form', source='Direct / Website Form'. Profile from sender (brand = attribution ceiling; do NOT infer paid/organic).
- Excludes: RE:/FW: CSR threads, test campaigns (`...(Temp) Test`), test submissions.
- Phone extraction handles: `Phone*:`, `Phone:`, `My phone number is...`, bare digits. HTML entities (`&nbsp;`) stripped before matching.
- Quinn LP forms arrived via `jobs@electriciantotherescue.com.au` (pre-late-Apr) then `leads@resend.quinnmarketing.com.au` (post switchover). Both detected by template shape, not sender.
- All tiers dedup against calls/WC/jobs through the 30-day connected-component graph. No double-ingestion.

### S2.6 Email Sender Classification -- BUILT

Previously "jobs@ = internal, exclude." Replaced with tiered logic:

| Sender | Content | Action |
|---|---|---|
| `jobs@plumbertotherescue.com.au` | Form submissions (PTTR) + CSR threads | **Parse forms** (S2.5 Tier 3); exclude RE:/FW: |
| `jobs@electriciantotherescue.com.au` | Form submissions (ETTR) + CSR threads | **Parse forms** (S2.5 Tier 3 + Tier 1/2 Quinn); exclude RE:/FW: |
| `leads@resend.quinnmarketing.com.au` | Quinn LP forms (both brands) | **Parse forms** (S2.5 Tier 1/2) |
| `noreply@myreceptionist.com.au` | OfficeHQ answering-service messages | **Enrichment** on matched 8x8 call (98.4% match rate). NOT a standalone lead. |
| `vodafone@myreceptionist.com.au` | Same (Vodafone pager, ended Jan 2026) | **Enrichment** on matched call |
| `noreply@message-media.com` | SMS reply notifications | **Exclude** (noise) |
| `maintenance@bright-duggan.com.au` | Strata/PM work orders | **Exclude** (Account work) |
| `noreply@smata.com` | Strata/PM | **Exclude** |
| Other strata/PM domains | urbanise, morethanstrata, precise.property, nswstrata, stratachoice | **Exclude** |

### S2.7 Other touches

| Data point | Source | Must reach | Rule | Verify |
|---|---|---|---|---|
| **SMS** | MessageMedia | timeline touch | full reply + original text | SMS body present |
| **OHQ messages** | OHQ | timeline touch (own rows) | full message; separate touch_source | OHQ body present |
| **Outlook** | `jobs@`, 3 paths (A:email, B:JN, C:thread) | timeline touch | subject + body as available | email touches present |
| **Multi-touch assembly** | all clustered to an opportunity | ALL touches, not just first | each call resolves own transcript; all SMS/email/OHQ rows present | a 9-touch job shows 9 touches |

### S2.8 Answering-Service Emails (OfficeHQ) -- BUILT

OfficeHQ emails carry structured customer data (name, phone, address, problem, Caller ID) for after-hours calls. Confirmed as enrichment on existing 8x8 calls (98.4% match rate). NOT a standalone lead source.

**Built**: contact name, email, and suburb from OfficeHQ pager emails are resolved as FALLBACK fields in `vw_lead_enriched` -- they appear in the `contact_name`, `email`, and `suburb` COALESCE chains when no WC/AroFlo/prior-client data exists. Matched by phone (E.164 or 0-prefix in body) within 10 min of opportunity timestamp.

**Still planned (not yet built)**:
- Full content store (problem description, address detail) keyed by opportunity_id, linked on detail page + available to the AI classifier
- **HIGH VALUE PRE-APRIL**: no 8x8 transcripts exist before ~Apr 30, so the answering-service email is the only content for Dec-March after-hours calls -- it is the pre-transcript classification substitute

### S2.9 HELD / NOT ingested (deliberate)

| Data point | Source | Why excluded |
|---|---|---|
| `lead_analysis_json` (WC AI: Intent, Lead Summary, Call Type) | WC | WC's own AI classification -- feeding it makes T7 a rubber-stamp. HELD. |
| `form_reason_did_not_convert` | WC (Fergus's code output) | Comparison basis, not raw input -- circular if fed |
| `form_reason_did_not_convert_detail` | WC (human typed) | Human work-product / comparison basis -- circular |
| `voicemail_transcription` | WC | Genuinely null in our data |
| `notes`, `spotted_keywords`, `quotable`, `lead_status`, `form_service_type`, `custom_fields_json` | WC | Empty, junk ("Select One"), or derived/downstream |

### S2.10 CORRESPONDENCE COVERAGE HOLE (KNOWN GAP -- one problem, three leaks)

**Root cause:** customer correspondence is being reconstructed from the `jobs@` Outlook mailbox (a lossy MIRROR) instead of pulled from the authoritative SOURCES. The mailbox only catches inbound emails + SMS-replies-delivered-as-emails. It misses everything below. **AroFlo is the source of truth for job correspondence (S1) -- but we read the mailbox shadow, not AroFlo.**

| # | Missing data | Why it's missing | Authoritative source to pull | Impact |
|---|---|---|---|---|
| 1 | **Outbound SMS with NO customer reply** | MessageMedia only emails `jobs@` when a customer REPLIES. No reply -> no notification -> no record. Outbound text only survives if embedded in a reply's "Original Message:" field, or if staff logged it as a task note. | **MessageMedia reporting API** (full sent-message log, reply or not) | **Breaks S4.3 Customer Unresponsive**, which REQUIRES visible trackable outbound. Without the outbound SMS we cannot evidence "we chased, they ghosted" vs NFUR. The classifier is blind to the exact touch that distinguishes them. |
| 2 | **Staff emails sent from NON-`jobs@` mailboxes** | `raw_emails_sent` IS the `jobs@` sent-items folder only -- `from_email` is always a `jobs@`-family address. A staff member emailing a customer from their personal/other mailbox never lands in `jobs@` sent items. | Wider mailbox ingest (other staff mailboxes) OR AroFlo task entries (if CC'd to the task address) | Outbound conversation invisible -> same Customer-Unresponsive / outcome blindness as #1. |
| 3 | **AroFlo email/SMS TASK ENTRIES (the big one -- "baked into AroFlo")** | When correspondence is CC'd to the AroFlo task address, AroFlo logs it as an entry AGAINST THE JOB -- the authoritative, complete record. We only capture the `jobs@` shadow of these (e.g. 22 staff-pasted email headers in `task_notes_deduped`), NOT AroFlo's own email-type entries. **UNTESTED:** whether `join=notes` (vs current `join=tasknotes`) or another join/endpoint exposes these entries. CC could not run the live AroFlo call; the Postman collection + creds exist (S11) -- this IS testable, do not leave as "can't." | **AroFlo API** -- task notes/correspondence endpoint. Confirm which join returns email-type entries. | The complete per-job conversation (incl. outbound, staff replies, quotes given) lives here. This is the J-141987 class (notes/emails changed Booking-Cancelled -> Quote Only). Under-ingesting it alters OUTCOMES, not just the timeline. |

**Note on `join=tasknotes` (settled):** the production ingest (`zone=tasks, join=tasknotes`) WORKS -- 107,378 notes / 23,876 jobs. The earlier "probe returned empty" was a malformed schema-enumeration probe, NOT a broken ingest. The open question is ONLY whether a different join/endpoint surfaces AroFlo's email-type entries that `tasknotes` omits (#3 above) -- that needs the live AroFlo call.

**This is ONE coverage hole** (decided: fix all three). It is the upstream completeness work that makes both matching (S5) and classification (S4) deterministic -- every missing channel is where determinism fails and inference begins. See S10.

---

## S3. Source-of-Truth Hierarchy (conflict resolution)

| Question | Authority | Loser / fallback | Rationale |
|---|---|---|---|
| Did the call get answered? | **8x8 CDR** (`has_answered_call`) | transcript presence | CDR is fact; transcript can be absent for recording-era reasons |
| What was said on the call? | **WC transcript** | 8x8 transcript | WC broader coverage; both transcribe same call so tie favours coverage |
| Job status / completion | **AroFlo `job_status`** (curated `tasks_complete`) | `tasks_deduped.status` (always "Archived") | curated field is real lifecycle state |
| Revenue (gross) | **`vw_job_invoiced.invoiced_total_ex`** | everything else | never quote notes / WC sale_value / pre-aggregates |
| Net revenue | **`vw_job_revenue`** (gross - refunds - discounts; bad debt separate opex) | -- | see S8 |
| Customer identity on strata/account jobs | **the caller in the task description** (resident/tenant) for *lead matching*; the structured client (strata co.) for *billing* | structured client field alone | the real caller's phone is often only in free-text (S5.1) |

---

## S4. Classification -- Gate then T7

**Architecture (locked):** the **gate** determines everything it can from FACTS; **T7** judges only the residual that genuinely needs reading. Facts settle; AI reads. The gate's allowed-set FENCE is absolute -- a no-JN lead can never receive a Booked sub-status; a JN lead can never escape the Booked set. **The system auto-classifies end-to-end** (see S5 for the auto-link/audit model -- there is no confirm-before-write step).

### S4.1 Gate determinations (by FACT, never by absence-of-content)

| Condition (facts) | -> Determined sub-status | Notes |
|---|---|---|
| JN + `invoiced_total_ex > 0` | **Completed and Invoiced** | invoice is the fact |
| JN + `$0` + `job_status='Archived'` | **Booking Cancelled** | never attended |
| JN + `$0` + `job_status='Open'` | **Job Pending** | still scheduled |
| JN + `$0` + `job_status='Completed'` | -> **Completed+$0 split** (S4.2) | payment-regex then T7 |
| **Was the call answered?** `has_answered_call = FALSE` + no non-call content | **Unanswered Call** | **CDR-FACT-FIRST. PRIMARY determinant is the CDR, NOT transcript absence.** Post-April IVR-only transcript is REINFORCING only. Pre-April: CDR is authority. *(Canonical term is "Unanswered Call" -- not "Missed Call". Align the gate's emitted label to this.)* |
| `has_answered_call = TRUE` + no readable content + no JN | **Unable to Classify** | answered but unreadable (pre-recording era / 8x8 gap). NOT Unanswered -- it connected. |
| **Was the call dropped?** answered + live exchange severed mid-call + reception-failure language ("I can't hear you", "you're breaking up", "hello? hello?") + sole touch | **Dropped Call** | reached a person THEN line failed. Distinct from Unanswered. Requires `has_answered_call=TRUE`. Naturally rare (most candidates are multi-touch opps where another call connected). |

### S4.2 Completed+$0 split (payment-regex pre-pass, then T7)

1. Labour notes match PAYMENT pattern (`$X+gst`, "collected", "eft", "card", "paid", `$\d+`) -> **Completed - Invoice Pending** (money collected, invoice not yet raised -- real revenue `vw_job_invoiced` hasn't captured). *(JN142889 "$1490 plus gst" revenue-hiding guard.)*
   - **OPEN definition question (decide in audit):** when cash was collected on-site, is it "Invoice Pending" or already "Completed and Invoiced"? Reconciliation flagged J-142780 ("collected $450") as arguably Completed-and-Invoiced. Resolve what Invoice-Pending means vs an effectively-complete cash job.
2. Notes match NOT-PROCEEDING (`quote only`, `not going ahead`, `too expensive`, `declined`, `won't proceed`) -> **Quote Only**.
3. Neither -> **T7** judges Quote Only vs Invoice Pending.
4. `credit_note_count > 0` -> NEUTRAL hint to T7 ("a credit occurred; read notes; still a normal Booked bucket, NOT a separate refund category"). Do NOT bias or auto-assign.

**Payment regex: DISABLED in cascade.** The `applyPaymentRegex` pre-pass has a known false-Invoice-Pending bug: it reads `$X+gst` in labour/task notes as invoice evidence, but this pattern appears in QUOTES as well as collections. Tested 0% accuracy on quote amounts (5 of 5 wrong -- all were Quote Only, not Invoice Pending). The regex cannot distinguish quote-language ("quoted $3636+gst") from collection-language ("collected $705+gst eft"). Until fixed (the fix must key on collection verbs adjacent to the dollar amount, not dollar-amount alone), ALL `judgement:Booked:completed_zero` leads route to T7.2 AI judgement. The regex is not called; it is not a fallback; it is OFF.

### S4.3 T7 judgement (the residual only)

T7 reads full content (transcript + notes + form) and classifies WITHIN the gate's allowed set. **T7 is judgement, not determination** -- never used to gate-determine a category. Validated CC-as-classifier (no OpenAI); production engine wiring is pending (S10).

**Key T7 rules:**
- **Wrong Number** = pure T7 judgement (validated 13/13; keywords retired -- people say "oh sorry" not "wrong number"). NEVER gate-determined.
- **Customer Unresponsive** requires VISIBLE, TRACKABLE outbound evidence (a call/SMS/email row).
- **OHQ after-hours leads -> No Follow-Up Recorded (NFUR), NOT Customer Unresponsive** -- follow-up goes to an untracked tech mobile; we CANNOT see if contact was made. Absence of trackable outbound != customer unresponsive when the channel is untrackable. *(Exception: if visible trackable outbound DOES exist, T7 reads content normally -- e.g. Tenant/Strata Referral.)*
- **No Follow-Up Recorded (NFUR)** = NEUTRAL data-state, NOT blame. Replaced PDNR ("PETTR Did Not Respond" -- dropped). Operational-failure detection -> HUMAN REVIEW of this bucket.
- **Customer Resolved** = pre-booking only.
- **Policy Declined** = DROPPED (phantom).
- **Known reasoning misses to watch (from reconciliation):** service-scope declines on appliances mis-called Not Job Related when they're Service Not Provided (G-afa09ff7); these are taxonomy-judgment errors, not input gaps.

### S4.4 Taxonomy (current, locked)

- **Not Captured** (determined): Unanswered Call, Dropped Call, Technical Error.
- **Unable to Classify** (determined): touch exists, zero readable content. `exclude_from_analysis = TRUE`: removes lead from all funnel denominators and rate calculations.
- **Not Quotable** (no JN): Spam, Service Not Provided, Outside Service Area, Strata Issue, Customer Inquiry Only, Wrong Number, Not Job Related.
- **Not Booked** (no JN): Customer Unresponsive, No Follow-Up Recorded, Tenant/Strata Referral, Price/Minimum Call Out, Capacity/Scheduling, Wanted Quote Over Phone, Customer Resolved, Booked Elsewhere, Other.
- **Pending**: Pending (with `pending_since` timestamp). Marks leads needing follow-up; converted from Firestore `_seconds` to ISO string at API read time.
- **Booked** (JN): Completed and Invoiced, Completed-Invoice Pending, Quote Only, Booking Cancelled, Unable to Complete-Out of Scope, Job Pending, Job Complete (auto).

Auto-detected sub-statuses (from BQ objective fields) are shown with a bullet indicator in the UI. Human overrides always replace auto-detection.

### S4.5 After-Hours Gap Auto-Classification

- Runs as orchestrator step (NOT page-load), daily after opportunities rebuild
- **Rules**: `is_after_hours_gap = TRUE` (no WC, no job, no contact, no recording, no OHQ email) AND `captured = FALSE` -> Not Captured / Dropped Call
- `is_after_hours_gap AND captured = TRUE` -> Not Booked / Customer Unresponsive (auto-placed in UI via `getAutoPlacement`)
- **Guard**: NEVER overwrites human overrides. Only writes when no Firestore doc exists OR existing doc was auto-written (`updated_by` starts with `auto_rule:`)
- Tagged `updated_by = 'auto_rule:ah_gap_short'`

### S4.6 CSR Review (independent of classification)

Categories: Failed to Book Job, Customer Service Issue, Complaint, Other (requires free-text note). Saved as `requires_csr_review`, `csr_review_category`, `csr_review_note` in Firestore.

### S4.7 Account Attribution

- **Flag**: links lead to an AroFlo Account (search -> select -> optional contact)
- Sets `is_account = TRUE`, `funnel_stage = 'Account'`, `exclude_from_analysis = TRUE`
- On-demand contact refresh from AroFlo (`/api/contacts/refresh`)
- Unflag via DELETE removes all account fields

### S4.8 Legacy Value Migration (on read)

- `'CSR Failure'` -> `'Customer Unresponsive'` + `requires_csr_review = TRUE`
- `'Lost / Unresponsive'` -> `'Customer Unresponsive'`

### S4.9 CRM Architecture -- Override Precedence

#### Data Flow
1. **BigQuery** (`vw_lead_enriched`): objective fields (answered, captured, completed, revenue, funnel_stage, is_after_hours_gap)
2. **Firestore** (`crm_lead_overrides`): human/auto classification overrides (stage, sub_status, loss_reason, exclude_from_analysis, is_account, etc.)
3. **API merge** (`/api/leads`): batch-reads Firestore, applies overrides on top of BQ data, returns merged Lead objects

#### Override Precedence (highest -> lowest)
1. **Objective AroFlo facts** always win: if BQ says `booking_status = 'Booked'` or `completed = TRUE`, override "Unable to Classify" is cleared
2. **Account flag** forces `funnel_stage = 'Account'` + `exclude_from_analysis = TRUE`
3. **Manual job link** (`manual_job_number`): promotes unlinked inbound to Booked/Paid Job based on linked job status. **Dedup rule**: when a job is manually linked to a lead, any `no_inbound` opportunity (`J-{jobnumber}`) for that same job is suppressed from the leads list to prevent double-counting.
4. **Human override** (Firestore stage/sub_status)
5. **Auto-classification** (orchestrator `auto_rule:*`)
6. **BQ default** (objective `funnel_stage`)

#### Firestore Collections
- `crm_lead_overrides`: classification overrides, keyed by `opportunity_id`
- `crm_job_value_overrides`: manual job value overrides, keyed by `jobnumber`
- `crm_notes`: user-added notes, keyed by auto-ID
- `crm_account_notes`: account notes

### S4.10 Keyword Rules & Fergus Crosswalk (the living rule store)

**`ds_crm.keyword_rules` is a LIVING, human-extensible rule store** -- NOT a static seed. Seeded from Fergus's `classifyLead()` regex (his `enrichWhatConvertsLeads.js`), it is designed to be **added to over time** by staff as new patterns appear, with additions persisted via **Firestore** (same override-layer pattern as `crm_lead_overrides` / `crm_match_overrides`) so they survive the nightly rebuild and accumulate. The system gets better as staff feed it patterns, rather than ossifying at Fergus's original regex.

**Schema:** `term`, `our_category`, `ferg_category` (crosswalk), `match_type`, `confidence`, `active`, `notes`.
- `active` = retire a rule without deleting it (keeps the audit trail -- e.g. Wrong Number keywords set inactive, not removed).
- `confidence` = governs whether a keyword match auto-classifies (high-confidence deterministic pre-pass) or just hints to T7.

**`applyKeywordRules()`** reads this table and routes via the gate's JN fence (never a hardcoded single category).

**Deterministic high-confidence pre-pass categories** (harvested from Fergus's `classifyLead()`; exact terms live IN the table):
- Outside Service Area terms
- Service Not Provided terms
- Spam terms

**Price-keyword bundle** -- four terms as ONE price-decline concept, JN-fence-routed:
- Terms: **"minimum charge", "minimum call out", "too expensive", "price too high"**
- JN exists -> **Quote Only** (quote given, declined); No JN -> **Price / Minimum Call Out** (balked pre-quote)
- `ferg_category`: "Price too High"

**Retirements:**
- Wrong Number keywords -> retired (0% recall; -> pure T7 judgement). Set `active=FALSE`, not deleted.
- Policy Declined -> dropped (phantom; regex fired on incidental phrasing).

**Payment-regex** (Completed+$0, reads labour notes -- S4.2):
- PAYMENT: `$X+gst`, "collected", "eft", "card", "paid", `$\d+` -> Invoice Pending
- NOT-PROCEEDING: "quote only", "not going ahead", "too expensive", "declined", "won't proceed" -> Quote Only

**Fergus crosswalk (his categories <-> ours):**

| Fergus category | Maps to (ours) | Note |
|---|---|---|
| "Dropped Call" (his catch-all for short/unanswered) | Unanswered Call / Dropped Call / CU / NFUR -- by CDR + content | the 30-divergence vocab mismatch; his term is a catch-all, ours splits by fact |
| "Service Not Offered" | Service Not Provided | |
| "Price too High" | Quote Only (JN) / Price-Min-Call-Out (no JN) | JN-fenced |
| (his `afterJobStatus`: Archived+processed -> Quote Only) | became our **job_status gate rule** | harvested into the gate |
| (his repeat-lead -> `sale_value=0`) | superseded by our opportunity clustering | crude dedup |

**Test/exclusion identities** (harvested from Fergus): emails **alexm@, francesb@, fergusg@, gordo@** mrwasher.com.au (note `gordo@`, not `gordon@`) + the test phones (S15.1).

> **VERIFY in audit:** (a) dump the LIVE `keyword_rules` rows (every term, our_category, ferg_category, match_type, confidence, active) into this section so the exact patterns are recorded from the table, not memory; (b) confirm the **Firestore add-over-time write-path is actually built and live at all three layers** -- this may be specced-not-built; (c) confirm `applyKeywordRules()` has a production caller (it may be exported-but-not-invoked -- the deferred OpenAI step, S10).

---

## S5. Matching Cascade -- Lead <-> Job

**Principle:** complete interaction data makes matching deterministic; every missing channel is where determinism fails and inference begins. Stop at first hit; stamp every link with the tier that produced it. **The system AUTO-CLASSIFIES end-to-end** -- all tiers auto-link/auto-classify with their tier + confidence stamped; there is NO confirm-before-write step. Low-confidence links are **audited AFTER the fact** (human review of the low-confidence/NFUR/flagged set), not gated before writing. Human override sits above all of it and can reject any auto-link. Overrides keyed by STABLE ids (`lead_id` + `job_number`), never `opportunity_id` (changes on rebuild).

### Tiers (all auto-link; confidence governs audit priority)

| Tier | Method | Confidence | Status |
|---|---|---|---|
| **T1** | Exact phone OR exact email (E.164 normalised) | deterministic | live |
| **T2** | Form-twin hydrate: phoneless WC form-leads -> `jobs@` email twin (normalised name + <=5min timestamp + collision guard), recover phone/email, then T1 | deterministic | shipped (`vw_leads_unified`) |
| **T3** | **Free-text phone/email extraction from BOTH sides** -- lead (transcript/form) AND job (`task_description`, `task_notes`, `labour_notes`). **Job-side (graph):** labeled extraction in clustering graph (Phone:/m)/Caller ID/Contact(M)). **Job-side (post-graph, `auto:t3_job_content_phone`):** guarded-broad 04XX from descriptions + notes, REGEXP_EXTRACT_ALL (fixes first-match-only bug), keyword guard (80-before: role labels; 40-after: committee only), frequency guard (>=10 Account descs -> exclude, including resident-context), single-candidate, +/-30d. **Lead-side (post-graph, `auto:t3_lead_content_phone`):** extracts non-primary 04XX from lead_timeline.full_content, matches against job desc/notes, same guards. | deterministic | shipped -- job-side graph (bfd52fa), job-side post-graph (6c2c6cb), lead-side post-graph (3fa8e12) |
| **T4** | Fuzzy phone, edit-distance-1, same length, SINGLE candidate, value-corroborated (transposition typos) | deterministic | specced |
| **T5** | Phone-mismatch / different-number calls: name + location + value corroboration | inferred (low-conf, audited after) | |
| **T6** | Fuzzy name + suburb, CORROBORATION-GATED: only if name+suburb AND >=1 of {exact value, full surname, exact address}. Bare first-name+suburb NEVER links (the "two Steves in Eastwood" trap). | inferred (low-conf, audited after) | |
| **T7** | AI over the RESIDUAL only. **T7-CLASSIFY** (built): picks sub-status within gate-constrained set. Reads from materialised `lead_timeline` (full_content, task_description, labour_notes, task_notes, gate_stage). Validated 97 blind: gate 48/48, payment-regex 8/8, AI 0 genuine errors. **T7-MATCH** (BUILT): see S5.3. | inferred (low-conf, audited after) | classify shipped (6b4e559), match BUILT (`scripts/run-cascade.ts` Steps 5-6) |

> **S5.1 -- KNOWN GAP (the strata caller-in-description + Account-exclusion miss).** On strata/account jobs the *structured client* is the strata company (e.g. "Strata Choice", office line `+61284249700`) but the *actual caller* is a resident/tenant whose phone is ONLY in the free-text task description (e.g. "Cy... 0435 778 286"). TWO compounding causes:
> 1. **Account jobs are excluded from the opportunity graph entirely** (`build_opportunities.sql` filters `customer_type='Account'` before matching runs) -- so the description phone is never even compared. The match is structurally impossible, not a regex miss.
> 2. Even for COD jobs, T3 description-scan must actually be reading `task_description`/`task_notes`/`labour_notes`.
>
> **Measured impact:** 3,340 Account jobs have a resident phone in the description that matches a gap-based COD lead -- **977 distinct COD leads, $6.1M invoiced revenue** -- currently misclassified as Unresponsive / Tenant Referral / Strata Issue when they actually CONVERTED. Symptom case: WC-222894823 (0435 778 286) failed to match JN141655 (description has that phone + "kitchen sink blocking up"), classified Customer Unresponsive despite the job completing and invoicing $636.90.
>
> **RESOLUTION (decided) -- the "SMS/resident-phone link tier."** Match resident-caller COD leads to their Account job and SHOW the true outcome (Completed/Invoiced) in the funnel -- but flag the link `is_account=TRUE` + `exclude_from_analysis=TRUE` so it stays OUT of COD campaign ROAS (S6). The lead is a genuine COD-channel inbound; the job is serviced as Account. Both truths held: real conversion visible, campaign metrics clean.
>
> **THREE constraints, ALL required (this is what keeps it safe -- do not drop any):**
> 1. **Unique caller phone only.** Match on the resident/tenant's UNIQUE phone (from the SMS thread / free-text task description), NEVER the SHARED strata-company office line. The shared line stays out of clustering -- matching on it recreates the mega-cluster (one strata phone Frankensteining hundreds of unrelated jobs). This is WHY the blanket Account-exclusion existed; we keep its protection by only ever matching the unique number.
> 2. **30-day forward window.** The Account job must be dated **within 30 days AFTER the lead date** (lead/call/SMS comes first, job follows). Bounds transitive linking -- even a not-perfectly-unique phone can't chain jobs across months.
> 3. **Flag the link** `is_account=TRUE` + `exclude_from_analysis=TRUE` (S6), keyed by stable `lead_id`+`job_number`.
>
> **BUILD STATUS (layer check, S0):** BUILT. Three tiers write links into `crm_account_exclusions`:
> - **`auto:resident_phone_tier`** (bf4a111): guarded-broad 04XX extraction from Account job descriptions. Keyword exclusion (11 role patterns, 80-char before-phone window), frequency guard (>=10 Account descs -> exclude), shared-line exclusion (structured phone on 3+ Account clients). Forward-only 30d. 287 leads, $499K. 0% FP on 20-sample.
> - **`auto:sms_jn_tier`**: MessageMedia SMS body JN extraction. +/-30d window. 29 leads with JN links, 186 flag-only (distant matches, correct exclusion, wrong job for attribution).
> - **`auto:t3_lead_content_phone`** (3fa8e12): non-primary 04XX from lead_timeline.full_content matched against job desc/notes. 21 leads, $28K.
> - **`auto:t3_job_content_phone`** (6c2c6cb): guarded-broad 04XX from ALL job descriptions + task_notes via REGEXP_EXTRACT_ALL. Corpus-derived guards (91K phone corpus): role keyword before-80, committee before-80 OR after-40 (include <5, defer >=5), resident + freq >=10 -> exclude, bare + freq >=10 -> exclude. 280 Account links, $814K. 0% FP on 25-sample post freq-cap.
> - **S6 post-link refresh**: generic `crm_account_exclusions.opportunity_id` refresh via stable keys (matched_phone + jobnumber -> rebuilt opp). Covers all tiers in one pass.
> - **Total Account-linked**: 626 opps. **Total revenue attributed**: $1.4M.

> **S5.2 -- Bare-mobile extraction on the GRAPH side is REJECTED.** Unlabeled "Joseph Pawney - 0412213986" produced 27 false-positive mixed-client merges (shared secondary-contact numbers). Too noisy for the clustering graph. **However, POST-GRAPH guarded-broad extraction IS safe** -- the T3 job-side and S5.1 tiers use bare 04XX with keyword + frequency guards and single-candidate constraint, validated at 0% FP. The distinction: graph-side extraction feeds connected-component clustering (transitive, amplifies errors); post-graph extraction feeds deterministic single-candidate UPDATE (bounded, auditable).

> **S5.3 -- T7-MATCH (AI residual job-matching).** BUILT (`scripts/run-cascade.ts` Steps 5-6, commits 7a69084 + b876f5a). First run: 101 signal leads, 0 matches (all structurally correct abstains). T7.1 recall gap: 0 of 6 real-job orphans caught. Architecture:
>
> 1. **SCOPE:** gap_based opps after all deterministic tiers, gate_stage = `judgement:NQ/NB`, with substantive content (full_content > 50 chars). **Excludes:** no-content (Unable to Classify), Unanswered Call, phones on >=10 Account job descriptions (conflation guard, inherited from T3). Estimated population: ~600 candidates of which ~100-200 have a plausible matching job.
>
> 2. **CANDIDATE GENERATION (deterministic SQL):** same service (PTTR->Plumbing, ETTR->Electrical trade label) + forward 0 to +30d window (job must follow the lead -- a job before the lead date is a prior event for the same customer, not this lead's job), up to 15 candidates per lead sorted by date proximity. **Pre-computed identity signals per candidate:** extract ALL phones from the candidate's identity bundle (structured fields + description + task_notes + labour_notes), normalise to E.164 in SQL. Extract lead's phones (primary + any in content). Compare -> `PHONE_MATCH: yes/no` per candidate. Same for email (lowercase/trim). **T7 never parses phone or email strings itself** -- these are handed as pre-computed booleans.
>
> 3. **T7 EVALUATION:** receives lead content + up to 15 candidates, each annotated with pre-computed `PHONE_MATCH`, `EMAIL_MATCH`, and raw identity/problem text. T7 reasons over the **FUZZY dimensions only**: name, address, suburb, problem/task characterisation (six-dimension model: name, address, suburb, phone, email, problem). Picks one with cited evidence or ABSTAINS.
>
> 4. **MATCH BAR:**
>    - **COD job:** >=2 corroborating signals, at least one being problem-match. Pre-computed PHONE_MATCH and EMAIL_MATCH each count as one signal.
>    - **Account job:** >=1 HARD identity signal (name/phone/email to a **person** in the description, NOT the strata company name) AND problem-match AND a location signal. Suburb + problem alone = ABSTAIN (the JN141239/JN141237 lesson -- multiple similar Account jobs at the same strata building).
>    - **VERBATIM PROBLEM EXCEPTION (COD only):** a verbatim or near-verbatim problem-text match -- where the lead's reported problem and the candidate's work description share distinctive actual text (e.g. a specific multi-clause fault list appearing substantially word-for-word on both sides), not merely the same problem CATEGORY -- is strong enough to satisfy the COD match bar on its own, or to serve as a qualifying identity-adjacent signal alongside a weak name (e.g. first-name-only). This is distinct from a SEMANTIC problem match ("no hot water" ~ "hot water unit failed"), which remains an ordinary single signal and still requires a second distinct signal. The exception applies ONLY to distinctive text overlap that would not plausibly coincide on an unrelated job -- generic or short problem phrases ("blocked toilet", "no power") do NOT qualify even if textually identical, because they are common. **Account jobs:** the verbatim exception does NOT bypass the strata-company-vs-person identity requirement for the hard-identity leg -- Account matching still requires a person-identity signal.
>    - **Problem-MISMATCH veto:** if the lead's reported problem contradicts the candidate's work description, disqualify regardless of identity signals (the building-manager-name trap: same name, different issue).
>    - **Multi-candidate within 0.1 confidence = ABSTAIN.**
>    - **Temporal proximity:** candidates are annotated with days-from-lead. Closer-in-time is stronger evidence -- a job 2 days after the lead is far more likely the match than one 28 days after. Factor proximity into confidence and multi-candidate tiebreak.
>    - **Forward-only:** candidate job dated 0 to +30d after the lead. Backward matches (job precedes lead) are invalid -- different event.
>    - **Confidence threshold: 0.8** for auto-link.
>
> 5. **OUTPUT:** auto-link with tier `auto:t7_match` + confidence stamped, OR abstain (lead stays gap_based). Account links -> `crm_account_exclusions` with `is_account + exclude_from_analysis`. COD links -> `opp_type = 'job_matched'`. Overrides keyed by stable `matched_phone` + `jobnumber` (not opportunity_id -- survives rebuild).
>
> 6. **DEPLOYMENT GUARD:** T7-match auto-links with no confirm-before-write, consistent with the spec's auto-classify principle. BUT the validation N is small (14 blind cases). On first production run over the full residual, T7-match links are written in a FLAGGED/reviewable state (`needs_audit = TRUE` or a separate review queue), NOT directly into the live funnel, until a human has eyeballed the first batch. Validated-on-14 earns the build; it does not yet earn unmonitored autonomy over the full set. After the first batch audits clean, remove the flag and let it run autonomously like the deterministic tiers.
>
> 7. **VALIDATION RECORD:** blind on 14 forward-matchable confirmed WC misses (`after_job_number` withheld from T7). Result: **11 correct, 3 correct-abstain, ZERO genuine wrong.** Two apparent failures resolved: WC-216450883 was a WC false positive T7 correctly rejected; WC-215312436 excluded as a conflated lead (building manager, multiple buildings on one phone). Sarah case (WC-232004696) flips abstain->correct with pre-computed `PHONE_MATCH`. The 3 abstentions: 2 Account jobs where T7 couldn't detect phone format difference (fixed by pre-computed `PHONE_MATCH`), 1 garbled transcript with insufficient readable content.
>
> 8. **KNOWN LIMITATION -- conflated leads.** 246 gap_based opps have phones on >=10 Account job descriptions. Of these: 183 have no content (gate = Unable to Classify, harmless), 38 span <=7 days (single event, not conflated), **25 have content spanning >7 days (genuinely conflated -- multiple unrelated conversations merged into one opp).** These 25 are flagged `conflation_risk = TRUE` and excluded from T7-match and per-event-precision analyses. The conflation does NOT corrupt T7-classify (classification applies to the specific conversation content, not the merged opp as a whole). Not a clustering bug -- an inherent limitation of phone-based identity when the same person calls about different issues over time.
>
> 9. **KNOWN LIMITATION -- multi-job disambiguation.** Building managers and repeat customers appear in MULTIPLE job descriptions. Any scan or match that finds "name X in a job description" may find several jobs for the same person. The selection MUST pick by DATE PROXIMITY to the lead (the job most likely to be THIS lead's job), NOT by invoiced amount or arbitrary sort. Evidence: the 2026-06-20 orphan scan sorted by `invoiced_ex DESC` and attributed Mark Ford to JN141811 ($1,817, 81d forward) instead of JN140906 ($466, same-day -- correct); Aaron Simpson to JN141593 ($5,412, 40d) instead of JN141307 ($0, 13d -- correct); John Gabor to JN142576 ($1,126, 16d) instead of JN142371 ($792, 1d -- correct). This produced a false linker-miss total of $18,090 vs the verified $10,993 -- a $7,097 overstatement from picking the wrong jobs. **The durable rule:** any scan, match, or orphan-detection step that selects among multiple candidate jobs for the same person MUST apply the cascade's own selection rules -- date proximity (item 2) and problem-mismatch veto (item 4). These rules exist precisely for this case. Ad-hoc code that reinvents job selection without applying them will repeat this error.

---

## S6. Account / Strata Jobs -- Link & Flag (do not exclude, FLAG)

**Decision (kept getting dropped):** Account jobs ARE ingested, linked, and shown with their true outcome -- but carry a flag to exclude from *campaign analysis*. Real revenue, must be visible; just not in PPC/COD metrics (the ad didn't generate the demand -- it routed an existing brand relationship). **This supersedes the current `build_opportunities.sql` blanket exclusion (S5.1).**

**Link model -- link-to-both, attribute-once:**
- A lead may link to MULTIPLE jobs (quote + the periodical it spawned). Link to ALL for traceability. *(Aaron Simpson lead 215312436 -> {141307 quote, 141813 periodical=revenue}.)*
- Mark the **revenue-bearing** job (`revenue_job`) so revenue is read once, never double-counted.

**Flags (Firestore `crm_lead_overrides`, keyed `lead_id`+`job_number`):**
- `is_account = TRUE`
- `exclude_from_analysis = TRUE` (out of campaign ROAS)
- link source/method recorded

**`existing_client` flag (computed, INDEPENDENT of Account):** `TRUE` if the lead's customer (phone/name) had ANY AroFlo job dated BEFORE this lead's enquiry. A COD lead can be an existing client too.

**Two independent analysis toggles:** (1) exclude `customer_type=Account`; (2) exclude `existing_client=TRUE`. Both off = "new-demand PPC performance"; both on = "all conversions"; either alone = in between.

**ABSOLUTE GUARD:** an invoiced job OR a WC-Unique inbound is NEVER excluded by any heuristic. *(Aaron Simpson, $5,609, was wrongly excluded by the internal-phone outbound-frequency heuristic -- a real Account client. An invoice + money = converted, full stop.)* Retire the outbound-frequency heuristic; replace with the explicit test-identity list (S4.10) + this guard.

---

## S7. Opportunity Clustering -- BUILT

**Table**: `ds_crm.opportunities` (materialized by `bigquery/build_opportunities.sql`)
**View**: `ds_crm.vw_opportunities` = `SELECT * FROM ds_crm.opportunities`

### Connected-Component Graph
Identity is phone OR email. Two events are the same opportunity if, within a 30-day window, they share a normalized phone or email. Matching is transitive (A shares phone with B, B shares email with C -> A+B+C = one opportunity).

### Graph Nodes
- **Spine events**: calls (connected + dropped + missed) + WC forms + email forms
- **AroFlo COD jobs**: client-level, task-contact-level, site-level, AND description-extracted contacts all feed the graph.

### Contact Hierarchy for Jobs (priority order)
1. Task contact mobile/email (`contacts_deduped.mobile/email` via `tasks_deduped.contact_userid -> contacts_deduped.userid`)
2. Location site (`tasks_deduped.location_SitePhone/SiteEmail`)
3. Client level (`tasks_complete.id_phone/norm_client_phone/norm_client_email`)
4. Description free-text extraction (regex on task description; only when all structured levels are null). Handles `Phone:`, `Caller ID:`, `Contact: {name} (M) {num}`, `m) {num}`.

Note: `contactname` / `contactphone` on tasks_deduped = CSR/staff, NOT customer. Exclude the 8583-xxxx extension range.

### Exclusions
- Account/PM jobs (`customer_type = 'Account'`)
- Account-only phones (phones appearing ONLY on Account-type jobs)
- Test clients (`client_name LIKE '%test%'`)

### opportunity_id (deterministic, idempotent)
- `J-{min_jobnumber}` when cluster contains an AroFlo job
- `G-{MD5(component_id | phones | emails)}` otherwise
- Tiebreaker on job rank: `ORDER BY date_distance, jobnumber`

### Implementation
5-round label propagation in a BigQuery scripted job (~50s). Too complex for a view; materialized as a table. Re-run is idempotent (CREATE OR REPLACE).

### Lead-Counting Invariant (RULE)
The **opportunity is the unit of lead counting**. All WC touches, 8x8 calls, and form submissions within a cluster are **interactions** -- never separate leads. Opportunity boundaries are set by a **30-day consecutive-silence gap** (measured between successive touches, not first-to-last). A customer contacting repeatedly with no 30-day gap = one opportunity, many interactions. A gap of >30 days between consecutive touches = a new opportunity.

- **Volume / funnel metrics** MUST count `COUNT(DISTINCT opportunity_id)`, never WC touch count or array length.
- **The interaction timeline** surfaces ALL touches (every WC lead, every 8x8 call, every form) as individual interactions -- this is content surfacing, not lead counting.
- **`wc_lead_id`** (scalar) = the primary WC touch, derived as first-touch from `wc_leads[0]`. Used for single-value displays and WC joins. The derivation is swappable (e.g. nearest-to-job) without a rebuild.
- **`wc_leads`** (array) = the lossless record of all WC-linked events in the cluster: `ARRAY<STRUCT<wc_lead_id, source, medium, keyword, campaign, channel, event_ts>>` Ordered by event_ts. One struct per WC touch.

### Key Fields
`opportunity_id`, `phone`, `jobnumber`, `all_jobnumbers`, `job_count`, `call_count`, `form_count`, `max_duration_sec`, `opp_type` (job_matched / gap_based / no_inbound), `channel`, `source`, `medium`, `campaign`, `keyword`, `profile`, `wc_lead_id` (derived primary), `wc_leads` (array, lossless), `matched_phones`, `matched_emails`, `is_no_inbound_enquiry`, `has_answered_call`, `is_existing_customer`

---

## S7a. Booking Rate (LOCKED -- never re-derive)

**Booking rate = booked jobs / quotable leads.**
- **Quotable** = gate/T7-determined genuine bookable opportunities.
- **EXCLUDES** from denominator: `no_inbound` (~28K job-only records, 100% booked by definition) and all of Not Quotable (Spam, Wrong Number, Outside Service Area, Service Not Provided, Strata Issue, Customer Inquiry Only, Not Job Related).
- The **"80% booking rate" is a meaningless artifact** of the no_inbound records and must NEVER be quoted.
- Mechanically equivalent to "gap_based + job_matched, exclude no_inbound." True historical COD rate ~26% all-time / ~22% recent.
- Numerator (bookings/revenue) reliable historically (facts). The **denominator** needs correct quotable classification (S4/S5) -- including the S5.1 Account fix, since 977 converted leads currently sit misclassified. Periods thick with Unable-to-Classify (pre-recording era) cannot produce a trustworthy rate.

---

## S8. Revenue Model

### S8.1 Lean Read Surface: vw_lead_enriched -- BUILT (v4)

One row per opportunity. Joins opportunities + lookups + AroFlo outcome + attribution + revenue model.

**Source file**: `bigquery/vw_lead_enriched.sql` (v4, deployed)

#### Profile Resolution Ladder (auditable via `profile_source`)
1. **Manual override** -- human sets PTTR/ETTR via `/api/leads/[id]/classify` (`profile_override` + `profile_overridden_at` in Firestore). Wins over all auto-resolution; applied at API read time.
2. Unambiguous DID -> trade (from lkp_did_trade)
3. WC profile ("Plumber to the Rescue" / "Electrician to the Rescue")
4. AroFlo job task_type (contains "Plumb" or "Electri")
5. 'Unknown (confirm)' -- unresolved

#### answered vs captured (distinct)
- `answered` = `raw_calls.answered = 'Answered'` (PBX says call connected)
- `captured` = `answered AND max_duration_sec >= 20` (meaningful conversation)
- Forms: both NULL
- `first_response_minutes` -- field exists in output, currently always NULL (placeholder for future response-time tracking)

#### completed (rules-based)
- `TRUE` if ANY job in the cluster is `job_status IN ('Completed', 'Archived')` (Archived = completed per AroFlo semantics; both count)
- Multi-job clusters: checked via `LOGICAL_OR` across all jobs
- Single-job: checks the primary job directly

#### Campaign Attribution (with Quinn LP fallback)
- Primary: `wc.lp_gad_campaignid -> lkp_campaign`
- Fallback: `opportunity.campaign -> lkp_campaign` (for Quinn paid forms where WC has no record but the email carries the gad_campaignid)

#### Funnel Stage Taxonomy -- Two Workstreams

**DATA-DRIVEN (objective, no human judgment):**
- Not Captured (dropped/missed/unanswered -- `raw_calls.answered`)
- Captured (answered AND >=20s)
- Booked (tied to >=1 AroFlo job; clustering-aware)
- Paid Job (Completed + `revenue > 0`, includes note-bridged revenue)
- Job Complete (Completed but no revenue yet)
- Revenue vs spend / ROAS per paid segment (`vw_economics`)

**QUALITATIVE (Firestore overrides, merged at API read time):**
- `quotable`, `loss_reason`, `csr_quality`, `disposition`, `lead_class`
- All NULL in `vw_lead_enriched` -- populated by manual classification + (future) AI + Firestore overrides at read time
- No rate that divides by a qualitative field (e.g. booking-rate-vs-quotable) can be computed until classification coverage is sufficient

### S8.2 Revenue Model -- BUILT (v4)

Three fields per job, cluster-summed to opportunity grain. Per-job ladder applied FIRST, then summed (so a mixed cluster sums each job at its own basis).

**Fields**:
- `invoiced_amount` -- from `ds_aroflo.vw_job_invoiced` (line-level invoice sum, replaces `task_invoices_total_ex` which was wrong for multi-invoice jobs). Cluster-summed. The truth; never overwritten by estimates.
- `estimated_sales` -- best note-bridge value when not yet invoiced. NULL when invoiced > 0. Tagged by `revenue_source` (inv_note / labour_note).
- `revenue` -- **derived reporting field**: `COALESCE(NULLIF(invoiced_amount, 0), estimated_sales)`. Invoiced always wins; when invoice later lands, revenue auto-flips from estimate to actual. No double-count.
- `revenue_basis` -- invoiced / inv_note / labour_note / override / pending
- `revenue_source` -- NULL when invoiced, else source tag
- `multi_visit_flag` -- TRUE when labour note has 2+ distinct work dates (possible partial amount)
- `job_value` -- backward-compatible alias for `revenue`

**Trust order** (per job, before cluster-sum):
1. `invoiced_amount > 0` -> use invoiced (actual always wins)
2. Manual task-value override (Firestore `crm_job_value_overrides`) -> highest estimate trust (applied at API read time, not in BQ view)
3. INV note (Frances) -> `revenue_source = 'inv_note'`
4. Tech labour note -> `revenue_source = 'labour_note'`
5. NULL -> `revenue_basis = 'pending'`

**INV Note Parser** (`task_notes_deduped.note_clean`):
- Matches Frances's template: `INV {n} ${X.XX} incl GST - Paid {method}`
- **Option A**: parse INV number from each note, take MAX amount per distinct invoice number (collapses partial-payment lines), SUM across distinct invoices (handles multi-invoice jobs). /1.1 for ex-GST.
- Excludes $0 ("Paid No work").
- Validated: **96% within 1%** of invoiced_ex on 99 jobs with both.

**Labour Note Parser** (`tasklabours_raw.note`):
- Matches `$X+gst` / `$X plus gst`. Amount is **already ex-GST** -- use as-is.
- **Keyword-anchored**: picks $ amount adjacent to collected/paid/banked/eft/cash/card -- NOT the max number. Fixes quote-embedded-in-note overstatement (e.g. "quoted $2485+gst ... collected $705" takes $705).
- Fix space-broken numbers: `$13 84` -> `$1384`.
- Exclude <$50. Latest workdate entry per job.
- Validated: **86% within 1%** of invoiced_ex on 338 invoiced jobs.

**Cluster-sum logic** (`cluster_revenue` CTE):
- Multi-job opps: UNNEST `all_jobnumbers`, LEFT JOIN `job_revenue`, SUM per opportunity. Each job contributes at its own basis.
- Single-job opps: `pj_rev` (per-job revenue) joined directly.
- `revenue_basis` at cluster level: if ANY job is invoiced -> 'invoiced'.

**WhatConverts sales_value -- cross-check only**:
- WC is accurate WHERE it tracks: 91% exact match on like-for-like leads, 10% total variance (add-on work / return visits).
- But WC covers only ~21% of booked opps (153 of 714). The $465K gap is unattributed organic/direct bookings WC never saw.
- **AroFlo-bridged `revenue` is the revenue truth.** WC sales_value is useful only as a paid-campaign validation.

### S8.3 Revenue Rules (MUST follow)

#### Revenue source of truth
- **Revenue = `ds_aroflo.vw_job_invoiced`** -- summed line-level invoices from `invoices_deduped` (status IN 'processed','approved'). All values ex-GST.
- **NEVER** use WC `sale_value` (estimate at capture), quote notes, sell columns, or `task_invoices_total_ex` (broken for multi-invoice jobs) as revenue.
- WC `sale_value` is a comparison/reconciliation figure only, not revenue truth.

#### Cross-task credit notes (NOT YET FIXED)
- AroFlo sometimes creates a NEW task with a negative invoice to credit an archived job. Pattern: description contains `"Credit Note against JN######"`.
- `vw_job_invoiced` does NOT net these across tasks -- it sums invoices per task_jobnumber only. Result: the original job is overstated, the credit task shows phantom negative revenue.
- **~$208K linkable** via JN extraction from description (78% deterministic). Fix pending: net the credit against the original job in the view.

#### Account-level billing gap
- ~20% of Account/Strata jobs have no per-job invoice -- billed at the Account level (monthly statement). `vw_job_invoiced` returns NULL for these. This is structural, not a bug -- per-job invoiced undercounts Account revenue by ~20%.

#### Quote -> Periodical revenue
- Some leads link to a $0 quote job; the real revenue is on the linked periodical task that the quote spawned. Follow the AroFlo linked-task relationship ("SEE LINKED TASK FOR APPROVAL" in description, or "master periodical has been created" in task notes) to find the revenue job. `revenue_job` field on Firestore overrides identifies which linked job to read revenue from.

### S8.4 Net Revenue View (`vw_job_revenue`)

New view layered on invoice data; `vw_job_invoiced` UNTOUCHED (all existing consumers unchanged). Gross stays the headline everywhere; net is an added lens.

**Credit-note types are differentiated -- this matters because they get different treatment:**
- `gross_revenue` = sum of POSITIVE invoices per job
- **`refunds`** (money collected then returned) -> **net OUT** of revenue
- **`discounts`** (price genuinely lower) -> **net OUT** of revenue
- **`bad_debt`** (invoiced, never collected, written off) -> **tracked SEPARATELY as an operating expense, NOT netted.** The sale was EARNED; the uncollected amount is opex (P&L expense line), not a revenue contra. Netting it would understate both true revenue and hide the expense.
- **`other`** credits ($8K) -> HELD unclassified (type later)
- **`net_revenue = gross_revenue - refunds - discounts`** (bad debt NOT subtracted)

**Why the differentiation is load-bearing:** of the ~$257K cross-task credit total, ~$115K is bad debt (never collected -- parent revenue is real but uncollected), ~$50K refunds, ~$29K discounts, ~$63K other. Treating bad debt as a revenue reduction would be wrong accounting. Refund vs discount vs bad-debt is keyword-separable in invoice descriptions ("refund" / "discount"/"goodwill" / "bad debt"/"write off"); "other" needs review.

**Credit-note cross-task linking cascade** (97.1% linked, $3,476 irreducible abstain accepted):
- T1 strict `credit note against jn`
- T2 widened JN regex (`jn#`, `j/n`, `job no`, `created from jn`, `ref jn`, `&nbsp;` fix)
- T3 invoice-number trace (`invoices_deduped.invoicenumber -> task_jobnumber`)
- T4 client + amount, **60-day window**, EXACTLY-ONE-candidate else ABSTAIN (never guess)
- Address adds nothing (credit tasks are admin tasks, null location).

**Switch to net (pending -- see delta first):** ROAS (`vw_economics`) + reconciliation -> net_revenue. Everything else stays gross. ROAS may later want a "cash kept" figure also stripping bad debt -- flag, don't build.

---

## S9. Orchestrator (nightly persistence)

**Cloud Function: `aroflo-daily-orchestrator`**

Run order (each depends on prior): **data sync -> opportunities rebuild -> lead_timeline rebuild -> lead_gate rebuild -> after-hours auto-classify (L304).** Deploy via `deploy.sh`. **Committing SQL is not enough -- `deploy.sh` must run or the nightly reverts.** Current good revision: **00025-qam** (CDR-fact-first gate). The pre-existing L304 auto-classify must be reconciled with the production T7 classifier when wired (S10), not left as a competing classifier.

- Runs daily. Steps include AroFlo data sync, opportunities rebuild (`build_opportunities.sql` = step 14 equivalent), then after-hours gap auto-classify
- Uses `firebase-admin-sa` secret to reach Firestore in `pettr-data` project
- If secret is missing, auto-classify step fails (non-fatal to orchestrator)

---

## S10. Open / Pending (the live hit list)

### DONE (verified)
1. **S5.1 / S6 Account-exclusion fix -- SMS/resident-phone link tier.** BUILT. Three tiers write links into `crm_account_exclusions`. Total Account-linked: 626 opps, $1.4M revenue attributed. See S5.1 for full detail.
2. **T7 INPUT FIX** -- `full_content` column MATERIALISED into `lead_timeline`. WC call transcript + full form content readable by direct BQ query -- no runtime hydration needed. Supersedes the TS-only fallback in `classify.ts`. Per-call resolution preserved. Coverage: 712/745 WC calls (95.6%), 373/373 forms (100%), 952/18764 8x8-only calls (Whisper, May+ only). Form cap raised from 300->2000 chars. Orchestrator deployed (rev 00023).
3. **T7-MATCH (S5.3)** -- BUILT (`scripts/run-cascade.ts` Steps 5-6, commits 7a69084 + b876f5a). First run: 101 signal leads, 0 matches (all structurally correct abstains). T7.1 recall gap: 0 of 6 real-job orphans caught.
4. **T7.1->T7.2 Wiring** -- Deployed: orchestrator rev 00031/00032. Account JN propagation + COD JN propagation. Idempotency proven across 2 consecutive rebuilds. See S15.4.

### OPEN
1. **S2.10 Correspondence coverage hole (3 leaks, one fix).** We harvest the `jobs@` mailbox shadow, not the authoritative sources. (a) Outbound SMS with no reply -- pull MessageMedia reporting API; (b) staff emails from non-`jobs@` mailboxes -- wider mailbox ingest; (c) AroFlo email/SMS task entries baked into the job -- pull from AroFlo API (test `join=notes`/endpoint vs current `join=tasknotes`; the live AroFlo call IS runnable -- Postman + creds exist, S11). Breaks S4.3 Customer Unresponsive evidence and under-ingests outcome-altering content (J-141987 class). **FIRST STEP: read-only -- make the live AroFlo call on a known-correspondence job (e.g. JN141987) to confirm what AroFlo exposes; and confirm MessageMedia has a reporting API for the sent log.**
2. **T7 deployment plumbing** -- proposal queue (`action='proposed'` in `crm_lead_overrides`), confirm/reject UI, scheduler, residual feed.
3. **Funnel + economics DASHBOARD** (discussion-paper layout) -- headline rates, numbers-at-a-glance, per-campaign economics. Requires Firestore classification data for qualitative stages (Not Quotable / Not Booked). Spend reconciliation done (S11); UI build pending.
4. **Taxonomy naming** -- align gate's emitted label to **"Unanswered Call"** (not "Missed Call") per S4.1; sync UI (`lead-classification.tsx`).
5. Switch ROAS + reconciliation to `net_revenue` (see delta first).
6. `attribution_class` toggle for ROAS (ad_generated / account / existing_client).
7. **S4.10 keyword store** -- verify Firestore add-over-time write-path is built+live; dump live `keyword_rules` into S4.10; confirm `applyKeywordRules`/`applyPaymentRegex` have a production caller (the deferred OpenAI engine step + scheduler).
8. Full pipeline run vs `enriched_leads-10.csv` (three-way blind: T7 / WC-human af_* / brother-code after_*) -- AFTER S10.1 & S10.5. RG_006 GT is stale (old taxonomy) -- not a valid adjudicator.
9. Invoice-Pending vs cash-collected-Completed definition (S4.2 open question).
10. **vw_accounts repoint** -- uses banned `task_invoices_total_ex` (+$22,992 overstatement across 7 clients). Repoint to `vw_job_invoiced` before any Account revenue is reported externally.
11. **Recording ingest retry** -- `pettr-recordings-backfill` advances watermark on transient 8x8 500 errors without retry (6 in 30d). Add retry-before-advance. Low priority (recordings purge before recovery).
12. Interaction timeline on Job view (`/jobs/{id}`) -- shared component with lead timeline. Join-key question (JN-only vs whole-opp) unresolved.
13. **Dashboard booking rate definition** -- the `getDashboardStats` Account-exclusion anti-join is committed and correct as one input, but the displayed rate's DENOMINATOR was never pinned to a single definition. AS-IS includes `no_inbound` jobs (100% booked by definition -> inflates all-time to ~80%, meaningless). The true COD rate = `gap_based + job_matched` only, inbound, Account-excluded (~24% on 30d). Fix the dashboard rate query to exclude `no_inbound` from the denominator. Parked -- not urgent.
14. Backlog: "other" credits typing ($8K); Account-billing $0 gap (~20% of Account jobs billed monthly = $0 in `vw_job_invoiced`); T7 budget-cap edge (>4000-char calls); drop orphan tables (`lead_interactions`, `vw_contact_timeline`); resolve `pettrDigital/pttr-crm` vs `ricgordon1977/pttr-crm` repo split.

### KNOWN WEBSITE-SIDE ATTRIBUTION GAPS
- **WPForms UTM passthrough**: main-site forms strip UTM/gclid at submit. Tier 3 forms permanently brand-only attribution. Website plugin fix needed.
- **ETTR WPForms WC gap**: ~5/month never reach WC. CRM compensates via email parser. Website instrumentation fix needed.
- **Quinn LP WC snippet**: still missing. CRM compensates via Tier 1 email parser. Website fix needed.

### KNOWN ISSUES / BACKLOG
- **task_invoices_total_ex replaced**: the AroFlo extract field was wrong for multi-invoice jobs (carried one invoice, not the net). Revenue now uses `ds_aroflo.vw_job_invoiced` which sums line-level invoices from `invoices_deduped` (status IN 'processed','approved'). 69 jobs corrected, +$109K net. All consumers migrated: vw_lead_enriched, queries.ts, route.ts, link-job, job-history, ai-classify-validate. The column alias `task_invoices_total_ex` is retained in query output for UI compatibility but now reads from `vw_job_invoiced`, not the broken AroFlo field.
- **Labour note parser outliers**: ~10% of matches on multi-visit jobs capture one visit's collection, not the full total. `multi_visit_flag` marks these. Not fixable without summing across visits (which double-counts when the tech re-states the running total).
- **Pending opps with no data** (312 of 714 booked): jobs where neither invoice nor any note carries a dollar amount. Mostly very recent or non-COD-flagged. Will self-resolve as invoicing catches up.

### SMS-phone-match deterministic tier (OPEN)
- **206 unlinked COD opps -> 151 Account jobs, $430K invoiced revenue.**
- Signal: resident calls COD line (creates a gap-based opp with their phone), job booked under Account (strata manager). Later, CSR texts the resident about access -- SMS reply carries the resident's phone + the JN.
- Match: `SMS sender phone = opp phone` + `JN in SMS body = Account job`.
- Verified: 116 distinct phones, 0 shared-phone false links, 5/5 spot-checks confirmed same person.
- Implementation: parse JN from MessageMedia email body, match sender phone to unlinked opp, link with `is_account=TRUE` + `exclude_from_analysis=TRUE`.
- This is a T3-style deterministic rule, not AI inference.

### JN-from-email-body linkage tier (OPEN)
- Task emails (to `mrwasher_task+{code}@inboundemail.aroflo.com`) carry the JN in the subject. 316 of 507 inbound task emails have extractable JN.
- Sender email can match to an opp's email identity.
- Lower volume than SMS but same deterministic shape.

---

## S11. Baseline + Reconciliation -- BUILT

### Opportunity Baseline (Dec 2025 - May 2026)
- **2,558 opportunities** (current, post-OfficeHQ enrichment + expanded spine)
- WC attribution: ~21% of booked opps have WC sales_value
- No-inbound (AroFlo job, no matching call/form): 153
- **487 completed** opps; **372 Paid Job** (completed + revenue > 0)
- Original 329 completed-invoiced reconciliation preserved; +13 completed jobs newly promoted to Paid Job via note-bridged revenue

### Revenue Baseline (Dec 2025 - May 2026, booked opps)
- **Total revenue**: $660,222 (AroFlo-bridged)
  - Invoiced (hard): $529,477 (368 opps, 80%)
  - INV note (estimate): $95,715 (65 opps, 15%)
  - Labour note (estimate): $35,030 (26 opps, 5%)
  - Pending (no data): 255 opps
- **WC sales_value** (same opps): $194,978 -- 30% of AroFlo-bridged
- Like-for-like (152 opps with both): AroFlo $213,839 vs WC $194,373 (+10%). 91% exact match at lead level. WC's problem is coverage, not accuracy.

### Email Form Ingestion Impact -- SETTLED
- 20 genuinely-new opportunities from email forms (no prior call/WC/job)
- +19 net baseline delta (20 new - 1 merge from email bridging)
- 25 former no-inbound job-opps reclassified to form-first (not new opps)
- Tier-1 detection: clean, no false positives (tawk/mrwasher excluded by sender allowlist + RE: filter)

### Quinn ROAS -- SETTLED
- Quinn-Suburb/Quinn-Smart total attributed: 155 opportunities (Feb-May)
- Quinn ROAS adjustment from email form parsing: **+4 opps** (May 2026, all Plumbing/Smart -- campaigns where WC call tracking wasn't yet capturing form-only visitors). For Feb-Apr, 28/28 paid Quinn forms merged into opps that WC had already attributed to the same Quinn campaign via the phone call. The form email is a forward-looking safety net, not a historical correction.
- "0/21 in WC" = no WC form record (customer often in WC via their call). 28 of 33 Quinn-form-containing opps already had Quinn attribution from WC.

### Answer Rate vs Capture Rate (Dec-May, call-type opps)
- Answered (PBX connected): 94.0%
- Captured (answered + >=20s): 83.2%
- Gap (10.8pp / 192 opps): calls that connected but lasted <20s

### SETTLED (economics phase prerequisites)
- Net-new counts tied out: 20 genuinely new, +19 baseline, +/-1 from merge
- Tier-1 false positive check: clean (tawk excluded by sender list)
- Quinn ROAS wording: +4 real uplift, 28/28 Feb-Apr already WC-attributed
- Revenue model validated: invoiced reconciles, note-bridge adds $131K
- WC vs AroFlo variance closed: coverage gap, not accuracy gap

---

## S12. Build Status

### BUILT
- [x] Multi-source spine (call + WC form + email form), sender-agnostic
- [x] Tiered email form ingestion (Quinn Paid / Quinn Organic / WPForms)
- [x] Quinn paid recovery + April sender-transition fix
- [x] Connected-component opportunity clustering (phone OR email, 30 days)
- [x] AroFlo job contact hierarchy (task contact -> site -> client -> description)
- [x] PM/Account exclusion from COD funnel
- [x] DID -> trade lookup + campaign -> type/division lookup
- [x] Profile resolution ladder (DID -> WC -> AroFlo -> Unknown)
- [x] answered vs captured (distinct fields, correct semantics)
- [x] completed reconciliation (329/329 to AroFlo, preserved at 487/372)
- [x] After-hours 8x8 confirmation (98.4% match to answering-service emails)
- [x] Deterministic idempotent opportunity IDs
- [x] Drift alarm queries (DID + campaign lookup coverage)
- [x] Transcript coverage map (0% pre-April, 83% May)
- [x] Revenue model v4: three fields (invoiced/estimated/revenue), two parsers (INV note 96% accuracy, labour note 86%), cluster-summed, WC validated
- [x] OfficeHQ answering-service enrichment on vw_lead_enriched (name/email/suburb)
- [x] Classification taxonomy (5 stages, full sub-statuses) + Firestore overrides
- [x] After-hours gap auto-classification (orchestrator, human-override guard)
- [x] CSR review categories (independent of classification)
- [x] Account attribution flow (flag -> account -> contact -> exclude from COD)
- [x] Manual job linking (promotes unlinked inbound to Booked/Paid Job)
- [x] Job value overrides (Firestore `crm_job_value_overrides`)
- [x] vw_economics: per-segment marketing economics (spend/leads/ROAS)
- [x] Operator resolution (call_legs -> recordings -> callee_name)
- [x] WC revenue validation: accurate where tracked (91% exact), but covers only 21% of booked opps -- AroFlo-bridged is revenue truth
- [x] Lead interaction timeline (8 sources): WC interactions, raw_calls (phone), email reply threads, form submissions, OfficeHQ pagers, MessageMedia SMS, AroFlo task emails, general Outlook correspondence (3 link paths: email match, JN-anchored, guarded subject-thread). Per-row defensive rendering.
- [x] Per-call WC transcript resolution (interaction detail joins via spine `call_id -> wc_lead_id` mapping, not cluster primary)
- [x] WC transcript + full form content MATERIALISED into lead_timeline `full_content` column. WC primary, 8x8 fallback (COALESCE). Forms raised from 300->2000 chars. Readable by direct BQ query -- no runtime hydration needed.
- [x] Call-disposition gate (Missed/Dropped): CDR-fact-first design. Deployed rev 00025-qam.
- [x] Leads search: matches PH-/WC-/EM-/JN- label + last-9-digit phone
- [x] SMS-JN linkage tier: 232 Account-flagged opps, $553K attributed, COD booking rate corrected via `crm_account_exclusions` table + getDashboardStats LEFT JOIN anti-join
- [x] WC reconciliation: 95.7% spine match, 38 gaps categorized, 1 genuine unique signal (Chris Kelsey, name-only T7 case)
- [x] Recording gap diagnosed: ~25% = mobile-forwarded calls, 8x8 routing issue, ~75% capture ceiling
- [x] T7-MATCH built (`scripts/run-cascade.ts` Steps 5-6)
- [x] T7.1->T7.2 wiring deployed (orchestrator rev 00031/00032)
- [x] Cascade function hierarchy built (`scripts/run-cascade.ts` Steps 0-9)

### PLANNED
- [ ] T7 deployment plumbing -- proposal queue, confirm/reject UI, scheduler, residual feed.
- [ ] Funnel + economics DASHBOARD
- [ ] vw_accounts repoint (banned `task_invoices_total_ex`)
- [ ] Recording ingest retry
- [ ] Interaction timeline on Job view (`/jobs/{id}`)
- [ ] Dashboard booking rate definition (exclude `no_inbound` from denominator)

---

## S13. Canonical Docs & Locations

| File | Purpose |
|---|---|
| `docs/PETTR_CRM_DATA_SPEC.md` | **This file** -- canonical requirements spec |
| `docs/END_TO_END_FUNCTION.md` | Cascade function detailed sub-spec (Steps 0-9) |
| `bigquery/vw_leads_unified.sql` | **Canonical** -- deployed spine (call + form + email) |
| `bigquery/vw_lead_enriched.sql` | **Canonical** -- deployed lean read surface + revenue model (v4) |
| `bigquery/vw_economics.sql` | **Canonical** -- per-segment marketing economics view |
| `bigquery/build_opportunities.sql` | **Canonical** -- materialized opportunity clustering script |
| `bigquery/view-definitions.sql` | Reference/audit copy of ALL BQ view DDL (not deployment source) |
| `bigquery/archive/` | Superseded versions (v1, v2, v3_view) -- do not edit |
| `cloud-functions/aroflo-daily-orchestrator/main.py` | Orchestrator: data sync + opportunities rebuild + auto-classify |
| `cloud-functions/aroflo-daily-orchestrator/deploy.sh` | Deploy script -- copies canonical SQL into function dir then deploys |
| `scripts/run-cascade.ts` | Cascade function -- full tiered match+classify (Steps 0-9) |
| `src/components/leads/lead-classification.tsx` | Classification taxonomy UI (stages + sub-statuses) |
| `src/app/api/leads/route.ts` | Leads API: BQ + Firestore merge, override precedence |
| `src/app/api/leads/[id]/classify/route.ts` | Classification GET/POST endpoint |
| `src/app/api/jobs/[id]/value-override/route.ts` | Job value override GET/POST |
| `HANDOVER.md` | CRM app (Next.js) technical handover |

> **Deploy artifact -- do not edit or commit:**
> `cloud-functions/aroflo-daily-orchestrator/build_opportunities.sql` is a **deploy artifact** generated by `deploy.sh` from the canonical `bigquery/build_opportunities.sql`. It is gitignored. Edit only the canonical copy; `deploy.sh` copies it into the function directory before every deploy. The two were intentionally de-duplicated (commit removing the tracked copy) to prevent drift.

**Key views/tables**: `vw_job_invoiced` (revenue), `vw_job_revenue` (net), `vw_tasks`, `vw_leads`, `vw_lead_detail`, `vw_lead_enriched`, `vw_economics` (ROAS), `ds_crm.keyword_rules`, `ds_crm.lead_timeline`, `ds_crm.lead_gate`, `ds_crm.opportunities`, `tasks_complete` (for `job_status`), `tasks_deduped` (description/notes), `invoices_deduped`, `contacts_deduped`, `raw_calls`, `raw_recordings`, `raw_call_legs`, `all_leads_enriched` (WC source), `crm_account_exclusions`.

**Firestore**: `crm_lead_overrides`, `crm_match_overrides`, `crm_job_value_overrides`, `crm_notes`, `crm_account_notes`, keyword-rule additions.

**AroFlo Postman**: `/Users/ricgordon/pettr-data/AroFlo API.postman_collection.json`.

**Repos**: `pettrDigital/pttr-crm` (shared org -- Ric works on pttr-crm here), `pettr-aroflo`, `pettr-bigquery-config`. Fergus's code (read-only ref): `~/pettr-dashboards/functions/enrichWhatConvertsLeads.js`.

---

## S14. Cascade Function Hierarchy

**Status**: BUILT v2 -- implemented in `scripts/run-cascade.ts`. Detailed sub-spec: `docs/END_TO_END_FUNCTION.md`.

One callable function that runs the full tiered match+classify cascade on a given population, in the correct order, producing a per-lead readout with every lead resolved to a real taxonomy leaf. Replaces manual step-by-step running that caused the reconciliation to skip T7.1. The function enforces the dependency order mechanically -- each step's output feeds the next, and no step can be skipped or reordered.

### Steps

```
STEP 0: SYNC              <- data must be current
   |
STEP 1: BUILD_OPPORTUNITIES  <- graph clustering + deterministic tiers + JN propagation
   |
STEP 2: BUILD_LEAD_TIMELINE  <- gate computes stage from JN presence
   |
STEP 3: LEAD_GATE            <- one row per opp, deterministic stage
   |
STEP 4: PRE-PASSES           <- factual constraints on the AI allowed-set
   |
STEP 5: T7.1 MATCH           <- residual matcher on gap_based/no-JN leads
   |
STEP 6: WRITE MATCHES + RE-BUILD  <- JN propagated, gate re-computed
   |
STEP 7: T7.2 CLASSIFY        <- sub-status on judgement remainder (ONE tier: T7.2 prompt model)
   |
STEP 8: WRITE CLASSIFICATIONS (STAGING)
   |
STEP 9: READOUT              <- per-lead line, every lead resolved
```

**ONE classification tier for judgement leads = T7.2 prompt model.** The AI seam at Step 7 MUST use the validated T7.2 prompt-based classifier reading full timeline per lead. No keyword/SQL/BQ shortcuts. If volume requires batching, batch it (50 leads/batch). See S15.1a.

**Steps 0-3** are the existing orchestrator (`aroflo-daily-orchestrator`). The cascade function calls these, then runs Steps 4-9 on top. NOT a new orchestrator.

**Output**: auto-classifications go to STAGING (`crm_auto_classifications`), never to `crm_lead_overrides` (human truth). Dual-metric view required before auto-output surfaces in dashboard.

**Reprocessing model**: Mode 1 (initial full run), Mode 2 (nightly 100-day AI window), Mode 3 (unbounded deterministic re-gate, no AI cost). See `docs/END_TO_END_FUNCTION.md` S7.

---

## S15. Settled Decisions -- Do Not Re-Derive

These decisions were validated with evidence. They are STANDING RULES. Do not re-derive, re-debate, or "improve" without explicit instruction. Each carries a rationale -- read it before proposing alternatives.

### S15.1 Exclusion List -- BY-LIST-ONLY (the Aaron Rule)

**RULE**: Exclude leads and phones ONLY by explicit, maintained lists. NEVER by heuristic (call frequency, outbound volume, pattern matching).

**Lists** (the ONLY exclusion authorities):
- `ds_crm.test_numbers` -- 16 entries (10 staff mobiles, 4 test lines, 1 strata partner, 1 owner). Spine excludes at `vw_leads_unified:63`.
- WC `is_test_lead` flag -- WC's own test marker. Spine excludes at `vw_leads_unified:233`.
- Internal email domains: `@mrwasher.com.au`, `@electriciantotherescue.com.au`, `@plumbertotherescue.com.au` -- excluded from EMAIL_MATCH precomputation in `t7_match_candidates.sql` STEP 3/6.
- `lkp_did_trade.is_internal` -- 10+ staff DIDs marked internal. Used for `is_internal_did` on `lead_timeline` and the NJR pre-pass.
- Internal phone range: 8583-xxxx extensions (CSR/staff, not customer).
- Account-only phones: phones appearing ONLY on Account-type jobs (excluded from COD spine, not from the system entirely).

**WHY BY-LIST-ONLY**: The retired heuristic ">=10 outbound + 0 AroFlo jobs = internal" wrongly excluded Aaron Simpson, a real high-volume property manager who made many calls but wasn't staff. Volume != internal. The heuristic was replaced by the explicit list after the Aaron incident. Any future exclusion proposal that uses frequency/volume/pattern as a proxy for "internal" must be rejected -- add the specific phone/email to the list instead.

**ADDING TO THE LIST**: manual only. Add the specific phone/email/DID to `test_numbers` or `lkp_did_trade` with a note and reason. The list is small (16 entries) and slow-growing -- this is by design.

**LIVE VIOLATION**: The conflation guard in `t7_match_candidates.sql` (`conflated_phones` CTE) excludes phones appearing on 10+ Account job descriptions. This is a frequency-based heuristic -- the exact pattern S15.1 bans. Proof: Mark Ford's phone was blocked despite having a real $466 invoiced Account job (JN 140906). The guard needs replacing with an explicit by-list exclusion of known high-volume phones (strata agency main lines). Until fixed, the cascade function silently misclassifies content-match conversions as non-conversions on every unattended run.

### S15.1a AI Seam Integrity -- Never Substitute the Classifier

**RULE**: When the function specifies the T7.2 prompt-based model at the AI seam (Step 7), use it -- not a keyword approximation, not a BQ CASE WHEN, not a "signal extraction" shortcut. The validated model reads each lead's full timeline and classifies per the NQ/NB or Booked prompt with pre-pass constraints. NEVER invent a different classification approach to save rounds.

**WHY**: On 2026-06-20, CC substituted a BQ keyword classifier for the validated T7.2 model to classify 596 leads in one query. The keyword patterns were too narrow -- 121 leads defaulted to NFUR/CU when the keywords didn't fire, producing wrong classifications on leads where the full-timeline model would have identified the specific reason (Wrong Number, OSA, Price, etc.). The reconciliation shipped with an unvalidated classifier's output presented as T7.2 results. The keyword approach was never in the spec, never validated, and silently degraded accuracy from 89.1% to unknown.

**THE RULE**: If the volume is too large for one pass, batch it (50 leads per batch, ~12 rounds for 600 leads) and say so. Speed is not a reason to change the engine. If you cannot run the specified engine at the required volume, say that -- do not silently downgrade.

### S15.2 Architectural Principle -- Facts in Pre-Passes, Not AI

**RULE**: If a classification decision can be checked against structured data (a column value, a row existence, a count), it MUST be a deterministic pre-pass. Do NOT ask the AI model to check facts against the timeline.

**Evidence**: T7.2 ignored the committed CU/NFUR rule 50 times. The rule was explicit ("REQUIRES POSITIVE EVIDENCE: visible outbound"), the prompt was correct, the model still picked CU on leads with no outbound. Moving the check to a deterministic pre-pass (`has_outbound` boolean from timeline query) eliminated the entire 50-error category mechanically.

**Current pre-passes** (all deterministic, no AI):
- `has_outbound` -> CU removed from allowed set when FALSE (commit `0b1a78e`)
- `has_internal_touch` -> NJR removed when FALSE (commit `b8d6d03`)
- `gate_stage` -> determined stages skip AI entirely (build_lead_timeline.sql)
- `applyPaymentRegex` -> payment/not-proceeding patterns on Booked:$0 leads (currently DISABLED -- see S4.2)

**The test**: "Could a SQL query answer this?" If yes -> pre-pass, not prompt. The model is good at reading conversational intent (why didn't they book?). The model is bad at checking structured properties (does outbound exist? how many touches? is the DID internal?).

### S15.3 T7.2 Validated Configuration (locked 2026-06-18)

- **Prompt**: flat decision rules (NOT layered -- 3-layer restructuring regressed SNP 61%->28%, reverted). Committed `4fa36bc`.
- **Definition fixes**: Spam includes apprentice/employment seekers. NJR = internal staff ONLY.
- **Pre-passes**: CU/NFUR (`has_outbound`), NJR (`has_internal_touch`), payment regex (Booked:$0) -- currently disabled (S4.2).
- **Content**: full uncapped (`formatClassifierPromptFull`). Capped version (`formatClassifierPrompt`) is API-only -- drops deciding signals on 2 of 4 tested hard cases.
- **Confidence routing**: >=0.70 auto-classify (95.2% accuracy on 84.5% of leads), <0.70 human review (15.5% of leads).
- **Measured**: 89.1% on 367 GT. See `t7_taxonomy_spec.md S10`.

**Failed experiment** (do not repeat): 3-layer prompt restructuring (c803de9) lowered overall accuracy and gutted SNP by making CU/NFUR a "residual" that uncertain leads dumped into. The pre-pass approach is architecturally superior.

### S15.4 T7.1->T7.2 Wiring (deployed 2026-06-19)

- **Deployed**: orchestrator rev 00031/00032 (`deploy.sh` run, artifacts verified). `build_opportunities.sql` + `build_lead_timeline.sql` both contain the propagation code.
- **Account JN propagation**: `auto:t7_match` added to S6 tier filter.
- **COD JN propagation**: post-graph UPDATE keyed on `wc_lead_id + jobnumber` (stable -- `matched_phone` is NULL for 8 of 10 COD matches).
- **Idempotency**: proven across 2 consecutive orchestrator rebuilds. 13 matches survived both. Same JNs, same gate_stages, no dupes.
- **Run order**: build_opportunities (with propagation) -> build_lead_timeline (gate reads JN) -> lead_gate. Sequential, `job.result()` blocks between.
- **Metric guard**: `getDashboardStats` reports `bookings_confirmed` (excludes `review_recommended`) vs `bookings_total`. Delta = T7.1 uplift, visible.
- **DEPLOY GAP WARNING**: committed canonical SQL != deployed artifact until `deploy.sh` runs. A rebuild with stale artifacts silently reverts in-flight work. Always deploy before relying on code committed since last deploy.

### S15.5 WC Reconciliation Standard

- **Population**: full CSV, zero unexplained gaps. Every lead is compared or has a proven reason for exclusion (test lead, no identity, pre-period).
- **Join**: `wc_lead_id` (exact) OR `phone E.164` (within 30d) OR `email` (within 30d). NOT primary wc_lead_id only -- secondary WC touches on the same opportunity must match via phone/email fallback.
- **Test exclusion**: by-list-only (S15.1). Indicators: `@mrwasher.com.au` email, phone=`123`, `is_test_lead=TRUE`, `test_numbers` table, Quinn marketing test submissions (`matt@quinnmarketing.com.au` + "test").
- **Every lead**: compared-or-explained. No "~287 gap, probably outside date range." Decompose to: matched, test-excluded, no-identity, spine-gap (single-digit), known recording gap, pre-period. The genuine gap is an exact number with per-lead evidence.

### S15.6 Company Email Exclusion (T7.1 candidate gen)

Exclude these domains from PHONE_MATCH/EMAIL_MATCH precomputation in `t7_match_candidates.sql` STEP 3 (lead emails) and STEP 6 (candidate emails). These fire false EMAIL_MATCH when the same company address appears in both lead content and job descriptions:

`@mrwasher.com.au`, `@electriciantotherescue.com.au`, `@plumbertotherescue.com.au`, `@inboundemail.aroflo.com`, `@notifications.aroflo.com`, `@replies.aroflo.com`, `@aroflo.com`, `@resend.quinnmarketing.com.au`, `@tawk.email`, `@blockeddrainstotherescue.com.au`

6 false EMAIL_MATCH signals were eliminated by this exclusion (commit `5ea5c93`). The exclusion is on BOTH sides (lead and candidate) to prevent the company email from matching itself.

---

## S16. Known Gaps -- Autonomy (2026-06-20 session)

### S16.1 Requirements (normative)

**ORPHAN DETECTION**: The cascade MUST run orphan-detection (content-match + phone-window scan) before classifying any lead as a non-conversion. A lead with a real AroFlo job linked by content/phone is flagged system-missed-conversion, never classified as a non-converter.

**SEAM INTEGRITY**: The AI seam MUST run the validated T7.2 prompt-based model reading full timeline per lead. Substituting a keyword/SQL/BQ shortcut is prohibited. If volume requires batching, batch it.

**CONFLATION GUARD**: Must exclude by-list, never by frequency threshold. The current >=10-job frequency guard is a live S15.1 violation.

### S16.2 Measured gaps

- **Clustering window**: 24 leads / $42,829 orphaned by 30-day window across full population. Fix: widen to 45d or post-clustering phone-match pass.
- **Known-staff-caller gap**: Donna Carey (1 phone, low priority).
- **Linker-miss rate**: 6/1,095 (0.5%), **$10,993** invoiced (verified `vw_job_invoiced`): Liz Manfredini JN141144 $8,855; Fong Loretta JN141470 $880; Mark Ford JN140906 $466; John Gabor JN142371 $792; Aaron Simpson JN141307 $0; Michael Kilborn JN141935 $0. The system does NOT self-capture conversion-orphans on unattended runs.

---

## S17. How to use this spec

1. Before building anything, find the relevant section. The spec states the decision AND the layer AND the verification.
2. After building, confirm green at ALL THREE layers (S0) and re-run the verification. "Committed" is not "done."
3. If a build contradicts this spec, the spec wins unless Ric changes it -- recorded HERE, not just in chat.
4. Mark items verified-built with commit hash + verification result, so no future session re-discovers a settled decision.

---

## S18. Audit instruction (the next step)

CC audits the live system against this spec -- NOT a fresh diagnosis, a checklist fill-in:
- For every S2 data point: green/red at each of the 3 layers (S0), with the verification query result.
- For every S4 gate rule + S5 match tier: is it live, and does it behave as specced? Run the verification.
- For S4.10: dump live `keyword_rules`; confirm Firestore write-path + production caller.
- For S5.1/S6: confirm the Account-exclusion gap and propose the fix.
- **Interrogate each against what we asked for in the working sessions** -- flag anything specced/agreed but not built, or built differently than agreed.
- Output: a status matrix (data point/rule -> committed/materialised/orchestrated -> matches-spec Y/N -> gap), per-row evidence, no aggregate "it works" claims.
