# Bug Registry

Use this file to prevent fixed defects from resurfacing during refactors.

## Rules
- Every bug fix must have a `Bug ID` (for example `BUG-2026-001`).
- Every closed bug must reference the fix commit and a regression test.
- Do not mark `Closed` if a regression test is missing.
- Keep entries concise and factual.

## Status Legend
- `Open`: Reproduced and not fixed.
- `In Progress`: Fix in implementation.
- `Monitoring`: Fix merged, waiting for production verification.
- `Closed`: Fix verified and protected by regression test.
- `Won't Fix`: Intentionally not addressed.

## Entries
| Bug ID | Status | Date Opened | Date Closed | Severity | Area | Symptom | Root Cause | Fix Summary | Regression Test | Fix Commit | Linked Issue/PR | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BUG-2026-002 | Monitoring | 2026-02-19 |  | High | `src/lib/supabase/client.ts`; `src/lib/supabase/auth.ts`; `src/components/*App.tsx` | Refresh/reload logged authenticated users out and redirected to login/welcome | Supabase client auth used non-persistent session behavior (`persistSession: false`), so auth state did not survive reloads | Switched to persisted PKCE session storage and centralized global sign-out plus client auth cleanup across logout flows | Not explicitly defined in repository. | `759a2c1` | Not explicitly defined in repository. | `team` |
