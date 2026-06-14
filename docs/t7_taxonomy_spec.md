# T7 Taxonomy Spec — Determined Stage Gates + Sub-Status Definitions

**Status**: DRAFT v2 — awaiting sign-off before any code changes.

---

## Principle

Every stage boundary is a **fact-fence**, computed in code BEFORE T7 is called.
T7 only ever picks a sub-status WITHIN a fact-fixed stage, never the stage itself.

---

## 1. Stage Determination (code, pre-T7)

### Decision tree (evaluated in order)

```
1. JN exists AND invoiced_total_ex > 0
   → BOOKED / Completed and Invoiced  (determined, skip T7)

2. JN exists (any status, any invoice)
   → BOOKED  (stage fixed, T7 picks within-Booked sub-status)

3. lead_type = 'call' AND has_answered_call = FALSE AND no content*
   → NOT CAPTURED / Unanswered Call  (determined, skip T7)

4. answered = TRUE AND max_duration_sec < 20 AND no content*
   → NOT CAPTURED / Dropped Call  (determined, skip T7)

5. Technical Error detected (form/ingest-gap fact)
   → NOT CAPTURED / Technical Error  (determined, skip T7)

6. Touch exists but NO content (no transcript, no form body, no notes,
   no OHQ, no email body — recording gap or content-less touch) AND no JN
   → UNABLE TO CLASSIFY  (determined, skip T7)

7. Content exists, no JN
   → NOT QUOTABLE or NOT BOOKED  (T7 picks sub-status from combined set)
```

**\*Content-override rule**: steps 3–4 fire only when there is **no usable
content** (no transcript, no form, no notes, no email body, no OHQ). A
short call (e.g. 15s) that has a transcript is a judgement lead — it reaches
T7 at step 7. A genuinely unanswered call cannot produce a transcript, so
the content check is a safety net, not a normal-path override. Rationale:
a 15s "you're outside our area" call with a transcript is Outside Service
Area (Not Quotable), not Dropped Call.

### Per-stage table

| Stage | Determined or Judgement | Gate rule | T7 involvement |
|---|---|---|---|
| Booked (Completed and Invoiced) | **Determined** | `invoiced_total_ex > 0` | None — auto-assigned |
| Booked (other sub-statuses) | **Judgement** | JN exists, `invoiced_total_ex` = 0 or NULL | T7 constrained to Booked sub-set |
| Not Captured | **Determined** | Call-record facts (answered, duration) AND no content | None — auto-assigned |
| Unable to Classify | **Determined** | Touch exists, zero content, no JN | None — auto-assigned |
| Not Quotable | **Judgement** | No JN, content present | T7 picks from NQ + NB combined set |
| Not Booked | **Judgement** | No JN, content present | T7 picks from NQ + NB combined set |

---

## 2. Not Captured (determined, no T7)

### Fence rules (code references)

**Unanswered Call**:
- Source: `build_opportunities.sql:355` — `LOGICAL_OR(s.answered = 'Answered') AS has_answered_call`
- Source: `vw_lead_enriched.sql:236` — `CASE WHEN o.call_count > 0 THEN o.has_answered_call ELSE NULL END AS answered`
- Rule: `has_answered_call = FALSE` AND `lead_type = 'call'` AND **no content**
- Current UI: `lead-classification.tsx:85` — `if (lead.lead_type === 'call' && !lead.answered) return { stage: 'Not Captured', sub_status: 'Unanswered Call' }`
- Content override: a genuinely unanswered call cannot produce a transcript or content. The content check is defensive — if content somehow exists (e.g. an OHQ pager matched to the opp, or a form submission in the same cluster), the lead has signal and should reach T7 at step 7 rather than being auto-classified Unanswered.

