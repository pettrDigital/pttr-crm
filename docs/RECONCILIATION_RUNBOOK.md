# WC Reconciliation Runbook

**Purpose**: Run the WC reconciliation end-to-end through the cascade function,
producing a complete 1,215-lead comparison against Fergus's CSV. This runbook
prevents the potholes from the 2026-06-20 session.

**Canonical spec**: `docs/PETTR_CRM_DATA_SPEC.md` (S0-S18). This runbook is
operational procedure — requirements live in the spec.

---

## 1. PRECONDITIONS (verify before starting)

### 1a. The classifier at Step 7 MUST be the validated T7.2 prompt model

Two uses of "keyword" in the system. Only one is the problem:

| Use | What it does | Status |
|---|---|---|
| **KEEP**: Deterministic tiers T1-T4 + gate rules | Phone/email/labelled-text matching, gate-determined stages (Completed+Invoiced, Booking Cancelled, Unanswered, etc.). Clear cases resolved by rules before T7. | Correct, untouched |
| **REMOVE**: Ad-hoc BQ keyword-SQL CASE-WHEN classifier | Built 2026-06-20 to classify the judgement residual (NQ/NB sub-statuses) in one BQ query. NOT a tier, NOT in the hierarchy. Produced ~121 NFUR/CU fallbacks by defaulting when narrow keyword patterns didn't fire. | **Must not run. See S15.1a.** |

**The precondition**: Leads reaching Step 7 (the judgement residual after
tiers + gate) are classified by the validated T7.2 prompt model:
- Reads each lead's FULL TIMELINE (not a 400-char snippet, not keyword signals)
- Applies `NQ_NB_SYSTEM_PROMPT` or `BOOKED_SYSTEM_PROMPT` from `t7-classifier.ts`
- Pre-pass constraints: `resolveNqNbAllowedSet(has_outbound, has_internal_touch)`
- Validated 89.1% on 367 GT (S15.3)

**Verification (do this BEFORE the full run)**:
1. Pull 5 judgement leads with known classifications (from the hand-classified
   batch 1a/1b — leads where the classification was verified by reading the
   full timeline).
2. Run the T7.2 prompt model on these 5 and confirm it produces the correct
   sub-statuses.
3. If it produces NFUR/CU on leads that should be Wrong Number or OSA, the
   keyword shortcut is running, not the prompt model. STOP.

**The keyword-SQL classifier** (`t7_classify_signals` table, the BQ CASE-WHEN
query) must NOT be called at Step 7. If the function or the operator uses it
as a shortcut for speed, the run is invalid (S15.1a). Batch the prompt model
at 50 leads/batch (~12 rounds for 600 leads) instead.

### 1b. The orphan-detection step is built into the function

Before Step 7 classifies any lead as a non-converter, orphan detection runs:
- **Content-match scan**: lead's full name in any AroFlo job description
  (different client phone), 0-100 days forward AND backward.
- **Phone-window scan**: lead's phone matches a job's client phone, 31-100
  days forward (beyond the 30-day clustering window).
- **Selection rule**: when multiple jobs match the same person, pick by
  DATE PROXIMITY to the lead, NOT by invoiced amount (S5.3 item 9). The
  2026-06-20 scan sorted by `invoiced_ex DESC` and attributed 3 leads to
  wrong jobs, overstating the linker-miss by $7,097.
- **Output**: leads with a real job are flagged `action='system_miss'` in
  `crm_auto_classifications`. They are NOT classified as non-converters,
  NOT manually linked. The flag preserves the measured linker-miss rate.

If orphan detection is not yet a built-in function step (it was a manual scan
on 2026-06-20), build it into `run-cascade.ts` Step 6.5 before running.

### 1c. Data is current

Run the orchestrator (Step 0) or confirm the last sync is recent enough.
`opportunities`, `lead_timeline`, `lead_gate` must reflect current AroFlo
+ 8x8 + WC data.

---

## 2. SCOPE

### 2a. Reconciliation scope = the 1,215 CSV population

The CSV is `ferg_csv_classifications` (1,215 rows, one per WC lead_id).
The reconciliation compares T7's classification against Fergus's `after_*`
fields on THIS population — not the full CRM history.

**How to scope the run**: the function's `--scope` flag controls the
population for Steps 1-3 (rebuild) and Step 4 (pre-passes). For the
reconciliation, either:
- Use `--scope all` for Steps 0-3 (rebuild full tables — these are shared
  infrastructure), then SCOPE Step 7 to only the 1,095 mapped reconciliation
  leads (filter the `t7_recon_classify_input` table or equivalent).
- OR: build a `--scope reconciliation` flag that filters to the CSV population.

