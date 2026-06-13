# SMS-JN Linkage Tier — Reconciliation Result

**Query date**: 2026-06-12
**Revenue source**: `pttr-taskdata.ds_aroflo.vw_job_invoiced.invoiced_total_ex`
(line-level invoice sum from `invoices_deduped` WHERE status IN 'processed','approved';
column is `totalex` = ex-GST at source, verified against raw invoice lines — no dividing by 1.1)

## Compound-Key Logic

The tier links unlinked COD opportunities to Account jobs using MessageMedia SMS
reply notifications in `ds_crm.raw_emails_received`. Two keys applied simultaneously:

1. **OPP side (phone key)**: SMS sender phone (parsed from subject, normalized to
   `+61` E.164) = `opportunities.phone` WHERE `opp_type = 'gap_based'`
2. **JOB side (JN key)**: JN extracted from SMS body (`r'JN#?\s*(\d{5,6})'`) =
   `tasks_complete.jobnumber` WHERE `customer_type = 'Account'`

The Account job is matched by JN, NOT by phone. Per CLAUDE.md §16:
`"Match: SMS sender phone = opp phone + JN in SMS body = Account job."`

### Phone parsing

MessageMedia subjects use two formats:
- Bare: `"New SMS reply received from 61XXXXXXXXX"` (93.4%)
- Named: `"New SMS reply received from Name (61XXXXXXXXX)"` (6.1%)
- Unparseable: rejected/other (0.5%)

Regex: `COALESCE(REGEXP_EXTRACT(subject, r'from (\d{10,13})$'), REGEXP_EXTRACT(subject, r'\((\d{10,13})\)$'))`
Then: `CONCAT('+', raw_digits)` to produce E.164.

**Format mismatch warning**: MessageMedia stores `61...` (bare), opportunities store
`+61...` (E.164). Without `CONCAT('+', ...)`, the join returns zero rows silently.

### JN source in SMS body

The JN appears in the **Original Message echo** — the CSR's outbound SMS (containing the
JN in their signature/message) is quoted in the customer's reply notification. The JN
identifies which job the CSR was texting the resident about.

## Excluded Phones (strata-manager contamination)

Three phones appear on 6+ Account jobs by `norm_client_phone`/`id_phone`, indicating
they are account-level contacts (facility/strata managers), not residents:

| Phone | Total Account Jobs | Matched JN | Client |
|---|---|---|---|
| +61410220524 | 110 | 107079 | Menzies Aviation Group |
| +61425277942 | 109 | 105130 | Boston University Sydney Program |
| +61404467358 | 38 | 140165 | Birch & Waite Foods P/L |

**Impact of exclusion**: 3 jobs, $3,114 revenue removed.

### Phone role decomposition (of 143 pre-exclusion phones)

| Role | Phones | % |
|---|---|---|
| 0 Account jobs by client phone (resident) | 134 | 94% |
| 1 Account job | 5 | 3% |
| 2-5 Account jobs | 1 | <1% |
| 6+ Account jobs (strata manager, excluded) | 3 | 2% |

## Final Counts (post-exclusion)

| Metric | Count |
|---|---|
| Distinct resident phones | **140** |
| Distinct Account jobs (total signal) | **196** |
| COD opps flagged (total signal) | **236** |
| Realized Account revenue now attributed to linked opps (ex-GST) | **$571,298.70** |
| — newly connected by this tier (192 JNs, 232 docs) | **$553,430.70** |
| — previously connected via admin links (4 JNs, 4 docs) | **$17,868.00** |
| Jobs with $0 invoiced | 15 (see breakdown below) |
| Distinct Account clients (total signal, by JN) | 35 |
| Distinct Account clients (primary on written docs) | 31 (4 clients appear only as non-primary JNs in linked_jobs) |

**Note on `account_id`**: The doc's `account_id` and `account_name` identify the
primary client (from the highest-invoiced JN selected as `revenue_job`). For the
20 opps whose `linked_jobs` span multiple Account clients, the non-primary
clients' JNs are still in the array. Revenue is always attributed per-job to
each JN's own client in BQ (`vw_accounts` joins on `tasks_deduped.client_clientid`),
not from the Firestore doc's single `account_id`. The doc field is a display
label only — it does not control revenue attribution.

### What These Numbers Mean

