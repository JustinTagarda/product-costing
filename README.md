# Product Costing

Local-first product costing sheets for batches:

- Materials (with waste %)
- Labor
- Overhead (flat or percent)
- Cost per unit + pricing (markup % + optional tax %)
- Import/export JSON

Data is stored in your browser `localStorage` by default (no database required).

## Dev

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes

- Use **Export** to download a JSON backup.
- Use **Import** to merge sheets from a JSON file.
- Current storage key: `product-costing:local:v1` (see the header in the app).
