# T7 vs Dashboard — Reconciliation Report
**Date**: 2026-06-21
**CSV**: /Users/ricgordon/crm-build/data/reconciliation/enriched_leads.csv (1245 leads)
**Engine**: Cascade output from crm_auto_classifications
---
## Population Funnel
| Bucket | Count |
|--------|-------|
| Test excluded | 119 |
| Mapped (3-way join) | 957 |
| No identity | 11 |
| Spine gap | 158 |
| **Total** | **1245** |
---
## Cascade Classification (mapped leads)
### By action
| Action | Count |
|--------|-------|
| proposed | 558 |
| determined | 406 |
| system_miss | 6 |
### By sub-status
| Sub-Status | Count |
|------------|-------|
| Completed and Invoiced | 238 |
| Spam | 103 |
| Quote Only | 80 |
| No Follow-Up Recorded | 75 |
| Booking Cancelled | 73 |
| Service Not Provided | 69 |
| Customer Unresponsive | 45 |
| Unable to Classify | 43 |
| Unanswered Call | 39 |
| Price / Minimum Call Out | 25 |
| Wrong Number | 23 |
| Outside Service Area | 22 |
| Capacity / Scheduling | 22 |
| Tenant / Strata Referral | 16 |
| Wanted Quote Over Phone | 15 |
| Other | 14 |
| Customer Resolved | 12 |
| Job Pending | 12 |
| Unable to Complete Job - Out of Scope | 10 |
| Common Property Responsibility | 9 |
| Booked Elsewhere | 7 |
| System-Missed Conversion | 6 |
| Completed - Invoice Pending | 6 |
| Customer Inquiry Only | 4 |
| Account Billing Review | 2 |
---
## Dashboard Classification (mapped leads)
| Dashboard Status | Count |
|-----------------|-------|
| Did Not Proceed | 420 |
| Job Completed | 239 |
| In Person Quote Only | 81 |
| Booking Cancelled | 68 |
| Lost / Unresponsive | 64 |
| Repeat | 50 |
| Waiting to Contact | 19 |
| Job Completed - To Be Invoiced | 12 |
| Job Booked | 10 |
| -- | 3 |
| Lost  / Unresponsive | 2 |
| Follow up Required | 2 |
---
## Unmapped Leads
| Reason | Count |
|--------|-------|
| test_excluded | 96 |
