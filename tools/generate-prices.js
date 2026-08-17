/* RiftZay - regenerate the bundled price snapshot (data/prices.js)
 *
 * The browser falls back to data/prices.js whenever the live Open TCG
 * API cannot be reached (e.g. Cloudflare blocks the visitor's network),
 * so the bundle must stay fresh. This script rebuilds it nightly from
 * the same API endpoints js/prices.js uses, plus fresh RiftCompare store
 * prices (riftcompare.com/api/cards - six markets in native currency
 * cents) joined to our slugs, and carries over any per-condition data we
 * can't refresh.
 *
 * Runs from .github/workflows/collect-history.yml. Can be run locally:
 *   node tools/generate-prices.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PRICES_FILE = path.join(ROOT, 'data', 'prices.js');

const SETS = [
    { id: 24698, abbr: 'VEN' }, { id: 24560, abbr: 'UNL' }, { id: 24519, abbr: 'SFD' },
    { id: 24344, abbr: 'OGN' }, { id: 24439, abbr: 'OGS' }, { id: 24552, abbr: 'JDG' },
    { id: 24528, abbr: 'OPP' }, { id: 24343, abbr: 'PR' }, { id: 24797, abbr: 'SGN' },
];
const BASE = 'https://tcgtracking.com/tcgapi/v1/89/sets/';
const RC_URL = 'https://riftcompare.com/api/cards';
const RC_PAGES = 40; // ~36 cards per page, ~1,430 total

function parseGlobal(src, name) {
    const m = src.match(new RegExp('window\\.' + name + '\\s*=\\s*(\\{.*?\\});', 's'));
    if (!m) throw new Error(name + ' not found in ' + PRICES_FILE);
    return JSON.parse(m[1]);
}

async function fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status);
    return r.json();
}

/* Mirror js/prices.js: turn one set's {productId: {tcg: {Normal, Foil}}}
 * into {slug: {low, market, finish, normal, foil}}. */
function applySetPrices(out, rev, payload) {
    const prices = (payload && payload.prices) || {};
    Object.keys(prices).forEach(function (pid) {
        const slug = rev[pid];
        if (!slug) return;
        const tcg = (prices[pid] && prices[pid].tcg) || {};
        const n = tcg.Normal, f = tcg.Foil;
        const normal = n && n.market != null ? { low: n.low, market: n.market } : null;
        const foil = f && f.market != null ? { low: f.low, market: f.market } : null;
        const pick = normal || foil;
        if (!pick) return;
        out[slug] = {
            low: pick.low,
            market: pick.market,
            finish: normal ? 'Normal' : 'Foil',
            normal: normal,
            foil: foil,
        };
    });
}

/* Mirror js/prices.js: aggregate per-condition SKU matrix into
 * {productId: {finish: {cnd: [mkt, low]}}}. */
function aggregateConds(skuPayload) {
    const aggByPid = {};
    const products = (skuPayload && skuPayload.products) || {};
    Object.keys(products).forEach(function (pid) {
        const agg = {};
        Object.keys(products[pid]).forEach(function (skuId) {
            const sku = products[pid][skuId];
            if (!sku || !sku.var || sku.mkt == null) return;
            if (sku.lng && sku.lng !== 'EN') return;
            const v = agg[sku.var] = agg[sku.var] || {};
            if (!v[sku.cnd]) v[sku.cnd] = [sku.mkt, sku.low];
        });
        const out = {};
        Object.keys(agg).forEach(function (fin) {
            const c = {};
            Object.keys(agg[fin]).forEach(function (cnd) {
                c[cnd] = agg[fin][cnd];
            });
            if (Object.keys(c).length) out[fin] = c;
        });
        if (Object.keys(out).length) aggByPid[pid] = out;
    });
    return aggByPid;
}

function applyConds(out, rev, condsByPid) {
    Object.keys(condsByPid).forEach(function (pid) {
        const slug = rev[pid];
        if (!slug || !out[slug]) return;
        out[slug].conds = condsByPid[pid];
    });
}

/* RiftCompare store prices: lowest in-stock offer per market in native
 * currency cents (US, UK, AU, NZ, SG, CA). The API pages ~36 cards at a
 * time; RiftCompare's slug is "name-set-number" while ours is "set-number",
 * so join on setCode + collectorNumber normalized to our slug format:
 *   VEN + 001/166   -> ven-001-166
 *   VEN + 189-star  -> ven-189-star-166
 *   UNL + t01/000   -> unl-t01 */
