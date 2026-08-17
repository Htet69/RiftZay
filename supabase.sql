-- RiftZay community marketplace schema
-- Run this once in Supabase > SQL Editor.

create table if not exists public.watchlist (
    user_id uuid not null references auth.users(id) on delete cascade,
    card_slug text not null,
    created_at timestamptz not null default now(),
    primary key (user_id, card_slug)
);

create table if not exists public.listings (
    id uuid primary key default gen_random_uuid(),
    card_slug text not null,
    seller_id uuid not null references auth.users(id) on delete cascade,
    seller_name text not null check (char_length(seller_name) between 1 and 60),
    condition text not null check (condition in ('Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged')),
    variant text not null check (variant in ('Normal', 'Foil', 'Alternate Art')),
    price_mmk integer not null check (price_mmk > 0),
    quantity integer not null default 1 check (quantity between 0 and 999),
    location text not null check (char_length(location) between 2 and 100),
    contact text not null check (char_length(contact) between 3 and 160),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists listings_card_price_idx
    on public.listings (card_slug, price_mmk)
    where quantity > 0;

create index if not exists listings_created_idx
    on public.listings (created_at desc)
    where quantity > 0;

-- Keep updated_at in sync automatically
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end $$;

drop trigger if exists listings_touch_updated_at on public.listings;
create trigger listings_touch_updated_at
    before update on public.listings
    for each row execute function public.touch_updated_at();

alter table public.watchlist enable row level security;
alter table public.listings enable row level security;

drop policy if exists "Users can read own watchlist" on public.watchlist;
drop policy if exists "Users can add to own watchlist" on public.watchlist;
drop policy if exists "Users can remove from own watchlist" on public.watchlist;
create policy "Users can read own watchlist" on public.watchlist for select using (auth.uid() = user_id);
create policy "Users can add to own watchlist" on public.watchlist for insert with check (auth.uid() = user_id);
create policy "Users can remove from own watchlist" on public.watchlist for delete using (auth.uid() = user_id);

drop policy if exists "Anyone can read active listings" on public.listings;
drop policy if exists "Sellers can read own listings" on public.listings;
drop policy if exists "Users can create own listings" on public.listings;
drop policy if exists "Users can update own listings" on public.listings;
drop policy if exists "Users can delete own listings" on public.listings;
create policy "Anyone can read active listings" on public.listings for select using (quantity > 0);
create policy "Sellers can read own listings" on public.listings for select using (auth.uid() = seller_id);
create policy "Users can create own listings" on public.listings for insert with check (auth.uid() = seller_id);
create policy "Users can update own listings" on public.listings for update using (auth.uid() = seller_id) with check (auth.uid() = seller_id);
create policy "Users can delete own listings" on public.listings for delete using (auth.uid() = seller_id);

-- Enable realtime for listings (safe to re-run)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'listings'
  ) then
    alter publication supabase_realtime add table public.listings;
  end if;
end $$;
