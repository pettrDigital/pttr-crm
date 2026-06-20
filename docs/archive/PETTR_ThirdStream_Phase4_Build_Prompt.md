# PETTR CRM — Third-Stream Phase 4: Consolidated Build Prompt

**Use:** paste into Claude Code as a single brief. This is the **first phase that writes** to the
spine. Companion spec: `PETTR_Third_Stream_Amendment.md` (§8a attribution, §10 validation).
Run with a clear head — a lot rests on this one rebuild.

---

## Context (locked from Phases 1–3, read-only)

Eligible WC leads: **979**. Final write plan:
- **849 ENRICH** — append each lead's payload to the matched opp's `wc_leads` array; never overwrite primary.
- **17 SEED_NEW** (identified) — new opportunities. *(Canonical set; the 17-vs-18 ambiguity was lead 238758086, which matches an existing opp by EMAIL → it is ENRICH, not a seed.)*
- **114 ANONYMOUS** — standalone single-touch opps, flagged, unlinked to jobs.
- **= 131 new opportunities** (+4.9% on the ~2,678 base). Of the 17 SEED_NEW: **3 link to an AroFlo job**, 14 are unlinked gap leads. All 114 anonymous are unlinked.

**Seed-vs-enrich test = the canonical phone-OR-email NOT EXISTS query from Phase 3. Use it
verbatim — do NOT reimplement (a phone-only version wrongly seeded 238758086).**

**All changes land in `build_opportunities.sql` at materialization (Option 1) — not split into
read-time view overrides.** 30-day windows use **Australia/Sydney**.

---

## STEP 0 — ROLLBACK POINT (before any write)

Snapshot the current opportunity layer / spine tables to a dated copy (e.g. `_pre_thirdstream_YYYYMMDD`).
Confirm the snapshot exists and record its row count. State the exact restore command. If any
STEP 3 validation fails, restore from this snapshot — do not leave the spine half-written.

## STEP 0a — Confirm targets are writable build SQL, not protected views

Confirm `build_opportunities.sql` / the spine build tables are NOT among the original protected
CRM views (`vw_accounts`, `vw_leads`, etc.). Proceed only if so. `vw_lead_enriched` /
`vw_opportunities` are spine-era objects — fair game — but confirm.

## STEP 0b — Fix the primary-attribution derivation (§8a.1: WhatConverts primacy)

Inspect the current primary (`wc_lead_id` + primary source/medium) derivation. Determine whether
it selects **(i) the first touch of ANY kind** (chronological first spine event, WC or not) or
**(ii) the first WC-ATTRIBUTED touch**.

Per §8a.1 the correct rule is **(ii)**: the earliest WC-tracked touch sets the primary; an
un-attributed direct 8x8 call occurring *earlier* must NOT win primary over a later WC-attributed
touch. Only clusters with **zero** WC touches fall back to channel-level attribution.

If currently (i), correct to (ii) in this rebuild. Report how many existing opps change primary
source as a result (mixed clusters where a direct call preceded the first WC touch — expect their
headline source to flip from direct → the WC source). **Confirm none LOSE attribution** (an opp
with any WC touch must never end up direct-primary).

## STEP 0c — Attribution tiers (§8a.2) + attribution-as-a-unit

Derive each opp's source/medium/keyword/campaign by this strict order:

1. **WC touch present in cluster → take the FULL attribution payload from the first WC-attributed
   `wc_leads` element.** Unconditional — wins over any parsed-email value, including both-exist
   form collapses.
2. **No WC + ANY Quinn form (Paid or "Organic") → `google/cpc`.** Full campaign/keyword/gclid for
   Quinn Paid where the body carries it; channel-level cpc (keyword from `lp_service` where
   present) for Quinn "Organic".
3. **No WC + WPForms → `organic`.**
4. **No WC, no form → channel-level `direct_did` / `jobs_email`** (existing tags).

**Nothing defaults to `direct`.** The only `direct` values that survive are WC-reported-direct
and untracked DID calls.

