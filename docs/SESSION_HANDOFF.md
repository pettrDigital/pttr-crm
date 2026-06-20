# PETTR CRM — Session Handoff (status snapshot)

**Read `PETTR_CRM_DATA_SPEC.md` for ALL requirements.** This doc is status only —
what's built, what's pending, what's next. No requirements live here.

---

## WHERE THINGS STAND (updated 2026-06-20)

### CASCADE FUNCTION — BUILT, FIRST RUN COMPLETE (with caveat)

- **Built**: `scripts/run-cascade.ts` (commits 7a69084 + b876f5a). 9 steps per
  `docs/END_TO_END_FUNCTION.md` v2. Writes to staging (`crm_auto_classifications`).
- **First run** (2026-06-20): `--scope=all` (full history, 22,619 opps).
  - T7.1 (Step 5): 101 signal leads → 0 matches (all correct abstains).
  - T7.2 (Step 7): **CAVEAT — classified 611 leads via BQ keyword approximation,
    NOT the validated T7.2 prompt model.** ~121 leads defaulted to NFUR/CU where
    the prompt model would have identified specific reasons. NQ/NB sub-statuses
    need re-classification through the actual T7.2 model (50/batch, ~12 rounds).
    See spec S15.1a (AI Seam Integrity).

### WC RECONCILIATION — POPULATION COMPLETE, CLASSIFICATION PENDING RE-RUN

- **Population**: 1,215 CSV → 109 test excluded → 1,095 mapped (3-way join) +
  8 no-identity + 3 spine-gap. Every lead bucketed, zero unexplained gaps.
- **Classified**: 476 determined (gate, reliable) + 611 keyword-approximated
  (needs re-run through T7.2 prompt model) + 6 system-missed conversions +
  2 pending = 1,095 mapped.
- **System-miss finding**: 6 leads with real AroFlo jobs the linker failed to
  connect. Total invoiced: **$10,993** (verified from `vw_job_invoiced`):
  Liz Manfredini JN141144 $8,855; Fong Loretta JN141470 $880;
  Mark Ford JN140906 $466; John Gabor JN142371 $792;
  Aaron Simpson JN141307 $0; Michael Kilborn JN141935 $0.
- **Fergus comparison** (428 comparable): 79 agree, 104 Other decomposed,
  15 T7 right (Booked), 73 content-gap, 62+72 T7 corrections, 62 disagree,
  17 ambiguous. Full doc: `docs/t7_wc_reconciliation_full.md`.
- **NOT FINAL** until the 611 keyword-classified leads are re-run through the
  validated T7.2 prompt model. Gate-determined (476) and system-miss (6) are final.

### AUTONOMY GAP (the key finding — conversion-orphan classes)

The system does NOT self-capture conversion-orphans. 6 real-job leads found
by manual scan, NONE by the system. Linker-miss rate: 6/1,095 (0.5%), $10,993.

4 orphan classes (requirements for fixes are in spec S16):
1. **Content-match** (4 leads, $1,258): name/address in Account job description,
   different client phone. Phone-based scans cannot find these.
2. **Clustering-window** (2 leads, $9,735 + 24 full-pop/$42,829): 30-day window
   too tight. Liz Manfredini ($8,855 at 31d), Fong Loretta ($880 at 44d).
3. **Conflation-guard** (live S15.1 violation): frequency heuristic blocked
   Mark Ford despite real $466 job. Must replace with by-list.
4. **Known-staff-caller** (Donna Carey, 2 leads, $0): low priority.

6 orphan INSERTs were REVERTED (flag model: measure miss rate, don't patch).
Orphans are flagged `action='system_miss'` in `crm_auto_classifications`.

### OUTSTANDING — NEXT STEPS (priority order)

1. **Re-classify 611 leads through validated T7.2 prompt model** — the keyword
   approximation must be replaced. 50 leads/batch, ~12 rounds. This makes the
   reconciliation final. (S15.1a requires this.)
2. **Close autonomy gap** — make orphan classes self-capturing (spec S16):
   replace conflation guard with by-list, add content-match candidate-gen,
   evaluate clustering-window widening (45d), add orphan-detection step to
   cascade function.
3. **AroFlo API call** — correspondence coverage verification (spec S2.10).
4. **Carried items**: T7.1 backward window, seam JSON §3-compliance, dual-
   classification metric view, payment-regex fix, keyword_rules table,
   vw_lead_enriched fanout, vw_accounts repoint.

### DONE (this session)

- Cascade function built + first run (Steps 0-9)
- WC reconciliation population footed (1,215, zero gaps)
- 6 system-missed conversions identified and flagged
- Clustering-window finding sized (24 leads/$42,829 full-pop)
- Orphan detection scan built (content-match + phone-window)
- Doc consolidation: ONE canonical spec (PETTR_CRM_DATA_SPEC.md S0-S18)
- CLAUDE.md slimmed to behavioral rules + pointer
- S15.1a (AI Seam Integrity) added to spec after keyword-shortcut incident

### DONE (earlier sessions)

- Lead interaction timeline (UI) — 8 sources, per-call resolution
- Recording gap diagnosed — ~25% mobile-forwarded, ~75% capture ceiling
- T7.1 Matcher (13 matches, validated) + T7.2 Classifier (89.1% on 367 GT)
- T7.1→T7.2 wiring deployed (rev 00031/00032, rebuild-proven)
- Revenue model v4 (invoiced/estimated/revenue, note parsers validated)
- is_internal pre-pass (lkp_did_trade → lead_timeline → NJR allowed set)

### HALF-BUILT

- §5.1 Account/SMS-resident-phone link tier: exclusion flags written (232 opps)
  but NOT job links. Highest-$ item: 977 leads / $6.1M.
- "Build A" (full content materialised into lead_timeline): table rebuilt but
  NOT committed/deployed. CC-as-classifier reads it; production classify.ts does not.

### NOT BUILT

- §2.6 Correspondence coverage hole (3 leaks — AroFlo API call needed)
- §5 JN-from-email-body tier (316/507 task emails carry extractable JN)
- T7 production wiring (proposal queue, confirm/reject UI, scheduler)
