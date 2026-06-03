# PTTR CRM — Handover Document

## Overview

Next.js CRM + analytics dashboard for PETTR (Plumber to the Rescue / Electrician to the Rescue). Internal tool — single-tenant, no public-facing pages. Data sourced from BigQuery (read-only), auth via Firebase, UI with shadcn/ui.

**Repo**: `ricgordon1977/pttr-crm` (branch: `dev`)
**Stack**: Next.js 16 · React 19 · TypeScript · Tailwind · shadcn/ui · TanStack Table · BigQuery · Firebase Auth · Firestore

---

## What's Working

### Leads Page (`/leads`)
- Full leads table from `ds_crm.vw_leads` with Inter font, compact rows
- Frozen columns (View, Date, Lead ID) with solid backgrounds — no bleed-through on horizontal scroll
- Sticky header row on vertical scroll
- Alternating row banding (light gray stripes)
- Excel-style column filter dropdowns (unique values per column)
- Pagination with selectable page size (10, 25, 50, 100)
- Global search across name, phone, suburb, source
- Badge components: Channel (Call=red, Form=blue, Email=amber), Profile (PTTR=sky, ETTR=amber), Source (color-coded by category), Medium (cpc=rose, organic=emerald, referral=purple), Funnel Stage (existing design system colors)
- View button as pill badge

### Lead Detail Sheet (slide-in from right)
- Opens on row click, 55vw / min 800px wide
- **Header**: lead name (20px), ID + date, profile label (sky/amber text), compact stats row (funnel stage badge, channel badge, value, speed to lead, after hours)
- **Contact info**: phone, email, suburb — compact single line
- **Converted job bar**: derived from job history data — finds closest job within 30 days of lead date. Blue tint for active/booked jobs, green for completed. Shows: Job #, primary work type (from `task_customfields_deduped`), status badge, invoice amount, address. Falls back to `task_type` if no custom fields. Deduplicates suburb in address display.
- **DNP / Sub-Status**: only shown when `dnp_reason` is not null/empty/"--"/"Select One"
- **Notes**: shown inline if present
- **Interaction timeline**: filtered to 30 days after `lead_datetime` to avoid mixing old customer journeys. Columns: Lucide icon (PhoneIncoming/PhoneOutgoing/Mail/Send green/blue), date, time, operator, duration. Chevron-right indicates clickable rows. Sorted most recent first.
- **Interaction detail view**: takes over full sheet on click. Back arrow returns to timeline. Calls: operator, duration, full transcript in scrollable mono block. Emails: from, to, subject, divider, full body. Fetches from `/api/leads/[id]/interaction` endpoint.
- **Job history table**: matches client across `tasks_complete` (completed) and `tasks_deduped` (active/booked) via phone (last-9-digit matching) and email. Joins `clients_deduped` for active job matching. Shows: date, job #, primary work type, status (blue badge for active), invoiced amount. LEFT JOINs `task_customfields_deduped` for primary work type.
- **Add note**: collapsible section at bottom, writes to Firestore `crm_notes` collection

### Interaction Content API
- `/api/leads/[id]/interaction?type=call|email&datetime=ISO` — fetches full transcript or email body
- Call detail: joins `lead_interactions` → `raw_calls` → `call_transcripts` → `raw_recordings` with ±5 second datetime BETWEEN matching
- Email detail: queries `lead_interactions` for `contact_content` (full body up to 13k chars)

### Call Recordings Route
- `/api/recordings?uri=gs://pttr-recordings/...` — generates 15-minute signed URL via `@google-cloud/storage`
- Locked to `pttr-recordings` bucket only (rejects other buckets with 400)
- Requires `crm-build@pttr-taskdata.iam.gserviceaccount.com` to have `objectViewer` on the bucket (not yet granted — see Known Issues)

### BigQuery Client
- `flattenRow()` in `src/lib/bigquery/client.ts` handles both `{value: "..."}` wrappers (DATETIME/TIMESTAMP) and Big.js objects (NUMERIC) — converts to plain JSON-serializable values at query level
- All queries use parameterized `@params` — no SQL injection risk

### Data Table Component (`src/components/shared/data-table.tsx`)
- Reusable across all pages (leads, accounts, contacts)
- Frozen columns with runtime-measured offsets via `useRef`/`offsetWidth`
- Solid opaque backgrounds on frozen cells (no transparency bleed-through)
- Box shadow on last frozen column edge
- Excel-style dropdown column filters
- Pagination with page size selector
- Alternating row banding
- Row hover highlight (works with frozen columns via inline `onMouseEnter`/`onMouseLeave`)

### Other Pages (scaffolded, basic functionality)
- **Accounts** (`/accounts`): list from `vw_accounts`, detail sheet with locations
- **Contacts** (`/contacts`): list from `vw_contacts`, detail sheet with timeline
- **Dashboard** (`/dashboard`): 30-day stats, recharts integration (has pre-existing type errors)
- **Login** (`/login`): Google sign-in via Firebase, allowlist check before session creation

---

## Security

### API Route Authentication
- Every data API route calls `verifyAuth(request)` from `src/lib/auth/verify-token.ts`
- Verifies Firebase ID token from `Authorization: Bearer <token>` header
- Returns 401 for missing/invalid tokens
- **Email allowlist**: after token verification, checks `decoded.email` against `ALLOWED_USERS` env var (comma-separated). Returns 403 "Access denied — contact administrator" if not on list. Fail-open if env var is empty.
- Login page calls `/api/auth/check-access` after Google sign-in — if denied, signs out immediately and shows access denied message

