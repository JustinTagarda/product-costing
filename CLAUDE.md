# CLAUDE.md

Product-costing web app: Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind v4, with Supabase as the only backend. Everything renders client-side; there are no Next API routes or server components with data fetching.

Deep architecture reference (kept current at end of each session): `docs/project-context.md`. Read it before nontrivial work. Other living docs: `docs/bug-registry.md`, `task-list.md`, `docs/session-start.md` / `docs/session-end.md` (session workflow).

## Commands

- Dev server: `npm run dev`
- Quality gates (definition of done for any code change, run all four):
  1. `npx tsc --noEmit`
  2. `npm run lint`
  3. `npm test` (Vitest, unit tests for `src/lib/**`)
  4. `npm run build`
- UI components have no automated coverage — keep refactors incremental and verify behavior in the running app when it matters. New pure logic belongs in `src/lib` with a `*.test.ts` beside it.

Env vars required (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Architecture

- `src/app/*/page.tsx` — thin route wrappers that `dynamic()`-import a feature component with `ssr: false`. Keep them thin.
- `src/components/*App.tsx` — one page-level feature component per route, owning auth bootstrap, data fetch, mutations, and render. Shared shell pieces: `MainNavMenu`, `GlobalAppToast`, `MainContentStatusFooter`, `ShareSheetModal`, `DataSelectionModal`.
- `src/lib/` — domain logic (costing, bom, purchases, currency, import/export validation) and shared hooks (`useAccountDataScope`, `useAppSettings`).
- `src/lib/supabase/` — per-table adapters. Follow the established pattern exactly: `Db*Row` / `Db*Insert` / `Db*Update` types, `rowTo*` mappers, `*ToRowUpdate` mappers, `makeBlank*Insert` helpers.
- `supabase/schema.sql` — full schema/policies/functions; `supabase/migrations/` — incremental SQL migrations named `YYYYMMDD_description.sql`. Schema changes need both a migration and a `schema.sql` update.

## Conventions

- Components/hooks: PascalCase files, `*App.tsx` suffix for page-level apps, `use*` for hooks; utility modules camelCase; route folders kebab-case; SQL identifiers snake_case.
- Path alias `@/*` → `./src/*`.
- Editable tables use the shared draft-row helpers (`src/lib/tableDraftEntry.ts`) and `DeferredNumericInput`; viewer-mode (shared datasets with read access) must disable all mutating UI.
- Money is handled in integer cents (`parseMoneyToCents`, `formatCentsWithSettingsSymbol`); don't introduce float currency math.
- Auth/session state lives in `sessionStorage` via custom storage (`src/lib/supabase/authStorage.ts`); account-scope selection (own vs shared dataset) comes from `useAccountDataScope` — always scope queries to the active owner account.

## Session workflow

At the end of a substantial working session, update the Session Handoff block at the top of `docs/project-context.md` (one line per field) per `docs/session-end.md`.

Note: `AGENTS.md` holds equivalent instructions for Codex agents; keep the two consistent if project rules change, but never edit any global (outside-repo) instruction files.
