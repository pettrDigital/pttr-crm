# PTTR CRM — Claude Code kickoff brief

## What we're building
Single Next.js app: CRM + analytics dashboard for a Sydney plumbing/electrical trades business (PTTR). 
Internal tool — no public-facing pages. Supabase for DB + auth. shadcn/ui for components.

---

## Step 1 — Scaffold the app

```bash
npx create-next-app@latest pttr-crm \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd pttr-crm
```

---

## Step 2 — Install dependencies

```bash
# Supabase
npm install @supabase/supabase-js @supabase/ssr

# shadcn/ui init
npx shadcn@latest init
# When prompted: Default style, Zinc base colour, yes to CSS variables

# shadcn components we'll need
npx shadcn@latest add button card badge table sheet dialog input label select textarea tabs separator skeleton avatar command popover

# Data table (TanStack)
npm install @tanstack/react-table

# Charts
npm install recharts

# Forms
npm install react-hook-form zod @hookform/resolvers

# Utilities
npm install date-fns clsx
```

---

## Step 3 — Environment

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=<from Supabase dashboard>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase dashboard>
SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard — server only>
```

---

## Step 4 — Supabase client setup

Create `src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

Create `src/lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )
}
```

---

## Step 5 — Database schema

Run this SQL in the Supabase SQL editor (Dashboard → SQL Editor → New query).

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── ACCOUNTS ────────────────────────────────────────────────────────────────
create table accounts (
  account_id    uuid primary key default uuid_generate_v4(),
  account_type  text not null check (account_type in ('residential','strata','commercial')),
  account_name  text not null,
  strata_mgmt_company text,
  source        text,                          -- 'aroflo_import' | 'manual' | 'inbound'
  notes         text,
  aroflo_client_id text,                       -- for import mapping
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── CONTACTS ────────────────────────────────────────────────────────────────
create table contacts (
  contact_id    uuid primary key default uuid_generate_v4(),
  account_id    uuid references accounts(account_id) on delete cascade,
  first_name    text,
  last_name     text,
  email         text,
  phone         text,                          -- E.164 normalised
  phone_alt     text,
  role          text check (role in ('property_manager','owner','tenant','committee','other')),
  is_primary    boolean default false,
  aroflo_contact_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── LOCATIONS ───────────────────────────────────────────────────────────────
create table locations (
  location_id   uuid primary key default uuid_generate_v4(),
  account_id    uuid references accounts(account_id) on delete cascade,
  address_full  text not null,
  suburb        text,
  state         text default 'NSW',
  postcode      text,
  location_type text check (location_type in ('residential','strata_building','commercial')),
  strata_plan_no text,
  lot_number    text,
  notes         text,
  aroflo_site_id text,
  created_at    timestamptz not null default now()
);

-- ─── CONTACT_LOCATION (strata many-to-many) ──────────────────────────────────
create table contact_locations (
  contact_id    uuid references contacts(contact_id) on delete cascade,
  location_id   uuid references locations(location_id) on delete cascade,
  relationship  text check (relationship in ('manages','owns','occupies')),
  primary key (contact_id, location_id)
);

-- ─── PHONE IDENTITY (unresolved inbound) ─────────────────────────────────────
create table phone_identities (
  identity_id       uuid primary key default uuid_generate_v4(),
  phone_e164        text,
  email             text,
  contact_id        uuid references contacts(contact_id),      -- nullable until resolved
  account_id        uuid references accounts(account_id),      -- nullable until resolved
  resolution_status text default 'unresolved' check (resolution_status in ('resolved','unresolved','duplicate')),
  first_seen        timestamptz not null default now(),
  last_seen         timestamptz not null default now(),
  unique (phone_e164)
);

-- ─── LEADS ───────────────────────────────────────────────────────────────────
create table leads (
  lead_id        uuid primary key default uuid_generate_v4(),
  identity_id    uuid references phone_identities(identity_id),
  contact_id     uuid references contacts(contact_id),         -- nullable
  account_id     uuid references accounts(account_id),         -- nullable
  location_id    uuid references locations(location_id),       -- nullable
  source_channel text check (source_channel in ('call','form','email','chat')),
  wc_lead_id     text,                                         -- WhatConverts ID
  status         text default 'new' check (status in ('new','quoted','booked','lost')),
  service_type   text,                                         -- 'blocked_drain' | 'hot_water' etc
  suburb         text,
  campaign       text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─── CALLS ───────────────────────────────────────────────────────────────────
create table calls (
  call_id         uuid primary key default uuid_generate_v4(),
  lead_id         uuid references leads(lead_id),
  identity_id     uuid references phone_identities(identity_id),
  phone_from      text,
  phone_to        text,
  duration_sec    integer,
  call_datetime   timestamptz,
  recording_url   text,
  wc_call_id      text,
  outcome         text check (outcome in ('booked','not_booked','voicemail','abandoned')),
  campaign        text,
  after_hours     boolean default false,
  created_at      timestamptz not null default now()
);

-- ─── TRANSCRIPTS ─────────────────────────────────────────────────────────────
create table transcripts (
  transcript_id  uuid primary key default uuid_generate_v4(),
  call_id        uuid references calls(call_id) on delete cascade,
  full_text      text,
  ai_summary     text,
  sentiment      text check (sentiment in ('positive','neutral','negative')),
  key_topics     text[],
  created_at     timestamptz not null default now()
);

-- ─── FORM SUBMISSIONS ────────────────────────────────────────────────────────
create table form_submissions (
  form_id        uuid primary key default uuid_generate_v4(),
  lead_id        uuid references leads(lead_id),
  identity_id    uuid references phone_identities(identity_id),
  form_type      text,
  form_data      jsonb,
  source_url     text,
  email          text,
  phone_raw      text,
  submitted_at   timestamptz not null default now()
);

-- ─── JOBS (synced from AroFlo) ───────────────────────────────────────────────
create table jobs (
  job_id         text primary key,              -- AroFlo task ID
  account_id     uuid references accounts(account_id),
  contact_id     uuid references contacts(contact_id),
  location_id    uuid references locations(location_id),
  lead_id        uuid references leads(lead_id), -- nullable
  job_number     text,
  job_type       text,
  status         text,
  scheduled_date date,
  completed_date date,
  invoice_amount numeric(10,2),
  technician_id  text,
  technician_name text,
  raw_aroflo     jsonb,                          -- full AroFlo payload for reference
  synced_at      timestamptz not null default now()
);

-- ─── JOB NOTES ───────────────────────────────────────────────────────────────
create table job_notes (
  note_id        uuid primary key default uuid_generate_v4(),
  job_id         text references jobs(job_id) on delete cascade,
  note_text      text not null,
  note_type      text check (note_type in ('office','tech','system')),
  created_by     text,
  created_at     timestamptz not null default now()
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
create index on contacts(account_id);
create index on contacts(phone);
create index on contacts(email);
create index on locations(account_id);
create index on locations(suburb);
create index on leads(account_id);
create index on leads(status);
create index on leads(created_at desc);
create index on calls(lead_id);
create index on calls(call_datetime desc);
create index on calls(phone_from);
create index on jobs(account_id);
create index on jobs(completed_date desc);
create index on phone_identities(phone_e164);
create index on phone_identities(email);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger accounts_updated_at before update on accounts
  for each row execute function update_updated_at();
create trigger contacts_updated_at before update on contacts
  for each row execute function update_updated_at();
create trigger leads_updated_at before update on leads
  for each row execute function update_updated_at();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
-- Enable RLS on all tables (internal app — authenticated users see everything)
alter table accounts           enable row level security;
alter table contacts           enable row level security;
alter table locations          enable row level security;
alter table contact_locations  enable row level security;
alter table phone_identities   enable row level security;
alter table leads              enable row level security;
alter table calls              enable row level security;
alter table transcripts        enable row level security;
alter table form_submissions   enable row level security;
alter table jobs               enable row level security;
alter table job_notes          enable row level security;

-- Single policy per table: authenticated users have full access
create policy "authenticated full access" on accounts           for all to authenticated using (true);
create policy "authenticated full access" on contacts           for all to authenticated using (true);
create policy "authenticated full access" on locations          for all to authenticated using (true);
create policy "authenticated full access" on contact_locations  for all to authenticated using (true);
create policy "authenticated full access" on phone_identities   for all to authenticated using (true);
create policy "authenticated full access" on leads              for all to authenticated using (true);
create policy "authenticated full access" on calls              for all to authenticated using (true);
create policy "authenticated full access" on transcripts        for all to authenticated using (true);
create policy "authenticated full access" on form_submissions   for all to authenticated using (true);
create policy "authenticated full access" on jobs               for all to authenticated using (true);
create policy "authenticated full access" on job_notes          for all to authenticated using (true);
```

---

## Step 6 — App structure to scaffold

Create this folder structure under `src/`:

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (crm)/
│   │   ├── layout.tsx              ← sidebar nav
│   │   ├── dashboard/page.tsx
│   │   ├── accounts/
│   │   │   ├── page.tsx            ← accounts list
│   │   │   └── [id]/page.tsx       ← account detail
│   │   ├── leads/
│   │   │   └── page.tsx            ← lead queue
│   │   ├── jobs/
│   │   │   └── page.tsx            ← jobs list
│   │   └── calls/
│   │       └── page.tsx            ← calls + transcripts
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   └── top-bar.tsx
│   ├── accounts/
│   │   ├── accounts-table.tsx
│   │   └── account-detail-sheet.tsx
│   ├── leads/
│   │   └── leads-table.tsx
│   └── shared/
│       ├── data-table.tsx          ← reusable TanStack wrapper
│       └── status-badge.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   └── utils.ts
└── types/
    └── database.ts                 ← generated from schema or handwritten
```

---

## Step 7 — Sidebar nav items

Build `sidebar.tsx` with these nav items and icons (lucide-react):

| Label | Route | Icon |
|---|---|---|
| Dashboard | /dashboard | LayoutDashboard |
| Accounts | /accounts | Building2 |
| Leads | /leads | PhoneIncoming |
| Jobs | /jobs | Wrench |
| Calls | /calls | Phone |

Active state from `usePathname()`.

---

## Step 8 — First page to build: Accounts list

`/accounts/page.tsx` — server component that fetches from Supabase and passes to a client DataTable.

Columns: Account name · Type (badge: strata/residential/commercial) · Suburb · Total jobs · Last job date · Open leads

Filter controls: account_type select · suburb search input

Clicking a row opens an `<Sheet>` (slide-out panel) with full account detail: contacts list, locations list, recent jobs, recent calls/leads timeline.

Build this page end-to-end before moving to the next route.

---

## Notes

- Use server components for all data fetching (Supabase server client). Client components only for interactivity.
- All dates: `date-fns` format, Australia/Sydney timezone.
- Phone display: strip E.164 prefix, format as `04XX XXX XXX` for AU mobiles, `(0X) XXXX XXXX` for landlines.
- `account_type` badge colours: strata → blue, residential → teal, commercial → amber.
- No auth complexity needed yet — set up Supabase email auth, single user (you), protected via middleware.
