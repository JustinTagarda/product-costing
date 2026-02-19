# Project Context Snapshot

## Session Handoff
Update this block at the end of each session. Keep every field to one line.

- Date: `2026-02-19`
- Session scope: `UI improvements`
- Branch: `main`
- Working tree: `## main...origin/main [ahead 1]`
- Completed: `None yet`
- Remaining: `Add automated regression coverage for refresh persistence and explicit logout behavior (BUG-2026-002) and then move it to Closed; review and commit .github/pull_request_template.md if intentional; implement prioritized UI improvements for navigation/layout polish`
- Blockers/Risks: `No automated regression test currently protects refresh/logout auth behavior; docs/ is excluded via .git/info/exclude so doc updates require force-add to commit`
- Validation: `typecheck=not-run; lint=not-run; build=not-run`
- Next step: `Implement the first UI improvement by polishing main navigation responsive spacing/visual hierarchy in src/components/MainNavMenu.tsx`

## Stack Detection
| Area | Detection | Evidence |
|---|---|---|
| Framework and version | Next.js `16.1.6` | `package.json`, route structure in `src/app/*` |
| UI library | React `19.2.3` | `package.json` (`react`, `react-dom`) |
| Language | TypeScript-first (`.ts`/`.tsx`), JavaScript allowed by compiler | `tsconfig.json` (`strict: true`, `allowJs: true`), source files under `src/` |
| Build tool | Next.js build pipeline (`next dev`, `next build`, `next start`) | `package.json` scripts |
| Runtime | Client-rendered React pages/components plus Next.js runtime for app execution | `"use client"` across `src/app/*/page.tsx` and `src/components/*`, Next scripts in `package.json` |
| Runtime version | Not explicitly defined in repository. | No `engines`, `.nvmrc`, or `.node-version` |
| Package manager | npm | `package-lock.json` present |
| Styling solution | Tailwind CSS v4 + global CSS variables/utilities | `tailwindcss` and `@tailwindcss/postcss` in `package.json`, `postcss.config.mjs`, `src/app/globals.css` |
| State management | React local state/hooks + custom hooks (`useAccountDataScope`, `useAppSettings`) | `src/components/*`, `src/lib/useAccountDataScope.ts`, `src/lib/useAppSettings.ts` |
| API structure | Direct Supabase client calls from client components/hooks; SQL RPC functions for shared operations; no Next API routes | `supabase.from(...)` / `supabase.rpc(...)` usage in `src/components/*`; no `src/app/**/route.ts` files |
| Testing setup | Not explicitly defined in repository. | No `test` script in `package.json`; no `*.test.*`/`*.spec.*` files under `src/` |
| Linting setup | ESLint with Next core web vitals + Next TypeScript config | `eslint.config.mjs` |
| Formatting setup | Not explicitly defined in repository. | No Prettier config or formatting script |

## Getting Started

### Commands
- Install dependencies: `npm install`
- Run development server: `npm run dev`
- Build production bundle: `npm run build`
- Start production server: `npm run start`

### Required Environment Variables
| Variable name | Referenced in |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase/client.ts`, `src/lib/supabase/auth.ts`, `.env.example`, `README.md` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase/client.ts`, `.env.example`, `README.md` |

## Route Map
| Route | Page file | Loaded `*App.tsx` |
|---|---|---|
| `/` | `src/app/page.tsx` | `DashboardApp` |
| `/auth/callback` | `src/app/auth/callback/page.tsx` | Not explicitly defined in repository. (Direct page logic, no `*App.tsx`) |
| `/bom` | `src/app/bom/page.tsx` | `BomApp` |
| `/calculator` | `src/app/calculator/page.tsx` | `CostingApp` |
| `/coming-soon` | `src/app/coming-soon/page.tsx` | `ComingSoonApp` |
| `/dataset-select` | `src/app/dataset-select/page.tsx` | `DatasetSelectionApp` |
| `/materials` | `src/app/materials/page.tsx` | `MaterialsApp` |
| `/products` | `src/app/products/page.tsx` | `ProductsApp` |
| `/products/[productId]` | `src/app/products/[productId]/page.tsx` | `ProductDetailsApp` |
| `/purchases` | `src/app/purchases/page.tsx` | `PurchasesApp` |
| `/settings` | `src/app/settings/page.tsx` | `SettingsApp` |

## Architecture

### Folder Structure and Responsibilities
- `src/app`: App Router routes and root layout; each route page dynamically loads a feature component.
- `src/components`: Feature-level application components (`*App.tsx`) and shared UI building blocks/modals.
- `src/lib`: Domain models, calculations, formatting, validation, navigation, and table-edit helpers.
- `src/lib/supabase`: Supabase client/auth storage helpers and row mappers (`rowTo*`, `*ToRowUpdate`, `makeBlank*Insert`).
- `supabase/schema.sql`: Full schema, policies, functions, triggers.
- `supabase/migrations`: Incremental SQL migrations (timestamp-prefixed).
- `public`: Static assets.
- `docs`: Project documentation artifacts.

### Feature Organization Strategy
- Route files in `src/app/*/page.tsx` are thin wrappers that `dynamic()` import feature components with `ssr: false`.
- Feature components in `src/components/*App.tsx` own page behavior: auth bootstrap, data fetch, local UI state, mutations, and render.
- Shared cross-feature concerns are centralized in hooks (`useAccountDataScope`, `useAppSettings`) and reusable shell components (`MainNavMenu`, `GlobalAppToast`, `ShareSheetModal`, `DataSelectionModal`).

