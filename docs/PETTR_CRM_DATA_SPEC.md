# PETTR CRM — Data Ingestion, Matching & Classification Spec

**Status:** CANONICAL (v2). Single source of truth for *what data is ingested, in what priority, how leads match to jobs, and how the gate + classification work.* Every build is checked against this spec. Nothing is "done" until verified at all three layers (§0).

**Why this exists:** Decisions kept getting made in conversation, half-built, and silently dropped — then re-discovered sessions later (WC transcripts built in the runtime layer but not the materialised table; the false-Unanswered gate; the strata caller-in-description match miss; the Account-exclusion funnel gap). This spec ends that by stating each decision *and* the layer it must live in *and* a verification.

**Owner:** Ric Gordon. **Last structural update:** June 2026.

> **NEXT STEP after this spec is locked:** CC audits the live system field-by-field and tier-by-tier against this spec — marking each green/red at all three layers with a verification query, and interrogating it against what we asked for in the working sessions. The spec is the checklist; the audit fills it in.

---

## §0. The Three-Layer Rule (read this first)

A data point or rule is only **DONE** when green at all three layers. "Committed" ≠ "live." Most recurring bugs were something green at one layer and red at another while looking finished.

| Layer | Meaning | How it fails silently |
|---|---|---|
| **1. INGESTED** | Raw data arrives complete from source into raw BQ tables | API returns partial data; a field is never pulled |
| **2. MATERIALISED** | Written into the table the classifier AND validators read directly (`lead_timeline`, `lead_gate`), as actual content — NOT a pointer | Logic built into runtime TS (`classify.ts` hydration) but never into `build_lead_timeline.sql`, so anything reading BQ directly is blind |
| **3. ORCHESTRATED** | The deployed Cloud Function rebuilds it nightly, so it persists | Committed to SQL but `deploy.sh` not run -> next nightly reverts to old revision |

**Verification rule:** every data point in §2 and rule in §4/§5 carries a **verification query** that can be re-run to prove it is live at layer 2. A claim you cannot re-run is not verified. Treat CC "validated / passed / N-of-N" as NOT credible unless the test was genuinely blind (the answer was withheld from the thing being tested).

---

## §1. Sources of Truth & System Inventory

| System | Owns (authoritative for) | Identifier |
|---|---|---|
| **AroFlo** | Jobs, job status, invoices, labour notes, task descriptions, task notes. SOURCE OF TRUTH for everything job/revenue. | `task_jobnumber` (JN) |
| **8x8** | Telephony CDR (answered/duration/direction), call recordings/transcripts (from ~April 2026) | `call_id`, call legs |
| **WhatConverts (WC)** | Lead attribution, **call transcripts (from ~Nov 2025)**, form submissions, recordings | `wc_lead_id` |
| **Quinn Marketing** | Form leads delivered via email to `jobs@mrwasher.com.au` | email twin |
| **MessageMedia** | SMS (inbound/outbound) | phone |
| **OfficeHQ / MyReceptionist (OHQ)** | After-hours answering service; takes message, forwards to tech mobile (**UNTRACKED**) | OHQ touch rows |
| **Microsoft Outlook** | `jobs@` mailbox (3 paths: A:email, B:JN-tagged, C:thread) | email |

**BQ project:** `pttr-taskdata`. **Datasets:** `ds_aroflo`, `ds_crm`, `gd_WhatConverts` (US multi-region). **Overrides/write-layer:** Firestore. **Auth:** Firebase (Google sign-in).

**Standing rules (do not re-litigate):**
- Revenue is ALWAYS `vw_job_invoiced`, line-summed ex-GST, column `invoiced_total_ex`. Never quote notes, pre-aggregated fields, or WC `sale_value`. Show token math.
- Never edit BigQuery views — changes go to underlying tables.
- All times Australia/Sydney.
- `~/crm-build` is source of truth (NOT the OneDrive copy — spaces in path hang Next.js).
- "Zero results" is a silent-bug suspect, not proof of absence. A signal only means something once the signal *could have existed* (pre-April transcript-absence != unanswered call; pre-close-out invoice-absence != not-completed).
- Phone format: normalise to E.164 `+61…`. The `+6161…` double-prefix bug has hidden \$430K+ in attributable revenue. Always normalise.
- All BQ rows -> `JSON.parse(JSON.stringify(rows))` before Next.js client components. Dates arrive as `{value: "..."}`.

---

## §2. Ingestion Inventory — Every Data Point

The authoritative list of what MUST reach the classifier/timeline. A field is not "ingested" until materialised into `lead_timeline` as content (layer 2) AND orchestrated (layer 3).

### §2.1 Call content

| Data point | Source field | Must reach | Rule | Verify |
|---|---|---|---|---|
| **Call transcript** | WC `call_transcription` (primary) -> 8x8 `full_transcript` (fallback) | `lead_timeline.full_content` as TEXT (not pointer) | `COALESCE(wc.call_transcription, ct.full_transcript)` — **WC PRIMARY**. Per-call resolution: each call touch -> its OWN `wc_lead_id`/`call_id`, never cluster primary. | `SELECT LENGTH(full_content) FROM lead_timeline WHERE opp=219552891` -> ~9,388 |
| **Call CDR facts** | 8x8 `has_answered_call`, duration, direction | structured fields on touch | CDR is AUTHORITY for answered/unanswered — never inferred from transcript presence | `has_answered_call` present per touch |
| **Call duration** | 8x8 (primary) -> WC `call_duration_seconds` (fallback) | structured | minor | duration present |

**Coverage boundaries (gate what "no content" means):**
- WC transcripts: from **~Nov 2025**. 8x8 transcripts: from **~April 2026** (~25% of post-April calls still missing — forwarded/after-hours/overflow bypass 8x8 per-extension recording).
- **Before these dates, absence of transcript = "not recorded," NOT "unanswered/no-content."** Any rule keying on transcript-absence MUST gate on the recording era. (This bug mislabelled 4,732 answered calls as Unanswered.)