This tier is **attribution, not recovered revenue**. The $571,299 / $553,431 was
always realized Account revenue — already invoiced in AroFlo as strata jobs,
already excluded from COD ROAS by design. Nothing was hiding and no money was
found, added, or moved.

What the tier changes is **visibility**: 232 COD-line lead opportunities that
previously looked like dead non-converting COD calls are now correctly connected
to the Account jobs they generated and flagged out of COD analysis. The dollar
figures measure revenue **newly connected to lead records**, not new revenue.

### Revenue Attribution Breakdown

- **$553,431** = realized Account revenue now **attributable** to the 232
  sms_jn_tier-linked opportunities — this tier's new connections (192 distinct
  Account jobs across 232 Firestore docs written on 2026-06-12).
- **$17,868** = realized Account revenue on 4 Account jobs already connected
  via prior admin links (JNs 111325, 136020, 142638, 142724 — skipped, not
  overwritten).
- **$571,299** = total realized Account revenue in this signal (196 distinct
  Account jobs), including both new and pre-existing connections.

### Value of This Tier

1. **COD ROAS accuracy**: 232 non-ad-generated calls are correctly excluded from
   the COD funnel denominator. Rates computed against the COD opportunity set
   (booking rate, conversion rate, ROAS) are now cleaner — these were strata
   residents calling about Account work, not failed COD leads.
2. **Lead→Account-job connection**: the relationship between the COD-line call
   and the Account job it generated now exists where it previously didn't. The
   CRM can surface the full journey for these residents.

Neither is a revenue gain — both are data-quality improvements.

### Briefing Paper Framing

> The strata work was always earned and invoiced. The COD-framed view simply
> couldn't see that ~$553K of realized Account revenue traces back to leads
> that looked like dead COD calls. This tier connects those leads to their
> Account jobs and removes them from COD analysis — it does not change any
> revenue figure, only where the lead attribution points.

### $0-Invoiced Jobs (15 of 196)

All 15 have zero invoices of ANY status (not just unprocessed — no invoice record at all).

**(a) Account-level-billed** (12 jobs) — Archived/Completed, no per-job invoice.
Per §14: ~20% of Account/Strata jobs have no per-job invoice (billed at monthly
Account statement level). These are real completed work with revenue billed elsewhere.

| JN | Client | Status | Classification |
|---|---|---|---|
| 103474 | Bright & Duggan Pty Ltd | Archived | account-level-billed |
| 112782 | Company Title Management Pty Ltd | Archived | account-level-billed |
| 115233 | Strata Choice | Archived | account-level-billed |
| 115618 | Clique Property | Archived | account-level-billed |
| 117415 | Bright & Duggan Pty Ltd | Archived | account-level-billed |
| 118118 | Clique Property | Archived | account-level-billed |
| 118852 | Strata Choice | Archived | account-level-billed |
| 122583 | Strata Choice | Archived | account-level-billed |
| 127303 | Clique Property | Archived | account-level-billed |
| 135407 | Strata Plus Pty Ltd | Archived | account-level-billed |
| 137597 | The Strata Collective | Archived | account-level-billed |
| 140825 | Strata Choice | Archived | account-level-billed |

**(b) Genuinely uninvoiced / in-progress** (3 jobs) — Open quotes or recently completed.

| JN | Client | Status | Classification |
|---|---|---|---|
| 141563 | Responsive Strata Management | Open/Quote | uninvoiced (quote stage) |
| 142583 | Whelan Property Group | Completed | uninvoiced (recently completed, pending) |
| 142724 | Sydney Strata Plumbing | Open/Quote | uninvoiced (quote stage) |

All 15 remain in the link set — $0 Account link is still a correct COD-funnel exclusion.

## Client Concentration

| Client | Matched Jobs |
|---|---|
| Bright & Duggan Pty Ltd | 72 |
| Strata Choice | 30 |
| Whelan Property Group | 17 |
| Strata Plus Pty Ltd | 8 |
| Premium Strata Pty Ltd | 7 |
| Strata Republic Pty Ltd | 7 |
| Neighbourly Strata (Len Robinson) | 7 |
| Jamesons Strata Management | 5 |
| Clique Property | 5 |
| More Than Strata | 4 |
| Other (25 clients) | 30 |

## Divergence from CLAUDE.md S16

S16 claimed: 206 opps, 151 jobs, 116 phones, $430,868 invoiced.
This run: 236 opps, 196 jobs, 140 phones, $571,299 invoiced.

