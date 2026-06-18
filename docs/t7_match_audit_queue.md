# T7-MATCH Audit Queue — Riskiest First

**All rows needs_audit=TRUE. Review before clearing any flag.**

Ranked by risk: lowest confidence first, then Account matches (higher consequence),
then verbatim-fingerprint-only (single-signal exception), then near-boundary cases.

---

## TIER 1: Lowest Confidence (0.85) — Review First

### 1. Oporto (WC 221688028) — conf 0.85, COD Electrical
- **Lead**: Caller from "Oporto Escanville", needs electrician, power issue
- **Job**: JN 141556, Oporto, COD Electrical, Erskineville. "power has tripped off circuit for POS system"
- **Corroboration**: name+suburb+problem
- **Evidence**: Business name (Oporto=Oporto) + suburb (Escanville~Erskineville) + problem (power/POS)
- **Risk**: Suburb is phonetic transcription match (Escanville≈Erskineville). No personal name — matched on business name. Caller doesn't give personal name. Moderate risk.

### 2. Helen Owens (WC 223847706) — conf 0.85, COD Electrical
- **Lead**: Neighbour calling on Helen's behalf. "switch going off in power board", phone line affected
- **Job**: JN 141721, Helen Owens, COD Electrical. "lost most of her powerpoints, neighbour helping with extension cord"
- **Corroboration**: name+problem
- **Evidence**: Name (Helen, first-only but corroborated) + problem (power board/powerpoints) + distinctive context (neighbour helping — appears on both sides)
- **Risk**: First-name-only "Helen". The neighbour-helping context is distinctive but not a formal signal dimension. Low-moderate risk.

### 3. Janet Howse (WC 214123961) — conf 0.85, COD Plumbing
- **Lead**: "Janet Howse, Rinnai water heater no hot water + toilet roll holders + toilet seats"
- **Job**: JN 141030, Howse Janet, COD Plumbing. "Janet called, 3 x toilets delivered, Nathan to do work"
- **Corroboration**: name+problem
- **Evidence**: Reversed name (Janet Howse = Howse Janet) + problem (water heater + toilets on both sides)
- **Risk**: Mislabelled lead (ETTR profile, plumbing problem). Recovered via hybrid other-trade bucket. The specific problems differ slightly (lead: no hot water + toilet seats; job: toilets delivered + warranty) but same customer, same home. Low risk.

---

## TIER 2: Account Matches (higher consequence — sets is_account + exclude_from_analysis)

### 4. Sarah Condoleon (WC 232004696) — conf 0.95, Account Plumbing
- **Lead**: Sarah, 13 Onslow Ave Elizabeth Bay, unit 8, blocked toilet, asks for Strata Embassy
- **Job**: JN 142270, Strata Embassy, Account Plumbing, Elizabeth Bay. "U8 Owner Sarah Armstrong 0402 000 542, sarahjarmstrong@bigpond.com"
- **Corroboration**: phone+email+suburb
- **Evidence**: PHONE_MATCH + EMAIL_MATCH + suburb (Elizabeth Bay). Triple hard identity.
- **Risk**: Very low. Triple identity match. Name discrepancy (Condoleon vs Armstrong) explained by married/maiden name — phone and email confirm same person.

### 5. Mary / Lifestyle Property (WC 215597161) — conf 0.90, Account Plumbing
- **Lead**: "Mary from Lifestyle Property Agency, organizing for Andrew Tingley, blocked drain + exhaust fan"
- **Job**: JN 141183, Jamesons Strata, Account Plumbing, Woolloomooloo. "RE Agent Mary Laktaridis 0499 540 288, blocked drain + exhaust fan not working"
- **Corroboration**: phone+name+problem
- **Evidence**: PHONE_MATCH (Mary Laktaridis +61499540288) + problem (blocked drain + exhaust fan verbatim) + name (Mary). Andrew Tingley referenced on both sides.
- **Risk**: Low. Phone match is authoritative. Mary is the property agent intermediary, not the resident — but the match is correct (she organized the job).

