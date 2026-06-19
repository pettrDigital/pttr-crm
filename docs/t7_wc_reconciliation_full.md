# T7 vs WC/Fergus — Full Reconciliation (928 leads)

**Date**: 2026-06-19
**Population**: 1,215 CSV leads → 928 mapped to our system → compared
**Not in our system**: 287 leads (outside Dec–Jun window or no WC-to-spine match)

## Population Funnel

| Step | Count |
|---|---|
| CSV total | 1,215 |
| Mapped to opportunity | **928** |
| Not mapped (coverage gap) | 287 |

## Agreement Summary

| Bucket | Count | % |
|---|---|---|
| COMPARE: both non-converted (sub-status comparison) | 339 | 36% |
| AGREE: both say converted | 220 | 23% |
| AGREE: both say quote/booked-$0 | 75 | 8% |
| AGREE: both say cancelled | 64 | 6% |
| COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) | 64 | 6% |
| PARTIAL: Ferg=reason, we=no content | 39 | 4% |
| REVIEW | 38 | 4% |
| NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) | 33 | 3% |
| PARTIAL: Ferg=reason, we=not captured | 33 | 3% |
| DISAGREE: Ferg=converted, we=no JN | 10 | 1% |
| AGREE: both say pending | 8 | 0% |
| DISAGREE: Ferg=lost, we=Booked | 5 | 0% |

## High-Value Disagreements

### Ferg Says Lost, We Say Booked (5 leads, $3,688 invoiced)

| WC Lead | Name | Ferg Status | Ferg Reason | Our Stage | Our Sub-Status | Our Path | Invoiced |
|---|---|---|---|---|---|---|---|
| 215394400 | Benny Hunter | Did Not Proceed | Out of Service Area | Job Complete | Completed and Invoiced | DETERMINED: gate — JN 141163 + invoiced $1232 | $1,232 |
| 226227292 | Bright & Duggan Pty Ltd | Did Not Proceed | Other | Job Complete | Completed and Invoiced | DETERMINED: gate — JN 141854 + invoiced $1126 | $1,126 |
| 219035874 | Loretta Fong | Did Not Proceed | Other | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141470 + invoiced $880 | $880 |
| 215597161 | Jamesons Strata Management | Did Not Proceed | Other | Job Complete | Completed and Invoiced | DETERMINED: gate — JN 141183 + invoiced $450 | $450 |
| 233001781 | MISC COD | Did Not Proceed | Dropped Call | Booked | Booking Cancelled | DETERMINED: gate — JN 142326 + Archived + $0 | $0 |

### Ferg Says Converted, We Have No JN (10 leads)

| WC Lead | Name | Ferg Status | Ferg JN | Our Stage | Our Sub-Status | Our Path |
|---|---|---|---|---|---|---|
| 241066835 | Michael Kilborn | Job Completed | (none) | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed from allowed set |
| 215312436 | Aaron Simpson | Job Completed | (none) | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set |
| 223945610 | Kosta | Job Completed | (none) | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set |
| 206561817 | Rudy Belcastro | Job Completed | (none) | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed from allowed set |
| 237918298 | None | Job Completed | (none) | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed from allowed set |
| 216450883 | Mervyn Yee | Job Completed | (none) | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed from allowed set |
| 224090503 | Vantas Nick | Job Completed | (none) | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set |
| 211331177 | Mark Ford | Job Completed | (none) | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed from allowed set |
| 226223724 | None | Job Completed | (none) | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed from allowed set |
| 233575766 | John Gabor | Job Completed | (none) | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed from allowed set |

## Full Per-Lead Table (928 leads)

Sorted: high-value disagreements first, then other disagreements, then agreements.