**Cannot decompose dollar-by-dollar** — S16 recorded no job list, no date, no query.
Likely causes of divergence:
- Opportunities table rebuilt daily; new gap_based opps since S16 = more phone matches
- Invoices landed on previously-pending jobs since S16
- Phone parse improved (named-parenthesized format captured, +993 subjects)

## Fan-Out Warning

One phone may appear on multiple gap_based opps (avg 1.7 opps/phone, max 10).
Revenue must ALWAYS be summed over DISTINCT jobnumbers, never over join rows.
The earlier $1,072,650 figure was 1.87x inflated by opp fan-out on a join-row SUM.

## Reproducibility Query

```sql
-- SMS-JN Tier: compound-key linkage of COD opps to Account jobs
-- Revenue source: vw_job_invoiced.invoiced_total_ex (ex-GST, verified)
-- Run date: 2026-06-12

WITH sms_parsed AS (
  SELECT
    CONCAT('+', COALESCE(
      REGEXP_EXTRACT(subject, r'from (\d{10,13})$'),
      REGEXP_EXTRACT(subject, r'from \+(\d{10,13})$'),
      REGEXP_EXTRACT(subject, r'\((\d{10,13})\)$')
    )) AS norm_phone,
    REGEXP_EXTRACT(body_text, r'JN#?\s*(\d{5,6})') AS jn_from_body
  FROM `pttr-taskdata.ds_crm.raw_emails_received`
  WHERE (LOWER(from_email) LIKE '%message-media%'
      OR LOWER(from_email) LIKE '%messagemedia%')
),
sms_with_jn AS (
  SELECT DISTINCT norm_phone, jn_from_body
  FROM sms_parsed
  WHERE norm_phone IS NOT NULL
    AND norm_phone != '+'
    AND jn_from_body IS NOT NULL
),
unlinked_cod AS (
  SELECT DISTINCT phone
  FROM `pttr-taskdata.ds_crm.opportunities`
  WHERE opp_type = 'gap_based'
    AND phone IS NOT NULL
),
account_jobs AS (
  SELECT CAST(jobnumber AS STRING) AS jn_str, jobnumber, client_name
  FROM `pttr-taskdata.ds_aroflo.tasks_complete`
  WHERE customer_type = 'Account'
),
-- Excluded strata-manager phones (6+ Account jobs by client phone)
excluded_phones AS (
  SELECT phone FROM UNNEST([
    '+61410220524',  -- Menzies Aviation Group (110 Account jobs)
    '+61425277942',  -- Boston University Sydney Program (109)
    '+61404467358'   -- Birch & Waite Foods P/L (38)
  ]) AS phone
),
matched AS (
  SELECT DISTINCT a.jobnumber, a.client_name, s.norm_phone AS resident_phone
  FROM unlinked_cod u
  JOIN sms_with_jn s ON u.phone = s.norm_phone
  JOIN account_jobs a ON s.jn_from_body = a.jn_str
  WHERE s.norm_phone NOT IN (SELECT phone FROM excluded_phones)
)
-- ALWAYS aggregate on DISTINCT jobnumber — never on join rows
SELECT
  COUNT(DISTINCT resident_phone) AS distinct_phones,
  COUNT(DISTINCT jobnumber) AS distinct_jobs,
  SUM(COALESCE(inv.invoiced_total_ex, 0)) AS revenue_ex_gst
FROM (SELECT DISTINCT jobnumber FROM matched) dj
LEFT JOIN `pttr-taskdata.ds_aroflo.vw_job_invoiced` inv ON dj.jobnumber = inv.jobnumber
```

## Distinct Account Job List (196 jobs)