**Attribution-as-a-unit guard:** when a WC touch is present, `source`, `medium`, `keyword`, AND
`campaign` must ALL come from the **same** array element — never `source` from `wc_leads[0]` while
`keyword` still comes from `first_event`. (This is the Frankenstein-row bug from the earlier
scalar fix; do not recreate it.)

## STEP 1 — Write seed / enrich

Using the canonical phone-OR-email seed-vs-enrich query:

- **ENRICH (849):** append the enriching WC lead's payload to the matched opp's `wc_leads` array.
  Primary is re-derived per STEP 0b (append must not overwrite an existing earlier WC primary).
- **SEED_NEW (17):** create new opportunities; `origination_source='whatconverts'`; primary
  attribution from the lead's own payload; phone identity for clustering/job-link.
- **ANONYMOUS (114):** create standalone single-touch opps; `origination_source='whatconverts'`,
  `identity='anonymous'`; carry channel attribution from the lead's own payload; unlinked to jobs
  (reconciliation to jobs happens at the booking layer, not here — §5).

## STEP 2 — Rebuild the opportunity layer.

## STEP 3 — VALIDATE (do not trust blind — §10 + attribution checks)

Spine / seeding:
- **(a)** Exactly **131** new opportunities exist (17 identified + 114 anonymous). ENRICH created **0** new opps.
- **(b)** No double-seed: no seeded opp's phone/email also appears on another opp within its 30-day window. Report collisions (must be **0**).
- **(c)** Exclusions hold post-write: **0** spam, **0** non-Unique among `origination_source='whatconverts'` seeds.
- **(d)** The 9 HAS_JOB leads resolve as Phase 2 predicted (5 ENRICH, 3 anonymous standalone, 1 SEED_NEW); **238745838 / job 142760** exists as a flagged anonymous opp.
- **(e)** Clustering invariant: no opp spans a >30-day consecutive internal gap.
- **(f)** Re-run the CSV bucket comparison vs `staging_enriched_leads`: AGREE_LINKED rises for the **3** job-linking seeds; **no bucket regresses**.
- **(j)** Job-link count: exactly **3** of the 17 SEED_NEW link to an AroFlo job; the other 14 and all 114 anonymous are unlinked.

Attribution:
- **(g)** WC primacy: every opp with a WC touch carries WC source/medium — **0** cases of a WC-present opp showing parsed-email attribution.
- **(h)** Quinn = paid: **0** Quinn no-WC form leads labeled `organic` or `direct` — all `google/cpc`.
- **(i)** Source-mix before/after, **decomposed into two effects** so they reconcile:
  - *Reclassification of EXISTING opps* (STEP 0b/0c on current base) — expected ≈ direct −51, google/cpc +11, google/organic +6, gmb/organic +8, WPForms→organic +20, ecosia/referral +1.
  - *Attribution of the 131 NEW seeded opps* (their own source/medium).
  - Report total = reclassification + new seeds. Confirm the final `direct` pool contains **only** WC-confirmed-direct + untracked DID calls — **zero** blind-parser / Quinn / WPForm defaults.

## STEP 4 — Report & rollback discipline

Report the new opportunity total and the **before/after funnel denominator** so the conversion-rate
shift is quantified now, not discovered on the dashboard later (denominator rises ~131; conversions
barely move → rates tick down; this is the expected overstatement-correction, not a regression).

**If ANY STEP 3 validation fails, STOP and restore from the STEP 0 snapshot. Do not leave the
spine partially written.**

---

## Success criteria

131 new opps written exactly as planned; primary derivation aligned to WC-primacy (0b);
attribution tiered per §8a.2 with no false-direct and no Frankenstein rows (0c); all §10 + (g)/(h)/(i)
validations pass; a dated rollback snapshot exists; the funnel denominator change is quantified.
On any failure, the spine is restored, not left partial.

## Deferred (NOT in this phase)

- Channel-attribution / marketing-medium read-time rule (§12) — safe to add later off the array.
- Surfacing `origination_source` / `identity` tags through `vw_lead_enriched` to the UI — small follow-up.
