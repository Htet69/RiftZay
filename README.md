# RiftZay — live community Riftbound marketplace

RiftZay is a TCGplayer-style marketplace for Riftbound cards, built for your local community. Sellers publish live listings; every member sees the same shared marketplace in real time, with prices in MMK (with an approximate USD equivalent) and local contact details. The card catalog is the **real Riftbound card database** and refreshes itself daily.

## What works

- **Real cards** — the full official Riftbound catalog (~1,100 cards: Origins, Proving Grounds, Spiritforged, Unleashed, Vendetta) with artwork, card text, rarities, and set/collector numbers
- **Always up to date** — the catalog re-fetches a fresh daily snapshot in the background (see "How the catalog updates" below)
- Search by card name, subtitle, set, code, rarity, type, or card text
- Autocomplete with keyboard navigation, card art, and price previews
- Filter and sort the full catalog
- Card page with real art, ability text, and Lowest / Market Average / Available from live community offers
- Sell flow: publish a listing with condition, variant, MMK price, quantity, city, and contact
- Shared accounts + private watchlist per member
- Real-time listing updates (a new offer appears immediately for everyone)
- Every MMK listing price also shows an approximate USD equivalent (`MMK_PER_USD` in `js/config.js`)

## Go live (shared listings across all members)

> You will need a free Supabase account and a free static host. Prices stay in MMK; USD is only a display estimate.

1. Create a **free** Supabase project at https://supabase.com (no credit card).
2. In Supabase → **SQL Editor**, paste the whole `supabase.sql` file and click **Run**. This creates the `listings` + `watchlist` tables, security policies, and realtime.
3. In Supabase → **Authentication → Providers**, turn **off** "Confirm email" so members can sign up instantly.
4. In Supabase → **Project Settings → API**, copy your **Project URL** and **anon public** key into `js/config.js`:
   ```js
   SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
   SUPABASE_ANON_KEY: "your-anon-public-key",
   ```
   Optionally set `MMK_PER_USD` to the current market rate.
5. Deploy this folder to a free static host — easiest is **Netlify Drop** (https://app.netlify.com/drop): drag the whole `RiftZay` folder in and you get a public URL. Vercel, GitHub Pages, and Cloudflare Pages also work.
6. **Verify it's live:** open the deployed URL and check the footer — it must show the green chip **"● Live — listings shared with the community"**. If it says "Local preview", the keys didn't save or you deployed before saving them.

Now share the URL with your community. When anyone publishes a listing, it appears for everyone immediately.

## Offline preview (local mode)

If the Supabase keys are empty, the app runs fully offline from `index.html` using `localStorage` — useful for testing the UI alone. The footer shows an amber **"● Local preview"** chip so you always know which mode you're in.

```text
RiftZay/
├── index.html
├── supabase.sql
├── css/styles.css
├── data/
│   └── cards.js        (bundled snapshot of the real catalog — fallback/offline)
└── js/
    ├── config.js
    ├── cards.js        (loader: fetches the freshest daily snapshot)
    ├── api.js
    └── app.js
```

## How the catalog updates

The app loads `data/cards.js` instantly (a bundled snapshot), then silently fetches the **latest daily snapshot** from the [`LouisCourrian/riftbound-cards`](https://github.com/LouisCourrian/riftbound-cards) Hugging Face mirror, which is scraped from the official Riftbound Card Gallery and republished automatically every day when anything changes. The freshest copy is cached in each visitor's browser (24h), so:

- New sets / cards / errata appear automatically — no redeploy needed.
- If the network is unavailable, the bundled snapshot keeps the site working.
- Card names, ability text, artwork, and set names are © Riot Games, mirrored for non-commercial community use under Riot's fan-content policy.

## Price-data note

Listing prices are the **live community listings** members publish in MMK (the USD equivalent next to them is computed locally from `MMK_PER_USD` and is only an estimate). This is a community marketplace, not a TCGplayer data feed — the prices that matter come from your own sellers. Confirm card condition, identity, payment, and delivery details before trading.
