# 🏪 RiftZay — Riftbound TCG Marketplace

**RiftZay** is a real, working marketplace for Riftbound trading cards. Users can:

- 🔍 **Browse cards** — compare Riftbound card prices across 6 online marketplaces (TCGplayer, Cardmarket, eBay, CardTrader, Amazon, TrollAndToad)
- 👤 **Create accounts** — real authentication (email + password)
- 📦 **Buy & sell** — post cards for sale, buy from other collectors
- ⭐ **Watchlist** — follow cards and check them anytime
- 📊 **Live prices** — market prices tick and refresh automatically

No Docker. No local installs. Runs 100% in the browser and connects to the cloud.

---

## 🚀 How it runs

RiftZay works in **two modes** — it auto-detects which one to use:

| | Local mode (default) | Cloud mode (recommended) |
|---|---|---|
| Setup | Zero setup — just open the page | ~5 min free setup (below) |
| Accounts | Stored in this browser only | Real shared accounts |
| Listings | This browser only + demo listings | **Shared by ALL users everywhere** |
| Watchlist | This browser only | Synced to your account |
| Best for | Trying it out instantly | A real public marketplace |

### Local mode — try it now (no setup)
1. Double-click `index.html` — that's it.
2. Create an account, buy/sell cards, use your watchlist.
3. Everything is stored in that browser's `localStorage`.

> ⚠️ Local mode is useful for testing, but data never leaves your browser.

---

## ☁️ Cloud mode — make it a real website users can share (free)

1. **Create a free Supabase project** → https://supabase.com
   - Free tier: 2 projects, 500 MB database, 50k monthly active users — perfect for a marketplace start.

2. **Get your API keys**
   - In your Supabase dashboard go to **Project Settings → API**
   - Copy the **Project URL** and the **`anon` public** key

3. **Paste them into the app**
   - Open `js/config.js`
   - Fill in:
     ```js
     const RIFTZAY_CONFIG = {
         SUPABASE_URL: "https://qfbfqpcdkmijsysrhbla.supabase.co",
         SUPABASE_ANON_KEY: "YOUR-ANON-KEY",
         APP_NAME: "RiftZay",
     };
     ```

4. **Create the database tables** — run this SQL in **Supabase → SQL Editor → New query → Run**:

   ```sql
   -- Listings table
   create table public.listings (
       id uuid primary key default gen_random_uuid(),
       card_slug text not null,
       price numeric not null check (price > 0),
       "condition" text not null default 'mint',
       seller_id uuid not null references auth.users(id),
       seller_name text not null,
       status text not null default 'active',
       buyer_id uuid references auth.users(id),
       sold_at timestamptz,
       created_at timestamptz not null default now()
   );

   -- Watchlist table
   create table public.watchlist (
       user_id uuid not null references auth.users(id),
       card_slug text not null,
       created_at timestamptz not null default now(),
       primary key (user_id, card_slug)
   );

   -- Enable row-level security
   alter table public.listings enable row level security;
   alter table public.watchlist enable row level security;

   -- Policies: listings
   create policy "Everyone can read active listings"
       on public.listings for select
       using (status = 'active');

   create policy "Users can create listings"
       on public.listings for insert
       with check (auth.uid() = seller_id);

   create policy "Sellers can delete their own listings"
       on public.listings for delete
       using (auth.uid() = seller_id);

   create policy "Buyers can mark a listing sold"
       on public.listings for update
       using (status = 'active')
       with check (status = 'sold' and auth.uid() = buyer_id);

   -- Policies: watchlist
   create policy "Users can read own watchlist"
       on public.watchlist for select
       using (auth.uid() = user_id);

   create policy "Users can add to own watchlist"
       on public.watchlist for insert
       with check (auth.uid() = user_id);

   create policy "Users can remove from own watchlist"
       on public.watchlist for delete
       using (auth.uid() = user_id);
   ```

5. **Reload the app** — you'll see the banner change to **"Cloud mode"**. 🎉
   - Accounts now shared with every visitor
   - Listings/watches live in your Supabase database in the cloud

---

## 🌐 Publish it — get a real public URL (free, no installs)

You can deploy RiftZay to **Netlify** (or Vercel, GitHub Pages, Cloudflare Pages) by **drag and drop** — no command line, no software.

1. Go to https://app.netlify.com/drop
2. Drag the **whole `RiftZay` folder** onto the page.
3. Done — you get a live URL like `https://funny-name-123.netlify.app`
4. Share that link. All users share the same Supabase cloud database.

> To deploy updates later: drag the folder again (or connect a Git repo for auto-deploys).

---

## 📁 Project structure

```
RiftZay/
├── index.html          # The app (single page)
├── css/
│   └── styles.css      # RiftZay dark-theme styling
├── js/
│   ├── config.js       # ← paste your Supabase URL + key here
│   ├── seed.js         # Riftbound card catalog + demo listings
│   ├── api.js          # Cloud/local data layer (auth, listings, watchlist)
│   └── app.js          # UI logic and rendering
└── README.md           # This file
```

## 🛠️ Tech stack (all free / no installs)

- **Frontend** — HTML, CSS, vanilla JavaScript (no build step)
- **Fonts** — Google Fonts (Orbitron + Inter) via CDN
- **Backend** — Supabase (free cloud Postgres + Auth) loaded via CDN
- **Deploy** — Netlify Drop (free static hosting)

## 📝 Notes

- Prices shown are demo/reference values for illustration.
- Local mode passwords are obfuscated only (for demo). Use Cloud mode for real security.
- Not affiliated with Riftbound or any card publisher.