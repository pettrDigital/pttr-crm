# PTTR CRM — Full Build Brief
## Next.js + BigQuery + Firebase

---

## Context

We have a scaffolded Next.js 16 + TypeScript + Tailwind + shadcn/ui app in the current directory.
It was built with Supabase as the data layer but we are replacing that with:
- **BigQuery** (`pttr-taskdata`) — read-only data source for all CRM data
- **Firebase Firestore** — write layer for CRM actions (notes, status overrides, manual updates)

All BigQuery views are already built and tested. Do not modify them.

GCP Project: `pttr-taskdata`
Firebase Project: create new or use same GCP project

---

## Step 1 — Install dependencies

```bash
# Remove Supabase
npm uninstall @supabase/supabase-js @supabase/ssr

# Add BigQuery
npm install @google-cloud/bigquery

# Add Firebase
npm install firebase firebase-admin

# Keep everything else (shadcn, TanStack, Recharts, etc.)
```

---

## Step 2 — Environment variables

Update `.env.local`:

```
# BigQuery (via service account)
GOOGLE_CLOUD_PROJECT=pttr-taskdata
BIGQUERY_DATASET=ds_crm
GOOGLE_APPLICATION_CREDENTIALS=./credentials/service-account.json

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_ADMIN_PRIVATE_KEY=
FIREBASE_ADMIN_CLIENT_EMAIL=
```

---

## Step 3 — BigQuery client

Create `src/lib/bigquery/client.ts`:

```typescript
import { BigQuery } from '@google-cloud/bigquery'

const bigquery = new BigQuery({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
})

export async function query<T>(sql: string, params?: any[]): Promise<T[]> {
  const options: any = { query: sql }
  if (params) options.params = params
  const [rows] = await bigquery.query(options)
  return rows as T[]
}

export default bigquery
```

Create `src/lib/bigquery/queries.ts` with all query functions:

```typescript
import { query } from './client'

const DS = 'pttr-taskdata.ds_crm'

// ─── ACCOUNTS ────────────────────────────────────────────────────────────────
export async function getAccounts() {
  return query(`
    SELECT * FROM \`${DS}.vw_accounts\`
    ORDER BY rank ASC
  `)
}

export async function getAccountLocations(accountId: string) {
  return query(`
    SELECT * FROM \`${DS}.vw_account_locations\`
    WHERE account_id = @accountId
    ORDER BY location_rank ASC
  `, { accountId })
}

// ─── CONTACTS ────────────────────────────────────────────────────────────────
export async function getContacts() {
  return query(`
    SELECT * FROM \`${DS}.vw_contacts\`
    ORDER BY revenue_l12m DESC NULLS LAST
  `)
}

export async function getContactTimeline(contactId: string) {
  return query(`
    SELECT * FROM \`${DS}.vw_contact_timeline\`
    WHERE contact_id = @contactId
    ORDER BY event_date DESC
  `, { contactId })
}

// ─── LEADS ───────────────────────────────────────────────────────────────────
export async function getLeads(limit = 500) {
  return query(`
    SELECT * FROM \`${DS}.vw_leads\`
    WHERE funnel_stage != 'Repeat'
    ORDER BY lead_date DESC
    LIMIT @limit
  `, { limit })
}

export async function getLeadDetail(leadId: string) {
  return query(`
    SELECT * FROM \`${DS}.vw_lead_detail\`
    WHERE lead_id = @leadId
    ORDER BY interaction_datetime ASC
  `, { leadId })
}

// ─── SEARCH ──────────────────────────────────────────────────────────────────
export async function search(term: string) {
  return query(`
    SELECT * FROM \`${DS}.vw_search\`
    WHERE LOWER(display_name) LIKE LOWER(@term)
       OR LOWER(phone) LIKE LOWER(@term)
       OR LOWER(email) LIKE LOWER(@term)
    LIMIT 50
  `, { term: `%${term}%` })
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
export async function getDashboardStats() {
  return query(`
    SELECT
      COUNT(*) AS total_leads,
      COUNTIF(is_booking) AS bookings,
      COUNTIF(is_converted_job) AS conversions,
      ROUND(SAFE_DIVIDE(COUNTIF(is_booking), COUNT(*)) * 100, 1) AS booking_rate,
      SUM(sales_value) AS revenue
    FROM \`${DS}.vw_leads\`
    WHERE lead_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    AND funnel_stage != 'Repeat'
  `)
}
```

---

## Step 4 — Firebase client

Create `src/lib/firebase/client.ts`:

```typescript
import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)