| # | WC Lead | Name | Channel | Ferg Status | Ferg Reason | Our Funnel Stage | Our Sub-Status | Our Path | Agreement |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 215394400 | Benny Hunter | Call | Did Not Proceed | Out of Service Area | Job Complete | Completed and Invoiced | DETERMINED: gate — JN 141163 + invoiced $1232 | DISAGREE: Ferg=lost, we=Booked |
| 2 | 226227292 | Bright & Duggan Pty  | Call | Did Not Proceed | Other | Job Complete | Completed and Invoiced | DETERMINED: gate — JN 141854 + invoiced $1126 | DISAGREE: Ferg=lost, we=Booked |
| 3 | 219035874 | Loretta Fong | Form | Did Not Proceed | Other | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141470 + invoiced $880 | DISAGREE: Ferg=lost, we=Booked |
| 4 | 215597161 | Jamesons Strata Mana | Call | Did Not Proceed | Other | Job Complete | Completed and Invoiced | DETERMINED: gate — JN 141183 + invoiced $450 | DISAGREE: Ferg=lost, we=Booked |
| 5 | 233001781 | MISC COD | Call | Did Not Proceed | Dropped Call | Booked | Booking Cancelled | DETERMINED: gate — JN 142326 + Archived + $0 | DISAGREE: Ferg=lost, we=Booked |
| 6 | 241066835 | Michael Kilborn | Phone Call | Job Completed |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | DISAGREE: Ferg=converted, we=no JN |
| 7 | 215312436 | Aaron Simpson | Phone Call | Job Completed |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | DISAGREE: Ferg=converted, we=no JN |
| 8 | 223945610 | Kosta | Form | Job Completed |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | DISAGREE: Ferg=converted, we=no JN |
| 9 | 206561817 | Rudy Belcastro | Call | Job Completed |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | DISAGREE: Ferg=converted, we=no JN |
| 10 | 237918298 |  | Call | Job Completed |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | DISAGREE: Ferg=converted, we=no JN |
| 11 | 216450883 | Mervyn Yee | Call | Job Completed |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | DISAGREE: Ferg=converted, we=no JN |
| 12 | 224090503 | Vantas Nick | Call | Job Completed |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | DISAGREE: Ferg=converted, we=no JN |
| 13 | 211331177 | Mark Ford | Call | Job Completed |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | DISAGREE: Ferg=converted, we=no JN |
| 14 | 226223724 |  | Call | Job Completed |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | DISAGREE: Ferg=converted, we=no JN |
| 15 | 233575766 | John Gabor | Call | Job Completed |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | DISAGREE: Ferg=converted, we=no JN |
| 16 | 231070244 | Peter Anderson | Form | Lost / Unresponsive |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142218 + invoiced $530 | REVIEW |
| 17 | 214815435 | Sian | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141105 + invoiced $17899 | AGREE: both say converted |
| 18 | 221323770 | Craig Durham | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141534 + invoiced $13573 | AGREE: both say converted |
| 19 | 207876903 | Strata United | Call | Job Completed |  | Job Complete | Completed and Invoiced | DETERMINED: gate — JN 140640 + invoiced $11543 | AGREE: both say converted |
| 20 | 236754054 | Justine Barra B | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142160 + invoiced $10005 | AGREE: both say converted |
| 21 | 209341962 | Ken Binks | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140746 + invoiced $9120 | AGREE: both say converted |
| 22 | 234780799 | Julie Keane | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142485 + invoiced $7275 | AGREE: both say converted |
| 23 | 235240997 | MISC COD | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142527 + invoiced $5844 | AGREE: both say converted |
| 24 | 231601857 | Sara Brentnall | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142245 + invoiced $5660 | AGREE: both say converted |
| 25 | 231618370 | Ben | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142255 + invoiced $5167 | AGREE: both say converted |
| 26 | 227383860 | Justin Longmore | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141985 + invoiced $4810 | AGREE: both say converted |
| 27 | 211915178 | Bright & Duggan Pty  | Call | Job Completed |  | Job Complete | Completed and Invoiced | DETERMINED: gate — JN 140961 + invoiced $4678 | AGREE: both say converted |
| 28 | 211915604 | Bright & Duggan Pty  | Call | Repeat |  | Job Complete | Completed and Invoiced | DETERMINED: gate — JN 140961 + invoiced $4678 | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 29 | 212976732 | MISC COD | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140970 + invoiced $4487 | AGREE: both say converted |
| 30 | 234459276 | Terry Tregoning | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142459 + invoiced $4417 | AGREE: both say converted |
| 31 | 212987494 | Margaret | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140978 + invoiced $4287 | AGREE: both say converted |
| 32 | 209361443 | Grace | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140751 + invoiced $4010 | AGREE: both say converted |
| 33 | 229869496 | Jeanette | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142150 + invoiced $3969 | AGREE: both say converted |
| 34 | 215406551 | Grace Johnson | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141170 + invoiced $3687 | AGREE: both say converted |
| 35 | 233827001 | Tim Reeves | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142407 + invoiced $3625 | AGREE: both say converted |
| 36 | 233245149 | Ann Ball | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142361 + invoiced $3446 | AGREE: both say converted |
| 37 | 230106842 | Mike | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142165 + invoiced $3435 | AGREE: both say converted |
| 38 | 221322019 | Louise | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141536 + invoiced $3387 | AGREE: both say converted |
| 39 | 210265418 | Appleton, Makisa | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140838 + invoiced $3258.5 | AGREE: both say converted |
| 40 | 207881164 | Jaine Stockler | Form | In Person Quote Only |  | Paid Job | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140642 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 41 | 214123961 | Janet Howse | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141030 + invoiced $3170 | AGREE: both say converted |
| 42 | 211647798 | Ye Rin Yoo | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140929 + invoiced $3097.73 | AGREE: both say converted |
| 43 | 220899005 | Janine Chrichley | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141514 + invoiced $2944 | AGREE: both say converted |
| 44 | 221689963 | Colin Toby | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141557 + invoiced $2909 | AGREE: both say converted |
| 45 | 223102257 | Paul | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141671 + invoiced $2880 | AGREE: both say converted |
| 46 | 213240388 | Carol Natsis | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140995 + invoiced $2870 | AGREE: both say converted |
| 47 | 225874564 | Ursula Samson-D | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141890 + invoiced $2823 | AGREE: both say converted |
| 48 | 219711225 | Sydney Custom Cabine | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141450 + invoiced $2590 | AGREE: both say converted |
| 49 | 209726045 | Thomas Muir | Call | Job Completed |  | Booked | Completed and Invoiced | DETERMINED: gate — JN 140782 + invoiced $2548 | AGREE: both say converted |
| 50 | 224879906 | Amanda | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141816 + invoiced $2451.73 | AGREE: both say converted |
| 51 | 233560863 | Mark | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142364 + invoiced $2240 | AGREE: both say converted |
| 52 | 225045572 | Wesley, Ian | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141844 + invoiced $2200 | AGREE: both say converted |
| 53 | 217582794 | Maria Pontin | Form | Repeat |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141310 + invoiced $2160 | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 54 | 230780122 | Terrey Hills Au | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142207 + invoiced $2140 | AGREE: both say converted |
| 55 | 225033848 | The Dinner Ladies | Call | Job Completed |  | Booked | Completed and Invoiced | DETERMINED: gate — JN 141826 + invoiced $2090 | AGREE: both say converted |
| 56 | 233825109 | Liz Manfredini | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141828 + invoiced $2060 | AGREE: both say converted |
| 57 | 231379011 | David Harvey | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142235 + invoiced $2044.24 | AGREE: both say converted |
| 58 | 238982056 | Rachel Teo | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142778 + invoiced $2000 | AGREE: both say converted |
| 59 | 224329408 | Strata Choice | Call | Job Completed |  | Job Complete | Completed and Invoiced | DETERMINED: gate — JN 141788 + invoiced $1974 | AGREE: both say converted |
| 60 | 209360282 | Josephine Clayton | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140750 + invoiced $1952 | AGREE: both say converted |
| 61 | 230521676 | Peter  Song | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142185 + invoiced $1939 | AGREE: both say converted |
| 62 | 237320789 | Ian Camlett | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142668 + invoiced $1924 | AGREE: both say converted |
| 63 | 239214597 | Ginu Jacob | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142812 + invoiced $1900 | AGREE: both say converted |
| 64 | 234254870 | Joan Becker | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142445 + invoiced $1883 | AGREE: both say converted |
| 65 | 220514555 | Webber Belinda | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141494 + invoiced $1869 | AGREE: both say converted |
| 66 | 222674760 | Josh Pyke | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141648 + invoiced $1856.73 | AGREE: both say converted |
| 67 | 211327581 | Brad | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140904 + invoiced $1800 | AGREE: both say converted |
| 68 | 236517295 | Lesley Maguire | Call | Job Completed |  | Booked | Completed and Invoiced | DETERMINED: gate — JN 142599 + invoiced $1779 | AGREE: both say converted |
| 69 | 228546024 | Felicity | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142050 + invoiced $1774 | AGREE: both say converted |
| 70 | 231618630 | Nick Smith | Form | Job Completed |  | Booked | Completed and Invoiced | DETERMINED: gate — JN 142256 + invoiced $1757 | AGREE: both say converted |
| 71 | 238418725 | Karen | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142728 + invoiced $1748 | AGREE: both say converted |
| 72 | 231400818 | Pawan Parmar | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142241 + invoiced $1714.54 | AGREE: both say converted |
| 73 | 215333801 | Bright & Duggan Pty  | Call | Job Completed |  | Job Complete | Completed and Invoiced | DETERMINED: gate — JN 141143 + invoiced $1668 | AGREE: both say converted |
| 74 | 212067075 | Graham | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140945 + invoiced $1665 | AGREE: both say converted |
| 75 | 205375176 | Debra | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140475 + invoiced $1612 | AGREE: both say converted |
| 76 | 223116388 | Danijela Dravec | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141680 + invoiced $1600 | AGREE: both say converted |
| 77 | 238126254 | Bill Holevas | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142710 + invoiced $1600 | AGREE: both say converted |
| 78 | 212980029 | Daisuke Ueda | Call | Booking Cancelled |  | Paid Job | Booking Cancelled | DETERMINED: gate — JN 140972 + Archived + $0 | AGREE: both say cancelled |
| 79 | 229835577 | Deepak | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142140 + invoiced $1419 | AGREE: both say converted |
| 80 | 219320179 | Jaine Stockler | Form | Repeat |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141428 + invoiced $1392 | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 81 | 214824774 | Preethi | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141109 + invoiced $1390 | AGREE: both say converted |
| 82 | 217852680 | Marco Colantonio | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141316 + invoiced $1384 | AGREE: both say converted |
| 83 | 238109206 | Ka Law | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142707 + invoiced $1363.64 | AGREE: both say converted |
| 84 | 237663815 | Kaio Vilar | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142682 + invoiced $1350 | AGREE: both say converted |
| 85 | 207879384 | Graeme Payne | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140641 + invoiced $1277 | AGREE: both say converted |
| 86 | 230547677 | Gillian | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142187 + invoiced $1268 | AGREE: both say converted |
| 87 | 213011500 | Scott Hekking | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140987 + invoiced $1250 | AGREE: both say converted |
| 88 | 207065861 | Salma | Form | Job Completed |  | Paid Job | Booking Cancelled | DETERMINED: gate — JN 140233 + Archived + $0 | REVIEW |
| 89 | 225721779 | Ash Gladden | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141887 + invoiced $1180 | AGREE: both say converted |
| 90 | 232831034 | Emily Leary | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142319 + invoiced $1174 | AGREE: both say converted |
| 91 | 234041981 | Rob Wen | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142430 + invoiced $1167 | AGREE: both say converted |
| 92 | 205196259 | Steve | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140461 + invoiced $1157 | AGREE: both say converted |
| 93 | 219370982 | Richard Menary | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141438 + invoiced $1125 | AGREE: both say converted |
| 94 | 239416965 | Francis Chu | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142814 + invoiced $1116 | AGREE: both say converted |
| 95 | 220665266 | Leanna Marx | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141498 + invoiced $1100 | AGREE: both say converted |
| 96 | 205181026 | Simon | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140454 + invoiced $1094 | AGREE: both say converted |
| 97 | 231374565 | Julia Roke | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142233 + invoiced $1090 | AGREE: both say converted |
| 98 | 234248754 | Landy's Dry Cleaners | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142442 + invoiced $1076.91 | AGREE: both say converted |
| 99 | 207116313 | Rob Sparshott | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140578 + invoiced $1050 | AGREE: both say converted |
| 100 | 234795691 | Tita Leach | Call | Job Completed |  | Booked | Completed and Invoiced | DETERMINED: gate — JN 142488 + invoiced $1045 | AGREE: both say converted |
| 101 | 229031630 | James | Form | Job Booked |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142089 + invoiced $1040 | REVIEW |
| 102 | 223684130 | Kate Bell | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141706 + invoiced $1018 | AGREE: both say converted |
| 103 | 231813548 | Caroline Havery | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142261 + invoiced $1002 | AGREE: both say converted |
| 104 | 206125117 | Mark Don | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140512 + invoiced $1000 | AGREE: both say converted |
| 105 | 215329360 | Lauren Troy | Call | Job Completed |  | Booked | Completed and Invoiced | DETERMINED: gate — JN 141118 + invoiced $987.27 | AGREE: both say converted |
| 106 | 215756892 | Chris Kelsey | Call | Repeat |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141193 + invoiced $980 | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 107 | 215756822 | Chris Kelsey | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141193 + invoiced $980 | AGREE: both say converted |
| 108 | 214614587 | George Kokkinos | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141087 + invoiced $976 | AGREE: both say converted |
| 109 | 207553227 | Will Granger | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140619 + invoiced $970 | AGREE: both say converted |
| 110 | 229800933 | Peter Hill | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142141 + invoiced $952 | AGREE: both say converted |
| 111 | 221081320 | Geoffrey Gabb | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141520 + invoiced $950 | AGREE: both say converted |
| 112 | 205375843 | Craig Skippen | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140472 + invoiced $950 | AGREE: both say converted |
| 113 | 221285760 | Steve Lulka | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141533 + invoiced $930 | AGREE: both say converted |
| 114 | 215339815 | Natasha | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141167 + invoiced $909.09 | AGREE: both say converted |
| 115 | 206341861 | Jeffrey Quinn | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140532 + invoiced $904 | AGREE: both say converted |
| 116 | 208131159 | Charlie Lee | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140653 + invoiced $903 | AGREE: both say converted |
| 117 | 227103577 | Michael | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141997 + invoiced $880 | AGREE: both say converted |
| 118 | 214200627 | Jake | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141049 + invoiced $854 | AGREE: both say converted |
| 119 | 206714141 | Mark Boyle | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140557 + invoiced $853 | AGREE: both say converted |
| 120 | 236286440 | Ben | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142586 + invoiced $832 | AGREE: both say converted |
| 121 | 211319410 | Lorraine Saric | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140914 + invoiced $830 | AGREE: both say converted |
| 122 | 215389067 | Pastor Ana | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141156 + invoiced $818.18 | AGREE: both say converted |
| 123 | 209928222 | Susan De Burgh | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140809 + invoiced $800 | AGREE: both say converted |
| 124 | 225703984 | Jo Cocks | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141883 + invoiced $783.64 | AGREE: both say converted |
| 125 | 232825079 | Paul Bazeley | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142317 + invoiced $770 | AGREE: both say converted |
| 126 | 230330000 | Ben | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142180 + invoiced $746 | AGREE: both say converted |
| 127 | 213455397 | Marica Vanoska | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141011 + invoiced $736.36 | AGREE: both say converted |
| 128 | 231606726 | Emily Vale | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142246 + invoiced $726 | AGREE: both say converted |
| 129 | 207881542 | Andre Bijlsma | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140643 + invoiced $717.55 | AGREE: both say converted |
| 130 | 215030569 | Kristy | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141133 + invoiced $707 | AGREE: both say converted |
| 131 | 226877485 | Rosanna Schomberg | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141951 + invoiced $705 | AGREE: both say converted |
| 132 | 232871378 | Sharmista | Form | Job Completed |  | Booked | Completed and Invoiced | DETERMINED: gate — JN 142335 + invoiced $705 | AGREE: both say converted |
| 133 | 208123762 | Bright & Duggan Pty  | Call | Job Completed |  | Job Complete | Completed and Invoiced | DETERMINED: gate — JN 140652 + invoiced $702 | AGREE: both say converted |
| 134 | 227438505 | John Peachman | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141996 + invoiced $700 | AGREE: both say converted |
| 135 | 219753449 | Haydn Hickson | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141455 + invoiced $688 | AGREE: both say converted |
| 136 | 208122281 | Tom Taylor | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140651 + invoiced $682 | AGREE: both say converted |
| 137 | 216925873 | Irena Havier | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141268 + invoiced $680 | AGREE: both say converted |
| 138 | 232004696 | Strata Embassy | Call | Job Completed |  | Job Complete | Completed and Invoiced | DETERMINED: gate — JN 142270 + invoiced $679 | AGREE: both say converted |
| 139 | 215232848 | Joseph Pawney | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141142 + invoiced $670 | AGREE: both say converted |
| 140 | 217865425 | Rowena Lapitan | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141323 + invoiced $650 | AGREE: both say converted |
| 141 | 205193328 | Mavis Mao | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140460 + invoiced $649 | AGREE: both say converted |
| 142 | 228535228 | Gary | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142048 + invoiced $640 | AGREE: both say converted |
| 143 | 218544891 | Colin Giles | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141359 + invoiced $639 | AGREE: both say converted |
| 144 | 236308972 | Steven Wan | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142594 + invoiced $629 | AGREE: both say converted |
| 145 | 229703307 | MISC COD | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141934 + invoiced $628 | AGREE: both say converted |
| 146 | 224974896 | Paul Bennell | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141817 + invoiced $620 | AGREE: both say converted |
| 147 | 226252587 | Bryce Earl | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141922 + invoiced $605.46 | AGREE: both say converted |
| 148 | 222662268 | Chakkri | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141642 + invoiced $600 | AGREE: both say converted |
| 149 | 227476426 | Francine St George | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142007 + invoiced $600 | AGREE: both say converted |
| 150 | 216443309 | Alex  Martinez | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141238 + invoiced $596 | AGREE: both say converted |
| 151 | 231147768 | MISC COD | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142227 + invoiced $590 | AGREE: both say converted |
| 152 | 212061674 | Lea | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140944 + invoiced $588 | AGREE: both say converted |
| 153 | 222894823 | Strata Choice | Call | Job Completed |  | Job Complete | Completed and Invoiced | DETERMINED: gate — JN 141655 + invoiced $579 | AGREE: both say converted |
| 154 | 235973329 | Matthew Nieass | Call | Repeat |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142558 + invoiced $574 | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 155 | 222892460 | Antoinette Albert | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141653 + invoiced $565 | AGREE: both say converted |
| 156 | 238758084 | Peter Cheevers | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142498 + invoiced $565 | AGREE: both say converted |
| 157 | 228599354 | Rayen Ponsamy | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142046 + invoiced $560 | AGREE: both say converted |
| 158 | 219765218 | Lucy Napoli | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141458 + invoiced $559 | AGREE: both say converted |
| 159 | 214130445 | Kimberlea Dudley | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141034 + invoiced $550 | AGREE: both say converted |
| 160 | 225263799 | Chau Pham | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141840 + invoiced $545 | AGREE: both say converted |
| 161 | 239440019 | Craig | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142828 + invoiced $543 | AGREE: both say converted |
| 162 | 235047304 | Alan Sinclair | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142515 + invoiced $541 | AGREE: both say converted |
| 163 | 221705942 | Deborah Graham | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141559 + invoiced $538 | AGREE: both say converted |
| 164 | 210835017 | Peter Denholm | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140878 + invoiced $530 | AGREE: both say converted |
| 165 | 231187073 | Nicola Love | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142232 + invoiced $520.64 | AGREE: both say converted |
| 166 | 219095841 | Jeremy Davidson | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141412 + invoiced $517 | AGREE: both say converted |
| 167 | 230563333 | Sophie Capelli | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142192 + invoiced $515 | AGREE: both say converted |
| 168 | 230563453 | Sophie Capelli | Form | Repeat |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142192 + invoiced $515 | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 169 | 218736825 | MISC COD | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141373 + invoiced $515 | AGREE: both say converted |
| 170 | 214129520 | Owen | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141033 + invoiced $513 | AGREE: both say converted |
| 171 | 218029236 | Megan Baldwin | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141329 + invoiced $506 | AGREE: both say converted |
| 172 | 211025413 | Shelley Bartley | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140895 + invoiced $504 | AGREE: both say converted |
| 173 | 210430499 | Kylie | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140861 + invoiced $500 | AGREE: both say converted |
| 174 | 209567364 | Lewis Cassano | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140773 + invoiced $500 | AGREE: both say converted |
| 175 | 213395083 | Mitch Stubbs | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140998 + invoiced $500 | AGREE: both say converted |
| 176 | 214652516 | Kristina  Vesk | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141101 + invoiced $494 | AGREE: both say converted |
| 177 | 213206002 | Jessica | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140989 + invoiced $490 | AGREE: both say converted |
| 178 | 228531195 | Karl | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142049 + invoiced $480 | AGREE: both say converted |
| 179 | 205900247 | O'Loughlin Maryann | Call | Job Completed | Price too High | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140499 + invoiced $477 | AGREE: both say converted |
| 180 | 208555422 | Oliver Storey | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140692 + invoiced $477 | AGREE: both say converted |
| 181 | 237920362 | Judith Taylor | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142711 + invoiced $454.55 | AGREE: both say converted |
| 182 | 222901066 | Bob Lu | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141656 + invoiced $454.55 | AGREE: both say converted |
| 183 | 235044937 | Tawat Tantivit | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142514 + invoiced $454.54 | AGREE: both say converted |
| 184 | 238509040 | French Street Tacos  | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142749 + invoiced $450 | AGREE: both say converted |
| 185 | 211340752 | Jann Todd | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140911 + invoiced $450 | AGREE: both say converted |
| 186 | 209718465 | Brian | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140787 + invoiced $450 | AGREE: both say converted |
| 187 | 213422707 | Kieran Jones | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141002 + invoiced $450 | AGREE: both say converted |
| 188 | 208091396 | Jo Rainbird | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140649 + invoiced $440 | AGREE: both say converted |
| 189 | 224270796 | Larissa Isakov | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141773 + invoiced $435 | AGREE: both say converted |
| 190 | 231615772 | Ruth Quirk | Call | Job Completed |  | Booked | Completed and Invoiced | DETERMINED: gate — JN 142254 + invoiced $430 | AGREE: both say converted |
| 191 | 238740866 | Trent B | Form | Job Completed |  | Booked | Completed and Invoiced | DETERMINED: gate — JN 142758 + invoiced $425 | AGREE: both say converted |
| 192 | 209364306 | Christopher Hampton | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140753 + invoiced $420 | AGREE: both say converted |
| 193 | 212268583 | Vanessa | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140948 + invoiced $420 | AGREE: both say converted |
| 194 | 222664091 | Mark McCarthy | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141640 + invoiced $420 | AGREE: both say converted |
| 195 | 221716349 | Melina Adams | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141567 + invoiced $416 | AGREE: both say converted |
| 196 | 232021511 | Phyllis Agam | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142277 + invoiced $408 | AGREE: both say converted |
| 197 | 217031800 | Grant | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141270 + invoiced $405 | AGREE: both say converted |
| 198 | 223850948 | Diane Wyllie | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141722 + invoiced $400 | AGREE: both say converted |
| 199 | 229872368 | Joshua Murphy | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142157 + invoiced $400 | AGREE: both say converted |
| 200 | 207559506 | Chapel Street Smash  | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140620 + invoiced $400 | AGREE: both say converted |
| 201 | 213426212 | Holly | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141003 + invoiced $395 | AGREE: both say converted |
| 202 | 219509114 | Helen | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141439 + invoiced $387 | AGREE: both say converted |
| 203 | 206872910 | Paryss  Rhae | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140549 + invoiced $386.36 | AGREE: both say converted |
| 204 | 232589357 | Cynthia Niven | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142291 + invoiced $381 | AGREE: both say converted |
| 205 | 229870249 | Jenelle Moore | Call | Job Completed | Other | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142223 + invoiced $379 | AGREE: both say converted |
| 206 | 223497074 | Savyesh Gupta | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141694 + invoiced $372 | AGREE: both say converted |
| 207 | 214627027 | Jack Lo Russo | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141091 + invoiced $368 | AGREE: both say converted |
| 208 | 208374722 | AUSTRALIA | Phone Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140670 + invoiced $359 | AGREE: both say converted |
| 209 | 236736126 | Quarry St Cafe | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142620 + invoiced $338.18 | AGREE: both say converted |
| 210 | 211989607 | Maria Pontin | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140936 + invoiced $322 | AGREE: both say converted |
| 211 | 216635088 | Thi Huong Nguyen | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141252 + invoiced $320 | AGREE: both say converted |
| 212 | 224088184 | Nicole | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141768 + invoiced $320 | AGREE: both say converted |
| 213 | 206321085 | Katerina Ladygo | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140529 + invoiced $320 | AGREE: both say converted |
| 214 | 236515898 | Jones, Matthew | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142597 + invoiced $320 | AGREE: both say converted |
| 215 | 210256081 | Valeria Kelly | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140830 + invoiced $310 | AGREE: both say converted |
| 216 | 238758088 | Roger Elliott | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142351 + invoiced $301 | AGREE: both say converted |
| 217 | 210842384 | Perry Liu | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140879 + invoiced $300 | AGREE: both say converted |
| 218 | 216055614 | Jill Waters | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141219 + invoiced $299 | AGREE: both say converted |
| 219 | 238756247 | Min Sian | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142766 + invoiced $295 | AGREE: both say converted |
| 220 | 238758087 | Lynne Ashpole | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142354 + invoiced $295 | AGREE: both say converted |
| 221 | 230779200 | Joash Manuel | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142205 + invoiced $295 | AGREE: both say converted |
| 222 | 216019565 | Tim | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141210 + invoiced $290 | AGREE: both say converted |
| 223 | 218291735 | Winne Chen | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141341 + invoiced $280 | AGREE: both say converted |
| 224 | 217082385 | Claire Hudson | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141286 + invoiced $280 | AGREE: both say converted |
| 225 | 231150855 | Sharmila Grunge | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142231 + invoiced $280 | AGREE: both say converted |
| 226 | 223116260 | Matthew Nieass | Call | Booking Cancelled |  | Paid Job | Booking Cancelled | DETERMINED: gate — JN 141679 + Archived + $0 | AGREE: both say cancelled |
| 227 | 207894974 | Pamela Reilly | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140646 + invoiced $250 | AGREE: both say converted |
| 228 | 223845592 | Hala | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141720 + invoiced $230 | AGREE: both say converted |
| 229 | 224075807 | Natalia Fernandez | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141740 + invoiced $220 | AGREE: both say converted |
| 230 | 220744085 | Rebecca | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141513 + invoiced $220 | AGREE: both say converted |
| 231 | 223784446 | Roberta | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141709 + invoiced $220 | AGREE: both say converted |
| 232 | 216834728 | Kathryn | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141256 + invoiced $220 | AGREE: both say converted |
| 233 | 224055130 | Kosta | Call | Repeat |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141734 + invoiced $200 | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 234 | 222315852 | Pip Martin | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141608 + invoiced $190 | AGREE: both say converted |
| 235 | 215819859 | Ealejandra | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141202 + invoiced $170 | AGREE: both say converted |
| 236 | 237693986 | Dylan Anthony | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 142692 + invoiced $170 | AGREE: both say converted |
| 237 | 218281412 | Neil Frederiksen | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141340 + invoiced $170 | AGREE: both say converted |
| 238 | 214178848 | Erin Cowin | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141037 + invoiced $170 | AGREE: both say converted |
| 239 | 216862288 | Chris Hall | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141265 + invoiced $170 | AGREE: both say converted |
| 240 | 222513897 | Mackenzie Martinez | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141633 + invoiced $170 | AGREE: both say converted |
| 241 | 210255866 | MISC COD | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140831 + invoiced $170 | AGREE: both say converted |
| 242 | 214644309 | Benji | Form | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141102 + invoiced $170 | AGREE: both say converted |
| 243 | 215739635 | Julia Mokdsi | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141192 + invoiced $170 | AGREE: both say converted |
| 244 | 226054441 | Tim Francis | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141899 + invoiced $170 | AGREE: both say converted |
| 245 | 205189682 | Leila Sedlarevic | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140456 + invoiced $170 | AGREE: both say converted |
| 246 | 206327844 | Glen Allam | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140530 + invoiced $170 | AGREE: both say converted |
| 247 | 212443669 | Glen Quill | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 140957 + invoiced $170 | AGREE: both say converted |
| 248 | 216043907 | Brighton, Jackie | Call | Job Completed |  | Paid Job | Completed and Invoiced | DETERMINED: gate — JN 141217 + invoiced $170 | AGREE: both say converted |
| 249 | 223866885 | Nicole Strojek | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141738 + Archived + $0 | AGREE: both say cancelled |
| 250 | 230122023 | Bunting, Caroline | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142171 + Archived + $0 | AGREE: both say cancelled |
| 251 | 213229694 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 252 | 237685094 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 253 | 240763740 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 254 | 214190393 |  | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 255 | 213237433 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 256 | 214633640 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 257 | 211013736 |  | Call | Did Not Proceed | Price too High | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 258 | 240747213 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 259 | 227113116 | Larissa | Call | Did Not Proceed | Price too High | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 260 | 235488858 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 261 | 225893837 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 262 | 232383610 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 263 | 219088162 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 264 | 225048809 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 265 | 219960677 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 266 | 230557442 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 267 | 228458660 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 268 | 229703202 | Mark Teh | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 269 | 221419349 | Md Avdullah Al Mamun | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 270 | 213846730 |  | Call | Did Not Proceed | Out of Service Area | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 271 | 208338611 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 272 | 238114958 |  | Call | Did Not Proceed |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 273 | 225887310 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 274 | 223544006 |  | Call | Did Not Proceed | Dropped Call | Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 275 | 208123890 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 276 | 223314218 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 277 | 229869586 |  | Call | Did Not Proceed | Wanted Quote Over Phone | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 278 | 224691941 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 279 | 230360577 |  | Call | Did Not Proceed | Wanted Quote Over Phone | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 280 | 223513039 | Dural Au | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 281 | 234814807 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 282 | 209122035 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 283 | 237413486 |  | Call | Did Not Proceed | Dropped Call | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 284 | 209905018 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 285 | 217493017 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 286 | 215609682 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 287 | 230770618 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 288 | 232378955 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 289 | 234037141 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 290 | 228104974 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 291 | 208798178 |  | Call | Did Not Proceed | Out of Service Area | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 292 | 214784242 |  | Call | Did Not Proceed | Wrong Number | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 293 | 217431726 | Roger Mann | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 294 | 215391864 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 295 | 238122745 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 296 | 236041462 | Aravind Fxdms J | Call | Did Not Proceed | Wanted Quote Over Phone | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 297 | 217871729 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 298 | 232223887 | Daniel Collins | Call | Did Not Proceed | Price too High | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 299 | 211326294 |  | Call | Did Not Proceed | Price too High | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 300 | 241419854 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 301 | 209121394 | Unknown | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 302 | 236959382 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 303 | 225282082 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 304 | 231821345 | Bunbury Au | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 305 | 211275166 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 306 | 218538048 |  | Call | Did Not Proceed | Wrong Number | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 307 | 210658239 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 308 | 222266584 |  | Call | Did Not Proceed | Dropped Call | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 309 | 224491653 |  | Call | Did Not Proceed |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 310 | 227292081 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 311 | 231991787 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 312 | 234251614 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 313 | 206881446 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 314 | 228297974 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 315 | 236758857 |  | Call | Did Not Proceed | Dropped Call | Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 316 | 213832179 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 317 | 217292727 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 318 | 211175273 | Carey, Donna | Call | Did Not Proceed | Dropped Call | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 319 | 215608908 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 320 | 240771532 | Sean Sparks | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 321 | 239203296 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 322 | 218234886 |  | Call | Did Not Proceed | Dropped Call | Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 323 | 220830947 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 324 | 207305327 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 325 | 213666252 |  | Call | Did Not Proceed | Dropped Call | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 326 | 215384783 | Victor Mihael | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141147 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 327 | 231075010 | MISC COD | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142215 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 328 | 236740032 | Sue  Rozario | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142621 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 329 | 210263276 | Liam Miller | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140834 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 330 | 241158059 | Julianna Yahaya | Call | Job Completed - To Be Invoiced |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142952 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 331 | 212986602 | Abbie Hanbridge | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140977 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 332 | 221479649 | Rita Saliba | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141550 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 333 | 231800503 | Rudy Belcastro | Call | Repeat |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142506 + Completed + $0 → T7.2 picks Quote | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 334 | 237312382 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 335 | 207108482 | Norma McDonald | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 140575 + Archived + $0 | AGREE: both say cancelled |
| 336 | 230582926 | Yen Gao | Call | Did Not Proceed | Dropped Call | Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 337 | 218327278 | Gibson Monica | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141346 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 338 | 235262442 | MISC COD | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142532 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 339 | 236955694 | Ahemi  Arbabzadeh | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142640 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 340 | 208959790 | Amit Mirkle | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 140726 + Archived + $0 | AGREE: both say cancelled |
| 341 | 232618881 | Sally West | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142302 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 342 | 229492163 | Belinda | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142128 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 343 | 235053837 | Dippa Kaur | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142524 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 344 | 235480052 | Jennifer Jenkins-Fli | Call | Job Completed |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142541 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 345 | 222144772 | Unknown | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141604 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 346 | 206736251 | Kuppal Palaniap | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140559 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 347 | 234439036 | Jim He | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142449 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 348 | 226244807 | Bryan Lei | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141916 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 349 | 239195353 | Will McCarthy | Call | Repeat |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142800 + Archived + $0 | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 350 | 219117486 | The Freedom Hub | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141447 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 351 | 224074633 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 352 | 238502583 | Wilson Lie | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142738 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 353 | 237681514 | Aaron Christianson | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142688 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 354 | 234807347 | Gerard McNamara | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142495 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 355 | 218539173 | Charles Bao | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141358 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 356 | 238137885 | Towheda Ahmed | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142720 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 357 | 237895877 | Andrew Keyworth | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142694 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 358 | 223769335 | Mia Lewin | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 359 | 219035489 | Sj | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141410 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 360 | 227893687 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 361 | 217766873 | Lily Phelan | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141321 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 362 | 240768331 | Julie King-Gee | Call | Job Booked |  | Job Complete | Job Pending | DETERMINED: gate — JN 142934 + Open + $0 | AGREE: both say pending |
| 363 | 208570936 | Jess Aldridge | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140695 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 364 | 237304336 | Celin Pala | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142654 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 365 | 241409544 | Daniel Hurd | Call | Job Completed - To Be Invoiced |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142961 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 366 | 241150862 | Jason Chow | Call | Job Completed - To Be Invoiced |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142944 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 367 | 220287652 | Evan Kaldor | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141474 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 368 | 217493901 | Nona Martin | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141305 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 369 | 215380163 | Sue | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141145 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 370 | 230325652 | Guy Shalvi | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142175 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 371 | 208728812 | Carlos J. Golla | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140716 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 372 | 230091747 | Carey, Donna | Call | Repeat |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 373 | 230568805 | Elliott Hyde | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 374 | 223309865 | Hardeep Singh | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141686 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 375 | 206884295 | James Aung | Call | In Person Quote Only | Price too High | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140556 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 376 | 233241695 | Eliza James | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142359 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 377 | 208549090 | Margaret  Yung | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140687 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 378 | 234808977 | Jeffrey Tighe | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142497 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 379 | 206883000 | Nino  Tomera | Call | In Person Quote Only | Price too High | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140555 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 380 | 228092501 | Rajib Roi | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142040 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 381 | 209918419 | Andrew Donovan | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140807 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 382 | 238967889 | Tatiana Markov | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142771 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 383 | 232007816 | May Limwaree | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142273 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 384 | 214999546 | Luke Nguyen | Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141128 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 385 | 212994260 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 386 | 230116985 | Alfian Bin Supr | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 387 | 236297672 | Ali | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 388 | 224865894 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 389 | 208349663 |  | Call | Did Not Proceed | Wrong Number | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 390 | 231826204 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 391 | 215809280 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 392 | 226174228 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 393 | 232379371 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 394 | 230119557 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 395 | 217496953 | Ben Alcott | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 396 | 230342947 |  | Call | Did Not Proceed | Dropped Call | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 397 | 212438644 | Fong Loretta (Brian) | Call | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 398 | 224689408 |  | Call | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 399 | 234462907 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 400 | 236964584 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 401 | 229804349 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 402 | 218333845 |  | Call | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 403 | 230774789 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 404 | 222900374 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 405 | 226069970 | zzRic Gordon | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 406 | 231144704 |  | Call | Did Not Proceed | Dropped Call | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 407 | 206888691 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 408 | 220520471 |  | Call | Repeat |  | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 409 | 209137936 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 410 | 215016900 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 411 | 233248073 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 412 | 236266833 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 413 | 233035435 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 414 | 238495577 | Karen McLeod | Call | Did Not Proceed | Dropped Call | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 415 | 223510105 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 416 | 229511123 |  | Call | Repeat |  | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 417 | 225696545 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 418 | 209121188 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 419 | 230131813 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 420 | 211669124 |  | Call | Did Not Proceed | Dropped Call | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 421 | 235483528 | Nada Mobile Akr | Call | -- |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | REVIEW |
| 422 | 241408673 | Mail | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 423 | 226083535 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 424 | 231067274 | David Harrison | Call | Repeat | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 425 | 241156203 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 426 | 222337874 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 427 | 228104555 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 428 | 227694174 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 429 | 207115646 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 430 | 207561463 |  | Call | Did Not Proceed | Wrong Number | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 431 | 227689904 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 432 | 221122591 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 433 | 215763980 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 434 | 225526170 | Unknown | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 435 | 226699623 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 436 | 223509239 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 437 | 224875030 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 438 | 216628842 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 439 | 209127062 |  | Call | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 440 | 227289694 |  | Call | Did Not Proceed | Dropped Call | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 441 | 212976950 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 442 | 208361583 |  | Call | Did Not Proceed | Wrong Number | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 443 | 234034128 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 444 | 234240234 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 445 | 213423411 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 446 | 223505506 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 447 | 220514474 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 448 | 226916275 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 449 | 236971090 |  | Call | Did Not Proceed | Dropped Call | Not Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 450 | 234798972 | Perth Au | Call | Repeat |  | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 451 | 206891528 |  | Call | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 452 | 234029194 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 453 | 217868965 |  | Call | Did Not Proceed | Out of Service Area | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 454 | 235272672 | Kelly | Call | -- |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | REVIEW |
| 455 | 229048872 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 456 | 210669109 | Helen Roberts | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 457 | 211641201 |  | Call | Did Not Proceed | Out of Service Area | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 458 | 222591269 |  | Call | Did Not Proceed | Dropped Call | Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 459 | 241160848 |  | Call | Did Not Proceed | Dropped Call | Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 460 | 210847193 | Perth Au | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 461 | 219112632 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 462 | 231387894 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 463 | 207808141 | Glen Hadiardja | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 464 | 239435567 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 465 | 220726312 | Nigel Carneiro | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141508 + Archived + $0 | AGREE: both say cancelled |
| 466 | 216853877 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 467 | 226914422 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 468 | 214626232 |  | Call | Repeat |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 469 | 209118946 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 470 | 230565275 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 471 | 241075573 | Rosman Greg | Call | Job Completed - To Be Invoiced |  | Paid Job | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142937 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 472 | 221910327 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 473 | 221919516 | Sue | Call | Repeat |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 474 | 241158573 | Joshua Thompson | Call | Job Completed - To Be Invoiced |  | Paid Job | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142954 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 475 | 230772928 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 476 | 241153699 | Hammad Hasson | Call | Job Booked |  | Paid Job | Job Pending | DETERMINED: gate — JN 142947 + Open + $0 | AGREE: both say pending |
| 477 | 229872779 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 478 | 231817423 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 479 | 229869791 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 480 | 227458899 |  | Call | Did Not Proceed | Price too High | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 481 | 234039640 | Christian Tooul | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 482 | 231395487 | Anbu Anpalagan | Call | Did Not Proceed |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 483 | 212281137 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 484 | 226076711 | Selicia Libby | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 485 | 211920303 | Mel | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 486 | 229035619 |  | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 487 | 216021283 | Johanna Scian | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141211 + Archived + $0 | AGREE: both say cancelled |
| 488 | 215291129 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 489 | 217284114 | Daniel Taylor | Call | In Person Quote Only |  | Paid Job | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141297 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 490 | 241081912 | Ani Bhati | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 491 | 236035732 | Eva Molnar | Call | Did Not Proceed | Out of Service Area | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 492 | 232378891 | O'Connell Kim | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 493 | 210193705 | Elvis Zilic | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 494 | 234751044 | Feras Basmawi | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 495 | 220302684 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 496 | 222304317 |  | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 497 | 241425887 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 498 | 215399456 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 499 | 238982441 | Hawanatu  Bangura | Call | Job Completed - To Be Invoiced |  | Paid Job | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142780 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 500 | 238769498 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 501 | 227447936 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 502 | 224075506 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 503 | 228558040 | Wei Wying Ng | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 504 | 215394800 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 505 | 206896134 |  | Call | Did Not Proceed | Out of Service Area | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 506 | 222674592 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 507 | 231805496 | John Abbott | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142260 + Archived + $0 | AGREE: both say cancelled |
| 508 | 229059691 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 509 | 219763858 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 510 | 205701478 |  | Call | Did Not Proceed | Out of Service Area | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 511 | 208365712 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 512 | 215619921 | Michael | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 513 | 234809977 |  | Call | Did Not Proceed |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 514 | 230952955 |  | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 515 | 223501492 | Lisa Baumann | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141696 + Archived + $0 | AGREE: both say cancelled |
| 516 | 241425371 | Watson, Michelle | Call | Job Completed - To Be Invoiced |  | Paid Job | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142975 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 517 | 215403938 |  | Call | Follow up Required |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | REVIEW |
| 518 | 232617198 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 519 | 207554706 |  | Call | Did Not Proceed | Wrong Number | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 520 | 241647870 |  | Call | Waiting to Contact |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | REVIEW |
| 521 | 237914483 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 522 | 234743256 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 523 | 228104816 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 524 | 235048068 |  | Call | Did Not Proceed | Dropped Call | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 525 | 233806634 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 526 | 229702608 |  | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 527 | 237316385 |  | Call | Did Not Proceed | Out of Service Area | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 528 | 218110219 |  | Call | Did Not Proceed | Dropped Call | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 529 | 221313766 |  | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 530 | 222383542 |  | Call | Did Not Proceed | Dropped Call | Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 531 | 229804916 | Joseph Khiami | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 532 | 215394597 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 533 | 227111828 |  | Call | Did Not Proceed | Dropped Call | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 534 | 227901044 |  | Call | Did Not Proceed | Dropped Call | Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 535 | 224477684 | Kosta | Call | Repeat |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 536 | 241156123 | Karen Lawson | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 537 | 215825126 |  | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 538 | 210116175 | Joseph Rupolo | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 539 | 211334704 |  | Call | Did Not Proceed | Wrong Number | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 540 | 209344406 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 541 | 236296411 |  | Call | Did Not Proceed | Out of Service Area | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 542 | 222465206 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 543 | 208559728 | Peter Orchard | Call | In Person Quote Only | Price too High | Paid Job | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140689 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 544 | 223695223 | Asti | Call | Did Not Proceed |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 545 | 221125450 |  | Call | Did Not Proceed | Price too High | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 546 | 230109809 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 547 | 223540948 | Brandon Koprivnjak | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 548 | 229781348 | Phawika Koo | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 549 | 222341812 | Karen | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 550 | 220728410 |  | Call | Did Not Proceed | Out of Service Area | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 551 | 205348160 | Aaron Highfield | Call | Did Not Proceed | Out of Service Area | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 552 | 233226897 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 553 | 236044577 |  | Call | Repeat |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 554 | 228104880 |  | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 555 | 228085160 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 556 | 207107001 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 557 | 236529658 |  | Call | Did Not Proceed |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 558 | 231136344 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 559 | 211172383 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 560 | 209120412 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 561 | 230779380 |  | Call | Did Not Proceed | Dropped Call | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 562 | 216844741 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 563 | 222116036 |  | Call | Did Not Proceed | Wanted Quote Over Phone | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 564 | 222882436 | Brisbane Au | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 565 | 241412564 | Nicky Pow | Call | Job Booked |  | Booked | Job Pending | DETERMINED: gate — JN 142964 + Open + $0 | AGREE: both say pending |
| 566 | 237420697 |  | Call | Did Not Proceed | Dropped Call | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 567 | 235697656 |  | Call | Did Not Proceed | Out of Service Area | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 568 | 232031197 | Heather Bootle | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142282 + Archived + $0 | AGREE: both say cancelled |
| 569 | 223114678 | Julie Morekem | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 570 | 228813656 | Alexa | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142058 + Archived + $0 | AGREE: both say cancelled |
| 571 | 209568434 | Vicky | Form | Booking Cancelled |  | Booked | Account Billing Review | DETERMINED: gate — JN 140777 + Archived + Account + $0 | REVIEW |
| 572 | 212987780 | Chris | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 140979 + Archived + $0 | AGREE: both say cancelled |
| 573 | 227300506 | Ross  Angus | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141986 + Archived + $0 | AGREE: both say cancelled |
| 574 | 223531406 | Tahmid Chowdhury | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 575 | 206159110 | Dean Crighton | Form | Booking Cancelled | Other | Booked | Booking Cancelled | DETERMINED: gate — JN 140523 + Archived + $0 | AGREE: both say cancelled |
| 576 | 214122688 | Jonathon Megalos | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141031 + Archived + $0 | AGREE: both say cancelled |
| 577 | 212271789 | Maria | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 140950 + Archived + $0 | AGREE: both say cancelled |
| 578 | 240543410 | Caroline Bennett | Form | Job Booked |  | Booked | Job Pending | DETERMINED: gate — JN 142921 + Open + $0 | AGREE: both say pending |
| 579 | 238758104 | Alfonso Martinez | Form | Booking Cancelled |  | Booked | Account Billing Review | DETERMINED: gate — JN 142582 + Archived + Account + $0 | REVIEW |
| 580 | 213004903 | Kristie | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 140986 + Archived + $0 | AGREE: both say cancelled |
| 581 | 212922263 | Lei | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 140966 + Archived + $0 | AGREE: both say cancelled |
| 582 | 222130749 | Mary Batzakis (Landl | Call | Did Not Proceed | Dropped Call | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 583 | 235980741 | Jacob | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142572 + Archived + $0 | AGREE: both say cancelled |
| 584 | 214127245 | Filiz Archer | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141035 + Archived + $0 | AGREE: both say cancelled |
| 585 | 211503835 | Chanel | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 140918 + Archived + $0 | AGREE: both say cancelled |
| 586 | 205567299 | megan | Form | Job Completed |  | Booked | Booking Cancelled | DETERMINED: gate — JN 140485 + Archived + $0 | REVIEW |
| 587 | 220493497 | Lee Cooper | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141489 + Archived + $0 | AGREE: both say cancelled |
| 588 | 228835353 | Paulo | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142075 + Archived + $0 | AGREE: both say cancelled |
| 589 | 205354478 |  | Call | Did Not Proceed | Out of Service Area | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 590 | 207809862 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 591 | 236520593 | Bennett | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142601 + Archived + $0 | AGREE: both say cancelled |
| 592 | 214424877 | Ned Cooke | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141058 + Archived + $0 | AGREE: both say cancelled |
| 593 | 214203557 | Matt | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141051 + Archived + $0 | AGREE: both say cancelled |
| 594 | 240768046 | Thomas Van Peteghem | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142935 + Archived + $0 | AGREE: both say cancelled |
| 595 | 221710614 | Vicky | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141580 + Archived + $0 | AGREE: both say cancelled |
| 596 | 219925250 | Candace | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141462 + Archived + $0 | AGREE: both say cancelled |
| 597 | 211513836 | Hjran Mohammmedyan | Form | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 598 | 207321937 | Louise | Form | Did Not Proceed | Out of Service Area | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 599 | 214435782 | AUSTRALIA | Form | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 600 | 214428044 | Claire Gibbons | Form | Lost  / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 601 | 229662494 | Leanne | Form | Did Not Proceed | Price too High | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 602 | 232311496 | Thérèse Bechara | Form | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 603 | 208521690 | Ethan | Form | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 604 | 223747937 | Grace | Form | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 605 | 223124705 | Bibi | Form | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 606 | 206895099 | Karissa | Form | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 607 | 225911049 | Edward Gillroy | Form | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 608 | 222605856 | Vijaya | Form | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 609 | 205894463 | Simon | Form | Did Not Proceed | Wanted Quote Over Phone | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 610 | 213439872 | Thomas | Form | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 611 | 226189638 | Adam Musgrave | Form | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 612 | 213427320 | Ollie | Form | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 613 | 228858410 | John | Form | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 614 | 224228417 | Jessica | Form | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 615 | 221284851 | AUSTRALIA | Form | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 616 | 235040139 | Hadis | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142511 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 617 | 236765504 | Larissa Isakov | Form | Repeat |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142637 + Completed + $0 → T7.2 picks Quote | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 618 | 220141621 | Robert | Form | In Person Quote Only | Price too High | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141475 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 619 | 224088011 | Justin Boyd | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141769 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 620 | 209143572 | Andreas Zehntner | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140736 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 621 | 221131061 | Richard Mott | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141531 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 622 | 216612429 | Amer Ashbeel | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141248 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 623 | 226704606 | Ben Conolly | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141948 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 624 | 206569524 | Deb Curtis | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140552 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 625 | 232337069 | Melvyn Tan | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142307 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 626 | 221130494 | Kathleen Mcfarlane | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141529 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 627 | 227878139 | Tsubasa | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142022 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 628 | 232619039 | Jonah | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142305 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 629 | 241159611 | AUSTRALIA | Form | Job Completed - To Be Invoiced |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142955 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 630 | 238758078 | Breakspear Alice | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142622 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 631 | 207906393 | Isabela | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140650 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 632 | 238758082 | Ming Chen | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142543 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 633 | 214127967 | Jessica | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141032 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 634 | 216868371 | Katie | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141269 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 635 | 222266773 | Paul Taylor | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141601 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 636 | 236036857 | Neil | Form | Job Completed - To Be Invoiced |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142562 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 637 | 240533166 | Marina Tate | Form | Job Completed - To Be Invoiced |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142914 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 638 | 237913357 | Josh Hoole | Form | Job Completed - To Be Invoiced |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142705 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 639 | 212927260 | Deepak | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140968 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 640 | 226924473 | Pracheeti | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141978 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 641 | 240749573 | Rhea Silman | Form | Job Completed - To Be Invoiced |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142927 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 642 | 238503923 | David Yu | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142740 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 643 | 215828438 | Christopher Hampton | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141203 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 644 | 221148570 | Nelson | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 141537 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 645 | 236521169 | Joe | Form | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142618 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 646 | 239437983 | Chiu Ng | Form | Job Booked |  | Job Complete | Job Pending | DETERMINED: gate — JN 142826 + Open + $0 | AGREE: both say pending |
| 647 | 234809257 | Mary Miller | Form | Repeat |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 648 | 227291188 | George Peters | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 649 | 229086141 | Ava | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 650 | 240071305 | Alex M | Form | Repeat |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 651 | 238758090 | Naomi Swan | Form | Did Not Proceed | Out of Service Area | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 652 | 231565612 | Jane O’neill | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 653 | 229797200 | Rachel L Cosgrove | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 654 | 222336111 | Kim Rosenwald | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 655 | 223219634 | Suwanna Wan-In | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 656 | 226170871 | Chantelle Curran | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 657 | 219122167 | Kevin Taylor | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 658 | 211190001 | Sajan Parajuli | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 659 | 238961080 |  | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 660 | 230566263 | Orlaith James | Form | Did Not Proceed | Price too High | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 661 | 231135220 | Taitusi Masiva | Form | Did Not Proceed |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 662 | 219562770 | Swanny | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 663 | 227696770 | Aadi Gakhar | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 664 | 233585463 | Ee Swen Ng | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142383 + Archived + $0 | AGREE: both say cancelled |
| 665 | 227467306 | Bob Thompson | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 666 | 216027999 | Bobby | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 667 | 219162968 | Test | Form | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 668 | 225298167 | Narayan Shrestha | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 669 | 211154382 | Liz Manfredini | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 670 | 219518043 | Aaron | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 671 | 214037652 | Jake | Form | Did Not Proceed | Wanted Quote Over Phone | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 672 | 213376392 | Eve Metz | Form | Did Not Proceed | Out of Service Area | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 673 | 229689671 | Luciano Dambrosi | Form | Did Not Proceed | Price too High | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 674 | 240307433 | Amira Finance | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 675 | 221421521 | Georgia | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 676 | 238758075 |  | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 677 | 211333253 | Tien | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 678 | 238758086 | Jarrad | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 679 | 211996223 | Megan | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 680 | 214828870 | Francesco Amitrano | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 681 | 240543767 | Mary Miller | Form | Repeat |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 682 | 207821291 | Jhovanny D Flames | Form | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 683 | 230100155 | Briana Kouloukakis | Form | Did Not Proceed | Wanted Quote Over Phone | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 684 | 208744658 | Aiyaz | Form | Lost  / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 685 | 209067353 | Kate | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 686 | 204935951 | Shri Menon | Form | Did Not Proceed | Price too High | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 687 | 238758081 |  | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 688 | 223304571 | Test | Form | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 689 | 216855811 | Sajana Bharati | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 690 | 232083709 | Vitele Petelo | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 691 | 220592801 | Test Name | Form | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 692 | 230925434 | Nadine Fornara | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 693 | 209331826 | Jannet | Form | Did Not Proceed | Wrong Number | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 694 | 224301893 | Theraviam Balakrishn | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 695 | 231397112 | Morris Chris | Form | Repeat |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 696 | 228120272 | Sara | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 697 | 226236883 | Alex M | Form | Repeat |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 698 | 222522587 | Ingrid | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 699 | 240087328 | Rabaa | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 700 | 208124489 | Patrice@Sevencommuni | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 701 | 210852535 | Faye | Form | Did Not Proceed | Out of Service Area | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 702 | 230502067 | Ritu D | Form | Did Not Proceed | Price too High | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 703 | 218136643 | Pranisha Shrestha | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 704 | 217211390 | Joe H | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 705 | 238758101 | Linda | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 706 | 230752747 | Barry | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 707 | 236517928 | Aram | Form | Did Not Proceed | Wanted Quote Over Phone | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 708 | 215414550 | John | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 709 | 233062512 | Alex | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 710 | 219114284 | Henry | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 711 | 231850839 | Amy Wilson | Form | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 712 | 208591010 | David Mason | Form | Did Not Proceed | Out of Service Area | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 713 | 233588473 | Sorena Afshar | Form | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 714 | 219918396 | Hedy | Form | Did Not Proceed | Wanted Quote Over Phone | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 715 | 206338143 | Leif | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 716 | 213657439 | Vibha | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 717 | 226902208 | Joe | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 718 | 219757266 | Denise Sheridan | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 719 | 217866208 | Anisur Rahman | Form | Did Not Proceed | Out of Service Area | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 720 | 224305115 | Mary Miller | Form | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 721 | 241157606 |  | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 722 | 238758102 | Mehar Sosa | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 723 | 212844324 | Koosha Rafiee | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 724 | 215386490 | Alex M | Form | Repeat |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 725 | 239743005 | Richard | Form | Repeat |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 726 | 213008438 | Bala Subramanian | Form | Did Not Proceed | Price too High | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 727 | 222501444 | Trent | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 728 | 230780945 | Morris Chris | Form | Repeat |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 729 | 228313613 | Ben | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 730 | 238758079 |  | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 731 | 206523764 | Helen | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 732 | 223768776 | Simon Ken Wu | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 733 | 225048179 | Les | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 734 | 219966070 | Matthew Skiffington | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 735 | 218708983 | Mel | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 736 | 210199418 | Samantha | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 737 | 230977954 | Justin Bartha | Form | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 738 | 212074571 | Brenda.Davidson@Gues | Form | Repeat |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 739 | 208142794 | Nadia Lillecrapp | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 740 | 211043974 | Lucy | Form | Did Not Proceed | Wrong Number | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 741 | 239815943 |  | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 742 | 219361279 | Aaron Kim | Form | Repeat |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 743 | 241423088 |  | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 744 | 207812899 | James | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 745 | 217890659 | Yam Garbuja | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 746 | 230348558 | Michele Cheong | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 747 | 211894414 | Anthea Boesenberg | Form | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 748 | 215334081 | Andy | Form | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 749 | 231150366 | Colin Grim | Form | Repeat |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 750 | 226251864 | Jazzmun | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 751 | 239840733 | Pooja Jorwal | Form | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 752 | 212260888 | Fran | Form | Repeat |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 753 | 212452295 | Ben Cooke | Form | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 754 | 232620107 | Sergio@Onmove.Com.Au | Form | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 755 | 238758077 |  | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 756 | 221420434 | Andrew Fressl | Form | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 757 | 223783506 | Jeremy Mo | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 758 | 214183891 |  | Call | Did Not Proceed | Wrong Number | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 759 | 208341435 | Simon | Form | In Person Quote Only |  | Paid Job | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140662 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 760 | 223304088 | Craig Preston | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 761 | 211333983 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 762 | 230763197 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 763 | 222104276 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 764 | 220943596 | Jacqulin | Call | Did Not Proceed | Price too High | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 765 | 231146643 | Kier | Form | In Person Quote Only |  | Paid Job | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142226 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 766 | 208746408 | Glen Henrich | Call | Did Not Proceed | Wrong Number | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 767 | 227277878 | Peter Qin | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141982 + Archived + $0 | AGREE: both say cancelled |
| 768 | 225281385 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 769 | 237305015 |  | Call | Waiting to Contact |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | REVIEW |
| 770 | 217000745 |  | Call | Did Not Proceed | Wrong Number | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 771 | 227375532 | Selvan Raman | Call | Did Not Proceed | Price too High | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 772 | 230733906 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 773 | 236747779 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 774 | 219562417 |  | Call | Did Not Proceed | Price too High | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 775 | 232304664 | Dharti Lamichhane | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 776 | 209353949 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 777 | 219288739 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 778 | 214847617 | George Calman | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 779 | 212974665 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 780 | 229869434 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 781 | 215388718 | Brew Collective Coff | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141155 + Archived + $0 | AGREE: both say cancelled |
| 782 | 229695671 | Rishi Kushwaha | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 783 | 221691770 |  | Call | Did Not Proceed | Wrong Number | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 784 | 221692203 |  | Call | Repeat |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 785 | 215024685 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 786 | 211506432 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 787 | 215229060 | Alex Taylor | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 788 | 209747968 | Blueridge Animal Hos | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 140789 + Archived + $0 | AGREE: both say cancelled |
| 789 | 210100485 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 790 | 237938742 | Darren Chen | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 791 | 208152970 |  | Call | Did Not Proceed | Dropped Call | Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | PARTIAL: Ferg=reason, we=no content |
| 792 | 231151600 |  | Call | Did Not Proceed | Wanted Quote Over Phone | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 793 | 232157778 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 794 | 230125447 | Melissa | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 795 | 214130120 | Ishtar Van Looy | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 796 | 220500287 |  | Call | Waiting to Contact |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | REVIEW |
| 797 | 206142720 | Zoe | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 798 | 240755765 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 799 | 215037508 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 800 | 209332933 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 801 | 227377841 | Jacob Seconi | Call | Did Not Proceed | Price too High | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 802 | 211529302 | James Walsh | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 803 | 207560688 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 804 | 211269554 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 805 | 236517986 |  | Call | Did Not Proceed | Wrong Number | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 806 | 214846552 | Le Nguyen | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 807 | 226104625 | Jasmine | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 808 | 234028653 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 809 | 219038269 | Ann Wong | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 810 | 219382247 | Parth Gulati | Call | Did Not Proceed | Price too High | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 811 | 230976671 |  | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 812 | 221295011 | Vivian Teitzsch | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 813 | 236744331 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 814 | 216532232 | Chaitanya Thakre | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 815 | 208132846 | Sharon Crick | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 816 | 227445784 |  | Call | Did Not Proceed | Dropped Call | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 817 | 231818851 |  | Call | Did Not Proceed | Out of Service Area | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 818 | 210849529 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 819 | 232615239 |  | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 820 | 215611724 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 821 | 215610495 | Flash Hand Car Wash | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 822 | 235488796 | Adam Crust Pizz | Call | Did Not Proceed | Wrong Number | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 823 | 235884430 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 824 | 232271967 | Shaun | Call | Repeat |  | Captured | Unable to Classify | DETERMINED: gate — touch exists but zero content (recording  | NOT-COMPARABLE: Ferg=Repeat (no equivalent in our taxonomy) |
| 825 | 220311771 |  | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 826 | 224970178 | Sarah Patterson | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 827 | 216627569 | Charlotte Lovegrove | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 828 | 207091092 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 829 | 236757257 |  | Call | Did Not Proceed | Wanted Quote Over Phone | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 830 | 218121521 | Removal Of Captcha | Call | Did Not Proceed | Service Not Offered | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 831 | 234044914 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 832 | 238737378 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 833 | 238509860 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 834 | 213651858 | Elissa Ryan | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141019 + Archived + $0 | AGREE: both say cancelled |
| 835 | 227896564 | Terry Teoh | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142025 + Archived + $0 | AGREE: both say cancelled |
| 836 | 223114061 |  | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 837 | 232834697 | David Lee | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142321 + Archived + $0 | AGREE: both say cancelled |
| 838 | 215387274 | Yen Tran | Call | Job Completed |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141152 + Archived + $0 | REVIEW |
| 839 | 230560950 | Maria Lobo | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142191 + Archived + $0 | AGREE: both say cancelled |
| 840 | 236529358 | Yijun Zhong | Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 841 | 214838725 | Jalal Gonthi | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141131 + Archived + $0 | AGREE: both say cancelled |
| 842 | 219552891 | Gill Merom | Call | Booking Cancelled | Price too High | Booked | Booking Cancelled | DETERMINED: gate — JN 141443 + Archived + $0 | AGREE: both say cancelled |
| 843 | 223846347 | Matthew Von Abo | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141695 + Archived + $0 | AGREE: both say cancelled |
| 844 | 222510038 | MISC COD | Call | Lost / Unresponsive |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141618 + Archived + $0 | REVIEW |
| 845 | 229859799 | Temar Kelleyan | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142145 + Archived + $0 | AGREE: both say cancelled |
| 846 | 223758156 | Paul Sherdian | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141708 + Archived + $0 | AGREE: both say cancelled |
| 847 | 241155488 | Evelyn Cuellar | Call | Job Booked |  | Booked | Job Pending | DETERMINED: gate — JN 142949 + Open + $0 | AGREE: both say pending |
| 848 | 233415101 |  | Call | Did Not Proceed | Spam | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 849 | 240086459 | George | Form | Job Completed - To Be Invoiced |  | Paid Job | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142889 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 850 | 226906377 | Kate Springer | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141956 + Archived + $0 | AGREE: both say cancelled |
| 851 | 221877291 | Joseph Nguyen | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141568 + Archived + $0 | AGREE: both say cancelled |
| 852 | 235464568 | MISC COD | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142539 + Archived + $0 | AGREE: both say cancelled |
| 853 | 231817827 | MISC COD | Call | Booking Cancelled | Dropped Call | Booked | Booking Cancelled | DETERMINED: gate — JN 142264 + Archived + $0 | AGREE: both say cancelled |
| 854 | 223106508 | Bryce | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141674 + Archived + $0 | AGREE: both say cancelled |
| 855 | 210851478 | Matthew Anderson | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 140880 + Archived + $0 | AGREE: both say cancelled |
| 856 | 241642440 | Wai Lim | Call | Job Booked |  | Booked | Job Pending | DETERMINED: gate — JN 142987 + Open + $0 | AGREE: both say pending |
| 857 | 236955766 | Karl Azzi Hairdresse | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142641 + Archived + $0 | AGREE: both say cancelled |
| 858 | 227457440 | Lisa | Form | In Person Quote Only |  | Paid Job | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142005 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 859 | 210828711 | Denis Aitken | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 140877 + Archived + $0 | AGREE: both say cancelled |
| 860 | 210185910 | David Harrison | Form | In Person Quote Only |  | Paid Job | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 140822 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 861 | 237427808 | Stella Yuyin | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142677 + Archived + $0 | AGREE: both say cancelled |
| 862 | 222598005 | Con | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 863 | 215608704 | Darcy Dauth | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141181 + Archived + $0 | AGREE: both say cancelled |
| 864 | 236515721 |  | Call | Lost / Unresponsive |  | Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 865 | 210660126 | Chin, Tony | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 140873 + Archived + $0 | AGREE: both say cancelled |
| 866 | 235682891 | Nicci | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142550 + Archived + $0 | AGREE: both say cancelled |
| 867 | 214427063 | Manjit Singh | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141059 + Archived + $0 | AGREE: both say cancelled |
| 868 | 233237176 | Kylie Barrs | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142357 + Archived + $0 | AGREE: both say cancelled |
| 869 | 223847706 | Helen  Owens | Phone Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141721 + Archived + $0 | AGREE: both say cancelled |
| 870 | 240548610 | AUSTRALIA | Phone Call | Job Booked |  | Booked | Job Pending | DETERMINED: gate — JN 142923 + Open + $0 | AGREE: both say pending |
| 871 | 221688028 | Oporto | Phone Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141556 + Archived + $0 | AGREE: both say cancelled |
| 872 | 239204862 | Avin  Ortega | Phone Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142807 + Archived + $0 | AGREE: both say cancelled |
| 873 | 239821296 | Kevin Berry | Phone Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142874 + Archived + $0 | AGREE: both say cancelled |
| 874 | 241084771 | Kira Dargin | Phone Call | Did Not Proceed | Other | Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (sub-status comparison) |
| 875 | 240544316 | Rachel Fretting | Phone Call | Job Completed - To Be Invoiced |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142917 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 876 | 238745838 | Clare Elias | Phone Call | In Person Quote Only |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142760 + Completed + $0 → T7.2 picks Quote | AGREE: both say quote/booked-$0 |
| 877 | 241144315 | AUSTRALIA | Phone Call | Job Completed - To Be Invoiced |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142941 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 878 | 239823835 | Pooja Jorwal | Phone Call | Job Completed - To Be Invoiced |  | Job Complete | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142880 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 879 | 232028852 |  | Phone Call | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 880 | 241416717 |  | Phone Call | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 881 | 241651277 | INTERNATIONAL | Phone Call | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 882 | 236296529 |  | Phone Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 883 | 239835925 | AUSTRALIA | Phone Call | Did Not Proceed | Dropped Call | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 884 | 225895205 |  | Phone Call | Did Not Proceed |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 885 | 241633492 |  | Phone Call | Waiting to Contact |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | REVIEW |
| 886 | 241644614 |  | Phone Call | Waiting to Contact |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | REVIEW |
| 887 | 221284862 |  | Phone Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 888 | 240084884 |  | Phone Call | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 889 | 231079772 |  | Phone Call | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 890 | 240543875 | INTERNATIONAL | Phone Call | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 891 | 239641154 | Rachel Perkins | Phone Call | Lost / Unresponsive |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement: has_outbound=TRUE → full NQ/NB allowed set | COMPARE: both non-converted (Ferg=lost, T7.2=sub-status) |
| 892 | 213611784 |  | Phone Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 893 | 216243460 |  | Phone Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 894 | 225052526 |  | Phone Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 895 | 235971167 |  | Phone Call | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 896 | 235884158 |  | Phone Call | Follow up Required |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | REVIEW |
| 897 | 237952734 |  | Phone Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 898 | 210665523 |  | Phone Call | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 899 | 229510240 |  | Phone Call | Did Not Proceed | Wanted Quote Over Phone | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 900 | 239821036 | AUSTRALIA | Phone Call | Did Not Proceed | Wrong Number | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 901 | 217444123 | Bellefontain Al | Phone Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 902 | 237245217 |  | Phone Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 903 | 221113058 |  | Phone Call | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 904 | 208547220 |  | Phone Call | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 905 | 239435805 |  | Phone Call | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 906 | 226919147 | MISC COD | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141965 + Archived + $0 | AGREE: both say cancelled |
| 907 | 234795275 | John Sossa | Call | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 142487 + Archived + $0 | AGREE: both say cancelled |
| 908 | 240770440 | AUSTRALIA | Phone Call | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 909 | 238353500 |  | Phone Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 910 | 234453844 |  | Phone Call | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 911 | 240317482 | Brisbane Au | Phone Call | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 912 | 240530396 | AUSTRALIA | Phone Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 913 | 240322594 | AUSTRALIA | Phone Call | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 914 | 236060683 |  | Phone Call | Did Not Proceed | Dropped Call | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 915 | 241420112 | Dr Wen | Phone Call | Did Not Proceed | Service Not Offered | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 916 | 240325920 |  | Phone Call | Did Not Proceed | Spam | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 917 | 227453724 |  | Phone Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 918 | 241652006 |  | Phone Call | Waiting to Contact |  | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | REVIEW |
| 919 | 214182650 |  | Phone Call | Did Not Proceed | Wrong Number | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 920 | 240084370 | AUSTRALIA | Phone Call | Did Not Proceed | Other | Not Captured | NQ/NB: T7.2 judgement | T7.2 judgement + PRE-PASS: has_outbound=FALSE → CU removed f | COMPARE: both non-converted (sub-status comparison) |
| 921 | 231101440 |  | Phone Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 922 | 232826182 |  | Phone Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 923 | 227968985 | Gordon Richard | Phone Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 924 | 240547837 |  | Phone Call | Did Not Proceed | Dropped Call | Not Captured | Unanswered Call | DETERMINED: gate — CDR has_answered_call=FALSE + no content | PARTIAL: Ferg=reason, we=not captured |
| 925 | 240312198 | AUSTRALIA | Phone Call | Job Completed - To Be Invoiced |  | Paid Job | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142896 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 926 | 240550399 | Hazelgrove Early Lea | Phone Call | Job Completed - To Be Invoiced |  | Paid Job | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142926 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 927 | 240546928 | Paula Cavasin | Phone Call | Job Completed - To Be Invoiced |  | Paid Job | Booked: T7.2 judgement (Completed+$0) | GATE-ASSISTED: JN 142920 + Completed + $0 → T7.2 picks Quote | REVIEW |
| 928 | 214435894 | Ruby Becker | Form | Booking Cancelled |  | Booked | Booking Cancelled | DETERMINED: gate — JN 141093 + Archived + $0 | AGREE: both say cancelled |