| JN | Client | Resident Phone | Invoiced Ex-GST |
|---|---|---|---|
| 100133 | GK Strata Management | +61410926955 | $3,145.00 |
| 102167 | ProActive Strata Services | +61498008437 | $4,796.00 |
| 102189 | Premium Strata Pty Ltd | +61407703669 | $1,030.00 |
| 103474 | Bright & Duggan Pty Ltd | +61450558228 | $0.00 |
| 103863 | Mowszowski Hanan | +61419477805 | $582.00 |
| 105657 | Bright & Duggan Pty Ltd | +61418112557 | $988.00 |
| 107198 | Bright & Duggan Pty Ltd | +61420289597 | $810.25 |
| 107752 | Strata Republic Pty Ltd | +61401308476 | $384.00 |
| 108486 | Whelan Property Group | +61413868707 | $10,994.00 |
| 108498 | Strata Choice | +61402323433 | $4,385.00 |
| 108876 | Jamesons Strata Management | +61410926955 | $8,798.00 |
| 108944 | Bright & Duggan Pty Ltd | +61416165495 | $970.50 |
| 108946 | Bright & Duggan Pty Ltd | +61417252068 | $352.00 |
| 109281 | Bright & Duggan Pty Ltd | +61421321475 | $3,524.00 |
| 109728 | Whelan Property Group | +61413868707 | $1,500.00 |
| 109837 | Bright & Duggan Pty Ltd | +61406320399 | $1,984.00 |
| 109937 | Bright & Duggan Pty Ltd | +61409031745 | $362.00 |
| 110375 | Neighbourly Strata | +61403133302 | $1,623.00 |
| 110897 | Bright & Duggan Pty Ltd | +61450558228 | $823.00 |
| 111325 | Strata Republic Pty Ltd | +61430397435 | $16,686.00 |
| 111461 | Premium Strata Pty Ltd | +61415551562 | $2,668.00 |
| 111613 | Bright & Duggan Pty Ltd | +61405444990 | $508.80 |
| 111779 | Whelan Property Group | +61413868707 | $597.00 |
| 112434 | Strata Choice | +61438846125 | $1,797.00 |
| 112526 | Bright & Duggan Pty Ltd | +61419258510 | $9,668.00 |
| 112782 | Company Title Management Pty Ltd | +61418460319 | $0.00 |
| 113109 | Whelan Property Group | +61410636168 | $1,910.00 |
| 113538 | Jamesons Strata Management | +61416209198 | $4,961.00 |
| 113693 | Bright & Duggan Pty Ltd | +61432691728 | $1,189.00 |
| 113814 | Strata Republic Pty Ltd | +61411174420 | $490.00 |
| 113895 | Strata Plus Pty Ltd | +61414225005 | $1,230.00 |
| 114170 | Strata Choice | +61431874078 | $5,057.00 |
| 114194 | Whelan Property Group | +61418422122 | $2,683.00 |
| 114254 | Strata Choice | +61412656386 | $489.00 |
| 114438 | Bright & Duggan Pty Ltd | +61409248622 | $1,167.00 |
| 114466 | Strata Choice | +61412664889 | $912.50 |
| 114516 | Premium Strata Pty Ltd | +61488424019 | $656.00 |
| 114641 | Bright & Duggan Pty Ltd | +61412892097 | $13,909.00 |
| 114712 | Strata Choice | +61401363799 | $1,978.50 |
| 114765 | Whelan Property Group | +61413868707 | $655.00 |
| 114829 | Whelan Property Group | +61418422122 | $1,998.00 |
| 114885 | Alldis & Cox (Coogee) Pty Ltd | +61423060356 | $297.00 |
| 115096 | Eling Strata Management Pty Ltd | +61414908112 | $1,112.00 |
| 115233 | Strata Choice | +61401717208 | $0.00 |
| 115269 | Bright & Duggan Pty Ltd | +61417225535 | $7,533.00 |
| 115303 | Bright & Duggan Pty Ltd | +61423771478 | $267.00 |
| 115440 | Bright & Duggan Pty Ltd | +61413131078 | $1,735.00 |
| 115478 | Strata Plus Pty Ltd | +61438275889 | $287.00 |
| 115564 | Neighbourly Strata | +61403133302 | $3,820.00 |
| 115618 | Clique Property | +61450309285 | $0.00 |
| 115707 | Bright & Duggan Pty Ltd | +61410703612 | $490.00 |
| 115726 | Bright & Duggan Pty Ltd | +61403066095 | $840.00 |
| 116282 | Neighbourly Strata | +61419477805 | $2,974.00 |
| 116591 | Bright & Duggan Pty Ltd | +61419111779 | $748.00 |
| 116802 | Y Strata | +61414225005 | $1,961.00 |
| 116919 | Premium Strata Pty Ltd | +61402676842 | $2,995.00 |
| 117061 | Bright & Duggan Pty Ltd | +61452212057 | $10,349.00 |
| 117415 | Bright & Duggan Pty Ltd | +61452212057 | $0.00 |
| 117758 | Bright & Duggan Pty Ltd | +61413131078 | $1,150.00 |
| 117876 | Bright & Duggan Pty Ltd | +61423771478 | $1,668.00 |
| 118115 | Strata Choice | +61412664889 | $7,407.00 |
| 118118 | Clique Property | +61459028673 | $0.00 |
| 118333 | Strata Choice | +61408516234 | $352.00 |
| 118760 | Strata Choice | +61438846125 | $13,299.00 |
| 118852 | Strata Choice | +61413089235 | $0.00 |
| 119151 | Strata Choice | +61401717208 | $2,100.00 |
| 119435 | Bright & Duggan Pty Ltd | +61418212048 | $456.00 |
| 119632 | Neighbourly Strata | +61411255447 | $2,636.00 |
| 119768 | Strata Choice | +61401717208 | $1,983.00 |
| 120082 | Bright & Duggan Pty Ltd | +61421847866 | $2,420.00 |
| 120980 | Strata Edge | +61408629754 | $751.00 |
| 121407 | Strata Choice | +61438846125 | $992.00 |
| 121446 | Bright & Duggan Pty Ltd | +61452229370 | $734.00 |
| 121519 | Strata Choice | +61417423937 | $2,277.00 |
| 121631 | Bright & Duggan Pty Ltd | +61420289597 | $2,548.00 |
| 122270 | Strata Plus Pty Ltd | +61413435437 | $5,925.00 |
| 122386 | Bright & Duggan Pty Ltd | +61417977877 | $1,030.00 |
| 122583 | Strata Choice | +61417423937 | $0.00 |
| 122637 | Bright & Duggan Pty Ltd | +61402856961 | $589.22 |
| 122911 | Strata Republic Pty Ltd | +61438548033 | $1,235.00 |
| 123015 | Jamesons Strata Management | +61420289597 | $2,574.00 |
| 123033 | Strata Choice | +61452378108 | $365.00 |
| 123157 | Strata Choice | +61431116100 | $1,980.00 |
| 123387 | Bright & Duggan Pty Ltd | +61414557531 | $437.00 |
| 123688 | Bright & Duggan Pty Ltd | +61450609505 | $1,113.00 |
| 123929 | Strata Choice | +61438846125 | $2,190.00 |
| 123937 | Lamb & Walters Strata Management | +61400125362 | $11,601.00 |
| 124636 | Bright & Duggan Pty Ltd | +61412745460 | $5,843.00 |
| 124707 | Bright & Duggan Pty Ltd | +61410509904 | $3,984.00 |
| 124790 | Bright & Duggan Pty Ltd | +61419111779 | $8,271.00 |
| 124868 | Bright & Duggan Pty Ltd | +61406320399 | $779.00 |
| 125338 | Strata Plus Pty Ltd | +61411161888 | $26,044.46 |
| 125404 | Neighbourly Strata | +61419477805 | $4,828.00 |
| 125521 | Bright & Duggan Pty Ltd | +61406320399 | $1,284.00 |
| 125854 | Bright & Duggan Pty Ltd | +61413131078 | $2,956.00 |
| 127303 | Clique Property | +61459028673 | $0.00 |
| 128520 | Bright & Duggan Pty Ltd | +61418400280 | $2,755.00 |
| 128776 | Sarraf Strata | +61417496514 | $6,522.00 |
| 128965 | Bright & Duggan Pty Ltd | +61409248622 | $486.00 |
| 129011 | Bright & Duggan Pty Ltd | +61459872782 | $10,676.55 |
| 129371 | Strata Republic Pty Ltd | +61411174420 | $2,522.00 |
| 130501 | Bright & Duggan Pty Ltd | +61418212048 | $1,987.00 |
| 130638 | Bright & Duggan Pty Ltd | +61423334567 | $5,446.00 |
| 131270 | Neighbourly Strata | +61400005673 | $352.00 |
| 131426 | Jamesons Strata Management-Double Bay | +61432234472 | $994.00 |
| 131712 | Whelan Property Group | +61412482260 | $2,136.00 |
| 131974 | Bright & Duggan Pty Ltd | +61412439937 | $1,000.00 |
| 132034 | Premium Strata Pty Ltd | +61477440076 | $3,022.00 |
| 132059 | Strata Choice | +61402323433 | $770.00 |
| 132272 | Jamesons Strata Management | +61416209198 | $990.00 |
| 132637 | Bright & Duggan Pty Ltd | +61413131078 | $2,420.00 |
| 133138 | Neighbourly Strata | +61400005673 | $2,482.00 |
| 133143 | Strata Plus Pty Ltd | +61408845970 | $8,093.00 |
| 133334 | Premium Strata Pty Ltd | +61477440076 | $3,032.00 |
| 133708 | Strata Choice | +61419218281 | $672.00 |
| 133722 | Bright & Duggan Pty Ltd | +61402856961 | $2,913.00 |
| 133727 | Ready Strata Management | +61460002676 | $11,019.00 |
| 133816 | Whelan Property Group | +61422887422 | $1,994.00 |
| 133955 | Strata Choice | +61431116100 | $1,458.00 |
| 134068 | Bright & Duggan Pty Ltd | +61448998960 | $2,930.00 |
| 134394 | Strata Choice | +61432064755 | $14,461.00 |
| 134787 | Jamesons Strata Management | +61416209198 | $1,000.00 |
| 134864 | Bright & Duggan Pty Ltd | +61412348670 | $5,135.00 |
| 134886 | Strata Republic Pty Ltd | +61423052719 | $6,564.00 |
| 134906 | Strata Choice | +61418964514 | $529.00 |
| 135159 | More Than Strata | +61409363143 | $3,244.00 |
| 135176 | Strata Choice | +61408772275 | $1,473.00 |
| 135209 | Bright & Duggan Pty Ltd | +61419258510 | $2,856.00 |
| 135211 | Bright & Duggan Pty Ltd | +61421847866 | $5,300.00 |
| 135245 | Bright & Duggan Pty Ltd | +61449998799 | $1,418.00 |
| 135407 | Strata Plus Pty Ltd | +61407107222 | $0.00 |
| 135580 | More Than Strata | +61418329880 | $452.00 |
| 135732 | Clique Property | +61414908112 | $592.00 |
| 135894 | Strata Choice | +61401717208 | $1,298.00 |
| 135921 | Bright & Duggan Pty Ltd | +61419111779 | $942.00 |
| 136020 | Premium Strata Pty Ltd | +61415745386 | $445.00 |
| 136025 | Gordon Robinson Real Estate | +61419477805 | $452.00 |
| 136467 | Bright & Duggan Pty Ltd | +61402856961 | $184.00 |
| 136558 | Whelan Property Group | +61412482260 | $848.00 |
| 136756 | Stratawide Management | +61425299866 | $588.00 |
| 136776 | C/- Strata Partners | +61448763163 | $4,124.00 |
| 137073 | C/- Strata Partners | +61438803367 | $1,104.00 |
| 137080 | Bright & Duggan Pty Ltd | +61451717888 | $592.00 |
| 137214 | The Strata Collective | +61432973488 | $3,540.00 |
| 137351 | Bright & Duggan Pty Ltd | +61421847866 | $2,300.00 |
| 137539 | Bright & Duggan Pty Ltd | +61407459490 | $528.00 |
| 137582 | Verve Strata | +61449647855 | $452.00 |
| 137597 | The Strata Collective | +61447309970 | $0.00 |
| 137602 | Whelan Property Group | +61451025789 | $2,367.00 |
| 137611 | Bright & Duggan Pty Ltd | +61417423188 | $16,709.00 |
| 137909 | Stratawide Management | +61421669112 | $2,584.00 |
| 138018 | MacKillop Family Services | +61477547753 | $4,468.00 |
| 138535 | Strata Choice | +61423196816 | $4,944.00 |
| 138674 | Mason & Brophy Strata Management | +61439256886 | $2,416.00 |
| 138724 | Bright & Duggan Pty Ltd | +61431293714 | $2,020.00 |
| 138838 | Whelan Property Group | +61412482260 | $3,823.00 |
| 138902 | Strata Choice | +61450276104 | $6,836.00 |
| 138995 | Bright & Duggan Pty Ltd | +61415955636 | $5,191.00 |
| 139000 | Lamb & Walters Strata Management | +61460111222 | $2,393.00 |
| 139190 | Strata Plus Pty Ltd | +61434197181 | $1,069.00 |
| 139196 | More Than Strata | +61412657278 | $2,913.00 |
| 139255 | More Than Strata | +61432500952 | $4,932.00 |
| 139304 | Bright & Duggan Pty Ltd | +61444580395 | $1,454.00 |
| 139747 | The Dinner Ladies | +61411350895 | $1,080.00 |
| 139785 | Strata Choice | +61415955975 | $952.00 |
| 139835 | Bright & Duggan Pty Ltd | +61416247351 | $991.00 |
| 139965 | Gordon Robinson Real Estate | +61411255447 | $702.00 |
| 139993 | Bright & Duggan Pty Ltd | +61438582848 | $16,948.00 |
| 140026 | Whelan Property Group | +61422887422 | $20,704.92 |
| 140061 | Result Property Group | +61424654240 | $496.00 |
| 140258 | Responsive Strata Management | +61414014000 | $1,290.00 |
| 140333 | Bright & Duggan Pty Ltd | +61408982115 | $692.00 |
| 140505 | Bright & Duggan Pty Ltd | +61477013520 | $1,562.00 |
| 140613 | Whelan Property Group | +61412482260 | $2,136.00 |
| 140734 | Strata Republic Pty Ltd | +61421178137 | $1,008.00 |
| 140825 | Strata Choice | +61405430431 | $0.00 |
| 140932 | Bright & Duggan Pty Ltd | +61405982531 | $4,198.00 |
| 141360 | Bright & Duggan Pty Ltd | +61419200649 | $3,799.00 |
| 141429 | Whelan Property Group | +61430221951 | $499.00 |
| 141563 | Responsive Strata Management | +61421505994 | $0.00 |
| 141622 | Whelan Property Group | +61412482260 | $566.00 |
| 141662 | Strata Plus Pty Ltd | +61421248002 | $4,809.00 |
| 141728 | Bright & Duggan Pty Ltd | +61447178829 | $6,196.00 |
| 141833 | Bright & Duggan Pty Ltd | +61419258510 | $4,111.00 |
| 141855 | Bright & Duggan Pty Ltd | +61424680428 | $634.00 |
| 141944 | Result Property Group | +61406301852 | $1,149.00 |
| 141947 | Clique Property | +61457362382 | $546.00 |
| 141949 | Precise Property Management | +61413760851 | $10,680.00 |
| 142039 | Bright & Duggan Pty Ltd | +61493335198 | $1,784.00 |
| 142098 | NSW Strata Management | +61407412706 | $453.00 |
| 142154 | Bright & Duggan Pty Ltd | +61412760793 | $281.00 |
| 142412 | Bright & Duggan Pty Ltd | +61412439937 | $719.00 |
| 142446 | Strata Choice | +61431874078 | $2,894.00 |
| 142583 | Whelan Property Group | +61413868707 | $0.00 |
| 142638 | Bright & Duggan Pty Ltd | +61426588746 | $737.00 |
| 142724 | Sydney Strata Plumbing | +61425335333 | $0.00 |

