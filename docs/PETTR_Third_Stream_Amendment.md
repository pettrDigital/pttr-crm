# PETTR CRM — Third-Stream Amendment (WhatConverts as Origination Source)

**Companion to:** PETTR Lead Spine Architecture Addendum.
**Status:** Spec amendment, produced from the June 2026 lead-coverage validation (the
enriched-leads CSV comparison). This is the SPEC the spine change is checked against — written
before the build, same as the Addendum.

---

## 1. What this changes, in one sentence

WhatConverts stops being **only** an attribution overlay and becomes a **third origination
source for the spine**: a WC lead that matches an existing spine event still enriches it (no
change), but a WC lead that matches **nothing** now **seeds its own spine row** instead of
falling out.

## 2. The gap this closes (evidence)

The current spine (`vw_leads_unified`) is anchored on 8x8 calls — one row per inbound call.
WC is overlaid via phone + timestamp. The validation proved this structurally drops a class of
real leads: **WC captures lead-origination events that neither the 8x8 call stream nor the
`jobs@` email stream contains.** From the 23 HAS_JOB cases (converted leads absent from the
spine):

- **anonymous / withheld-number WC calls** — no phone, so no 8x8 match, and often no 8x8 CDR
  row at all (e.g. JN 142760, the Randwick caller). The lead has nowhere to live.
- **WC calls 8x8 never logged** — PBX bypass; WC recorded the call, 8x8 didn't.

These are not matching-tolerance failures (those were the first-event attribution bug, already
fixed, and the different-WC-ID cases, resolved by the `wc_leads` array). They are **leads with
no spine row**. The only fix is to let WC seed spine rows.

## 3. The core rule

For each **Unique, non-spam** WC lead (preserve existing exclusions — see §6):

```
IF the WC lead's identity (normalised phone OR email) matches an existing spine
   event within the 30-day consecutive-silence cluster window:
       → ENRICH. Attach as an interaction on that opportunity (current behaviour),
         AND attempt the ±5s 8x8-leg match for recording/agent (current behaviour).
ELSE IF the WC lead has a usable identity (phone or email) but matches nothing:
       → SEED a new spine row → new opportunity. Tag origination_source = 'whatconverts'.
ELSE (anonymous: no phone, no email):
       → see §5 DECISION.
```

The matching logic itself does **not** change. What changes is the **fallthrough**: a non-match
goes from *drop* to *seed*. The seed-vs-enrich test is the coarse **identity-within-cluster**
match (phone/email within the 30-day window), **not** the ±5s call-timestamp match — the ±5s
match is only ever for attaching a WC call to a specific 8x8 CDR leg.

## 4. The central risk this must control: duplicate seeding

The current design's failure mode is *dropping*. This amendment's failure mode is the inverse
— **double-counting**. Every WC lead that *should* have matched an existing event but doesn't
will now seed a phantom duplicate opportunity, inflating lead volume.

Mitigations, all required:

1. **Seed-vs-enrich must test against ALL spine events** in the cluster window — 8x8 calls,
   `jobs@` emails, AND already-seeded WC-only rows — on normalised phone OR email, not just
   ±5s against 8x8. A WC lead seeds only if it matches *nothing* on identity.
2. **WC-only-to-WC-only dedup**: a customer's repeat WC touches within one cluster must
   collapse onto one opportunity (the `wc_leads` array already holds multiple touches per opp;
   seeding must respect the same clustering, not create one opp per touch).
3. **WC web-form ↔ `jobs@` email dedup** (§7) — the same submission can arrive on both streams.

## 5. DECISION — anonymous WC leads (no phone, no email)

Anonymous WC calls can't be clustered or job-linked by identity — there's nothing to match on.
Two options:

- **(A) Seed as flagged standalone opportunities** *(recommended)*. Each non-spam anonymous WC
  lead becomes a single-touch opportunity tagged `identity = 'anonymous'`,
  `origination_source = 'whatconverts'`, **unlinked to any job** (no identity to link by). They
  ARE real enquiries (JN 142760 became a paid job), so they belong in lead volume. The spam
  filter already removes the anonymous-spammer case, so seeded anonymous leads are genuine
  withheld-number callers. Reporting can segment them via the flag.