### §2.2 Form content

| Data point | Source field | Must reach | Rule | Verify |
|---|---|---|---|---|
| **Form full content** | WC `additional_fields_json` (Name/Phone/Email/Address/Problem/Intent) -> `form_my_problem` fallback | `lead_timeline.full_content` | **Cap 2000 chars** (was 300, truncated 95/373). Problem description must NOT be cut. | `LENGTH(full_content)` on a known long form -> full |

### §2.3 Job content (AroFlo) — incl. invoice detail

| Data point | Source field | Must reach | Rule | Verify |
|---|---|---|---|---|
| **Task description** | AroFlo task description | classifier input + UI | FULL text, no truncation, formatting/highlight preserved where meaningful (CODE RED / commercial-rate flags). **Contains caller name/phone on strata/account jobs — see §5.1.** | source-vs-CRM char match on a known job |
| **Labour notes** | AroFlo labour notes (ALL lines, ALL resources) | classifier input + UI | FULL text, ALL lines. The Completed+\$0 payment-regex reads these — truncation hides payment/outcome language (the JN141655 "cut at 'and mini'" bug). | raw labour-row count = CRM count; full text present |
| **Task notes** | AroFlo task notes (Frances/Katrina/Mario internal) | classifier input + UI | FULL text, all authors. **These changed a classification: J-141987 was Booking Cancelled but notes/emails showed a price was quoted -> Quote Only. Missing notes alter outcomes, not just display.** | source-vs-CRM match |
| **Job facts** | `jobnumber`; `job_status` (curated `tasks_complete` — NOT `tasks_deduped.status` which always reads "Archived"); `customer_type`; `credit_note_count` | structured gate fields | gate keys off these | facts present per job |
| **Invoice — amount** | `vw_job_invoiced.invoiced_total_ex` (line-summed ex-GST) | structured | THE revenue figure | amount present |
| **Invoice — detail** | `invoices_deduped`: `invoicenumber`, status (processed/approved), invoice date, per-line detail | structured + available to classifier | Needed for: (a) credit-note cascade T3 trace (`invoicenumber -> task_jobnumber`, §8); (b) the Invoice-Pending vs Completed-and-Invoiced distinction (does an invoice RECORD exist vs money-collected-not-yet-invoiced). | invoice number + status present for a known job |

### §2.4 Other touches

| Data point | Source | Must reach | Rule | Verify |
|---|---|---|---|---|
| **SMS** | MessageMedia | timeline touch | full reply + original text | SMS body present |
| **OHQ messages** | OHQ | timeline touch (own rows) | full message; separate touch_source | OHQ body present |
| **Outlook** | `jobs@`, 3 paths (A:email, B:JN, C:thread) | timeline touch | subject + body as available | email touches present |
| **Multi-touch assembly** | all clustered to an opportunity | ALL touches, not just first | each call resolves own transcript; all SMS/email/OHQ rows present | a 9-touch job shows 9 touches |

### §2.5 HELD / NOT ingested (deliberate)