**Total: 196 jobs, $571,298.70 ex-GST**

## Firestore Write Execution Record

**Write date**: 2026-06-12T22:27:38.522Z
**Collection**: `crm_lead_overrides`
**Docs written**: 232 (of 236 matched opps; 4 skipped — already admin-linked)
**Docs skipped** (pre-existing admin links, untouched):
- `G-356055f627b68ac56f97e0c2857ff0bc` (admin, JN 142759)
- `G-6bef3a6024c45d7e1792335252b97e0c` (auto:job_link, JN 142638)
- `G-7918b2a4433521fe11e344bcf72c7b66` (auto:job_link, JN 142678)
- `G-b7b816f86f74d8f24325d23e319facb4` (auto:job_link, JN 142724)

### Write Shape (per doc)

```
manual_job_number: <revenue_job>       (string)
manual_job_linked_at: <write timestamp>(Timestamp)
manual_job_linked_by: "auto:sms_jn_tier" (string)
is_account: true                       (boolean)
account_id: <per-row client_clientid>  (string)
account_name: <per-row client_name>    (string)
exclude_from_analysis: true            (boolean)
account_flagged_by: "auto:sms_jn_tier" (string)
account_flagged_at: <write timestamp>  (Timestamp)
linked_jobs: [<all matched JNs>]       (array)
revenue_job: <highest-invoiced JN>     (string)
match_tier: "sms_jn_tier"             (string)
provenance: "sms_jn_tier"             (string)
run_date: "2026-06-12"                (string)
```