**Dropped Call**:
- Source: `vw_lead_enriched.sql:238` — `CASE WHEN o.call_count > 0 THEN o.has_answered_call AND o.max_duration_sec >= 20 ELSE NULL END AS captured`
- Source: `build_opportunities.sql:354` — `MAX(s.duration_sec) AS max_duration_sec`
- Rule: `answered = TRUE` AND `max_duration_sec < 20` AND **no content**
- Current UI: `lead-classification.tsx:84` — `if (lead.answered && !lead.captured) return { stage: 'Not Captured', sub_status: 'Dropped Call' }`
- Note: evaluated on MAX duration across ALL calls in the opp (LOGICAL_OR / MAX aggregation). A dropped call followed by a connected callback = captured, not dropped.
- Content override: a 15-second call with a usable transcript (e.g. "you're outside our area") has content → reaches T7 for qualitative judgement. A 15-second call with no transcript and no other content → Dropped Call.

**Technical Error** (MOVED from Not Quotable):
- Definition: lead never received due to form plugin outage, ingest pipeline failure, or similar system error. Not a customer action.
- Detection: form/ingest-gap fact (to be defined — currently no automated detection, manual-only in UI)
- GT count: 1 row (judgement, no JN). Will become determined.

### Removal from T7 enum
All three labels (`Dropped Call`, `Unanswered Call`, `Technical Error`) removed from T7's allowed outputs. T7 can never return a Not Captured label. The 5 violations from the new-input run (3 Dropped Call, 1 Unanswered Call, 1 Unable to Classify) become structurally impossible.

---

## 3. Unable to Classify (NEW determined stage)

### Definition
A touch exists (call received, form submitted, email arrived) but there is **zero content** for qualitative judgement: no transcript (recording gap — see CLAUDE.md §3), no form body, no task notes, no OHQ pager, no email body. The lead is real but unclassifiable.

### Detection rule (code)
After content assembly (`enrichTouches` + `fetchJobContent`), check:
```
touches.every(t => t.full_content === null) AND
job_description === null AND labour_note === null AND task_notes === null
```
If true AND no JN → Unable to Classify.
(If JN exists → Booked stage, even with no content — T7 still picks within-Booked, defaulting to Job Pending.)

### Relationship to T7 abstention
T7's current `abstained: true` JSON flag maps to the same condition. Under the new gate:
- If the code detects zero content → `Unable to Classify` is set before T7 is called. No model call.
- T7's `abstained` flag becomes redundant (the gate pre-empts it).
- If T7 is called (content exists) and still returns `abstained: true`, that's a model error to log, not a valid outcome.

### Denominator treatment
- `exclude_from_analysis = TRUE` — same as current Unable to Classify in the UI (`lead-classification.tsx:160`)
- Sits OUTSIDE the quotable denominator: Not Quotable rate = `Not Quotable / (total - Not Captured - Unable to Classify - Account)`.
- This keeps junk-lead attribution clean: a lead with no transcript (8x8 recording gap) doesn't inflate the Not Quotable count or deflate the booking rate.

### UI threading
- Current: `Unable to Classify` is a sub-status under Not Captured in the UI taxonomy (`lead-classification.tsx:15`). It sets `exclude_from_analysis = true` (`lead-classification.tsx:160`).
- Change: move to its own stage, or keep as a sub-status under a renamed "Excluded" parent. **AMBIGUOUS** — the UI currently groups it under Not Captured. Moving it to a standalone stage requires UI taxonomy changes (stage list, filter dropdowns, colour coding). Alternatively, keep it as `exclude_from_analysis = true` with any stage assignment and let the denominator logic handle exclusion. **FLAG: needs decision on UI treatment before build.**

### Dashboard denominator
- `getDashboardStats` (`queries.ts:644-658`) currently does NOT filter `exclude_from_analysis` — it only anti-joins on `crm_account_exclusions`. For Unable to Classify exclusion to work in the dashboard, either:
  - (a) Materialize Unable to Classify flags into `crm_account_exclusions` (or a new exclusion table), OR
  - (b) Add Firestore batch-read to `getDashboardStats` (expensive), OR
  - (c) Add a BQ-side `exclude_from_analysis` column to `vw_lead_enriched` (requires orchestrator to sync Firestore → BQ).
- **FLAG: denominator implementation path needs decision.**

---

## 4. Not Quotable (all judgement, T7 picks sub-status)

### Fence
- No JN (if JN exists → Booked, hard)
- Content exists (if no content → Unable to Classify)
- Not Captured conditions not met (answered + no content, or captured)