- **(B) Exclude anonymous leads.** Every seeded lead stays actionable/clusterable, but genuine
  anonymous enquiries (and the jobs they convert to) stay invisible — the exact J-142760 hole
  the validation flagged.

**DECIDED: (A) — seed-and-flag.** It's the honest reading of "a lead is a customer reaching out
by any door." The flag keeps them segmentable and the spam pre-filter bounds the volume.
Phase 2 measured the real population at **114 anonymous opps (~4.3% of the ~2,678 base)** — a
bigger flagged-orphan set than first estimated, but immaterial as a share and genuine
withheld-number callers, not noise.

**Anonymous → job reconciliation happens at the BOOKING / job layer, not the spine.** An
anonymous lead and its eventual job can't be joined at origination (no shared identity), but
once the enquiry becomes a booked job the job carries a real phone, address, and customer, so
the link surfaces there on the job's own identity. The spine deliberately does not attempt
timestamp-only job-linkage for anonymous leads; that reconciliation is a property of the job
layer.

> Note: anonymous leads are seeded but remain **unlinked to jobs** under either option. Linking
> an anonymous WC call to a job requires a non-identity signal (timestamp proximity), which is
> fragile and is **deliberately excluded from the spine rule**. If wanted, it belongs in a
> separate, conservative heuristic layer (single WC anonymous + single job in a tight window,
> no other candidates) — not here.

## 6. Preserve existing exclusions

Only **Unique, non-spam** WC leads are eligible to seed. The 343-lead decomposition correctly
excluded 121 spam + 144 non-Unique (WC duplicate) leads; seeding must **not** re-admit them.
Spam and non-Unique status are checked *before* the seed-vs-enrich test.

## 7. WC web-form ↔ `jobs@` email dedup

Quinn Marketing / Yellow Pages forms are **emailed to `jobs@`** — so one form submission can
exist as both (a) a WC web-form lead and (b) a `jobs@` inbound email parsed by Layer 0. If both
streams seed, the enquiry is double-counted. Rule: a WC web-form lead and a parsed `jobs@`
form-email that represent the same submission (match on email/phone + tight timestamp, ideally
same form signature) **collapse to one origination event**. Consistent with the Addendum's
existing cross-stream dedup principle ("direct emails dedup against calls").

## 8. Spine tagging

Seeded rows carry `origination_source = 'whatconverts'` (vs `'8x8'` / `'jobs_email'`) and, for
anonymous, `identity = 'anonymous'`. This makes the new rows segmentable everywhere downstream
and lets you measure exactly how much volume the third stream adds.

## 8a. Attribution (source / medium / keyword / campaign)

Attribution is **never derived or guessed** — it is read from the WC lead's own payload
(`wc_source`, `wc_medium`, `wc_keyword`, `wc_campaignId`). The only question per class is
whether that payload sets a *new* opportunity's primary or appends as a *touch* to an existing
one:

- **SEED_NEW (identified) + SEED (anonymous)** — the seeded opportunity stamps its **primary**
  attribution from the seeding lead's own WC payload. The seeding lead is, by definition, the
  origination touch.
- **ENRICH** — the enriching lead does **not** overwrite the existing opportunity's
  attribution. Its source/medium/campaign is **appended to the opp's `wc_leads` array** as
  another touch; the opp's primary is then derived from the array by the existing rule
  (first-touch, swappable). This routes the third stream through the *same* multi-touch
  mechanism already built — seeding/enriching must use the array-append path, never a scalar
  overwrite.
- **Anonymous leads retain channel attribution.** "Anonymous" means no phone/email — it does
  **not** mean unattributed. A withheld-number caller still arrived via a tracked channel
  (the tracking number / landing page captured `gmb / organic`, `google / cpc / <keyword>`,
  etc.). So the 114 anonymous seeds carry full source/medium/campaign even though they have no
  identity and no job link. They are reportable by channel.