### Verification Read-Back (2026-06-12T22:27)

| Check | Result |
|---|---|
| Docs with provenance=sms_jn_tier AND run_date=2026-06-12 | **232** ✓ |
| Spot-check: single-JN doc (G-8574..., JN 114712, Strata Choice) | account_id non-null, linked_jobs=["114712"], revenue_job==manual_job_number ✓ |
| Spot-check: multi-JN doc (G-03c5..., JNs 115233/119151/119768/135894) | linked_jobs=4 items, revenue_job="119151" (highest invoiced) ✓ |
| Spot-check: $0-invoiced doc (G-ad31..., JN 140825, Strata Choice) | all fields correct, $0 = account-level-billed ✓ |
| 4 skipped docs unchanged | account_flagged_by=admin/auto:job_link, no provenance field ✓ |
| Rollback query would select | **232 docs**, all owned by sms_jn_tier ✓ |

### Rollback (provenance-safe)

```javascript
const snapshot = await db.collection('crm_lead_overrides')
  .where('provenance', '==', 'sms_jn_tier')
  .where('run_date', '==', '2026-06-12')
  .get();

const { FieldValue } = require('firebase-admin/firestore');
const batch = db.batch();
let skipped = 0;
for (const doc of snapshot.docs) {
  const data = doc.data();
  if (data.account_flagged_by && data.account_flagged_by !== 'auto:sms_jn_tier') {
    batch.update(doc.ref, {
      provenance: FieldValue.delete(),
      run_date: FieldValue.delete(),
      linked_jobs: FieldValue.delete(),
    });
    skipped++;
    continue;
  }
  batch.update(doc.ref, {
    manual_job_number: FieldValue.delete(),
    linked_jobs: FieldValue.delete(),
    manual_job_linked_at: FieldValue.delete(),
    manual_job_linked_by: FieldValue.delete(),
    is_account: FieldValue.delete(),
    account_id: FieldValue.delete(),
    account_name: FieldValue.delete(),
    exclude_from_analysis: FieldValue.delete(),
    account_flagged_by: FieldValue.delete(),
    account_flagged_at: FieldValue.delete(),
    revenue_job: FieldValue.delete(),
    match_tier: FieldValue.delete(),
    provenance: FieldValue.delete(),
    run_date: FieldValue.delete(),
  });
}
await batch.commit();
```