---

## TIER 3: Verbatim-Fingerprint Matches (single-signal exception in match bar)

### 6. Ben Dermody (WC 236286440) — conf 0.90, COD Electrical
- **Lead**: "Name: Ben. Problem: LED lights not working, replace drivers. Garden lights not working, external wall lights not working. Light switch covers need replacing"
- **Job**: JN 142586, Ben Dermody, COD Electrical. Same problem text word-for-word.
- **Corroboration**: verbatim_problem+name
- **Evidence**: Verbatim problem fingerprint (multi-clause fault list) + weak name (Ben→Ben Dermody, first-name-only = the literal "two Steves in Eastwood" trap example in the prompt)
- **Risk**: The verbatim fingerprint is strong (4-clause distinctive text). "Ben" first-name-only is formally insufficient alone but the fingerprint carries it. Low risk — the problem text is too distinctive to be coincidence.

---

## TIER 4: Standard Matches (conf >= 0.90, strong signals)

### 7. Filiz Archer (WC 214127245) — conf 0.95, COD Plumbing
- **Lead**: "Filiz Archer, kitchen sink leak + three washers changed"
- **Job**: JN 141035, Filiz Archer. Same problem verbatim.
- **Corroboration**: name+verbatim_problem
- **Risk**: Very low. Exact full name + verbatim problem.

### 8. Chris Kelsey (WC 215756822) — conf 0.95, COD Electrical
- **Lead**: "Chris Kelsey, Exhaust Fan in Bathroom"
- **Job**: JN 141193, Kelsey Christopher. "Chris Kelsey, Exhaust Fan in Bathroom no longer operable"
- **Corroboration**: name+verbatim_problem
- **Risk**: Very low. Exact full name + verbatim problem.

### 9. Sophie Capelli (WC 230563333) — conf 0.90, COD Electrical
- **Lead**: "Sophie Capelli, install new power point in kitchen"
- **Job**: JN 142192, Sophie Capelli. Same problem.
- **Corroboration**: name+problem
- **Risk**: Very low. Exact distinctive full name + matching problem.

### 10. Clare Elias (WC 238745838) — conf 0.90, COD Electrical
- **Lead**: "Claire Elias, sensor light removal + install customer supplied"
- **Job**: JN 142760, Clare Elias. "remove existing sensor light, install customer supplied"
- **Corroboration**: name+problem
- **Risk**: Very low. Name spelling variant (Claire/Clare) + matching problem.

### 11. Peter Denham (WC 210835017) — conf 0.90, COD Plumbing [VALIDATION ONLY]
- **Lead**: "Peter Denham, Lindfield, leaking shower taps, returning customer"
- **Job**: JN 140878, Peter Denholm. "shower taps leaking from showerhead, did work here last year"
- **Corroboration**: name+problem
- **Evidence**: Fuzzy name (Denham~Denholm, 1-edit distance) + problem (leaking shower taps) + returning customer context
- **Risk**: Low, but NOTE: this match was validated in the 13-lead batch but NOT confirmed by the full-run triage (fuzzy name not caught by substring matching). Row exists in queue from validation write.

---

## Summary for Audit

| Risk Tier | Count | Action |
|---|---|---|
| Tier 1 (lowest confidence) | 3 | Review evidence carefully |
| Tier 2 (Account, high consequence) | 2 | Verify person identity before promoting |
| Tier 3 (verbatim fingerprint) | 1 | Confirm the fingerprint is genuinely distinctive |
| Tier 4 (standard, strong) | 5 | Quick verify, likely approve |
| **Total** | **11** | |

**To promote a match**: clear needs_audit=FALSE on the row. Account matches will then set is_account+exclude_from_analysis in vw_lead_enriched; COD matches will be available for the §6 tier when added to build_opportunities.sql.

**To reject a match**: DELETE the row from crm_account_exclusions or crm_t7_match_queue.