export const db = getFirestore(app)
export const auth = getAuth(app)
```

Create `src/lib/firebase/admin.ts`:

```typescript
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    }),
  })
}

export const adminDb = getFirestore()
```

---

## Step 5 — API Routes

Create these API routes under `src/app/api/`:

**`src/app/api/accounts/route.ts`**
```typescript
import { NextResponse } from 'next/server'
import { getAccounts } from '@/lib/bigquery/queries'

export async function GET() {
  const accounts = await getAccounts()
  return NextResponse.json(accounts)
}
```

**`src/app/api/accounts/[id]/locations/route.ts`**
**`src/app/api/contacts/route.ts`**
**`src/app/api/leads/route.ts`**
**`src/app/api/leads/[id]/detail/route.ts`**
**`src/app/api/search/route.ts`**
**`src/app/api/dashboard/stats/route.ts`**

Each follows the same pattern — import query function, return NextResponse.json().

---

## Step 6 — TypeScript types

Update `src/types/database.ts` with types matching BigQuery view schemas:

```typescript
export interface Account {
  account_id: string
  account_name: string
  is_do_not_trade: boolean
  client_category: string
  contacts_count: number
  locations_count: number
  top_contact_name: string
  total_jobs: number
  total_revenue: number
  jobs_l12m: number
  revenue_l12m: number
  rank: number
  open_jobs: number
  last_activity: string
  abn: string
  phone: string
  fax: string
  email: string
  address_addressline1: string
  address_addressline2: string
  address_suburb: string
  address_state: string
  address_postcode: string
  notes: string
  primary_contact: string
  datecreated: string
  website: string
}

export interface Contact {
  contact_id: string
  contact_name: string
  contact_type: string
  account_id: string
  account_name: string
  phone: string
  mobile: string
  email: string
  suburb: string
  jobs_l12m: number
  revenue_l12m: number
  open_jobs: number
  last_job_date: string
}

export interface Lead {
  lead_id: string
  lead_date: string
  lead_datetime: string
  channel: string
  profile: string
  contact_name: string
  phone_raw: string
  phone_norm: string
  email: string
  suburb: string
  lead_source: string
  lead_medium: string
  lead_campaign: string
  lead_class: string
  lead_status: string
  dnp_reason: string
  dnp_detail: string
  service_type: string
  funnel_stage: string
  quotable: boolean
  is_booking: boolean
  is_converted_job: boolean
  business_hours_flag: string
  call_duration_seconds: number
  call_transcription: string
  sales_value: number
  call_count: number
  email_count: number
  has_jobs: boolean
  notes: string
}

export interface LeadInteraction {
  lead_id: string
  interaction_date: string
  interaction_time: string
  interaction_datetime: string
  interaction_type: string
  interaction_operator: string
  interaction_summary: string
  interaction_duration_seconds: number
}