### Sub-statuses (7 total)

| Sub-status | Definition | GT count |
|---|---|---|
| **Spam** | Unsolicited marketing, telemarketing, or sales pitch. Includes cleaning-service pitches, employment agencies, office-space offers, and any external party trying to sell TO PETTR. The caller is selling, not buying. | 114 |
| **Service Not Provided** | A genuine customer enquiry for something PETTR does not do — not plumbing or electrical (e.g. TV repair, locksmith, solar, appliance installation, air conditioning, roofing, gas fitting if not offered). The caller wants to buy, but we don't sell it. | 86 |
| **Outside Service Area** | Geographic — caller is outside the Sydney/Greater Sydney service area. The service is something we do, but not where they are. | 8 (thin) |
| **Strata Issue** | Caller's issue is a strata/body corporate responsibility, not a direct-to-homeowner job. Referral to strata manager or body corporate required. Distinct from Tenant/Strata Referral (Not Booked) where the caller IS a tenant/resident with a real plumbing/electrical problem, but needs strata approval to proceed. | 5 (thin) |
| **Customer Inquiry Only** | An existing customer calling about an in-progress or recently completed job — not a new lead. Service enquiry, status check, warranty question, or complaint about existing work. | 2 (thin) |
| **Wrong Number / Contact Details** | Wrong number, disconnected number, fax line, or invalid contact details preventing any engagement. The lead cannot be reached or was never intended for PETTR. | 16 |
| **Not Job Related** | A known staff member or internal party is on the call, discussing other existing business — operational/internal, not a new customer lead. Signal: `is_internal` DID flag or operator-extension shows internal party, or call is between staff about scheduling, inventory, HR, etc. **Not** external sales pitches (those are Spam). **BUILD PREREQUISITE**: `is_internal` must be added to `InteractionRow` and surfaced in the prompt before this definition ships (see §10 Build Sequence). | 0 in GT (phantom) |

### Changes from current prompt
1. **DELETE** the rule `"cleaning/employment/office-space = Not Job Related"` — those are Spam (unsolicited external pitch).
2. **REDEFINE** Not Job Related = internal/operational call, not a new lead. Operator-extension and DID context fed to T7 as signal (not determinant).
3. **Vodafone Orphan**: PARKED, remains in enum, flagged as open. 0 GT rows. Likely historical artefact.

### Operator/extension context for T7
Currently available in the prompt per touch:
- `interaction_operator` — CSR name from `callee_name` (e.g. "Mario Cardona"), source label ("OfficeHQ"), or null. (`sql.ts:24-27`, `classify.ts:243`)
- `called_did_label` — DID label from `lkp_did_trade` (e.g. "ETTR-ADWORDS", "Strata Account"). (`sql.ts:37`, `classify.ts:245`)

NOT currently available (prerequisite for Not Job Related):
- `is_internal` flag from `lkp_did_trade` — exists in BQ but not carried through to `InteractionRow` (`types.ts`).
- Caller phone number — used as join key but not surfaced.
- Staff extension range (8583-xxxx) — not checked.

**Action**: add `is_internal` from `lkp_did_trade` to `InteractionRow` and render as `[INTERNAL]` tag in the touch header. Not a determinant — T7 still judges.

---

## 5. Booked (fence: JN exists → Booked, hard)

### Fence rule
```
opportunities.jobnumber IS NOT NULL → stage = Booked
```
No exceptions. T7 cannot move a lead out of Booked if a JN exists.

### Determined sub-status (no T7)

**Completed and Invoiced** (NEW label, replaces old `Job Complete`):
- Rule: `vw_job_invoiced.invoiced_total_ex > 0`
- Source: `ds_aroflo.vw_job_invoiced` — summed line-level invoices from `invoices_deduped` (status IN 'processed', 'approved')
- The AroFlo `status` string (`Completed`, `Archived`) is **irrelevant** — invoice is the only test.
- Rationale: $0-invoiced "Completed" jobs are quote visits (43 of 51 GT Quote Only rows are `job_status='Completed'` with $0 invoiced). Using `job_status` alone would auto-complete them incorrectly.