async function fetchStorePrices() {
    const byKey = {};
    for (let page = 1; page <= RC_PAGES; page++) {
        let data;
        try {
            data = await fetchJson(RC_URL + '?page=' + page);
        } catch (e) {
            console.warn('riftcompare page ' + page + ' failed: ' + e.message);
            break;
        }
        const cards = (data && data.cards) || [];
        if (!cards.length) break;
        for (const c of cards) {
            let cn = (c.collectorNumber || '').toLowerCase().replace(/\//g, '-');
            cn = cn.replace('*', '-star').replace(/-000$/, '');
            const key = ((c.setCode || '').toLowerCase() + '-' + cn).replace(/^ven-ven-/, 'ven-');
            const rc = {};
            if (c.lowestPriceCents != null) rc.AU = c.lowestPriceCents;
            if (c.lowestPriceCentsNz != null) rc.NZ = c.lowestPriceCentsNz;
            if (c.lowestPriceCentsUs != null) rc.US = c.lowestPriceCentsUs;
            if (c.lowestPriceCentsUk != null) rc.UK = c.lowestPriceCentsUk;
            if (c.lowestPriceCentsSg != null) rc.SG = c.lowestPriceCentsSg;
            if (c.lowestPriceCentsCa != null) rc.CA = c.lowestPriceCentsCa;
            if (Object.keys(rc).length) byKey[key] = rc;
        }
    }
    console.log('riftcompare cards with prices:', Object.keys(byKey).length);
    return byKey;
}

async function main() {
    const src = fs.readFileSync(PRICES_FILE, 'utf8');
    const productMap = parseGlobal(src, 'RIFTZAY_PRODUCT_MAP');
    const prev = parseGlobal(src, 'RIFTZAY_PRICES_BUNDLE');
    const prevMarketsUpdated = (src.match(/window\.RIFTZAY_MARKETS_UPDATED\s*=\s*"([^"]*)"/) || [])[1];
    const rev = {};
    Object.keys(productMap).forEach(function (slug) { rev[productMap[slug]] = slug; });

    const bySet = {};
    const skusBySet = {};
    let updated = null;
    for (const s of SETS) {
        try {
            bySet[s.abbr] = await fetchJson(BASE + s.id + '/pricing');
            if (!updated && bySet[s.abbr].updated) updated = bySet[s.abbr].updated;
        } catch (e) {
            console.warn('pricing failed for ' + s.abbr + ': ' + e.message);
        }
        try {
            skusBySet[s.abbr] = await fetchJson(BASE + s.id + '/skus');
        } catch (e) {
            console.warn('skus failed for ' + s.abbr + ': ' + e.message);
        }
    }

    const out = {};
    Object.keys(bySet).forEach(function (abbr) {
        applySetPrices(out, rev, bySet[abbr]);
        if (skusBySet[abbr]) applyConds(out, rev, aggregateConds(skusBySet[abbr]));
    });

    // Fresh RiftCompare store prices (native-currency cents per market).
    // Fall back to the previous bundle's rc only if RiftCompare is down.
    let rcBySlug = null;
    let rcError = null;
    try {
        const rcByKey = await fetchStorePrices();
        rcBySlug = {};
        Object.keys(productMap).forEach(function (slug) {
            if (rcByKey[slug]) rcBySlug[slug] = rcByKey[slug];
        });
    } catch (e) {
        rcError = e.message;
    }
    if (!rcBySlug || !Object.keys(rcBySlug).length) {
        console.warn('riftcompare store prices unavailable (' + (rcError || 'no matches') + ') - reusing previous rc');
        rcBySlug = null;
    } else {
        console.log('store prices matched to slugs:', Object.keys(rcBySlug).length);
    }

    // Carry over anything we could not refresh today (store prices fallback,
    // and whole records when today's TCGplayer API has no entry).
    Object.keys(prev).forEach(function (slug) {
        const fresh = out[slug];
        const old = prev[slug];
        if (!fresh) {
            out[slug] = old;
        } else {
            if (old && old.rc) fresh.rc = old.rc;
            if (!fresh.conds && old && old.conds) fresh.conds = old.conds;
        }
    });

    // Apply the fresh (or carried-over) RiftCompare prices last.
    if (rcBySlug) {
        Object.keys(rcBySlug).forEach(function (slug) {
            if (out[slug]) out[slug].rc = rcBySlug[slug];
        });
    }

    const cardsPriced = Object.keys(out).length;
    const tcgFetched = Object.keys(bySet).length > 0;
    console.log('cards in bundle:', cardsPriced, '| tcgplayer fetched:', tcgFetched);
    if (cardsPriced < 100) {
        throw new Error('bundle looks broken (only ' + cardsPriced + ' cards) - refusing to write');
    }

    // Only advance each timestamp when its source actually refreshed today,
    // so the site never claims fresh data it doesn't have.
    const prevPriceUpdated = (src.match(/window\.RIFTZAY_PRICE_UPDATED\s*=\s*"([^"]*)"/) || [])[1];
    const stamp = tcgFetched && updated && !isNaN(Date.parse(updated))
        ? updated
        : (tcgFetched ? new Date().toISOString() : prevPriceUpdated);
    const marketsStamp = rcBySlug
        ? new Date().toISOString()
        : (prevMarketsUpdated || new Date().toISOString());
    const outText =
        '// Generated by tools/generate-prices.js from the Open TCG API (tcgtracking.com)\n' +
        '// and RiftCompare store prices (riftcompare.com). Refreshed nightly. Do not edit by hand.\n' +
        'window.RIFTZAY_PRICE_UPDATED = ' + JSON.stringify(stamp) + ';\n' +
        'window.RIFTZAY_MARKETS_UPDATED = ' + JSON.stringify(marketsStamp) + ';\n' +
        'window.RIFTZAY_PRODUCT_MAP = ' + JSON.stringify(productMap) + ';\n' +
        'window.RIFTZAY_PRICES_BUNDLE = ' + JSON.stringify(out) + ';\n';

    fs.writeFileSync(PRICES_FILE, outText, 'utf8');
    console.log('wrote', PRICES_FILE, Buffer.byteLength(outText, 'utf8'), 'bytes, updated', stamp);
}

main().catch(function (e) { console.error(e); process.exit(1); });