/* RiftZay - Real Riftbound market prices (auto-updated)
 *
 * Price source: Open TCG API by TCGTracking
 *   https://openapi.tcgtracking.com  (category 89 = Riftbound)
 * Free, no key required, refreshed nightly from TCGplayer market data.
 *
 * How it works, mirroring js/cards.js:
 *   1. Use the fresh local cache if present (saves a network round trip).
 *   2. Fetch live pricing for every Riftbound set from the Open TCG API
 *      (CORS is wide open), join product IDs back to our card slugs via the
 *      bundled window.RIFTZAY_PRODUCT_MAP, and cache the result.
 *   3. Fall back to the bundled snapshot (data/prices.js) offline.
 *
 * Exposes window.RIFTZAY_PRICES (slug -> price record), RIFTZAY_PRICES_READY
 * and RIFTZAY_PRICES_UPDATED (ISO date of the source data).
 */

(function () {
    "use strict";

    var BASE = "https://tcgtracking.com/tcgapi/v1/89/sets/";
    var LS_KEY = "riftzay_market_prices_v4";
    var LS_AGE = 12 * 60 * 60 * 1000; // refresh market prices twice a day

    // All Riftbound sets that carry TCGplayer prices.
    var SETS = [
        { id: 24698, abbr: "VEN" },
        { id: 24560, abbr: "UNL" },
        { id: 24519, abbr: "SFD" },
        { id: 24344, abbr: "OGN" },
        { id: 24439, abbr: "OGS" },
        { id: 24552, abbr: "JDG" },
        { id: 24528, abbr: "OPP" },
        { id: 24343, abbr: "PR" },
        { id: 24797, abbr: "SGN" },
    ];

    function readLS(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || "null");
        } catch (e) {
            return null;
        }
    }

    function writeLS(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            /* storage full or unavailable - ignore */
        }
    }

    function fetchJSON(url, timeoutMs) {
        var ms = timeoutMs || 15000;
        var ctrl = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, ms);
        return fetch(url, { cache: "no-store", signal: ctrl.signal }).then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
        }).finally(function () {
            clearTimeout(timer);
        });
    }

    /* Reverse the bundled slug -> productId map so live pricing
     * (keyed by productId) can be joined back to our card slugs. */
    function reverseProductMap() {
        var map = window.RIFTZAY_PRODUCT_MAP || {};
        var rev = {};
        Object.keys(map).forEach(function (slug) { rev[map[slug]] = slug; });
        return rev;
    }

    /* Turn one set's {productId: {tcg: {Normal, Foil}}} payload into
     * {slug: {low, market, finish, normal, foil}}. Prefers the Normal
     * finish for the headline price, like TCGplayer's default view. */
    function applySetPrices(out, rev, payload) {
        var prices = (payload && payload.prices) || {};
        Object.keys(prices).forEach(function (pid) {
            var slug = rev[pid];
            if (!slug) return;
            var tcg = (prices[pid] && prices[pid].tcg) || {};
            var n = tcg.Normal, f = tcg.Foil;
            var normal = n && n.market != null ? { low: n.low, market: n.market } : null;
            var foil = f && f.market != null ? { low: f.low, market: f.market } : null;
            var pick = normal || foil;
            if (!pick) return;
            out[slug] = {
                low: pick.low,
                market: pick.market,
                finish: normal ? "Normal" : "Foil",
                normal: normal,
                foil: foil,
            };
        });
    }

    /* Aggregate one set's per-condition SKU matrix
     * ({productId: {skuId: {cnd, var, lng, mkt, low}}}) into
     * {productId: {Normal: {NM: [mkt, low], ...}, Foil: {...}}}.
     * Prefers English listings and keeps the first SKU per (finish, cnd). */
    function aggregateConds(skuPayload) {
        var aggByPid = {};
        var products = (skuPayload && skuPayload.products) || {};
        Object.keys(products).forEach(function (pid) {
            var agg = {};
            Object.keys(products[pid]).forEach(function (skuId) {
                var sku = products[pid][skuId];
                if (!sku || !sku.var || sku.mkt == null) return;
                if (sku.lng && sku.lng !== "EN") return;
                var v = agg[sku.var] = agg[sku.var] || {};
                if (!v[sku.cnd]) v[sku.cnd] = [sku.mkt, sku.low];
            });
            var out = {};
            Object.keys(agg).forEach(function (fin) {
                var c = {};
                Object.keys(agg[fin]).forEach(function (cnd) {
                    c[cnd] = agg[fin][cnd];
                });
                if (Object.keys(c).length) out[fin] = c;
            });
            if (Object.keys(out).length) aggByPid[pid] = out;
        });
        return aggByPid;
    }

    /* Merge condition data into {slug: price record} via the reverse map. */
    function applyConds(out, rev, condsByPid) {
        Object.keys(condsByPid).forEach(function (pid) {
            var slug = rev[pid];
            if (!slug || !out[slug]) return;
            out[slug].conds = condsByPid[pid];
        });
    }

    /* Multi-market store prices (RiftCompare, 6 markets in native-currency
     * cents) come bundled in data/prices.js since their API has no CORS
     * headers. Carry them onto every price record regardless of whether the
     * TCGplayer figure came from the bundle or live. */
    function applyMarketsFromBundle(out) {
        var bundle = window.RIFTZAY_PRICES_BUNDLE || {};
        Object.keys(out).forEach(function (slug) {
            var rc = bundle[slug] && bundle[slug].rc;
            if (rc) out[slug].rc = rc;
        });
    }

    function applyFromLive(bySet, skusBySet, updated) {
        var rev = reverseProductMap();
        var out = {};
        Object.keys(bySet).forEach(function (abbr) {
            applySetPrices(out, rev, bySet[abbr]);
            if (skusBySet && skusBySet[abbr]) {
                applyConds(out, rev, aggregateConds(skusBySet[abbr]));
            }
        });
        applyMarketsFromBundle(out);
        return { ts: Date.now(), updated: updated, prices: out };
    }

    window.RIFTZAY_PRICES_READY = (function () {
        return (async function () {
            var result = null;

            // 1) Fresh local cache
            var cached = readLS(LS_KEY);
            if (cached && cached.prices &&
                Date.now() - (cached.ts || 0) < LS_AGE) {
                result = cached;
                applyMarketsFromBundle(result.prices);
            }

            // 2) Live pricing from the Open TCG API (refreshed nightly)
            if (!result) {
                var bySet = {};
                var skusBySet = {};
                var updated = null;
                var pending = SETS.map(function (s) {
                    return Promise.all([
                        fetchJSON(BASE + s.id + "/pricing").then(function (data) {
                            bySet[s.abbr] = data;
                            if (!updated) updated = data.updated;
                        }),
                        fetchJSON(BASE + s.id + "/skus").then(function (data) {
                            skusBySet[s.abbr] = data;
                        }),
                    ]).catch(function () {
                        /* one set failing should not sink the whole refresh */
                    });
                });
                try {
                    await Promise.all(pending);
                    if (Object.keys(bySet).length) {
                        result = applyFromLive(bySet, skusBySet, updated);
                        if (Object.keys(result.prices).length) {
                            writeLS(LS_KEY, result);
                        }
                    }
                } catch (e) {
                    result = null;
                }
            }

            // 3) Bundled snapshot shipped with the site
            if (!result) {
                result = {
                    ts: 0,
                    updated: window.RIFTZAY_PRICE_UPDATED || null,
                    prices: window.RIFTZAY_PRICES_BUNDLE || {},
                };
            }

            var prices = (result && result.prices) || {};
            window.RIFTZAY_PRICES = prices;
            window.RIFTZAY_PRICES_UPDATED = (result && result.updated) || null;
            window.RIFTZAY_MARKETS_UPDATED = window.RIFTZAY_MARKETS_UPDATED || null;
            return prices;
        })();
    })();
})();
