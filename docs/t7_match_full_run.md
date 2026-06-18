# T7-MATCH Full Run — 2026-06-18

**Eligible**: 560 distinct opps (signal-based eligibility, DISTINCT guard)
**Candidates**: 8,411 rows across 555 leads (5 leads had zero candidates)
**Engine**: CC-as-classifier (Claude Code reasoning, no API)
**Prompt**: committed MATCH_SYSTEM_PROMPT in t7-classifier.ts

## Run-Level Numbers

| Metric | Count |
|---|---|
| **Eligible leads** | 560 |
| **Matched (conf >= 0.8)** | 11 |
| **Abstained** | 549 |
| **Below threshold** | 0 |
| **Account matches** | 2 |
| **COD matches** | 9 |

### Confidence Distribution

| Confidence | Count |
|---|---|
| 0.95 | 3 (Filiz Archer, Chris Kelsey, Sarah Condoleon) |
| 0.90 | 5 (Sophie Capelli, Ben Dermody, Clare Elias, Mary/Lifestyle, Peter Denham*) |
| 0.85 | 3 (Janet Howse, Oporto, Helen Owens) |

*Peter Denham was validated in the 13-lead batch but NOT confirmed by the full-run triage (fuzzy name Denham/Denholm). His validation-batch row remains in the queue with needs_audit=TRUE.

### Corroboration Breakdown

| Corroboration Type | Count | Leads |
|---|---|---|
| name+verbatim_problem | 2 | Filiz Archer, Chris Kelsey |
| verbatim_problem+name | 1 | Ben Dermody |
| phone+email+suburb | 1 | Sarah Condoleon |
| phone+name+problem | 1 | Mary/Lifestyle |
| name+problem | 5 | Janet Howse, Sophie Capelli, Helen Owens, Clare Elias, Peter Denham* |
| name+suburb+problem | 1 | Oporto |

### Account Matches with NO Location Signal (Ann-type)

**0 Account matches lack location.** Both Account matches have location:
- Sarah Condoleon: suburb = Elizabeth Bay (from lead transcript + job suburb)
- Mary/Lifestyle: suburb = Woolloomooloo (job suburb)

Ann (WC 208123762) correctly ABSTAINed — Account bar not met (first-name-only, no location).

## Per-Lead Verdicts

### MATCHES (11)

| # | WC Lead | Opp ID | Contact | JN | Client | Type | Conf | Corroboration | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 214127245 | G-28545c95 | Filiz Archer | 141035 | Filiz Archer | COD | 0.95 | name+verbatim_problem | Exact name + verbatim kitchen sink leak + washers |
| 2 | 215756822 | G-8227ef23 | Chris Kelsey | 141193 | Kelsey, Christopher | COD | 0.95 | name+verbatim_problem | Exact name + verbatim exhaust fan in bathroom |
| 3 | 232004696 | G-723e8211 | Sarah Condoleon | 142270 | Strata Embassy | Account | 0.95 | phone+email+suburb | Phone+email match (Sarah Armstrong) + suburb (Elizabeth Bay) |
| 4 | 230563333 | G-025084ce | Sophie Capelli | 142192 | Sophie Capelli | COD | 0.90 | name+problem | Exact name + problem (power point in kitchen) |
| 5 | 236286440 | G-c5393d85 | Ben | 142586 | Ben Dermody | COD | 0.90 | verbatim_problem+name | Verbatim fingerprint (LED lights+garden+wall+switch covers) + weak name |
| 6 | 238745838 | G-1f9388eb | Claire Elias | 142760 | Clare Elias | COD | 0.90 | name+problem | Name (Claire=Clare Elias) + problem (sensor light removal/replacement) |
| 7 | 215597161 | G-f8b0b2c6 | Mary (Lifestyle) | 141183 | Jamesons Strata | Account | 0.90 | phone+name+problem | Phone match (Mary Laktaridis +61499540288) + blocked drain + exhaust fan |
| 8 | 210835017 | G-51043f41 | Peter Denham | 140878 | Peter Denholm | COD | 0.90 | name+problem | Name (Denham~Denholm) + problem (leaking shower taps) [validation-batch only] |
| 9 | 214123961 | G-0ee9bc4e | Janet Howse | 141030 | Howse Janet | COD | 0.85 | name+problem | Name reversed (Janet Howse=Howse Janet) + problem (water heater+toilets) |
| 10 | 221688028 | G-0985d088 | Oporto caller | 141556 | Oporto | COD | 0.85 | name+suburb+problem | Business name (Oporto) + suburb (Erskineville) + problem (power/POS) |
| 11 | 223847706 | G-49833bde | Helen (neighbour) | 141721 | Helen Owens | COD | 0.85 | name+problem | Name (Helen) + problem (power board) + context (neighbour helping) |