### Edge case: account billing review
- Condition: `job_status = 'Archived'` AND `invoiced_total_ex` = 0 or NULL AND `payment_terms` contains "Day" (Account terms, not COD)
- Action: tag as `account_billing_review`, exclude from T7, surface for manual review.
- Rationale: ~20% of Account/Strata jobs have no per-job invoice (billed at Account level). These aren't $0 jobs — they're structurally uninvoiced.

### T7 judgement sub-statuses (JN exists, $0 invoiced)

| Sub-status | Definition |
|---|---|
| **Completed - Invoice Pending** (NEW) | Job attended, work done, money collected per tech notes — but no processed invoice in AroFlo yet. Signal: labour note mentions `$X+gst card/eft/cash`, task notes show work completed. Distinct from Quote Only where no work was done. |
| **Quote Only** | We attended site and provided a quote, but the customer did not proceed with the work. Signal: labour note says "quote only", "not going ahead", "getting other quotes", "waste of time", or $0 collected. |
| **Booking Cancelled** | Booking was cancelled for ANY reason — customer cancelled, went with a competitor, was unresponsive to confirm, job resolved itself, or scheduling fell through. Includes the "Booked Elsewhere with JN" pattern (customer told us they chose a competitor after we created the job). |
| **Unable to Complete Job - Out of Scope** | We attended site but couldn't provide the service — requires different trade, structural issue, manufacturer issue, no RPZ valve, roofing work, etc. |
| **Job Pending** | Job is booked/scheduled but not yet attended. No site visit, no quote, no outcome yet. Default when no content indicates an outcome. |

### ungated_open (JN exists, job_status = 'Open')
- Currently hits `FULL_SYSTEM_PROMPT` (`t7-harness-gated.ts:485-486`).
- **Change**: route to constrained Booked prompt, same as `gated_booked`. A JN exists — stage is Booked regardless of AroFlo lifecycle state.

### Label rename
- Old `Job Complete` → split into:
  - `Completed and Invoiced` (determined, invoiced > 0)
  - `Completed - Invoice Pending` (T7 judgement, $0 invoiced but notes show collection)
- Old `Job Pending` → unchanged
- `SUB_STATUS_TO_STAGE` map updated accordingly

---

## 6. Not Booked (all judgement, fence: JN exists → NOT eligible)

### Fence rule
```
IF opportunities.jobnumber IS NOT NULL → stage = Booked (not eligible for Not Booked)
```
Any GT row with stage = Not Booked AND a JN is a fence violation / GT error.

### Sub-statuses (9 total)