- **Non-WC origination carries channel-level attribution only.** 8x8-only and `jobs@`-only spine
  rows have no WC record, so no campaign granularity — they are `direct_did` / `web_did` /
  `jobs_email` via the existing `attribution_source` / `direct_subtype` tags. This is the
  ceiling of what's knowable, not a gap. The funnel dashboard must represent "Direct /
  Untracked" as a real attribution bucket, not blanks, or these leads vanish from source
  reporting.

**Coherence note (primary rule × seeding):** under the current **first-touch** primary rule, a
seeded WC lead stays the opp's primary even after later touches enrich it — which is correct
(the origination touch wins). If the primary rule is ever switched to **nearest-the-job**,
seeded/originating leads could lose attribution to a later touch; keep the two decisions
coherent and revisit this line if the rule changes.

### 8a.1 WhatConverts primacy (source-of-truth principle)

**8x8 tells you a contact happened; WhatConverts tells you what marketing produced it.** They
answer different questions, so the presence of an 8x8 call is NEVER a reason to drop the WC
source/medium for that contact — carrying that attribution is the entire purpose of running
WhatConverts. Concretely:

- When a WC lead matches an 8x8 call (ENRICH), the WC source/medium **rides onto the
  opportunity** via the `wc_leads` array; it is not discarded because a call record already
  exists. (Verified in Phase 3: the 848 ENRICH leads append their attribution; the array
  spot-checks confirm it.)
- **Forms often have no 8x8 call at all** — a web-form submission has nothing for the phone
  system to record. For forms, WhatConverts is BOTH the event and the attribution, which is
  why a call-anchored spine cannot represent them and why the third stream must let WC
  originate, not only enrich.

**Primary = first *attributed* touch (WhatConverts primacy).** The opp primary is the earliest
WC-tracked touch in the cluster — so WhatConverts sets the lead's headline source whenever any
WC touch exists. Clarification for mixed clusters: if an un-attributed **direct 8x8 call**
occurs *before* the first WC-tracked event, the primary should still prefer the earliest
**WC-attributed** touch over the earlier un-attributed one (un-attributed direct contact is an
event, not a "source"). This is a small refinement to the first-touch derivation —
`first WC-attributed touch`, not `first touch of any kind` — and it is the precise expression
of "WhatConverts primacy."

### 8a.2 Attribution tiers for form leads (DECIDED)

The Layer 0 form parser reads only the email body, so for most form types it cannot see the
channel and defaults to `direct/(none)` when blind. The June 2026 audit found that where a form
lead exists in BOTH WC and as a parsed email they disagree 90% of the time and **WC is correct
in 100% of disagreements** (WPForms strips UTM; the parser's "Quinn Organic" is just
gclid-not-found, not a real organic channel — 6/6 such forms were actually `google/cpc` per WC).