| Data point | Source | Why excluded |
|---|---|---|
| `lead_analysis_json` (WC AI: Intent, Lead Summary, Call Type) | WC | WC's own AI classification — feeding it makes T7 a rubber-stamp. HELD. |
| `form_reason_did_not_convert` | WC (Fergus's code output) | Comparison basis, not raw input — circular if fed |
| `form_reason_did_not_convert_detail` | WC (human typed) | Human work-product / comparison basis — circular |
| `voicemail_transcription` | WC | Genuinely null in our data |
| `notes`, `spotted_keywords`, `quotable`, `lead_status`, `form_service_type`, `custom_fields_json` | WC | Empty, junk ("Select One"), or derived/downstream |

### §2.6 CORRESPONDENCE COVERAGE HOLE (KNOWN GAP — one problem, three leaks)

**Root cause:** customer correspondence is being reconstructed from the `jobs@` Outlook mailbox (a lossy MIRROR) instead of pulled from the authoritative SOURCES. The mailbox only catches inbound emails + SMS-replies-delivered-as-emails. It misses everything below. **AroFlo is the source of truth for job correspondence (§1) — but we read the mailbox shadow, not AroFlo.**

| # | Missing data | Why it's missing | Authoritative source to pull | Impact |
|---|---|---|---|---|
| 1 | **Outbound SMS with NO customer reply** | MessageMedia only emails `jobs@` when a customer REPLIES. No reply -> no notification -> no record. Outbound text only survives if embedded in a reply's "Original Message:" field, or if staff logged it as a task note. | **MessageMedia reporting API** (full sent-message log, reply or not) | **Breaks §4.3 Customer Unresponsive**, which REQUIRES visible trackable outbound. Without the outbound SMS we cannot evidence "we chased, they ghosted" vs NFUR. The classifier is blind to the exact touch that distinguishes them. |
| 2 | **Staff emails sent from NON-`jobs@` mailboxes** | `raw_emails_sent` IS the `jobs@` sent-items folder only — `from_email` is always a `jobs@`-family address. A staff member emailing a customer from their personal/other mailbox never lands in `jobs@` sent items. | Wider mailbox ingest (other staff mailboxes) OR AroFlo task entries (if CC'd to the task address) | Outbound conversation invisible -> same Customer-Unresponsive / outcome blindness as #1. |
| 3 | **AroFlo email/SMS TASK ENTRIES (the big one — "baked into AroFlo")** | When correspondence is CC'd to the AroFlo task address, AroFlo logs it as an entry AGAINST THE JOB — the authoritative, complete record. We only capture the `jobs@` shadow of these (e.g. 22 staff-pasted email headers in `task_notes_deduped`), NOT AroFlo's own email-type entries. **UNTESTED:** whether `join=notes` (vs current `join=tasknotes`) or another join/endpoint exposes these entries. CC could not run the live AroFlo call; the Postman collection + creds exist (§11) — this IS testable, do not leave as "can't." | **AroFlo API** — task notes/correspondence endpoint. Confirm which join returns email-type entries. | The complete per-job conversation (incl. outbound, staff replies, quotes given) lives here. This is the J-141987 class (notes/emails changed Booking-Cancelled -> Quote Only). Under-ingesting it alters OUTCOMES, not just the timeline. |

**Note on `join=tasknotes` (settled):** the production ingest (`zone=tasks, join=tasknotes`) WORKS — 107,378 notes / 23,876 jobs. The earlier "probe returned empty" was a malformed schema-enumeration probe, NOT a broken ingest. The open question is ONLY whether a different join/endpoint surfaces AroFlo's email-type entries that `tasknotes` omits (#3 above) — that needs the live AroFlo call.

**This is ONE coverage hole** (decided: fix all three). It is the upstream completeness work that makes both matching (§5) and classification (§4) deterministic — every missing channel is where determinism fails and inference begins. See §10.

---

## §3. Source-of-Truth Hierarchy (conflict resolution)

| Question | Authority | Loser / fallback | Rationale |
|---|---|---|---|
| Did the call get answered? | **8x8 CDR** (`has_answered_call`) | transcript presence | CDR is fact; transcript can be absent for recording-era reasons |
| What was said on the call? | **WC transcript** | 8x8 transcript | WC broader coverage; both transcribe same call so tie favours coverage |
| Job status / completion | **AroFlo `job_status`** (curated `tasks_complete`) | `tasks_deduped.status` (always "Archived") | curated field is real lifecycle state |
| Revenue (gross) | **`vw_job_invoiced.invoiced_total_ex`** | everything else | never quote notes / WC sale_value / pre-aggregates |
| Net revenue | **`vw_job_revenue`** (gross - refunds - discounts; bad debt separate opex) | — | see §8 |
| Customer identity on strata/account jobs | **the caller in the task description** (resident/tenant) for *lead matching*; the structured client (strata co.) for *billing* | structured client field alone | the real caller's phone is often only in free-text (§5.1) |

---

## §4. Classification — Gate then T7

**Architecture (locked):** the **gate** determines everything it can from FACTS; **T7** judges only the residual that genuinely needs reading. Facts settle; AI reads. The gate's allowed-set FENCE is absolute — a no-JN lead can never receive a Booked sub-status; a JN lead can never escape the Booked set. **The system auto-classifies end-to-end** (see §5 for the auto-link/audit model — there is no confirm-before-write step).

### §4.1 Gate determinations (by FACT, never by absence-of-content)

| Condition (facts) | -> Determined sub-status | Notes |
|---|---|---|
| JN + `invoiced_total_ex > 0` | **Completed and Invoiced** | invoice is the fact |
| JN + `\$0` + `job_status='Archived'` | **Booking Cancelled** | never attended |
| JN + `\$0` + `job_status='Open'` | **Job Pending** | still scheduled |
| JN + `\$0` + `job_status='Completed'` | -> **Completed+\$0 split** (§4.2) | payment-regex then T7 |
| **Was the call answered?** `has_answered_call = FALSE` + no non-call content | **Unanswered Call** | **CDR-FACT-FIRST. PRIMARY determinant is the CDR, NOT transcript absence.** Post-April IVR-only transcript is REINFORCING only. Pre-April: CDR is authority. *(Canonical term is "Unanswered Call" — not "Missed Call". Align the gate's emitted label to this.)* |
| `has_answered_call = TRUE` + no readable content + no JN | **Unable to Classify** | answered but unreadable (pre-recording era / 8x8 gap). NOT Unanswered — it connected. |
| **Was the call dropped?** answered + live exchange severed mid-call + reception-failure language ("I can't hear you", "you're breaking up", "hello? hello?") + sole touch | **Dropped Call** | reached a person THEN line failed. Distinct from Unanswered. Requires `has_answered_call=TRUE`. Naturally rare (most candidates are multi-touch opps where another call connected). |

### §4.2 Completed+\$0 split (payment-regex pre-pass, then T7)

1. Labour notes match PAYMENT pattern (`\$X+gst`, "collected", "eft", "card", "paid", `\$\d+`) -> **Completed - Invoice Pending** (money collected, invoice not yet raised — real revenue `vw_job_invoiced` hasn't captured). *(JN142889 "\$1490 plus gst" revenue-hiding guard.)*
   - **OPEN definition question (decide in audit):** when cash was collected on-site, is it "Invoice Pending" or already "Completed and Invoiced"? Reconciliation flagged J-142780 ("collected \$450") as arguably Completed-and-Invoiced. Resolve what Invoice-Pending means vs an effectively-complete cash job.
2. Notes match NOT-PROCEEDING (`quote only`, `not going ahead`, `too expensive`, `declined`, `won't proceed`) -> **Quote Only**.
3. Neither -> **T7** judges Quote Only vs Invoice Pending.
4. `credit_note_count > 0` -> NEUTRAL hint to T7 ("a credit occurred; read notes; still a normal Booked bucket, NOT a separate refund category"). Do NOT bias or auto-assign.

### §4.3 T7 judgement (the residual only)

T7 reads full content (transcript + notes + form) and classifies WITHIN the gate's allowed set. **T7 is judgement, not determination** — never used to gate-determine a category. Validated CC-as-classifier (no OpenAI); production engine wiring is pending (§10).

**Key T7 rules:**
- **Wrong Number** = pure T7 judgement (validated 13/13; keywords retired — people say "oh sorry" not "wrong number"). NEVER gate-determined.
- **Customer Unresponsive** requires VISIBLE, TRACKABLE outbound evidence (a call/SMS/email row).
- **OHQ after-hours leads -> No Follow-Up Recorded (NFUR), NOT Customer Unresponsive** — follow-up goes to an untracked tech mobile; we CANNOT see if contact was made. Absence of trackable outbound != customer unresponsive when the channel is untrackable. *(Exception: if visible trackable outbound DOES exist, T7 reads content normally — e.g. Tenant/Strata Referral.)*
- **No Follow-Up Recorded (NFUR)** = NEUTRAL data-state, NOT blame. Replaced PDNR ("PETTR Did Not Respond" — dropped). Operational-failure detection -> HUMAN REVIEW of this bucket.
- **Customer Resolved** = pre-booking only.
- **Policy Declined** = DROPPED (phantom).
- **Known reasoning misses to watch (from reconciliation):** service-scope declines on appliances mis-called Not Job Related when they're Service Not Provided (G-afa09ff7); these are taxonomy-judgment errors, not input gaps.

### §4.4 Taxonomy (current)

- **Not Captured** (determined): Unanswered Call, Dropped Call, Technical Error.
- **Unable to Classify** (determined): touch exists, zero readable content.
- **Booked** (JN): Completed and Invoiced, Completed-Invoice Pending, Quote Only, Booking Cancelled, Unable to Complete-Out of Scope, Job Pending.
- **Not Quotable** (no JN): Spam, Service Not Provided, Outside Service Area, Strata Issue, Customer Inquiry Only, Wrong Number, Not Job Related.
- **Not Booked** (no JN): Customer Unresponsive, No Follow-Up Recorded, Tenant/Strata Referral, Price/Minimum Call Out, Capacity/Scheduling, Wanted Quote Over Phone, Customer Resolved, Booked Elsewhere, Other.

### §4.5 Keyword Rules & Fergus Crosswalk (the living rule store)

**`ds_crm.keyword_rules` is a LIVING, human-extensible rule store** — NOT a static seed. Seeded from Fergus's `classifyLead()` regex (his `enrichWhatConvertsLeads.js`), it is designed to be **added to over time** by staff as new patterns appear, with additions persisted via **Firestore** (same override-layer pattern as `crm_lead_overrides` / `crm_match_overrides`) so they survive the nightly rebuild and accumulate. The system gets better as staff feed it patterns, rather than ossifying at Fergus's original regex.

**Schema:** `term`, `our_category`, `ferg_category` (crosswalk), `match_type`, `confidence`, `active`, `notes`.
- `active` = retire a rule without deleting it (keeps the audit trail — e.g. Wrong Number keywords set inactive, not removed).
- `confidence` = governs whether a keyword match auto-classifies (high-confidence deterministic pre-pass) or just hints to T7.

**`applyKeywordRules()`** reads this table and routes via the gate's JN fence (never a hardcoded single category).

**Deterministic high-confidence pre-pass categories** (harvested from Fergus's `classifyLead()`; exact terms live IN the table):
- Outside Service Area terms
- Service Not Provided terms
- Spam terms

**Price-keyword bundle** — four terms as ONE price-decline concept, JN-fence-routed:
- Terms: **"minimum charge", "minimum call out", "too expensive", "price too high"**
- JN exists -> **Quote Only** (quote given, declined); No JN -> **Price / Minimum Call Out** (balked pre-quote)
- `ferg_category`: "Price too High"

**Retirements:**
- Wrong Number keywords -> retired (0% recall; -> pure T7 judgement). Set `active=FALSE`, not deleted.
- Policy Declined -> dropped (phantom; regex fired on incidental phrasing).

**Payment-regex** (Completed+\$0, reads labour notes — §4.2):
- PAYMENT: `\$X+gst`, "collected", "eft", "card", "paid", `\$\d+` -> Invoice Pending
- NOT-PROCEEDING: "quote only", "not going ahead", "too expensive", "declined", "won't proceed" -> Quote Only

**Fergus crosswalk (his categories <-> ours):**

| Fergus category | Maps to (ours) | Note |
|---|---|---|
| "Dropped Call" (his catch-all for short/unanswered) | Unanswered Call / Dropped Call / CU / NFUR — by CDR + content | the 30-divergence vocab mismatch; his term is a catch-all, ours splits by fact |
| "Service Not Offered" | Service Not Provided | |
| "Price too High" | Quote Only (JN) / Price-Min-Call-Out (no JN) | JN-fenced |
| (his `afterJobStatus`: Archived+processed -> Quote Only) | became our **job_status gate rule** | harvested into the gate |
| (his repeat-lead -> `sale_value=0`) | superseded by our opportunity clustering | crude dedup |

**Test/exclusion identities** (harvested from Fergus): emails **alexm@, francesb@, fergusg@, gordo@** mrwasher.com.au (note `gordo@`, not `gordon@`) + the test phones (§6).

> **VERIFY in audit:** (a) dump the LIVE `keyword_rules` rows (every term, our_category, ferg_category, match_type, confidence, active) into this section so the exact patterns are recorded from the table, not memory; (b) confirm the **Firestore add-over-time write-path is actually built and live at all three layers** — this may be specced-not-built; (c) confirm `applyKeywordRules()` has a production caller (it may be exported-but-not-invoked — the deferred OpenAI step, §10).

---

## §5. Matching Cascade — Lead <-> Job

**Principle:** complete interaction data makes matching deterministic; every missing channel is where determinism fails and inference begins. Stop at first hit; stamp every link with the tier that produced it. **The system AUTO-CLASSIFIES end-to-end** — all tiers auto-link/auto-classify with their tier + confidence stamped; there is NO confirm-before-write step. Low-confidence links are **audited AFTER the fact** (human review of the low-confidence/NFUR/flagged set), not gated before writing. Human override sits above all of it and can reject any auto-link. Overrides keyed by STABLE ids (`lead_id` + `job_number`), never `opportunity_id` (changes on rebuild).

### Tiers (all auto-link; confidence governs audit priority)

| Tier | Method | Confidence | Status |
|---|---|---|---|
| **T1** | Exact phone OR exact email (E.164 normalised) | deterministic | live |
| **T2** | Form-twin hydrate: phoneless WC form-leads -> `jobs@` email twin (normalised name + <=5min timestamp + collision guard), recover phone/email, then T1 | deterministic | shipped (`vw_leads_unified`) |
| **T3** | **Free-text phone/email extraction from BOTH sides** — lead (transcript/form) AND job (`task_description`, `task_notes`, `labour_notes`). **Job-side (graph):** labeled extraction in clustering graph (Phone:/m)/Caller ID/Contact(M)). **Job-side (post-graph, `auto:t3_job_content_phone`):** guarded-broad 04XX from descriptions + notes, REGEXP_EXTRACT_ALL (fixes first-match-only bug), keyword guard (80-before: role labels; 40-after: committee only), frequency guard (≥10 Account descs → exclude, including resident-context), single-candidate, ±30d. **Lead-side (post-graph, `auto:t3_lead_content_phone`):** extracts non-primary 04XX from lead_timeline.full_content, matches against job desc/notes, same guards. | deterministic | shipped — job-side graph (bfd52fa), job-side post-graph (6c2c6cb), lead-side post-graph (3fa8e12) |
| **T4** | Fuzzy phone, edit-distance-1, same length, SINGLE candidate, value-corroborated (transposition typos) | deterministic | specced |
| **T5** | Phone-mismatch / different-number calls: name + location + value corroboration | inferred (low-conf, audited after) | |
| **T6** | Fuzzy name + suburb, CORROBORATION-GATED: only if name+suburb AND >=1 of {exact value, full surname, exact address}. Bare first-name+suburb NEVER links (the "two Steves in Eastwood" trap). | inferred (low-conf, audited after) | |
| **T7** | AI over the RESIDUAL only. **T7-CLASSIFY** (built): picks sub-status within gate-constrained set. Reads from materialised `lead_timeline` (full_content, task_description, labour_notes, task_notes, gate_stage). Validated 97 blind: gate 48/48, payment-regex 8/8, AI 0 genuine errors. **T7-MATCH** (designed, validated, not yet built): see §5.3. | inferred (low-conf, audited after) | classify shipped (6b4e559), match specced |

> **§5.1 — KNOWN GAP (the strata caller-in-description + Account-exclusion miss).** On strata/account jobs the *structured client* is the strata company (e.g. "Strata Choice", office line `+61284249700`) but the *actual caller* is a resident/tenant whose phone is ONLY in the free-text task description (e.g. "Cy… 0435 778 286"). TWO compounding causes:
> 1. **Account jobs are excluded from the opportunity graph entirely** (`build_opportunities.sql` filters `customer_type='Account'` before matching runs) — so the description phone is never even compared. The match is structurally impossible, not a regex miss.
> 2. Even for COD jobs, T3 description-scan must actually be reading `task_description`/`task_notes`/`labour_notes`.
>
> **Measured impact:** 3,340 Account jobs have a resident phone in the description that matches a gap-based COD lead — **977 distinct COD leads, \$6.1M invoiced revenue** — currently misclassified as Unresponsive / Tenant Referral / Strata Issue when they actually CONVERTED. Symptom case: WC-222894823 (0435 778 286) failed to match JN141655 (description has that phone + "kitchen sink blocking up"), classified Customer Unresponsive despite the job completing and invoicing \$636.90.
>
> **RESOLUTION (decided) — the "SMS/resident-phone link tier."** Match resident-caller COD leads to their Account job and SHOW the true outcome (Completed/Invoiced) in the funnel — but flag the link `is_account=TRUE` + `exclude_from_analysis=TRUE` so it stays OUT of COD campaign ROAS (§6). The lead is a genuine COD-channel inbound; the job is serviced as Account. Both truths held: real conversion visible, campaign metrics clean.
>
> **THREE constraints, ALL required (this is what keeps it safe — do not drop any):**
> 1. **Unique caller phone only.** Match on the resident/tenant's UNIQUE phone (from the SMS thread / free-text task description), NEVER the SHARED strata-company office line. The shared line stays out of clustering — matching on it recreates the mega-cluster (one strata phone Frankensteining hundreds of unrelated jobs). This is WHY the blanket Account-exclusion existed; we keep its protection by only ever matching the unique number.
> 2. **30-day forward window.** The Account job must be dated **within 30 days AFTER the lead date** (lead/call/SMS comes first, job follows). Bounds transitive linking — even a not-perfectly-unique phone can't chain jobs across months.
> 3. **Flag the link** `is_account=TRUE` + `exclude_from_analysis=TRUE` (§6), keyed by stable `lead_id`+`job_number`.
>
> **BUILD STATUS (layer check, §0):** BUILT. Three tiers write links into `crm_account_exclusions`:
> - **`auto:resident_phone_tier`** (bf4a111): guarded-broad 04XX extraction from Account job descriptions. Keyword exclusion (11 role patterns, 80-char before-phone window), frequency guard (≥10 Account descs → exclude), shared-line exclusion (structured phone on 3+ Account clients). Forward-only 30d. 287 leads, $499K. 0% FP on 20-sample.
> - **`auto:sms_jn_tier`**: MessageMedia SMS body JN extraction. ±30d window. 29 leads with JN links, 186 flag-only (distant matches, correct exclusion, wrong job for attribution).
> - **`auto:t3_lead_content_phone`** (3fa8e12): non-primary 04XX from lead_timeline.full_content matched against job desc/notes. 21 leads, $28K.
> - **`auto:t3_job_content_phone`** (6c2c6cb): guarded-broad 04XX from ALL job descriptions + task_notes via REGEXP_EXTRACT_ALL. Corpus-derived guards (91K phone corpus): role keyword before-80, committee before-80 OR after-40 (include <5, defer ≥5), resident + freq ≥10 → exclude, bare + freq ≥10 → exclude. 280 Account links, $814K. 0% FP on 25-sample post freq-cap.
> - **§6 post-link refresh**: generic `crm_account_exclusions.opportunity_id` refresh via stable keys (matched_phone + jobnumber → rebuilt opp). Covers all tiers in one pass.
> - **Total Account-linked**: 626 opps. **Total revenue attributed**: $1.4M.

> **§5.2 — Bare-mobile extraction on the GRAPH side is REJECTED.** Unlabeled "Joseph Pawney - 0412213986" produced 27 false-positive mixed-client merges (shared secondary-contact numbers). Too noisy for the clustering graph. **However, POST-GRAPH guarded-broad extraction IS safe** — the T3 job-side and §5.1 tiers use bare 04XX with keyword + frequency guards and single-candidate constraint, validated at 0% FP. The distinction: graph-side extraction feeds connected-component clustering (transitive, amplifies errors); post-graph extraction feeds deterministic single-candidate UPDATE (bounded, auditable).

> **§5.3 — T7-MATCH (AI residual job-matching).** Architecture:
>
> 1. **SCOPE:** gap_based opps after all deterministic tiers, gate_stage = `judgement:NQ/NB`, with substantive content (full_content > 50 chars). **Excludes:** no-content (Unable to Classify), Unanswered Call, phones on ≥10 Account job descriptions (conflation guard, inherited from T3). Estimated population: ~600 candidates of which ~100-200 have a plausible matching job.
>
> 2. **CANDIDATE GENERATION (deterministic SQL):** same service (PTTR→Plumbing, ETTR→Electrical trade label) + forward 0 to +30d window (job must follow the lead — a job before the lead date is a prior event for the same customer, not this lead's job), up to 15 candidates per lead sorted by date proximity. **Pre-computed identity signals per candidate:** extract ALL phones from the candidate's identity bundle (structured fields + description + task_notes + labour_notes), normalise to E.164 in SQL. Extract lead's phones (primary + any in content). Compare → `PHONE_MATCH: yes/no` per candidate. Same for email (lowercase/trim). **T7 never parses phone or email strings itself** — these are handed as pre-computed booleans.
>
> 3. **T7 EVALUATION:** receives lead content + up to 15 candidates, each annotated with pre-computed `PHONE_MATCH`, `EMAIL_MATCH`, and raw identity/problem text. T7 reasons over the **FUZZY dimensions only**: name, address, suburb, problem/task characterisation (six-dimension model: name, address, suburb, phone, email, problem). Picks one with cited evidence or ABSTAINS.
>
> 4. **MATCH BAR:**
>    - **COD job:** ≥2 corroborating signals, at least one being problem-match. Pre-computed PHONE_MATCH and EMAIL_MATCH each count as one signal.
>    - **Account job:** ≥1 HARD identity signal (name/phone/email to a **person** in the description, NOT the strata company name) AND problem-match AND a location signal. Suburb + problem alone = ABSTAIN (the JN141239/JN141237 lesson — multiple similar Account jobs at the same strata building).
>    - **VERBATIM PROBLEM EXCEPTION (COD only):** a verbatim or near-verbatim problem-text match — where the lead's reported problem and the candidate's work description share distinctive actual text (e.g. a specific multi-clause fault list appearing substantially word-for-word on both sides), not merely the same problem CATEGORY — is strong enough to satisfy the COD match bar on its own, or to serve as a qualifying identity-adjacent signal alongside a weak name (e.g. first-name-only). This is distinct from a SEMANTIC problem match ("no hot water" ≈ "hot water unit failed"), which remains an ordinary single signal and still requires a second distinct signal. The exception applies ONLY to distinctive text overlap that would not plausibly coincide on an unrelated job — generic or short problem phrases ("blocked toilet", "no power") do NOT qualify even if textually identical, because they are common. **Account jobs:** the verbatim exception does NOT bypass the strata-company-vs-person identity requirement for the hard-identity leg — Account matching still requires a person-identity signal.
>    - **Problem-MISMATCH veto:** if the lead's reported problem contradicts the candidate's work description, disqualify regardless of identity signals (the building-manager-name trap: same name, different issue).
>    - **Multi-candidate within 0.1 confidence = ABSTAIN.**
>    - **Temporal proximity:** candidates are annotated with days-from-lead. Closer-in-time is stronger evidence — a job 2 days after the lead is far more likely the match than one 28 days after. Factor proximity into confidence and multi-candidate tiebreak.
>    - **Forward-only:** candidate job dated 0 to +30d after the lead. Backward matches (job precedes lead) are invalid — different event.
>    - **Confidence threshold: 0.8** for auto-link.
>
> 5. **OUTPUT:** auto-link with tier `auto:t7_match` + confidence stamped, OR abstain (lead stays gap_based). Account links → `crm_account_exclusions` with `is_account + exclude_from_analysis`. COD links → `opp_type = 'job_matched'`. Overrides keyed by stable `matched_phone` + `jobnumber` (not opportunity_id — survives rebuild).
>
> 6. **DEPLOYMENT GUARD:** T7-match auto-links with no confirm-before-write, consistent with the spec's auto-classify principle. BUT the validation N is small (14 blind cases). On first production run over the full residual, T7-match links are written in a FLAGGED/reviewable state (`needs_audit = TRUE` or a separate review queue), NOT directly into the live funnel, until a human has eyeballed the first batch. Validated-on-14 earns the build; it does not yet earn unmonitored autonomy over the full set. After the first batch audits clean, remove the flag and let it run autonomously like the deterministic tiers.
>
> 7. **VALIDATION RECORD:** blind on 14 forward-matchable confirmed WC misses (`after_job_number` withheld from T7). Result: **11 correct, 3 correct-abstain, ZERO genuine wrong.** Two apparent failures resolved: WC-216450883 was a WC false positive T7 correctly rejected; WC-215312436 excluded as a conflated lead (building manager, multiple buildings on one phone). Sarah case (WC-232004696) flips abstain→correct with pre-computed `PHONE_MATCH`. The 3 abstentions: 2 Account jobs where T7 couldn't detect phone format difference (fixed by pre-computed `PHONE_MATCH`), 1 garbled transcript with insufficient readable content.
>
> 8. **KNOWN LIMITATION — conflated leads.** 246 gap_based opps have phones on ≥10 Account job descriptions. Of these: 183 have no content (gate = Unable to Classify, harmless), 38 span ≤7 days (single event, not conflated), **25 have content spanning >7 days (genuinely conflated — multiple unrelated conversations merged into one opp).** These 25 are flagged `conflation_risk = TRUE` and excluded from T7-match and per-event-precision analyses. The conflation does NOT corrupt T7-classify (classification applies to the specific conversation content, not the merged opp as a whole). Not a clustering bug — an inherent limitation of phone-based identity when the same person calls about different issues over time.

---

## §6. Account / Strata Jobs — Link & Flag (do not exclude, FLAG)

**Decision (kept getting dropped):** Account jobs ARE ingested, linked, and shown with their true outcome — but carry a flag to exclude from *campaign analysis*. Real revenue, must be visible; just not in PPC/COD metrics (the ad didn't generate the demand — it routed an existing brand relationship). **This supersedes the current `build_opportunities.sql` blanket exclusion (§5.1).**

**Link model — link-to-both, attribute-once:**
- A lead may link to MULTIPLE jobs (quote + the periodical it spawned). Link to ALL for traceability. *(Aaron Simpson lead 215312436 -> {141307 quote, 141813 periodical=revenue}.)*
- Mark the **revenue-bearing** job (`revenue_job`) so revenue is read once, never double-counted.

**Flags (Firestore `crm_lead_overrides`, keyed `lead_id`+`job_number`):**
- `is_account = TRUE`
- `exclude_from_analysis = TRUE` (out of campaign ROAS)
- link source/method recorded

**`existing_client` flag (computed, INDEPENDENT of Account):** `TRUE` if the lead's customer (phone/name) had ANY AroFlo job dated BEFORE this lead's enquiry. A COD lead can be an existing client too.

**Two independent analysis toggles:** (1) exclude `customer_type=Account`; (2) exclude `existing_client=TRUE`. Both off = "new-demand PPC performance"; both on = "all conversions"; either alone = in between.

**ABSOLUTE GUARD:** an invoiced job OR a WC-Unique inbound is NEVER excluded by any heuristic. *(Aaron Simpson, \$5,609, was wrongly excluded by the internal-phone outbound-frequency heuristic — a real Account client. An invoice + money = converted, full stop.)* Retire the outbound-frequency heuristic; replace with the explicit test-identity list (§4.5) + this guard.

---

## §7. Booking Rate (LOCKED — never re-derive)

**Booking rate = booked jobs / quotable leads.**
- **Quotable** = gate/T7-determined genuine bookable opportunities.
- **EXCLUDES** from denominator: `no_inbound` (~28K job-only records, 100% booked by definition) and all of Not Quotable (Spam, Wrong Number, Outside Service Area, Service Not Provided, Strata Issue, Customer Inquiry Only, Not Job Related).
- The **"80% booking rate" is a meaningless artifact** of the no_inbound records and must NEVER be quoted.
- Mechanically equivalent to "gap_based + job_matched, exclude no_inbound." True historical COD rate ~26% all-time / ~22% recent.
- Numerator (bookings/revenue) reliable historically (facts). The **denominator** needs correct quotable classification (§4/§5) — including the §5.1 Account fix, since 977 converted leads currently sit misclassified. Periods thick with Unable-to-Classify (pre-recording era) cannot produce a trustworthy rate.

---

## §8. Revenue Model (`vw_job_revenue`)

New view layered on invoice data; `vw_job_invoiced` UNTOUCHED (all existing consumers unchanged). Gross stays the headline everywhere; net is an added lens.

**Credit-note types are differentiated — this matters because they get different treatment:**
- `gross_revenue` = sum of POSITIVE invoices per job
- **`refunds`** (money collected then returned) -> **net OUT** of revenue
- **`discounts`** (price genuinely lower) -> **net OUT** of revenue
- **`bad_debt`** (invoiced, never collected, written off) -> **tracked SEPARATELY as an operating expense, NOT netted.** The sale was EARNED; the uncollected amount is opex (P&L expense line), not a revenue contra. Netting it would understate both true revenue and hide the expense.
- **`other`** credits (\$8K) -> HELD unclassified (type later)
- **`net_revenue = gross_revenue - refunds - discounts`** (bad debt NOT subtracted)

**Why the differentiation is load-bearing:** of the ~\$257K cross-task credit total, ~\$115K is bad debt (never collected — parent revenue is real but uncollected), ~\$50K refunds, ~\$29K discounts, ~\$63K other. Treating bad debt as a revenue reduction would be wrong accounting. Refund vs discount vs bad-debt is keyword-separable in invoice descriptions ("refund" / "discount"/"goodwill" / "bad debt"/"write off"); "other" needs review.

**Credit-note cross-task linking cascade** (97.1% linked, \$3,476 irreducible abstain accepted):
- T1 strict `credit note against jn`
- T2 widened JN regex (`jn#`, `j/n`, `job no`, `created from jn`, `ref jn`, `&nbsp;` fix)
- T3 invoice-number trace (`invoices_deduped.invoicenumber -> task_jobnumber`)
- T4 client + amount, **60-day window**, EXACTLY-ONE-candidate else ABSTAIN (never guess)
- Address adds nothing (credit tasks are admin tasks, null location).

**Switch to net (pending — see delta first):** ROAS (`vw_economics`) + reconciliation -> net_revenue. Everything else stays gross. ROAS may later want a "cash kept" figure also stripping bad debt — flag, don't build.

---

## §9. Orchestrator (nightly persistence)

Run order (each depends on prior): **data sync -> opportunities rebuild -> lead_timeline rebuild -> lead_gate rebuild -> after-hours auto-classify (L304).** Deploy via `deploy.sh`. **Committing SQL is not enough — `deploy.sh` must run or the nightly reverts.** Current good revision: **00025-qam** (CDR-fact-first gate). The pre-existing L304 auto-classify must be reconciled with the production T7 classifier when wired (§10), not left as a competing classifier.

---

## §10. Open / Pending (the live hit list)

1. **§5.1 / §6 Account-exclusion fix — SMS/resident-phone link tier.** Resolution DECIDED (§5.1): match resident-caller COD leads to their Account job on the UNIQUE caller phone, within **30 days after the lead date**, flag `is_account`/`exclude_from_analysis`. **Status: half-built** — exclusion flags written for 232 opps but job links NOT (`jobnumber=NULL`). **Remaining work: write the job links under the three §5.1 constraints, keeping the flags.** Deterministic — do NOT route through T7. 977 leads / \$6.1M. **Highest-impact correctness item.**
2. **§2.6 Correspondence coverage hole (3 leaks, one fix).** We harvest the `jobs@` mailbox shadow, not the authoritative sources. (a) Outbound SMS with no reply — pull MessageMedia reporting API; (b) staff emails from non-`jobs@` mailboxes — wider mailbox ingest; (c) AroFlo email/SMS task entries baked into the job — pull from AroFlo API (test `join=notes`/endpoint vs current `join=tasknotes`; the live AroFlo call IS runnable — Postman + creds exist, §11). Breaks §4.3 Customer Unresponsive evidence and under-ingests outcome-altering content (J-141987 class). **FIRST STEP: read-only — make the live AroFlo call on a known-correspondence job (e.g. JN141987) to confirm what AroFlo exposes; and confirm MessageMedia has a reporting API for the sent log.**
3. **Taxonomy naming** — align gate's emitted label to **"Unanswered Call"** (not "Missed Call") per §4.1; sync UI (`lead-classification.tsx`).
4. Switch ROAS + reconciliation to `net_revenue` (see delta first).
5. Retire internal-phone heuristic -> explicit test-identity list + §6 absolute guard; recover Aaron + others.
6. `attribution_class` toggle for ROAS (ad_generated / account / existing_client).
7. **§4.5 keyword store** — verify Firestore add-over-time write-path is built+live; dump live `keyword_rules` into §4.5; confirm `applyKeywordRules`/`applyPaymentRegex` have a production caller (the deferred OpenAI engine step + scheduler).
8. Full pipeline run vs `enriched_leads-10.csv` (three-way blind: T7 / WC-human af_* / brother-code after_*) — AFTER §10.1 & §10.5. RG_006 GT is stale (old taxonomy) — not a valid adjudicator.
9. Invoice-Pending vs cash-collected-Completed definition (§4.2 open question).
10. Backlog: "other" credits typing (\$8K); Account-billing \$0 gap (~20% of Account jobs billed monthly = \$0 in `vw_job_invoiced`); T7 budget-cap edge (>4000-char calls); drop orphan tables (`lead_interactions`, `vw_contact_timeline`); resolve `pettrDigital/pttr-crm` vs `ricgordon1977/pttr-crm` repo split.

---

## §11. Canonical Docs & Locations

- This spec (canonical), `T7_BUILD_SEQUENCE.md`, `T7_MATCHING_CASCADE.md`, `t7_taxonomy_spec.md`, `PETTR_LeadJob_Matching_Cascade.md`, `CLAUDE.md` (§14 credit notes) — all in `~/crm-build/docs/`.
- Key views/tables: `vw_job_invoiced` (revenue), `vw_job_revenue` (net), `vw_tasks`, `vw_leads`, `vw_lead_detail`, `vw_lead_enriched`, `vw_economics` (ROAS), `ds_crm.keyword_rules`, `ds_crm.lead_timeline`, `ds_crm.lead_gate`, `ds_crm.opportunities`, `tasks_complete` (for `job_status`), `tasks_deduped` (description/notes), `invoices_deduped`, `contacts_deduped`, `raw_calls`, `raw_recordings`, `raw_call_legs`, `all_leads_enriched` (WC source), `crm_account_exclusions`.
- Firestore: `crm_lead_overrides`, `crm_match_overrides`, keyword-rule additions.
- AroFlo Postman: `/Users/ricgordon/pettr-data/AroFlo API.postman_collection.json`.
- Repos: `pettrDigital/pttr-crm` (shared org — Ric works on pttr-crm here), `pettr-aroflo`, `pettr-bigquery-config`. Fergus's code (read-only ref): `~/pettr-dashboards/functions/enrichWhatConvertsLeads.js`.

---

## §12. How to use this spec

1. Before building anything, find the relevant §. The spec states the decision AND the layer AND the verification.
2. After building, confirm green at ALL THREE layers (§0) and re-run the verification. "Committed" is not "done."
3. If a build contradicts this spec, the spec wins unless Ric changes it — recorded HERE, not just in chat.
4. Mark items verified-built with commit hash + verification result, so no future session re-discovers a settled decision.

---

## §13. Audit instruction (the next step)

CC audits the live system against this spec — NOT a fresh diagnosis, a checklist fill-in:
- For every §2 data point: green/red at each of the 3 layers (§0), with the verification query result.
- For every §4 gate rule + §5 match tier: is it live, and does it behave as specced? Run the verification.
- For §4.5: dump live `keyword_rules`; confirm Firestore write-path + production caller.
- For §5.1/§6: confirm the Account-exclusion gap and propose the fix.
- **Interrogate each against what we asked for in the working sessions** — flag anything specced/agreed but not built, or built differently than agreed.
- Output: a status matrix (data point/rule -> committed/materialised/orchestrated -> matches-spec Y/N -> gap), per-row evidence, no aggregate "it works" claims.