**Do NOT classify the full 22,619 opp history** at Step 7 if the goal is the
reconciliation. That's a separate concern. The reconciliation classifies
only the 1,095 mapped leads.

### 2b. The 3-way join is MANDATORY

The join from CSV leads to current opportunities uses THREE methods in
priority order:
1. **Primary wc_lead_id**: `ferg_csv.wc_lead_id = opportunities.wc_lead_id`
2. **wc_leads array**: `wc_lead_id IN UNNEST(opportunities.wc_leads)`
3. **Phone fallback**: `ale.norm_phone = opportunities.phone`

**Primary-only join drops ~130 leads** whose wc_lead_id is a non-primary
touch in their opportunity cluster. This caused the 602→548 bug on 2026-06-20.
Always use all three methods, deduplicated to one opportunity per lead
(priority: primary > array > phone).

### 2c. Test exclusion (109 leads)

Excluded by-list-only (S15.1):
- Internal email domains (`@mrwasher.com.au`, `@electriciantotherescue.com.au`,
  `@plumbertotherescue.com.au`, `@quinnmarketing.com.au`)
- `test_numbers` table (16 entries)
- WC `is_test_lead = TRUE`
- `test_wc_leads` table

These are held out from comparison — not counted as disagreements.

---

## 3. EXPECTED FOOTING (tripwire)

These numbers are the verified baseline from 2026-06-20. Any deviation is a
bug to investigate BEFORE proceeding — not a "new number" to accept.

### 3a. Population funnel (foots to 1,215)

| Bucket | Expected | Investigate if |
|---|---|---|
| Test excluded | 109 | Changes by >2 (new test leads added/removed) |
| Mapped (3-way join) | 1,095 | Any change (join logic or opp rebuild shifted IDs) |
| No identity | 8 | Changes (these are zero-phone zero-email leads) |
| Spine gap | 3 | Changes |
| **Total** | **1,215** | Must always foot exactly |

### 3b. Classification breakdown (1,095 mapped)

| Bucket | Expected | Investigate if |
|---|---|---|
| Determined (gate) | ~476 | Large shift = gate logic changed or jobs added/removed |
| T7.2 classified | ~611 | Large shift = gate boundary moved |
| System-miss (orphan) | 6 | New orphans = good (orphan scan improved); fewer = orphan scan regressed |
| Pending | 2 | Should resolve to 0 |

### 3c. System-miss leads (verified $10,993)

| Lead | Job | Invoiced | Orphan type |
|---|---|---|---|
| Liz Manfredini | JN141144 | $8,855 | Phone 31d |
| Fong Loretta | JN141470 | $880 | Phone 44d |
| Mark Ford | JN140906 | $466 | Content match |
| John Gabor | JN142371 | $792 | Content match |
| Aaron Simpson | JN141307 | $0 | Content match |
| Michael Kilborn | JN141935 | $0 | Content backward |

If any of these 6 STOP appearing as system-miss, investigate — either the
linker improved (good, confirm) or the orphan scan regressed (bad, fix).

---

## 4. RUN PROCEDURE

### Step-by-step

```
1. SYNC (Step 0)
   → Confirm data is current (or run orchestrator)

2. REBUILD (Steps 1-3)
   → npx tsx scripts/run-cascade.ts --skip-sync
   → Produces: opportunities, lead_timeline, lead_gate
   → CHECK: footing — how many determined vs judgement?
     Compare against §3b. Investigate any shift.

3. PRE-PASSES (Step 4)
   → has_outbound, has_internal_touch computed per lead
   → Payment regex: OFF (S4.2)

4. T7.1 MATCH (Step 5)
   → Expected: ~0 new matches (same as 2026-06-20)
   → If matches found: write via Step 6, re-build Steps 1-3

5. ORPHAN DETECTION (Step 6.5 — before Step 7)
   → Content-match + phone-window scan on all judgement leads
   → Selection: DATE PROXIMITY, not invoiced amount
   → Flag system_miss leads in crm_auto_classifications
   → Expected: 6 (same leads as §3c)

6. T7.2 CLASSIFY (Step 7) — THE CRITICAL STEP
   → Population: all judgement leads MINUS system_miss
   → Classifier: VALIDATED T7.2 PROMPT MODEL
     - Full timeline per lead
     - NQ_NB_SYSTEM_PROMPT or BOOKED_SYSTEM_PROMPT
     - Pre-pass constraints (has_outbound, has_internal_touch)
   → Batch: 50 leads/batch, ~12 rounds
   → DO NOT substitute keyword/SQL classifier (S15.1a)
   → DO NOT drop into manual chat-classification
   → The function classifies, writes output JSON, continues

7. STAGING WRITE (Step 8)
   → Write to crm_auto_classifications (action='proposed')
   → NEVER write to crm_lead_overrides

8. READOUT (Step 9)
   → Per-lead reconciliation: our classification vs Fergus
   → Foot to 1,215. Zero unresolved.
   → Write to docs/t7_wc_reconciliation_full.md
```

