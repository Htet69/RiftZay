# 🏪 RiftZay — Riftbound TCG Price Tracker

**RiftZay** is a real, working price tracker for Riftbound trading cards. Users can:

- 🔍 **Browse cards** — compare Riftbound card prices across 6 online marketplaces (TCGplayer, Cardmarket, eBay, CardTrader, Amazon, TrollAndToad)
- 👤 **Create accounts** — real authentication (email + password)
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
| Watchlist | This browser only | Synced to your account |
| Best for | Trying it out instantly | A real public price tracker |

### Local mode — try it now (no setup)
1. Double-click `index.html` — that's it.
2. Browse cards, compare prices, create an account, use your watchlist.
3. Everything is stored in that browser's `localStorage`.

> ⚠️ Local mode is useful for testing, but data never leaves your browser.

---

## ☁️ Cloud mode — make it a real website users can share (free)

1. **Create a free Supabase project** → https://supabase.com
   - Free tier: 2 projects, 500 MB database, 50k monthly active users — perfect for a price tracker start.

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

4. **Create the database table** — run this SQL in **Supabase → SQL Editor → New query → Run**:

   ```sql
   -- Watchlist table
   create table public.watchlist (
       user_id uuid not null references auth.users(id),
       card_slug text not null,
       created_at timestamptz not null default now(),
       primary key (user_id, card_slug)
   );

   -- Enable row-level security
   alter table public.watchlist enable row level security;

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
   - Watchlists live in your Supabase database in the cloud

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
│   ├── seed.js         # Riftbound card catalog
│   ├── api.js          # Cloud/local data layer (auth, watchlist)
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