| Sub-status | Definition | GT count |
|---|---|---|
| **Customer Unresponsive** | We attempted to contact the customer and they did not respond. REQUIRES POSITIVE EVIDENCE: ≥1 outbound follow-up (call, SMS, or email) MUST be visible in the timeline. Signal: outbound calls with short durations (0-10s = unanswered), VM left, SMS sent with no reply. If no outbound follow-up is visible in the timeline, use No Follow-Up Recorded instead — absence of recorded follow-up does not prove we tried. | 92 total (86 genuine no-JN, 6 fence violations — see §8) |
| **Tenant / Strata Referral** | The caller is a tenant or strata resident who needs to go through their strata manager, body corporate, or property manager to authorise the work. Not a direct booking — the lead is redirected through a third-party approval chain. Distinct from Strata Issue (Not Quotable) where the issue itself is a strata responsibility, not just the approval pathway. | 20 (19 no-JN + 1 fence violation) |
| **Price / Minimum Call Out** | Customer declined due to pricing — minimum call-out fee, quoted price too high, or price comparison unfavourable. The service is quotable and in-area, but the customer chose not to proceed on price. | 19 |
| **Capacity / Scheduling** | PETTR couldn't accommodate the customer's timeline — fully booked, too far out, or couldn't meet the urgency. OR customer's schedule didn't align with available slots. The issue is timing/availability, not price or service scope. | 15 (14 no-JN + 1 fence violation) |
| **Wanted Quote Over Phone** | Customer wanted a price estimate over the phone without booking a site visit. May or may not proceed — the enquiry ended at the phone-quote stage. | 11 (9 no-JN + 2 fence violations) |
| **Customer Resolved** | The customer's problem resolved on its own OR the customer fixed/handled it themselves, BEFORE any PETTR booking or site visit. Examples: Sydney Water fixed the main, blockage cleared, power came back, customer replaced a part themselves. No PETTR service was provided or needed. Pre-booking only — if a JN exists and the problem then resolved, that's Booking Cancelled (Booked stage). | 8 (thin) |
| **Booked Elsewhere** | Customer told us they chose a competitor BEFORE any PETTR job was created. No JN exists. If a JN exists and the customer went elsewhere, that's Booking Cancelled (Booked stage). The boundary is purely whether a JN exists. | 0 in GT (phantom — but keep, may appear) |
| **No Follow-Up Recorded** | A valid no-JN enquiry where NO outbound follow-up is visible in the timeline AND no positive evidence of customer choice (not gone-cold-after-contact, not declined-on-price). Describes the DATA STATE (no recorded follow-up), NOT a cause. Absence may be a real operational miss OR an un-ingested-channel gap — T7 must NOT assert failure from absence. A large count in this bucket is a signal for human operational review, not a classifier conclusion. Replaces former "PETTR Did Not Respond" (dropped: asserting our own failure from absence was unreliable). | 0 in GT (phantom) |
| **Other** | Catch-all for leads that don't fit any defined category. When T7 selects this, it MUST surface for human review — it's a signal that the taxonomy needs extending, not a resting place. | 0 in GT (phantom) |

---

## 7. Full Enum After Changes

### Additions
- `Completed and Invoiced` (Booked, determined)
- `Completed - Invoice Pending` (Booked, T7 judgement)

### Removals from T7 enum (determined-only, code-set)
- `Dropped Call` — removed from T7 allowed outputs
- `Unanswered Call` — removed from T7 allowed outputs
- `Technical Error` — moved to Not Captured (determined), removed from T7 allowed outputs

### Renames
- `Job Complete` → deprecated, replaced by `Completed and Invoiced` + `Completed - Invoice Pending`

### Full SUB_STATUS_TO_STAGE map

```typescript
const SUB_STATUS_TO_STAGE: Record<string, string> = {
  // Not Captured (determined, no T7)
  'Dropped Call': 'Not Captured',
  'Unanswered Call': 'Not Captured',
  'Technical Error': 'Not Captured',

  // Unable to Classify (determined, no T7)
  'Unable to Classify': 'Unable to Classify',

  // Not Quotable (T7 judgement)
  'Outside Service Area': 'Not Quotable',
  'Service Not Provided': 'Not Quotable',
  'Strata Issue': 'Not Quotable',
  'Spam': 'Not Quotable',
  'Customer Inquiry Only': 'Not Quotable',
  'Wrong Number / Contact Details': 'Not Quotable',
  'Not Job Related': 'Not Quotable',
  'Vodafone Orphan': 'Not Quotable',  // PARKED

  // Not Booked (T7 judgement, no JN)
  'Customer Unresponsive': 'Not Booked',
  'Booked Elsewhere': 'Not Booked',
  'Tenant / Strata Referral': 'Not Booked',
  'Price / Minimum Call Out': 'Not Booked',
  'Capacity / Scheduling': 'Not Booked',
  'Wanted Quote Over Phone': 'Not Booked',
  'Customer Resolved': 'Not Booked',
  'No Follow-Up Recorded': 'Not Booked',
  'Other': 'Not Booked',

  // Booked (fence: JN exists)
  'Completed and Invoiced': 'Booked',      // determined: invoiced > 0
  'Completed - Invoice Pending': 'Booked', // T7 judgement
  'Job Pending': 'Booked',
  'Booking Cancelled': 'Booked',
  'Quote Only': 'Booked',
  'Unable to Complete Job - Out of Scope': 'Booked',
}
```

### T7 allowed outputs by gate

**When stage = Booked (JN exists, $0 invoiced)**:
```
'Job Pending', 'Booking Cancelled', 'Quote Only',
'Unable to Complete Job - Out of Scope', 'Completed - Invoice Pending'
```