### ABSTAINS — Signal Leads (22 leads evaluated individually)

| WC Lead | Contact | Reason |
|---|---|---|
| 233062512 | Alex | First-name-only "Alex" + suburb "Sydney" too generic + problem mismatch (wax in sink vs periodic sewer jetting) |
| 222598005 | Con | First-name-only "Con" + suburb "Kensington" but no candidate name/problem match (calling for elderly woman, no power) |
| 232083709 | Vitele Petelo | FALSE email match — company email jobs@mrwasher.com.au in both lead content and job description |
| 230348558 | Michele Cheong | FALSE email match (company email) + lead explicitly cancelled ("resolved, no longer needs anyone") |
| 208142794 | Nadia Lillecrapp | Suburb match (Newtown) but problem mismatch (toilet replace vs strata scheme quote) |
| 240770440 | (AUSTRALIA) | Contact name "AUSTRALIA" not a real name + no signal match with any candidate |
| 222104276 | Monica (PropertyMe) | Suburb "Sydney" too generic + caller is from property software company, not a resident |
| 226236883 | Alex M | FALSE phone+email match — Alex Mitchell is INTERNAL STAFF (Office Administrator), not a customer |
| 230502067 | Ritu D | Suburb "Castle Hill" no candidate match + "plumber to" in description is brand name not content |
| 230925434 | Nadine Fornara | FALSE email match (company email) + lead is unanswered callback ("called, no answer, left vm") |
| 227696770 | Aadi Gakhar | Suburb "Sydney" too generic + unanswered callback |
| 214037652 | Jake | First-name-only "Jake" + problem mismatch (kitchen tap pressure vs blocked storm water downpipe) |
| 213376392 | Eve Metz | Outside service area (Southbank/Melbourne) + FALSE email match (company email) |
| 205894463 | Simon | First-name-only "Simon" + "Simon" in descriptions = staff electrician, not customer |
| 223695223 | Asti | No name match + problem mismatch (sink behind wall vs outdoor tap leak) |
| 240767626 | (AUSTRALIA) | Digital marketing sales call (Lewis from "your digital") — not a customer |
| 231135220 | Taitusi Masiva | FALSE email match with Mr Washer "spare" placeholder jobs |
| 225048179 | Les | First-name-only + problem mismatch (intercom replacement vs loose powerpoint) |
| 220934366 | Ria | Not a job request (seeking apprenticeship/work placement) |
| 211920303 | Mel/Nell | Suburb "Sydney" too generic + no name match |
| 231821345 | Bunbury Au | Not in Sydney service area (Bunbury, WA) |
| 236529358 | Yijun Zhong | Corrupted suburb field ("Erskineville Message: Now the power comp") + no candidate match |

### ABSTAINS — No-Signal Leads (528 leads)

All 528 leads with zero pre-computed signals (no phone_match, no email_match, no name similarity with any candidate, no suburb match, no content overlap). Under the MATCH_SYSTEM_PROMPT, the >=2 signal bar cannot be met with zero matching dimensions. Correctly classified as ABSTAIN.

## Known Limitations

1. **Fuzzy name matching**: Peter Denham (Denham~Denholm, 1-edit distance) was caught in the 13-lead validation but NOT by the full-run triage. The triage uses exact/substring matching; fuzzy name matching requires NLP or edit-distance computation not currently in the SQL triage. Estimated miss rate: ~1-3 leads in 560 (0.2-0.5%).

2. **Company email false positives**: 6 of 8 email_match leads were false — jobs@mrwasher.com.au appears in both lead content (as email sender) and job descriptions (as company address). The email extraction in t7_match_candidates.sql STEP 3 should exclude known company emails. Filed for fix.

3. **Staff phone/email conflation**: Alex Mitchell (internal staff) triggered phone+email match because his contact details appear on jobs he coordinates. The conflation guard (STEP 1) only checks description-embedded phones, not structured contact fields. Filed for fix.

## Write Summary

| Table | Pre-existing | New | Total |
|---|---|---|---|
| crm_account_exclusions (auto:t7_match) | 1 (Sarah) | 1 (Mary) | 2 |
| crm_t7_match_queue (auto:t7_match) | 9 | 0 | 9 |
| **Total flagged** | 10 | 1 | **11** |

All rows needs_audit=TRUE. Zero appear in dashboard funnel, vw_lead_enriched is_account, or vw_economics.