### Data Flow
1. Route page mounts and loads a feature component via Next dynamic import.
2. Feature component initializes Supabase client (`getSupabaseClient`) in guarded state initializer.
3. Auth state is hydrated with `auth.getSession()` and updated via `auth.onAuthStateChange`.
4. Active account scope (own/shared dataset) is resolved by `useAccountDataScope`.
5. Settings are loaded by `useAppSettings` for the active owner account.
6. Feature data is fetched from Supabase tables/RPCs and mapped to UI/domain models using `rowTo*` helpers.
7. UI edits update local component state, then persist through Supabase `insert/update/delete` calls (often debounced for row edits).

### Component Patterns
- Client-only feature pages (`"use client"`) with shared shell layout.
- Repeated shell composition: `MainNavMenu` + feature content + `GlobalAppToast` + status/footer + sharing/data-selection modals.
- Heavy use of editable table interfaces with deferred numeric inputs and draft-row commit handlers (`handleDraftRowBlurCapture`, `handleDraftRowKeyDownCapture`).
- Per-feature transient notification state (`notice`) with timed dismissal.

### Service Layer Patterns
- Table-specific adapter modules under `src/lib/supabase` provide typed DB contracts:
  - `Db*Row`, `Db*Insert`, `Db*Update` types
  - `rowTo*` mapping functions
  - `*ToRowUpdate` mapping functions
  - `makeBlank*Insert` helpers
- Supabase RPC functions are part of the service boundary for account sharing and audit logs:
  - `list_shared_accounts_for_current_user`
  - `share_account_with_email`
  - `unshare_account_by_email`
  - `list_account_change_logs`

## Data Model Overview
| Supabase table | UI usage | Mapping module (`rowTo*`) |
|---|---|---|
| `cost_sheets` | Dashboard, calculator, products, product details | `src/lib/supabase/costSheets.ts` (`rowToSheet`) |
| `materials` | Materials, purchases, calculator, BOM | `src/lib/supabase/materials.ts` (`rowToMaterial`) |
| `purchases` | Purchases, materials weighted-cost derivation | `src/lib/supabase/purchases.ts` (`rowToPurchase`) |
| `bom_items` + `bom_item_lines` | BOM management UI | `src/lib/supabase/bom.ts` (`rowToBomLine`, `combineBomRows`) |
| `app_settings` | Settings load/save and formatting defaults across features | `src/lib/supabase/settings.ts` (`rowToSettings`) |
| `account_change_logs` | Product details history tab, share modal activity | `src/lib/supabase/accountChangeLogs.ts` (`rowToAccountChangeLog`) |
| `account_shares` | Share modal and account-scope selection | Not explicitly defined in repository. (No dedicated `rowTo*` mapper) |

## Operational Notes
- Auth session persistence uses Supabase client config in `src/lib/supabase/client.ts` with custom storage from `src/lib/supabase/authStorage.ts`.
- Session tokens are persisted to `sessionStorage` using key `product-costing:supabase-auth` (memory fallback exists for storage access failures).
- Account data-scope selection is also session-scoped via key prefix `product-costing:selected-owner:`.
- Sign-out path clears auth data from memory, `sessionStorage`, `localStorage`, and matching auth cookies (`clearClientAuthData`).
- Route pages dynamically import feature apps with `{ ssr: false }`; combined with `"use client"`, feature rendering/data-fetch/auth bootstrap are client-only.
- Client-only loading implies no server-side data prefetch for feature pages; initial UI state relies on client hydration/loading states before data appears.

## Conventions

### Naming Conventions
- React components: PascalCase file and export names (for example `ProductsApp.tsx`, `ShareSheetModal.tsx`).
- Hooks: `use*` naming (`useAccountDataScope.ts`, `useAppSettings.ts`).
- Utility/domain modules: camelCase filenames (`importDataValidation.ts`, `itemCodes.ts`).
- DB adapter types: `Db*Row`, `Db*Insert`, `Db*Update`.
- Database columns/tables/functions: snake_case in SQL and Supabase queries.

### File Naming and Folder Rules
- Route folders are lowercase/kebab-case (`dataset-select`, `coming-soon`, `auth/callback`).
- Dynamic route segments use bracket notation (`src/app/products/[productId]/page.tsx`).
- Feature components use `*App.tsx` suffix for page-level apps.
- Supabase migration files use `YYYYMMDD_description.sql` naming.

### Enforced Patterns from ESLint and TypeScript
- TypeScript strict checking enabled (`strict: true`).
- No emit in TypeScript build (`noEmit: true`).
- Module resolution set to bundler mode (`moduleResolution: "bundler"`).
- Path alias configured: `@/* -> ./src/*`.
- ESLint extends Next core web vitals and Next TypeScript presets, with explicit global ignores for build artifacts.

## Quality Gates
Definition of done for code changes:
1. Typecheck passes: `npx tsc --noEmit`
2. Lint passes: `npm run lint`
3. Production build passes: `npm run build`

## Technical Debt and TODO Findings

### TODO/Marker Scan
- `TODO`/`FIXME`/`HACK`/`XXX`/`TECHDEBT` markers: none found in `src/` and `supabase/`.

### Evidence-Based Debt Signals
- Large feature components combine data access, state orchestration, and rendering in single files:
  - `src/components/PurchasesApp.tsx` (~1670 lines)
  - `src/components/CostingApp.tsx` (~1582 lines)
  - `src/components/BomApp.tsx` (~815 lines)
  - `src/components/MaterialsApp.tsx` (~809 lines)
- Automated tests: Not explicitly defined in repository.
- README alignment risk: `README.md` describes guest-mode `localStorage` product persistence, while current feature implementations are cloud/signed-in oriented with no explicit product-data `localStorage` path in current `src/components/*App.tsx` and `src/lib/*` modules.
