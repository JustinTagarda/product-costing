# Product Costing

Cloud-based product costing and operations workspace for small businesses, built with Next.js and Supabase.

## Live Demo

- https://costing.justintagarda.com

## Why This Project

This project demonstrates full-stack product engineering across:
- Domain-heavy business logic (cost sheets, BOM rollups, weighted purchase costs)
- Secure multi-user collaboration (account sharing with role-based access + RLS)
- Production-focused UX (responsive, touch-friendly workflows across desktop/tablet/mobile)
- Data quality and operational tooling (import validation, normalization, audit history)

## Mobile and Tablet UX Highlights

Recent improvements focused on making dense operational workflows usable on real phones and tablets:
- Mobile editor cards for table-heavy workflows while preserving desktop tables
- Progressive disclosure (`Advanced fields`) for high-density forms
- Touch-friendly horizontal scroll wrappers with swipe affordances where needed
- Mobile-safe input sizing and viewport-safe modal behavior

Implemented across:
- Purchases editor
- Materials editor
- Cost calculator line editors (materials, labor, overhead)
- BOM component line editor
- Product details cost-breakdown horizontal table UX

## Core Features

### Dashboard (`/`)
- KPI summary (cost, margin, labor/material mix)
- Recent products view

### Cost Calculator (`/calculator`)
- Editable cost sheets for materials (with waste), labor, overhead (flat or percentage), markup, and optional tax
- Sheet actions: create, duplicate, delete, import/export JSON

### Products (`/products`, `/products/[productId]`)
- Product catalog with computed totals and margin
- Product details tabs: overview, cost breakdown, history (account change logs), notes

### Materials (`/materials`)
- Material master data management
- Weighted average material cost from purchase history

### Purchases (`/purchases`)
- Purchase tracking (material, variation, quantities, costs, marketplace, store)
- TSV import flow with validation and normalization

### BOM (`/bom`)
- BOM item and line management
- Material lines + nested BOM/subassembly support
- Roll-up cost calculations and circular-reference detection

### Settings (`/settings`)
- Localization and date/time preferences
- Currency formatting and precision controls
- Unit conversions and costing defaults

### Data Sharing (`Share` modal)
- Account-level sharing (not per-sheet)
- Owner can invite by email, assign roles, update roles, and revoke access
- Non-owner sees read-only sharing state

## Access Control

Roles:
- `owner`: full control, including sharing
- `editor`: CRUD inside shared owner dataset, no sharing controls
- `viewer`: read-only

Enforced at:
- UI layer (mutations guarded/disabled for viewers)
- Database layer (Supabase RLS and RPC ownership checks)

Core role-aware tables:
- `cost_sheets`
- `materials`
- `purchases`
- `bom_items`
- `bom_item_lines`
- `app_settings`

## Architecture Notes

- Next.js App Router with feature-focused `*App.tsx` pages
- Supabase-first data model and typed mapping modules
- Client-side auth bootstrap with Google OAuth
- Account scope selection for own data vs shared datasets
- Account audit history via `account_change_logs`

## Tech Stack

- Next.js `16.1.6`
- React `19.2.3`
- TypeScript (strict mode)
- Tailwind CSS v4
- Supabase (Postgres, Auth, RLS, RPC)

## Local Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Configure Supabase

Create a Supabase project and initialize schema:
- Recommended: run `supabase/schema.sql`
- If applying incrementally, include: `supabase/migrations/20260218_account_level_data_sharing.sql`, `supabase/migrations/20260219_account_change_logs.sql`, `supabase/migrations/20260219_account_share_access_levels.sql`

### 3) Enable Google OAuth in Supabase

Add redirect URLs:
- `http://localhost:3000/auth/callback`
- `https://costing.justintagarda.com/auth/callback`

### 4) Set environment variables

From `.env.example`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 5) Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev`: start development server
- `npm run lint`: run ESLint
- `npx tsc --noEmit`: run TypeScript type check
- `npm run build`: create production build
- `npm run start`: start production server
