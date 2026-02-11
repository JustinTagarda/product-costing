# Product Costing

Supabase-backed product costing sheets for batches:

- Materials (with waste %)
- Labor
- Overhead (flat or percent)
- Cost per unit + pricing (markup % + optional tax %)
- Import/export JSON

Sheets are stored in your Supabase database and scoped per user (Google login).

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
