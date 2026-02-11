# Product Costing

Product costing sheets for batches with two storage modes:

- Guest mode: local browser storage (`localStorage`)
- Signed-in mode: Supabase database (Google login)

Features:

- Materials (with waste %)
- Labor
- Overhead (flat or percent)
- Cost per unit + pricing (markup % + optional tax %)
- Import/export JSON

When signed out, sheets stay on the current browser/device.  
When signed in, sheets are stored in Supabase and scoped per user.

## Supabase Setup

1) Create a Supabase project.

2) Create the table + RLS policies by running:

- `supabase/schema.sql`

3) Enable **Google** as an Auth provider in Supabase Auth.

4) Add redirect URL(s) in Supabase Auth settings:

- `http://localhost:3000/auth/callback`
- Your Vercel domain callback, e.g. `https://YOUR_APP.vercel.app/auth/callback`

5) Set environment variables (see `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Dev

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes

- Use **Export** to download a JSON backup.
- Use **Import** to upload sheets from a JSON file.
- Google login is optional. If Supabase env vars are missing, the app still works in local mode.
