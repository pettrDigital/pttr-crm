# PETTR Lead↔Job Matching Cascade — DEFINITIVE REFERENCE

**This is settled. Do NOT re-derive any of it.** Consolidated from sessions
2026-06-04 → 2026-06-14. If a repo doc `PETTR_LeadJob_Matching_Cascade.md`
already exists, reconcile to it — this should match. Companion:
`T7_BUILD_SEQUENCE.md`, `t7_taxonomy_spec.md`, `PETTR_Third_Stream_Amendment.md`,
CLAUDE.md §7/§14–16.

---

## What the cascade IS

The ordered set of methods for linking an inbound lead (call/form/email) to its
AroFlo job, collapsing touches into one opportunity. Each tier is MORE permissive
and LESS certain than the one above. **The cascade stops at the first hit.** Every
link is stamped with the tier that produced it.

A lead with a clean phone match never reaches the lower tiers — only the hard
residual does. This is why T7 (the AI tier) is cheap: it runs on leftovers only.

---

## THE TIERS

### AUTO-LINK tiers (deterministic — write the link directly)

- **T1 — Exact phone OR exact email match.** The base case. (Existing.)
- **T2 — Form-twin hydrate.** Phoneless WC form-leads matched to their parsed
  `jobs@` email twin (normalized name + ≤5min timestamp + collision guard),
  recover phone/email, then T1. (SHIPPED — in `vw_leads_unified`. Reference, do
  not rebuild.)
- **T3 — Labeled free-text extraction.** Regex AU phone/email out of BOTH sides'
  free text — lead (transcript/form) AND job (task_description, task_notes,
  labour_notes) — normalize to E.164, add as match keys, then T1. Single-candidate
  only. (SHIPPED. Proved ~20/50 links had the phone in the job description.)
  **NOTE:** bare-mobile extraction was TESTED AND REJECTED (27 false-positive
  merges) — labeled-only auto-links; bare numbers go to propose tiers, never
  auto-link.
- **~~T4 — Fuzzy phone, edit-distance-1~~ — RETIRED as standalone auto-link tier.**
  Tested 2026-06-14. Edit-distance-1 across the full population found 248 pairs
  (109 single-candidate). With a 60-day time guard: 11 candidates. Of those 11,
  ZERO had a lead-side corroborating signal (name/address/value) — the lead side
  is typically a bare phone with no WC contact name. Only 1 case (+61288584867 →
  +61288554867, JN140830) is externally confirmable from the GT audit.
  **Finding:** fuzzy-phone without corroboration cannot safely auto-link. The
  signal (edit-distance-1 phone) folds into T5/T6 as one of the propose-tier
  candidate signals — it is NOT a distinct auto-link rung. No code was added to
  `build_opportunities.sql`; the single confirmable link is not worth a graph
  extension that cannot be guarded against false merges on the other 10.

### — THE AUTO / PROPOSE LINE —

### PROPOSE tiers (inference — write a PROPOSAL, stays unlinked until a human confirms)

- **T5 — Phone-mismatch / different-number calls.** Caller's phone ≠ job's client
  phone (partner/neighbour/tenant called). Proposes via name + location + value
  corroboration. Includes fuzzy-phone (edit-distance-1) as a candidate signal —
  a near-miss phone strengthens the proposal but does NOT auto-link alone.
  (Specced; may be superseded by T7 — bare structured name-matching threw
  hundreds of false candidates, so the AI does this job better.)
- **T6 — Fuzzy name + suburb, CORROBORATION-GATED.** Proposes ONLY if name+suburb
  match AND ≥1 of {exact value, full surname, exact address}. Bare
  first-name+suburb NEVER proposes (the "two Steves in Eastwood" trap). Common
  first names flagged for extra scrutiny. (Specced; likely superseded by T7.)
- **T7 — AI propose engine over the RESIDUAL only.** For leads that fell through
  T1–T6. Reads lead content (transcript/form/email) AND job free text
  (task_description, task_notes, labour_notes) AND full structured identity
  (location/client address, location phone, location/client/contact name).
  Proposes a specific job WITH cited evidence + value corroboration, or ABSTAINS.

---

## CORE PRINCIPLES (non-negotiable)

1. **Deterministic first, AI last.** T1–T4 catch links cheaply and certainly.
   T7 (AI) is the last resort for the residual no rule can catch. Never pay T7 to
   do what a deterministic tier does — if a phone is extractable, extract it (T3),
   don't have T7 read for it.
2. **T7 is PROPOSE-ONLY for now. Never auto-link during validation.** Output is a
   proposal to the review queue (Firestore `crm_match_overrides`, keyed by
   lead_id+job_number) with tier, confidence, evidence, channel. Human confirms →
   link written. Rejects → logged. This containment is WHY the untested
   false-positive risk is acceptable: worst case is a wrong proposal a human
   catches, never a silent bad link.
   - **DEFERRED DEPLOYMENT DECISION (not settled — revisit at step 7/8):**
     human-reviewing every residual is not feasible at scale, so the disposition
     model will likely change to **link-but-flag** (T7 writes the link live, flags
     it for async review) — probably TIERED (high-corroboration links live, weak
     ones stay propose-only) and/or `exclude_from_analysis` until reviewed.
     PRECONDITION before any live linking: measure T7's actual false-positive rate
     and set the corroboration threshold, because link-but-flag fails OPEN
     (unreviewed errors stay live in ROAS/attribution). This is a deployment
     decision — does NOT affect the current goal of proving T7 reads leads
     correctly. Validation runs stay propose-only / scored-not-written.
