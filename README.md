# RiftZay â€” live community Riftbound marketplace

RiftZay is a TCGplayer-style marketplace for Riftbound cards, built for your local community. Sellers publish live listings; every member sees the same shared marketplace in real time, with prices in MMK (with an approximate USD equivalent) and local contact details. The card catalog is the **real Riftbound card database** and refreshes itself daily.

## What works

- **Real cards** â€” the full official Riftbound catalog (~1,100 cards: Origins, Proving Grounds, Spiritforged, Unleashed, Vendetta) with artwork, card text, rarities, and set/collector numbers
- **Always up to date** â€” the catalog re-fetches a fresh daily snapshot in the background (see "How the catalog updates" below)
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
2. In Supabase â†’ **SQL Editor**, paste the whole `supabase.sql` file and click **Run**. This creates the `listings` + `watchlist` tables, security policies, and realtime.
3. In Supabase â†’ **Authentication â†’ Providers**, turn **off** "Confirm email" so members can sign up instantly.
4. In Supabase â†’ **Project Settings â†’ API**, copy your **Project URL** and **anon public** key into `js/config.js`:
   ```js
   SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
   SUPABASE_ANON_KEY: "your-anon-public-key",
   ```
   Optionally set `MMK_PER_USD` to the current market rate.
5. Deploy this folder to a free static host â€” easiest is **Netlify Drop** (https://app.netlify.com/drop): drag the whole `RiftZay` folder in and you get a public URL. Vercel, GitHub Pages, and Cloudflare Pages also work.
6. **Verify it's live:** open the deployed URL and check the footer â€” it must show the green chip **"â— Live â€” listings shared with the community"**. If it says "Local preview", the keys didn't save or you deployed before saving them.

Now share the URL with your community. When anyone publishes a listing, it appears for everyone immediately.

## Offline preview (local mode)

If the Supabase keys are empty, the app runs fully offline from `index.html` using `localStorage` â€” useful for testing the UI alone. The footer shows an amber **"â— Local preview"** chip so you always know which mode you're in.

```text
RiftZay/
â”œâ”€â”€ index.html
â”œâ”€â”€ supabase.sql
â”œâ”€â”€ css/styles.css
â”œâ”€â”€ data/
â”‚   â”œâ”€â”€ cards.js         (bundled snapshot of the real catalog â€” fallback/offline)
â”‚   â”œâ”€â”€ prices.js        (bundled snapshot of real TCGplayer market prices â€” fallback/offline)
â”‚   â””â”€â”€ price_history.js (daily market-price snapshots for the forecast engine)
â”‚   â””â”€â”€ meta.js        (daily tournament metagame snapshot from riftdecks.com)
â”œâ”€â”€ tools/
â”‚   â”œâ”€â”€ collect_history.js (nightly collector that appends today's prices)
â”‚   â”œâ”€â”€ collect_meta.js    (nightly collector that fetches tournament metagame)
â”‚   â”œâ”€â”€ generate-prices.js (rebuilds the fallback price bundle so offline visitors get fresh prices daily)
â”‚   â”œâ”€â”€ notify_moves.js    (posts Discord price-move alerts)
â”‚   â”œâ”€â”€ notify_price_alerts.js (emails members whose watched cards dropped >= 5%)
â”‚   â””â”€â”€ watched.json       (card slugs you want a heads-up on at a lower threshold)
â”œâ”€â”€ .github/workflows/
â”‚   â”œâ”€â”€ collect-history.yml (GitHub Action that runs both collectors daily)
â”‚   â”œâ”€â”€ notify-moves.yml    (GitHub Action that posts price-move alerts to Discord)
â”‚   â””â”€â”€ notify-price-alerts.yml (GitHub Action that emails members about watched-card price drops)
â””â”€â”€ js/
    â”œâ”€â”€ config.js
    â”œâ”€â”€ cards.js         (loader: fetches the freshest daily catalog snapshot)
    â”œâ”€â”€ prices.js        (loader: fetches live market pricing from the Open TCG API)
    â”œâ”€â”€ predict.js       (forecast engine: trend + momentum on collected history + tournament meta)
    â”œâ”€â”€ buys.js          (Smart Buy-Now scoring engine incl. forecast signal)
    â”œâ”€â”€ api.js
    â””â”€â”€ app.js
```

## How the catalog updates

The app loads `data/cards.js` instantly (a bundled snapshot), then silently fetches the **latest daily snapshot** from the [`LouisCourrian/riftbound-cards`](https://github.com/LouisCourrian/riftbound-cards) Hugging Face mirror, which is scraped from the official Riftbound Card Gallery and republished automatically every day when anything changes. The freshest copy is cached in each visitor's browser (24h), so:

- New sets / cards / errata appear automatically â€” no redeploy needed.
- If the network is unavailable, the bundled snapshot keeps the site working.
- Card names, ability text, artwork, and set names are Â© Riot Games, mirrored for non-commercial community use under Riot's fan-content policy.

## How prices update

Every card that TCGplayer sells now shows its **real market price** (near-mint and foil, low + market) pulled live from the **Open TCG API** (tcgtracking.com â€” category 89, Riftbound). It's free, needs no key, refreshes nightly from TCGplayer data, and works straight from the static site because its CORS headers are open. Prices are cached in each visitor's browser for 12h; a bundled snapshot in `data/prices.js` keeps the site working offline.

- Market prices appear on card tiles, search suggestions, and a "Market Price Guide" on each card page, in USD with an approximate MMK equivalent (using `MMK_PER_USD` in `js/config.js`).
- A **"Buy Now"** view ranks every card with a transparent **Smart Score (0-100)** using signals like cross-market price gaps, condition discounts, foil value, liquidity, and how much real money can be saved. Cards are tiered **Buy Now / Watch / Wait** with a plain-English reason for each, and a score chip shows up on card tiles and the price guide. Watch a card and RiftZay toasts + browser-notifies you when it becomes a Buy Now pick.
- **Price prediction:** RiftZay collects a **daily market-price snapshot** of every card (via the `collect-history` GitHub Action) and forecasts each card's likely **30-day direction** using trend + momentum on that real history â€” shown as `â–² +12% Â· conf 78%` chips on the Buy Now view, card tiles, and price guides, and weighted into the Smart Score itself. Forecasts are honest statistics (not a black box): they only turn on once a card has a week of collected history, and every chip shows its confidence. The more days RiftZay has, the sharper the predictions get.
- **Tournament-driven insight:** alongside price history, RiftZay also collects a **daily snapshot of the Riftbound tournament metagame** from [riftDecks.com](https://riftdecks.com/cards/stats) â€” how often each card is played, its win rate, and how many decks use it. Because cards that perform well in competitive play (high win rate, rising play rate) tend to climb in price *before* the TCGplayer market fully reacts, this metagame signal is blended into the forecast as a leading indicator. You'll see a `ðŸ† 62% win` chip on hot cards, a tournament line in the Price Trend "why buy" copy, and the forecast confidence rises for cards with solid competitive samples. Tournament data shows up even for cards that haven't built price history yet.
- **Price Trend & "why buy":** every card page draws a **trend chart** of its collected price history with a dashed 30-day projection, plus a plain-language reason for acting â€” *"The price is trending up â€” projected +12% in 30 days. Buying now locks in today's price."* Buy Now rows show a compact sparkline too.
- The price guide also breaks each card down **by condition** (Near Mint / Lightly Played / Moderately Played / Heavily Played / Damaged) for both finishes, pulled from TCGplayer's per-SKU listings â€” so buyers can compare what a well-worn copy actually costs.
- A **"Store Prices Worldwide"** section shows the lowest in-stock offer across six markets (US, UK, Australia, New Zealand, Singapore, Canada), aggregated from local stores and eBay by [RiftCompare](https://riftcompare.com) â€” each in its native currency with an approximate MMK equivalent (rates in `FX_TO_USD` in `js/config.js`).
- Sort by market price lowâ†’high / highâ†’low in the browse view.
- Cards TCGplayer doesn't list (some runes, tokens, judge promos) simply show no market price and fall back to community listings.

## Price-move alerts to your phone (Discord)

The `notify-moves` GitHub Action runs 20 minutes after each daily snapshot and posts to a **Discord webhook** whenever a card's market price moved a lot since yesterday â€” so you get a phone push (Discord app) without building anything. One-time setup:

1. In Discord, open a server â†’ channel â†’ **Edit Channel â†’ Integrations â†’ Webhooks â†’ New Webhook** â†’ copy the webhook URL.
2. On GitHub: **repo â†’ Settings â†’ Secrets and variables â†’ Actions â†’ New repository secret**, name it `DISCORD_WEBHOOK`, paste the URL.
3. In `tools/watched.json`, add the slug of any card you want a *lower* 2% threshold on, e.g. `"sfd-227-star-221"` (you can find a slug in any card's URL). Everything else alerts at the default 5%.

That's it â€” alerts start on the next daily run (or hit **Actions â†’ Notify price moves â†’ Run workflow** to test now). Each alert lists the biggest movers with name, new price, and the % change.

## Price-drop alerts by email (for your members)

Members who sign in can toggle **"Email me when a watched card's price drops 5% or more"** on their Watchlist page. A nightly job emails each opted-in user about the cards on their watchlist that dropped at least 5% between daily snapshots. The emails are sent through [Resend](https://resend.com) (free tier: 100 emails/day). One-time setup:

1. Create a free account at https://resend.com, add a domain (or use `onboarding@resend.dev` while testing), and copy your **API key**.
2. Verify the `profiles` table exists: in Supabase â†’ SQL Editor, re-run `supabase.sql` (it now creates the `profiles` table + policies alongside `watchlist`/`listings`).
3. On GitHub: **repo â†’ Settings â†’ Secrets and variables â†’ Actions**, add these secrets:
   - `SUPABASE_URL` â€” your Project URL (same as in `js/config.js`)
   - `SUPABASE_SERVICE_KEY` â€” Project Settings â†’ API â†’ `service_role` key
   - `RESEND_API_KEY` â€” from Resend
   - `ALERT_FROM_EMAIL` â€” e.g. `RiftZay <alerts@yourdomain.com>`
4. The `notify-price-alerts` Action runs daily at 08:40 UTC (after the collectors). Test it now via **Actions â†’ Notify price-drop alerts â†’ Run workflow**, or dry-run locally:
   ```bash
   node tools/notify_price_alerts.js --dry
   ```

The opt-in is on by default for new sign-ups; members can turn it off with one toggle on their Watchlist page. Alerts only ever contain cards the user is watching.

## Price-data note

Two kinds of prices coexist on RiftZay:

1. **Real market prices** from TCGplayer (via the Open TCG API) â€” shown as "Market" / in the price guide.
2. **Community listings** â€” prices members publish in MMK (the USD equivalent next to them is computed locally from `MMK_PER_USD` and is only an estimate).

Community listings are the live offers from your own sellers; market prices are a global reference. Confirm card condition, identity, payment, and delivery details before trading.