**Decided rule (overrides the parser's blind `direct` default — nothing defaults to `direct`):**

1. **WC present (any form) → WC source/medium. Unconditional.** WC wins over parsed-email every
   time, including both-exist collapses (§8a.3). Discard the parsed-email guess.
2. **No WC + ANY Quinn form (Paid or "Organic") → `google/cpc`.** Quinn is a paid lead-gen
   channel; the parser's Organic/Paid split is a gclid-visibility artefact, not a channel
   difference. Keep full campaign/keyword/gclid for Quinn Paid where the body carries it; Quinn
   "Organic" becomes channel-level cpc (keyword from `lp_service` where present, no campaign_id).
3. **No WC + WPForms → `organic`.** Website form with no WC tracking and UTM stripped → default
   to organic.

> **Known residual (accepted):** the no-WC WPForms→organic default understates paid for the
> subset that were actually cpc (the audit's trackable WPForms split ~53% organic / ~47% cpc,
> so ~half of the ~48 no-WC WPForms may truly be paid). Bounded (~22 leads on a ~2,678 base) and
> far milder than a `direct` mislabel. WPForms-organic is a floor, not a measured channel.

### 8a.3 §7 dedup — attribution winner

When a WC form-lead and a parsed `jobs@` form-email are the same submission, the collapse is
**not neutral**: WC always wins source/medium (per 8a.2 tier 1). The parsed email still
contributes the *interaction* (form body, problem text) but contributes **nothing** to
attribution when WC is present.

## 9. Downstream impact (expected, not a regression)

- **The lead base grows.** Seeded WC-only opportunities are new opportunities, so every
  volume/funnel metric sees more leads. This is **correct and intended** — the Addendum already
  flagged that WC-only conversion rates are overstated until recomputed on the full lead base.
  Funnel denominators will move; recompute rates after the change.
- **The counting invariant protects against double-counting touches.** Counting is by
  `opportunity_id` (CLAUDE.md §7), so multiple WC touches on one opp stay one lead. The new risk
  is duplicate *opportunities* from bad seeding (§4), which the dedup mitigations address — not
  duplicate touches.
- **`vw_lead_enriched`** currently reads the scalar `wc_lead_id` off the opportunity; it will
  now also surface WC-only-originated opportunities. Confirm it carries the
  `origination_source` / `identity` tags through.

## 10. Validation plan (before/after — do not trust blind)

1. **The no-8x8 / anonymous class now appears.** The ~9–10 NULL_PHONE + NO_8x8_CALL leads from
   the 23 HAS_JOB now exist in the spine as opportunities (phone-bearing ones linkable to their
   jobs; anonymous ones present but unlinked, per §5).
2. **No double-seeding.** Every seeded row must have failed an identity match against ALL spine
   events in its cluster window. Report any opportunity whose phone/email also appears on
   another opportunity in the same window — that's a dedup miss.
3. **Exclusions hold.** Zero spam and zero non-Unique WC leads among the seeds.
4. **Volume increase is bounded and explained.** Report the count of seeded opportunities split
   by `origination_source`/`identity`, and confirm the total lead increase equals (eligible
   WC-only leads − cross-stream dedup collapses). No surprise inflation.
5. **Re-run the CSV bucket comparison.** AGREE_LINKED should rise for the phone-bearing seeds;
   no bucket should regress.
6. **Spine clustering invariant still holds** — no opportunity spans a >30-day consecutive
   internal gap after seeding.

## 11. Open decision for sign-off

- **§5 anonymous handling: (A) seed-as-flagged-standalone — DECIDED.**

## 12. DEFERRED — channel-attribution (marketing-medium) rule

Separate from the §8a *primary* (first-touch, for interaction display), define a derived
`attributed_channel` for **marketing reporting** that applies a channel-priority rule across
ALL touches in the `wc_leads` array — e.g. "any cpc touch in the cluster → PPC lead."

**This is a READ-TIME derivation off the array, not a spine write — so it is safe to defer.**
The array already stores every touch losslessly; the rule can be added later and applies
retroactively to all data. It does NOT need to be decided before Phase 4 seeds/enriches.

Decisions required when picked up (with the funnel dashboard, where the right answer is
visible from how reports read):
- **Tie-break order** when a cluster has multiple mediums. Candidate: paid (cpc) > gmb/local >
  organic > referral > direct. Sub-choice: *any-paid-touch* (cpc anywhere wins — most generous
  to paid) vs *last-paid-touch* vs *strict last-touch*.
- **Where GMB sits** (own category vs folded into organic).

**Note:** applying channel-priority will RE-CATEGORIZE existing enriched opps (an organic-primary
opp with a cpc touch becomes PPC), so the "leads by source" distribution shifts more than the
+131 new opps alone — capture before/after on the source *distribution*, not just counts, when
this lands.

Everything else in this amendment is mechanical once that's set. On sign-off, the build
sequences as: (1) eligibility + exclusions filter, (2) seed-vs-enrich identity test against all
streams, (3) cross-stream + WC-only dedup, (4) tagging, (5) rebuild opportunity layer, (6) the
§10 validation pass — one phase at a time, spine-first.