### Credentials
- BigQuery service account key at `./credentials/service-account.json` (SA: `crm-build@pttr-taskdata.iam.gserviceaccount.com`)
- `.gitignore` covers: `.env*`, `credentials/`, `pttr-taskdata-*.json`, `*.json` (with exceptions for package.json, tsconfig.json, components.json, firebase.json)
- Neither key file is tracked by git

### Firestore Rules
- `firestore.rules` restricts `crm_notes`, `crm_lead_overrides`, `crm_account_notes` to authenticated users only
- Default deny on all other collections
- Deploy with: `firebase deploy --only firestore:rules --project pettr-data`

### Recordings Route
- Validates GCS URI starts with `gs://pttr-recordings/` before generating signed URL
- Rejects arbitrary bucket access

---

## Known Issues / Bugs

### Bug 1: Pre-existing TypeScript errors
- `src/components/dashboard/dashboard-client.tsx` line 132: recharts `Formatter` type mismatch
- `src/components/contacts/contacts-table.tsx` line 75: `Select` onChange type mismatch
- These don't affect runtime — only `tsc --noEmit` strict checking

### Bug 2: Funnel stage classification
- Lead 238740866 shows `funnel_stage = "Pending"` despite having job 142758 booked in AroFlo
- Root cause: `vw_leads` derives funnel_stage from `lead_class` in WhatConverts (`all_leads_classified`), not from AroFlo job status
- Fix requires enriching the classification with a cross-check against AroFlo job data

### Bug 3: Storage permissions for recordings
- `crm-build@pttr-taskdata.iam.gserviceaccount.com` does not yet have `storage.objectViewer` on `pttr-recordings` bucket
- Run: `gsutil iam ch serviceAccount:crm-build@pttr-taskdata.iam.gserviceaccount.com:objectViewer gs://pttr-recordings`

### Bug 4: AroFlo location data gaps
- COD jobs with free-text addresses only have `tasklocation_locationname` (e.g. "142 Garden Street, Maroubra") — no structured suburb/state/postcode
- Structured fields are only populated when the task is linked to a saved location record via `tasklocation_locationid`

---

## What Still Needs to Be Built

1. **Call recordings audio player** — wire up the `/api/recordings` signed URL route to an `<audio>` player in the call detail view (grant storage permissions first)
2. **Accounts page + detail sheet** — scaffold exists but needs data table polish (frozen columns, badges, filters) matching the leads page
3. **Contacts page + detail sheet** — same as accounts
4. **Tasks/Jobs page + detail sheet** — new page showing AroFlo jobs with status, type, invoice amounts, linked leads
5. **Universal search** — API route exists (`/api/search`), needs UI: command palette (cmdk) in top bar, results linking to accounts/contacts/leads
6. **Dashboard charts** — leads by funnel stage, leads by source, revenue by week (recharts scaffolded, needs real data queries)
7. **Firestore write layer** — editable funnel stage and DNP reason on leads (override stored in Firestore, merged at display time)
8. **Cross-linking between pages** — lead → account, lead → contact, job → account, etc. (clickable references in detail sheets)
9. **Mobile responsiveness** — punted for now, desktop-first
10. **Deploy to Vercel** — env vars, domain, production build

---

## Environment Setup

### Required env vars (`.env.local`)
```
GOOGLE_CLOUD_PROJECT=pttr-taskdata
BIGQUERY_DATASET=ds_crm
GOOGLE_APPLICATION_CREDENTIALS=./credentials/service-account.json

NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=pettr-data.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=pettr-data
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=pettr-data.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...

FIREBASE_ADMIN_PRIVATE_KEY=...
FIREBASE_ADMIN_CLIENT_EMAIL=...

ALLOWED_USERS=ricgordon1977@gmail.com,digital.plumbertotherescue@gmail.com,fergusgordon77@gmail.com
```

### Run locally
```bash
cd ~/crm-build
npm install
npm run dev
```

### BigQuery data refresh
```bash
# Trigger AroFlo daily orchestrator
gcloud functions call aroflo-daily-orchestrator --project=pttr-taskdata --region=australia-southeast1

# Trigger custom fields ingest (separate)
gcloud functions call aroflo-customfields-ingest --project=pttr-taskdata --region=australia-southeast1

# Run scheduled queries (dedup views, tasks_complete rebuild, etc.)
bq mk --transfer_run --project_id=pttr-taskdata --run_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)" projects/594562749975/locations/us/transferConfigs/6a33a06f-0000-2556-89d8-582429a9af50
bq mk --transfer_run --project_id=pttr-taskdata --run_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)" projects/594562749975/locations/us/transferConfigs/695dd9bb-0000-22b5-a60f-ac3eb158b6ec
bq mk --transfer_run --project_id=pttr-taskdata --run_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)" projects/594562749975/locations/us/transferConfigs/6a07f71e-0000-29ed-bac7-d4f547e56cb8
```

### Deploy Firestore rules
```bash
firebase deploy --only firestore:rules --project pettr-data
```

---

## Key Architecture Decisions

- **BigQuery as read-only data source** — no writes to BQ from the CRM. All views are in `ds_crm`.
- **Firestore for CRM-specific writes** — notes, funnel stage overrides, user-generated data
- **No Supabase in production** — schema file exists from initial kickoff but was replaced by BigQuery + Firestore
- **Server components for initial page loads** — leads page fetches data server-side, passes to client component
- **Client-side fetches for detail panels** — sheet/modal content loaded on demand via API routes
- **Per-route auth, not middleware** — explicit `verifyAuth()` call at top of each route for clarity
- **Job history matches by phone/email, not lead_id** — because AroFlo jobs aren't linked to WhatConverts leads; matching uses last-9-digit phone normalization and email to find all jobs for a client across both `tasks_complete` and `tasks_deduped`