3. **Human override sits ABOVE both auto and propose.** Can reject even a T1
   auto-link if wrong. Overrides are keyed by STABLE ids (lead_id / job_number),
   NOT opportunity_id (which changes on every spine rebuild).
4. **T7 reads RAW EVIDENCE only — never human work-product.** No
   `form_job_number`, no `manual_job_number`, no `linked_jobs`, no WC judgement
   fields. Those are held out as the COMPARISON/validation basis (`includeManualLinks=false`).
   Feeding T7 a human-confirmed link = handing it the answer it's meant to propose.
5. **The 30-day clustering window is an identity rule, not a timing rule.** Most
   unlinked cases are DIFFERENT-PHONE-ENTIRELY (Account/strata or phone-mismatch),
   which no window change fixes. Only a small same-phone-late slice benefits from a
   wider window — and widening raises false-merge risk. Don't reach for the window
   as a fix.

---

## THE ACCOUNT / STRATA PATTERN (settled 2026-06-12 — most-repeated re-derivation)

Resident/tenant calls the COD line → CSR books the job under the strata manager's
**Account** (the job carries the PM's phone, e.g. Bright & Duggan +61294383133).
The resident's real details (name, unit, mobile) sit in the job's DESCRIPTION
free-text, not the structured client fields.

- **Account jobs are EXCLUDED from COD clustering BY DESIGN** — removing the
  exclusion reintroduces the strata-blob problem (all of a PM's jobs cluster on
  one shared phone) and recovers almost nothing (~1 case).
- **Recovery is T7's job**, reading the transcript → extract resident name/address
  → match the Account job's description text. ("Pass A" proved it: Louise Butler,
  Aaron, Susan Qua, Joseph Smith, Toby Herden all found this way.)
- Some are deterministic IF the resident's phone is IN the description — but that
  is a T3-extension consideration, NOT a reason to drop the Account exclusion.
- **CRITICAL — the link writes with the ACCOUNT FLAG.** `is_account=TRUE` +
  `exclude_from_analysis=TRUE` (already in `link-job/route.ts` ~lines 77–83). The
  lead shows as "converted to Account work" — attribution complete, revenue
  visible, but EXCLUDED from COD ROAS/booking-rate. Linking Account jobs into the
  COD funnel CONTAMINATES the exact metric the exclusion protects. Never recover
  Account work into COD metrics.

---

## VALIDATION STATUS (T7 as matcher, from 2026-06-12)

T7 was blind-tested as a matcher and PASSED:
- **Abstention:** 25 no-job leads, 0 false proposals (doesn't hallucinate).
- **Recall:** 20/20 on leads with a findable correct job.
- **Adversarial decoy:** real enquiries whose correct answer is NO_MATCH, paired
  with surname/value/suburb-similar decoy jobs — rejected the decoys, caught its
  own mislabels. 0 false-positive across 65 blind leads.
- **Standing caveat:** "0 false-positive" proves it DIDN'T misfire on the test
  set, not that it CAN'T. This is exactly why it stays PROPOSE-only — the human is
  the backstop for the false positive the tests couldn't fully isolate.
- **Status: validated, NOT deployed.** No packaged job, no queue, no UI, no
  scheduler — it existed only as prompts. (This session is building the
  productionised version on the materialised foundation.)

---

## CONFIRMED RESIDUAL TEST CASES (real, characterised — use to validate the build)

- **Same-phone outside-window (COD):** Mark Ford (+61416165495 → JN129871/JN123228),
  Sarah Condoleon (+61402000542 → JN135382/JN133904/JN130376).
- **Account/strata (resident details in job description):** Louise Butler, Aaron,
  Susan Qua, Joseph Smith, Toby Herden.
- **Phoneless content-match:** Sophie Capelli, Chris Kelsey, Janet Howse.
- **Name-format mismatch:** Chris Kelsey ($980) — WC "Chris Kelsey" vs job
  "Kelsey, Christopher".
- **Transposed-digit typo (T4 fuzzy-phone):** +61288584867 vs +61288554867.

---

## RELATIONSHIP TO T7-AS-CLASSIFIER

T7 does TWO jobs (settled this session): it is a MATCHER (this doc — which job an
opportunity links to) AND a CLASSIFIER (`t7_taxonomy_spec.md` — the funnel
sub-status). Order: deterministic match (T1–T4) → T7 residual match (T5/6 logic,
done by AI) → T7 classification of ALL leads. Matching settles before classifying,
because the classification gate depends on the JN the match produces.
