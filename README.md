# Product Costing

Cloud-based product costing and operations workspace for small businesses.

This app runs on Next.js + Supabase and supports:
- Cost calculator (materials, labor, overhead, pricing)
- Product catalog and product detail/history views
- Materials and purchases management
- BOM/subassembly management
- Account-level sharing with role-based access (`owner`, `editor`, `viewer`)

## Current App Behavior

The project is now Supabase-first:
- Data is stored in Supabase (not localStorage guest mode).
- Authentication uses Google OAuth.
- Per-session account scope selection supports:
  - your own account data
  - shared account data
- If no one has shared data with the signed-in user, dataset selection is skipped automatically.

## Feature Overview

### Dashboard (`/`)
- KPI overview (cost, labor/material mix, margin)
- Recent products table

### Cost Calculator (`/calculator`)
- Cost sheet editing for:
  - materials (+ waste %)
  - labor
  - overhead (flat or percentage)
  - markup and optional tax
- Sheet actions:
  - create
  - duplicate
  - delete
  - export/import JSON

### Products (`/products`, `/products/[productId]`)
- Product list with computed totals/margins
- Product detail tabs:
  - overview
  - cost breakdown
  - history (account change logs)
  - notes

### Materials (`/materials`)
- Material master list
- Weighted average cost display derived from purchases

### Purchases (`/purchases`)
- Purchase tracking (material, description, variation, qty, cost, usable qty, marketplace, store)
- TSV import workflow with validation + normalization

### BOM (`/bom`)
- BOM item and line management
- Material and nested BOM component support
- Roll-up cost calculations
- Circular reference detection warnings

### Settings (`/settings`)
- Localization (country, timezone, date format)
- Currency formatting and rounding
- Unit conversions
- Costing defaults (waste, markup, tax, precision)

### Data Sharing (`Share` modal)
- Account-level sharing (not per-sheet)
- Owner can:
  - add users by email
  - assign role (`editor` or `viewer`)
  - update role
  - remove share
- Non-owner sees read-only sharing view (owner + shared users + roles)

## Access Control Model

### Owner
- Full data control
- Can manage sharing and access levels

### Editor
- Can create, update, delete within shared owner dataset
- Cannot manage sharing

### Viewer
- Read-only access to shared owner dataset
- Cannot create, update, delete
- Cannot manage sharing

Enforcement is implemented at both:
- UI level (mutating controls disabled/guarded for viewers)
- Database level (RLS and RPC ownership checks)

Core tables with role-aware RLS:
- `cost_sheets`
- `materials`
- `purchases`
- `bom_items`
- `bom_item_lines`
- `app_settings`

## Tech Stack

- Next.js `16.1.6`
- React `19`
- TypeScript
- Tailwind CSS v4
- Supabase (Postgres + Auth + RPC/RLS)

## Setup

### 1) Install

```bash
npm install
```

### 2) Configure Supabase

Create a Supabase project, then initialize schema.

Recommended:
- Run `supabase/schema.sql` (canonical full schema)

If applying incrementally, ensure these migrations are included:
- `supabase/migrations/20260218_account_level_data_sharing.sql`
- `supabase/migrations/20260219_account_change_logs.sql`
- `supabase/migrations/20260219_account_share_access_levels.sql`

### 3) Enable Google OAuth

In Supabase Auth providers:
- Enable Google
- Add redirect URLs:
  - `http://localhost:3000/auth/callback`
  - your deployed callback URL, e.g. `https://YOUR_APP.vercel.app/auth/callback`

### 4) Environment Variables

From `.env.example`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 5) Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` - start dev server
- `npm run lint` - run ESLint
- `npm run build` - production build
- `npm run start` - run production server