**When stage = Not Quotable or Not Booked (no JN, content exists)**:
```
// Not Quotable
'Spam', 'Service Not Provided', 'Outside Service Area', 'Strata Issue',
'Customer Inquiry Only', 'Wrong Number / Contact Details', 'Not Job Related'

// Not Booked
'Customer Unresponsive', 'Booked Elsewhere', 'Tenant / Strata Referral',
'Price / Minimum Call Out', 'Capacity / Scheduling', 'Wanted Quote Over Phone',
'Customer Resolved', 'No Follow-Up Recorded', 'Other'
```

T7 picks from the combined NQ + NB set. Stage is derived from the sub-status via `SUB_STATUS_TO_STAGE`.

---

## 8. GT Remap Counts (report only — do not apply until approved)

### Count reconciliation

The BQ staging table `t7_ground_truth_rg006` contains **694 rows total**:
- 201 determined (183 Job Complete + 18 Job Pending)
- 493 judgement

The "187" figure referenced earlier in the session was not a stored count — it
likely combined Job Complete (183) with a subset of Job Pending (4) or came from
a pre-Out-of-Scope-remap snapshot. The authoritative BQ counts are:

| GT label | Total | Determined | Judgement |
|---|---|---|---|
| Job Complete | 183 | 183 | 0 |
| Job Pending | 18 | 18 | 0 |
| **Total determined** | **201** | **201** | **0** |

### Job Complete → invoice-based split (201 determined rows)

| Current GT label | invoiced > $0 | $0 or NULL | New label |
|---|---|---|---|
| Job Complete (183) | 160 | 23 | 160 → Completed and Invoiced (determined); 23 → T7 judgement pool |
| Job Pending (18) | 11 | 7 | 11 → Completed and Invoiced (determined); 7 → T7 judgement pool |

**30 rows** move from determined to T7 judgement (23 Job Complete + 7 Job Pending with $0 invoiced).
**171 rows** become determined `Completed and Invoiced` (160 + 11 with invoiced > 0).

### Not Booked fence violations (10 rows — GT error, JN exists)

| opp_id | JN | GT sub | job_status | invoiced |
|---|---|---|---|---|
| J-142264 | 142264 | Capacity / Scheduling | Archived | null |
| J-140968 | 140968 | Customer Unresponsive | Completed | $0 |
| J-141580 | 141580 | Customer Unresponsive | Archived | null |
| J-141618 | 141618 | Customer Unresponsive | Archived | null |
| J-141965 | 141965 | Customer Unresponsive | Archived | null |
| J-142218 | 142218 | Customer Unresponsive | Completed | **$530** |
| J-142485 | 142485 | Customer Unresponsive | Completed | **$7,275** |
| J-141203 | 141203 | Tenant / Strata Referral | Completed | $0 |
| J-140726 | 140726 | Wanted Quote Over Phone | Archived | null |
| J-141093 | 141093 | Wanted Quote Over Phone | Archived | null |

Under the new fence, all 10 move to Booked:
- 2 with invoiced > $0 (J-142218 $530, J-142485 $7,275) → **Completed and Invoiced** (determined). These are hard GT errors — real paid jobs labelled "Customer Unresponsive."
- 8 with $0/null invoiced → T7 judgement within Booked

### Customer Unresponsive count reconciliation

Across all references in this spec:

| Scope | Count |
|---|---|
| Total GT rows labelled Customer Unresponsive | **92** |
| Determined | 0 |
| Judgement | 92 |
| Judgement WITH JN (fence violations → move to Booked) | **6** |
| Judgement WITHOUT JN (genuine Not Booked) | **86** |

The 6 JN fence violations:
- J-142218 (Completed, $530) → Completed and Invoiced
- J-142485 (Completed, $7,275) → Completed and Invoiced
- J-140968 (Completed, $0) → T7 Booked judgement
- J-141580 (Archived, null) → T7 Booked judgement
- J-141618 (Archived, null) → T7 Booked judgement
- J-141965 (Archived, null) → T7 Booked judgement

