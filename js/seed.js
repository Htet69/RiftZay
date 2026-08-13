/* RiftZay - Seed data (Riftbound reference cards) */

const RIFTZAY_MARKETS = [
    { key: "tcgplayer", name: "TCGplayer", logo: "🛒", region: "North America" },
    { key: "cardmarket", name: "Cardmarket", logo: "🇪🇺", region: "Europe" },
    { key: "ebay", name: "eBay", logo: "📦", region: "Global" },
    { key: "cardtrader", name: "CardTrader", logo: "🔄", region: "Global" },
    { key: "amazon", name: "Amazon", logo: "📚", region: "Global" },
    { key: "trollandtoad", name: "TrollAndToad", logo: "🐸", region: "North America" },
];

const RIFTZAY_CARDS = [
    {
        slug: "aether-prowler",
        name: "Aether Prowler",
        set: "Riftbound: First Dawn",
        rarity: "common",
        prices: { tcgplayer: 0.15, cardmarket: 0.12, ebay: 0.22, cardtrader: 0.1, amazon: 0.35, trollandtoad: 0.18 },
    },
    {
        slug: "void-shard-sentinel",
        name: "Void Shard Sentinel",
        set: "Riftbound: First Dawn",
        rarity: "uncommon",
        prices: { tcgplayer: 0.45, cardmarket: 0.4, ebay: 0.6, cardtrader: 0.38, amazon: 0.9, trollandtoad: 0.5 },
    },
    {
        slug: "riftwalkers-pact",
        name: "Riftwalker's Pact",
        set: "Riftbound: First Dawn",
        rarity: "rare",
        prices: { tcgplayer: 2.1, cardmarket: 1.85, ebay: 2.6, cardtrader: 1.7, amazon: 3.4, trollandtoad: 2.3 },
    },
    {
        slug: "chrono-weave-adept",
        name: "Chrono Weave Adept",
        set: "Riftbound: Shattered Timelines",
        rarity: "rare",
        prices: { tcgplayer: 3.4, cardmarket: 3.1, ebay: 4.2, cardtrader: 2.95, amazon: 5.1, trollandtoad: 3.7 },
    },
    {
        slug: "eclipse-dragon",
        name: "Eclipse Dragon",
        set: "Riftbound: Shattered Timelines",
        rarity: "legendary",
        prices: { tcgplayer: 24.5, cardmarket: 22.0, ebay: 28.0, cardtrader: 21.0, amazon: 32.0, trollandtoad: 26.0 },
    },
    {
        slug: "null-field-collapse",
        name: "Null Field Collapse",
        set: "Riftbound: First Dawn",
        rarity: "epic",
        prices: { tcgplayer: 8.9, cardmarket: 8.2, ebay: 10.5, cardtrader: 7.8, amazon: 12.0, trollandtoad: 9.4 },
    },
    {
        slug: "starforged-arcanist",
        name: "Starforged Arcanist",
        set: "Riftbound: Emberfall",
        rarity: "mythic",
        prices: { tcgplayer: 45.0, cardmarket: 41.0, ebay: 52.0, cardtrader: 39.5, amazon: 58.0, trollandtoad: 47.0 },
    },
    {
        slug: "prismatic-gatekeeper",
        name: "Prismatic Gatekeeper",
        set: "Riftbound: Emberfall",
        rarity: "legendary",
        prices: { tcgplayer: 18.75, cardmarket: 17.2, ebay: 21.0, cardtrader: 16.5, amazon: 24.0, trollandtoad: 19.5 },
    },
    {
        slug: "soulbound-echo",
        name: "Soulbound Echo",
        set: "Riftbound: Emberfall",
        rarity: "rare",
        prices: { tcgplayer: 1.95, cardmarket: 1.75, ebay: 2.4, cardtrader: 1.6, amazon: 3.1, trollandtoad: 2.1 },
    },
    {
        slug: "dimensional-riftcaller",
        name: "Dimensional Riftcaller",
        set: "Riftbound: Duskveil",
        rarity: "mythic",
        prices: { tcgplayer: 67.0, cardmarket: 61.0, ebay: 74.0, cardtrader: 58.0, amazon: 82.0, trollandtoad: 70.0 },
    },
    {
        slug: "twilight-herald",
        name: "Twilight Herald",
        set: "Riftbound: Duskveil",
        rarity: "legendary",
        prices: { tcgplayer: 12.4, cardmarket: 11.2, ebay: 14.0, cardtrader: 10.8, amazon: 16.5, trollandtoad: 13.0 },
    },
    {
        slug: "cinder-wraith",
        name: "Cinder Wraith",
        set: "Riftbound: Emberfall",
        rarity: "uncommon",
        prices: { tcgplayer: 0.6, cardmarket: 0.55, ebay: 0.8, cardtrader: 0.5, amazon: 1.1, trollandtoad: 0.65 },
    },
    {
        slug: "astral-nexus",
        name: "Astral Nexus",
        set: "Riftbound: Shattered Timelines",
        rarity: "epic",
        prices: { tcgplayer: 6.5, cardmarket: 6.0, ebay: 7.8, cardtrader: 5.7, amazon: 9.0, trollandtoad: 6.9 },
    },
    {
        slug: "feral-riftmaw",
        name: "Feral Riftmaw",
        set: "Riftbound: First Dawn",
        rarity: "rare",
        prices: { tcgplayer: 2.8, cardmarket: 2.5, ebay: 3.3, cardtrader: 2.4, amazon: 4.1, trollandtoad: 3.0 },
    },
    {
        slug: "oblivions-edge",
        name: "Oblivion's Edge",
        set: "Riftbound: Duskveil",
        rarity: "epic",
        prices: { tcgplayer: 9.8, cardmarket: 9.0, ebay: 11.5, cardtrader: 8.6, amazon: 13.0, trollandtoad: 10.2 },
    },
];

/* Build an easy lookup + enriched helpers */
const RIFTZAY_CARD_BY_SLUG = {};
RIFTZAY_CARDS.forEach(function (card) {
    const entries = Object.keys(card.prices).map(function (key) {
        return { market: key, price: card.prices[key] };
    });
    const sorted = entries.slice().sort(function (a, b) { return a.price - b.price; });
    card.marketEntries = entries;
    card.lowest = sorted[0];
    card.highest = sorted[sorted.length - 1];
    card.spread = card.highest.price - card.lowest.price;
    RIFTZAY_CARD_BY_SLUG[card.slug] = card;
});