### COD-Conversion Guard (verified)

32 COD `job_matched` opps on the same 140 resident phones remain untouched
in the COD funnel. Zero opps were spared by the guard within the write set
(verified: no gap_based opp had a COD job within ±30 days on the same phone).

---

## Open Item: vw_accounts Uses Banned Revenue Column

**Found during Tier A verification** — not part of this tier, logged for next task.

`ds_crm.vw_accounts` computes `total_revenue` and `revenue_l12m` as
`SUM(task_invoices_total_ex)`. Per §14, `task_invoices_total_ex` is the banned
column — it is wrong for multi-invoice jobs. The authoritative source is
`ds_aroflo.vw_job_invoiced.invoiced_total_ex` (line-level invoice sum).

### Discrepancy Sized (31 Account clients in SMS-JN tier)

| Clients with delta | 7 of 31 |
|---|---|
| Aggregate delta | **+$22,992** (task_invoices overstates by this amount) |
| Largest single-client delta | Bright & Duggan: **+$25,275** |
| Direction | Mixed — 4 clients overstated, 3 understated |

Per-client breakdown (only clients with non-zero delta):

| Client | task_invoices | vw_job_invoiced | Delta |
|---|---|---|---|
| Bright & Duggan Pty Ltd | $14,055,680 | $14,030,406 | +$25,275 |
| Strata Plus Pty Ltd | $2,568,970 | $2,565,686 | +$3,284 |
| Precise Property Management | $112,013 | $111,321 | +$692 |
| Jamesons Strata Management | $1,462,698 | $1,466,091 | −$3,393 |
| Strata Choice | $3,939,235 | $3,940,326 | −$1,091 |
| NSW Strata Management | $25,434 | $26,345 | −$911 |
| Result Property Group | $1,004,923 | $1,005,787 | −$864 |

24 of 31 clients show zero delta — `task_invoices_total_ex` happens to match
`vw_job_invoiced` for them (single-invoice jobs only).

### Action Required

Repoint `vw_accounts` from `task_invoices_total_ex` to `vw_job_invoiced.invoiced_total_ex`
before any Account revenue is reported externally. The view currently overstates
aggregate Account revenue by ~$23K across these 31 clients. The fix is the same
pattern already applied to `vw_lead_enriched` (§14 backlog item).