After remap: 86 genuine Customer Unresponsive rows remain in Not Booked.

### Booked-GT T7-pushed-out violations (5 rows from prior run)

| opp_id | JN | GT sub | job_status | invoiced | Issue |
|---|---|---|---|---|---|
| J-142383 | 142383 | Booking Cancelled | Archived | null | T7 said "Booked Elsewhere" — under gate, constrained to Booked set |
| J-142025 | 142025 | Booking Cancelled | Archived | null | T7 said "Customer Unresponsive" — gate prevents |
| J-141059 | 141059 | Booking Cancelled | Archived | null | T7 said "Booked Elsewhere" — gate prevents |
| J-142487 | 142487 | Quote Only | Archived | null | T7 said "Booked Elsewhere" — gate prevents |
| J-142260 | 142260 | Quote Only | Archived | null | T7 said "Price / Minimum Call Out" — gate prevents |

All 5 are Archived/$0 — under the new gate, they stay in Booked (JN exists) and T7 picks from the constrained set.

### Not Quotable JN check
All 232 Not Quotable judgement rows have **zero JN** — no fence violations. Clean.

---

## 9. Flagged Ambiguities

1. **Unable to Classify UI treatment**: currently a sub-status under Not Captured. Making it a standalone stage requires UI taxonomy changes (stage list, filters, colour). Alternative: keep as `exclude_from_analysis = true` with any stage. **Needs decision.**

2. **Dashboard denominator**: `getDashboardStats` (`queries.ts:644-658`) doesn't filter `exclude_from_analysis`. Needs a materialisation path to exclude Unable to Classify from the rate denominator. **Needs decision on implementation.**

3. **Technical Error detection**: currently manual-only in UI. No automated form/ingest-gap detection exists. GT has 1 row. **Low priority — keep manual for now?**

4. **Vodafone Orphan**: parked. 0 GT rows, likely historical. Leave in enum, unscored.

5. **Not Job Related prerequisite**: redefined as internal/operational call. 0 GT rows exist — impossible to score. The `is_internal` DID flag is available in BQ (`lkp_did_trade`) but not currently surfaced in the touch data (`InteractionRow` in `types.ts`). **Adding `is_internal` to InteractionRow is a build prerequisite — see §10.**

6. **Booked Elsewhere (Not Booked)**: defined as "chose competitor before JN created." 0 GT rows. If a JN was created and the customer went elsewhere, that's Booking Cancelled (Booked). The boundary is purely whether a JN exists. **Confirm this is the intent.**

7. **Completed - Invoice Pending**: new label. The current `Job Complete` label in the UI, Firestore, and all downstream consumers would need migration. **Scope of UI/Firestore rename needs scoping before build.**

---

## 10. Build Sequence (prerequisites and ordering)

The following must be built in order — later steps depend on earlier ones.

| Step | What | Prerequisite for | Notes |
|---|---|---|---|
| **1** | Add `is_internal` (from `lkp_did_trade`) to `InteractionRow` in `types.ts`, carry through `sql.ts` join, render as `[INTERNAL]` tag in `classify.ts:formatClassifierPrompt` | Not Job Related definition (§4) | Without this, T7 has no signal to distinguish internal calls. Not Job Related ships broken if this is skipped. |
| **2** | Implement determined-stage gates in harness (§1 decision tree) | All subsequent harness runs | Content-override rule on steps 3–4 is the key logic. |
| **3** | Update T7 prompt: remove Not Captured labels from enum, add all sub-status definitions (§4 Not Quotable, §5 Booked, §6 Not Booked), delete old "cleaning = Not Job Related" rule | Accurate scoring | |
| **4** | GT remap: apply invoice-based split (§8), move fence violations to Booked | Comparable before/after scoring | |
| **5** | Constrained Booked prompt with new `Completed - Invoice Pending` label | Booked sub-status accuracy | |
| **6** | UI taxonomy changes (if Unable to Classify becomes standalone stage) | Dashboard accuracy | Blocked on §9.1 decision |
| **7** | Dashboard denominator fix | Reported rates | Blocked on §9.2 decision |