export interface Location {
  account_id: string
  account_name: string
  location_id: string
  location_name: string
  full_address: string
  suburb: string
  state: string
  postcode: string
  location_rank: number
  jobs_l12m: number
  revenue_l12m: number
  jobs_total: number
  revenue_total: number
  open_jobs: number
  last_job_date: string
  site_contact: string
  site_phone: string
  site_email: string
}
```

---

## Step 7 — Pages to build

### 7a. Layout (`src/app/(crm)/layout.tsx`)
- Sidebar with nav: Dashboard, Accounts, Contacts, Leads, Jobs, Calls
- Universal search bar at top (hits `/api/search`)
- Search results dropdown grouped by type (Account, Contact, Lead, Job)

### 7b. Accounts page (`src/app/(crm)/accounts/page.tsx`)
Server component. Fetch from `/api/accounts`.

Table columns:
- Rank, Account name, Phone, Email, Locations, Open jobs, Jobs L12M, Revenue L12M, Total Jobs, Total Revenue, Last activity

Row click → opens Account Detail sheet (shadcn `<Sheet>` from right side)

**Account Detail Sheet:**
- Header: account name, rank, ABN, phone, fax, email, address, client since
- Stats row: Contacts, Locations, Open Jobs, Total Jobs, Revenue L12M, Total Revenue
- Tabs: Locations | Contacts | Jobs | Leads & Calls
- Locations tab: table from `/api/accounts/[id]/locations`
  Columns: Rank, Location (full_address), Contact, Phone, Email, Jobs Total, Revenue Total, Open Jobs, Last Job

### 7c. Contacts page (`src/app/(crm)/contacts/page.tsx`)
Table columns:
- Contact name, Type (badge), Suburb, Phone, Email, Account, Jobs L12M, Revenue L12M, Open Jobs, Last Job

Filter: All | Residential | Strata Rep | COD

Row click → Contact Detail sheet
- Header: name, phone, email, suburb, account link
- Timeline table from `/api/contacts/[id]/timeline`

### 7d. Leads page (`src/app/(crm)/leads/page.tsx`)
Default filter: funnel_stage != 'Repeat'

Table columns:
- Date, Channel (icon: 📞↙️/📞↗️/✉️/📤), Profile badge, Contact name, Phone, Email, Suburb, Source, Medium, Funnel Stage (badge), Booked, Converted, After Hours, Duration, Service Type, DNP Reason, Value

"View Lead" button on each row → opens Lead Detail modal

**Lead Detail Modal:**
- Header: contact name, lead # + date, profile badge, after hours badge
- Stats row: Funnel Stage, Channel, Value, Speed to Lead, Service Type
- Contact info: phone, email, suburb
- DNP reason (if applicable)
- Notes (if applicable)
- Job section (if has_jobs): job number, type, status, value
- Interaction timeline table:
  Columns: Date, Time, Type (icon), Operator, Summary, Duration

### 7e. Dashboard page (`src/app/(crm)/dashboard/page.tsx`)
Stats cards (last 30 days):
- Total Leads, Bookings, Booking Rate, Revenue

Charts (Recharts):
- Leads by funnel stage (bar chart)
- Leads by source (pie chart)
- Revenue by week (line chart)

---

## Step 8 — Firestore write layer

Firestore collections for CRM actions (these don't exist in BigQuery):

```
crm_notes/
  {noteId}:
    lead_id: string
    account_id: string
    note_text: string
    created_by: string
    created_at: timestamp

crm_lead_overrides/
  {leadId}:
    manual_funnel_stage: string
    updated_by: string
    updated_at: timestamp

crm_account_notes/
  {noteId}:
    account_id: string
    note_text: string
    created_by: string
    created_at: timestamp
```

Add a "Add note" button to Lead Detail modal and Account Detail sheet that writes to Firestore.

---

## Step 9 — Auth

Use Firebase Auth with Google sign-in (single user for now).

Create `src/middleware.ts`:
```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Protect all /dashboard/* routes
  // Redirect to /login if not authenticated
  // Use Firebase session cookie
}
```

Create simple login page at `/login` with Google sign-in button.

---

## Step 10 — Remove Supabase

- Delete `src/lib/supabase/`
- Remove Supabase references from all components
- Update `src/app/(auth)/login/page.tsx` to use Firebase Auth

---

## Design notes

- Use shadcn/ui components throughout
- Account type badges: strata → blue, residential → teal, COD → amber, do_not_trade → red
- Funnel stage badges:
  - Paid Job → green
  - Booked - Pending → blue
  - Booked - Did Not Complete → orange
  - Not Booked → red
  - Not Quotable → gray
  - Not Captured → gray
  - Pending → yellow
- Profile badges: PTTR → blue, ETTR → purple
- After Hours badge → orange
- Channel icons: 📞↙️ inbound call, 📞↗️ outbound call, 📥 inbound email, 📤 outbound email
- All dates in Australia/Sydney timezone
- Phone display format: 04XX XXX XXX for mobiles, (0X) XXXX XXXX for landlines
- Currency: AUD, no decimals for values over $100

## Build order

1. BigQuery client + API routes (test each with curl)
2. Firebase client + auth
3. Layout + sidebar + search
4. Accounts page + detail sheet
5. Contacts page + detail sheet
6. Leads page + detail modal
7. Dashboard
8. Firestore write layer (notes, overrides)

Build and test each step before moving to the next.
Run `npm run dev` after each step to confirm no TypeScript errors.