### Run discipline

- The function runs Steps 0-9 end-to-end. The AI seam (Steps 5 and 7)
  classifies the batch and the function consumes it — do NOT exit the
  function to classify leads manually in chat.
- If the seam pauses for input (writes JSON, waits for output JSON),
  fill the output and resume. Do NOT start a new classification approach.
- If volume is too large for one pass, BATCH it. Say "this will take N
  rounds at 50/batch." Do NOT invent a faster classifier.

---

## 5. EXPECTED DIFFERENCE vs 2026-06-20

The 2026-06-20 run used a BQ keyword classifier at Step 7. Tomorrow's run
uses the real T7.2 prompt model. Expected differences:

### 5a. The ~121 NFUR/CU keyword-fallback leads should resolve

On 2026-06-20, ~121 leads defaulted to NFUR or CU because the keyword
patterns didn't fire. The real T7.2 model reads the full timeline and should
identify specific reasons:

| 2026-06-20 (keyword) | Expected tomorrow (T7.2) | Why |
|---|---|---|
| NFUR (keyword miss) | Wrong Number, OSA, SNP, etc. | Full timeline shows "wrong number" phrasing the keyword missed |
| CU (pre-pass fallback) | Wanted Quote, Price, Capacity, etc. | Full timeline shows the specific barrier |
| NFUR (genuine) | NFUR (unchanged) | Lead genuinely had no outbound follow-up |

**Tripwire**: if the ~121 leads STILL classify as NFUR/CU at the same rate,
the real T7.2 model is NOT running — the keyword shortcut is still in the
path. Investigate before accepting the results.

### 5b. Overall sub-status distribution should be more specific

2026-06-20 had NFUR=190 and CU=97 (inflated by keyword fallback). Tomorrow
should have lower NFUR/CU counts and higher counts in specific categories
(Wrong Number, OSA, Service Not Provided, Wanted Quote, etc.).

### 5c. Fergus agreement rate should improve

The 18% direct agreement rate was artificially deflated by the keyword
classifier's NFUR/CU over-routing. With the real T7.2 model correctly
identifying specific reasons, the agreement rate on unambiguous categories
(Spam, Wrong Number, OSA) should be higher.

---

## 6. POST-RUN CHECKS

1. **Footing**: 1,215 = 109 + 1,095 + 8 + 3. Exact.
2. **Zero unresolved**: every mapped lead has a classification or system-miss flag.
3. **System-miss count**: 6 (same leads). If different, investigate.
4. **NFUR/CU count**: should be LOWER than 2026-06-20 (190+97=287). If still
   ~287, the keyword classifier is still running.
5. **Per-category agreement with Fergus**: check Spam (should be >73%),
   Wrong Number (should be >35%), OSA (should be >24%). If lower, investigate.
6. **Orphan $ total**: $10,993 (verified from `vw_job_invoiced`). Same 6 jobs.
   If different, check which jobs the orphan scan attributed — it must use
   date proximity, not invoiced amount (S5.3 item 9).

---

## 7. REFERENCE: Today's Potholes (do not repeat)

| Pothole | What happened | Guard in this runbook |
|---|---|---|
| **Keyword classifier substitution** | CC built a BQ CASE-WHEN to classify 600 leads in one query. ~121 defaulted to NFUR/CU. | §1a: precondition check. §4 Step 6: "DO NOT substitute." |
| **Primary-only join** | 3-way join filtered to primary wc_lead_id only, dropping 130 leads (602→548). | §2b: 3-way join mandatory. |
| **--scope=all on reconciliation** | Function ran on full 22,619 history instead of the 1,095 reconciliation population. | §2a: scope explicitly stated. |
| **Manual chat-classification** | Dropped out of the function to classify leads one-by-one in chat, losing structure. | §4: run discipline — function runs through, don't exit. |
| **Orphan scan sorted by invoice** | Content-match scan picked highest-invoiced job, not closest. 3 leads attributed to wrong jobs, $7,097 overstatement. | §1b: date proximity selection rule (S5.3 item 9). |
| **Orphan manual linking** | 6 orphans manually inserted into match/exclusion tables, then reverted to flags. | §1b: flag system_miss, never manually link. |
| **Cross-doc $ disagreement** | Reconciliation said $18,090, handoff said $466/$0/$792. Different jobs for same leads. | §3c: verified figures from `vw_job_invoiced`. |
| **Footing accepted without investigation** | 602→548 shift accepted as "some opp IDs changed" instead of investigated. | §3a/§3b: any shift = investigate BEFORE proceeding. |
