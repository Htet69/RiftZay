/* RiftZay - Smart Buy-Now scoring engine
 *
 * Transparent, rule-based scoring (0-100) that ranks cards by how much
 * value is on the table RIGHT NOW, using only live data RiftZay already
 * has: TCGplayer market prices, per-condition SKU prices, and
 * multi-market store prices (RiftCompare). Nothing is a black box - every
 * point comes from five explainable signals, and each card gets a
 * plain-English reason for its rank.
 *
 * Signals (weights, re-normalized if a signal has no data):
 *   cross-market gap    20%   cheapest store price vs TCGplayer market
 *   condition discount  16%   played copies (LP/MP/HP/DMG) vs Near Mint
 *   foil value          12%   foil premium vs the Normal finish
 *   liquidity            8%   how many markets/conditions have data
 *   market tightness     6%   TCGplayer low vs market (real demand)
 *   savings size        18%   real dollars that can be saved today
 *   price forecast      20%   trend + momentum projection (see js/predict.js)
 *
 * Tiers:  Buy Now >= 70   |   Watch 40-69   |   Wait < 40
 *
 * A note on "AI": the price-forecast signal is honest statistical
 * forecasting (linear trend + momentum on the daily snapshots RiftZay
 * collects itself), not a black-box ML model. Every other signal is fully
 * explainable scoring of current data. Nothing guarantees the future -
 * the forecast has a confidence score and only turns on after a week of
 * history has been collected.
 */

(function () {
    "use strict";

    var FX_TO_USD = (window.RIFTZAY_CONFIG && window.RIFTZAY_CONFIG.FX_TO_USD) || {};
    var MARKET_NAMES = { AU: "Australia", NZ: "New Zealand", US: "US", UK: "UK", SG: "Singapore", CA: "Canada" };

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    /* One signal. value is 0-100, weight 0-1, hasData decides whether the
     * weight participates in the final (re-normalized) score. */
    function Signal(name, weight, value, hasData) {
        return { name: name, weight: weight, value: clamp(value, 0, 100), hasData: !!hasData };
    }

    function pct(a, b) {
        if (!(b > 0)) return 0;
        return (b - a) / b;
    }

    /* Cheapest store price in USD across the six tracked markets, or null. */
    function cheapestStoreUSD(rc) {
        if (!rc) return null;
        var best = null;
        Object.keys(rc).forEach(function (code) {
            var usd = (rc[code] / 100) * (FX_TO_USD[code] || 1);
            if (usd > 0 && (best == null || usd < best)) best = usd;
        });
        return best;
    }

    /* Cheapest non-NM condition market price in USD, or null. */
    function cheapestPlayed(conds) {
        if (!conds || !conds.Normal) return null;
        var nm = conds.Normal.NM;
        if (!nm || !(nm[0] > 0)) return null;
        var best = null;
        Object.keys(conds.Normal).forEach(function (cnd) {
            if (cnd === "NM") return;
            var v = conds.Normal[cnd];
            if (!v || !(v[0] > 0)) return;
            if (best == null || v[0] < best) best = v[0];
        });
        return best == null ? null : best;
    }

    /* Core scoring. record = window.RIFTZAY_PRICES[slug], slug = card slug
     * (used to look up the price forecast). Pure - no DOM, no IO. */
    function score(record, slug) {
        if (!record) return null;

        var market = record.market;
        var storeUSD = cheapestStoreUSD(record.rc);
        var played = cheapestPlayed(record.conds);
        var fx = FX_TO_USD;
        void fx;

        /* 1) Cross-market gap: how much cheaper is the best store vs TCGplayer? */
        var cross, crossData = false;
        if (storeUSD != null && market > 0) {
            var gap = pct(storeUSD, market);
            cross = clamp((gap / 0.3) * 100, 0, 100); // 30% below market = perfect
            crossData = gap > 0.02;
        } else {
            cross = 50;
        }

        /* 2) Condition discount: played copies vs Near Mint. */
        var cond, condData = false;
        var nmMarket = record.normal && record.normal.market;
        var nmRef = nmMarket > 0 ? nmMarket : (market > 0 ? market : null);
        if (played != null && nmRef != null) {
            var condGap = pct(played, nmRef);
            cond = clamp((condGap / 0.4) * 100, 0, 100); // 40% off = perfect
            condData = condGap > 0.05;
        } else {
            cond = 50;
        }

        /* 3) Foil value: reasonable premium = good buy. */
        var foil, foilData = false;
        var normM = record.normal && record.normal.market;
        var foilM = record.foil && record.foil.market;
        if (normM > 0 && foilM > 0) {
            var premium = foilM / normM;
            foil = clamp(100 - ((premium - 1) / 2) * 100, 0, 100); // <=1.0x = 100, 3x = 0
            foilData = premium < 1.6;
        } else {
            foil = 50;
        }

        /* 4) Liquidity: how many markets/conditions actually have data. */
        var marketCount = record.rc ? Object.keys(record.rc).length : 0;
        var condCount = record.conds && record.conds.Normal ? Object.keys(record.conds.Normal).length : 0;
        var liq = clamp(((marketCount / 6) * 60) + ((condCount / 5) * 40), 0, 100);
        var liqData = marketCount >= 2 || condCount >= 2;

        /* 5) Market tightness: low close to market = real demand, not an outlier. */
        var tight, tightData = false;
        if (record.low != null && market > 0 && record.low > 0) {
            var spread = pct(record.low, market);
            tight = clamp(100 - (spread / 0.5) * 100, 0, 100); // tight = 100
            tightData = true;
        } else {
            tight = 50;
        }

        /* 6) Savings size: how many real dollars can be saved right now.
         * Rewards finding actual value, not just big percentages on bulk. */
        var savedUSD = 0;
        if (storeUSD != null && market > 0) savedUSD = Math.max(savedUSD, market - storeUSD);
        if (played != null && nmRef != null) savedUSD = Math.max(savedUSD, nmRef - played);
        var saveSize = clamp((savedUSD / 5) * 100, 0, 100); // $5+ saved = perfect
        var saveData = savedUSD >= 0.25;

        /* 7) Price forecast: trend + momentum from the collected history.
         * Upward momentum = buy before it rises; downward = wait it out. */
        var fc = null;
        if (window.RIFTZAY_PREDICT) {
            fc = window.RIFTZAY_PREDICT.forecast(slug);
        }
        var forecastValue = 50, forecastData = false;
        if (fc && fc.ready) {
            if (fc.direction === "up") {
                forecastValue = clamp(50 + (fc.pct30 / 0.25) * 50 * (fc.confidence / 100), 0, 100);
                forecastData = fc.confidence >= 45;
            } else if (fc.direction === "down") {
                forecastValue = clamp(50 - (Math.abs(fc.pct30) / 0.25) * 50 * (fc.confidence / 100), 0, 100);
                forecastData = fc.confidence >= 45;
            } else {
                forecastValue = 50;
                forecastData = fc.confidence >= 45;
            }
        }

        var signals = [
            Signal("cross-market gap", 0.20, cross, crossData),
            Signal("condition discount", 0.16, cond, condData),
            Signal("foil value", 0.12, foil, foilData),
            Signal("liquidity", 0.08, liq, liqData),
            Signal("market tightness", 0.06, tight, tightData),
            Signal("savings size", 0.18, saveSize, saveData),
            Signal("price forecast", 0.20, forecastValue, forecastData),
        ];

        var wTotal = 0, scoreSum = 0;
        signals.forEach(function (s) {
            if (s.hasData) { scoreSum += s.value * s.weight; wTotal += s.weight; }
        });
        var final = wTotal > 0 ? Math.round(scoreSum / wTotal) : 50;

        var tier = final >= 70 ? "Buy Now" : (final >= 40 ? "Watch" : "Wait");

        var reasons = buildReasons(signals, record, storeUSD, played, fc);

        return { score: final, tier: tier, signals: signals, reasons: reasons, forecast: fc };
    }

    function buildReasons(signals, record, storeUSD, played, fc) {
        var reasons = [];
        var byName = {};
        signals.forEach(function (s) { byName[s.name] = s; });

        if (storeUSD != null && record.market > 0 && byName["cross-market gap"].value >= 60) {
            reasons.push("Best store price is " + pctLabel(storeUSD, record.market) + " below the TCGplayer market");
        }
        if (played != null && byName["condition discount"].value >= 60) {
            var conds = record.conds && record.conds.Normal;
            var cond = cheapestPlayed(conds);
            var cndName = "LP";
            if (conds) {
                Object.keys(conds).forEach(function (c) {
                    if (c === "NM") return;
                    if (conds[c] && conds[c][0] === cond) cndName = c;
                });
            }
            reasons.push(cndName + " copies are a solid " + pctLabel(played, record.normal && record.normal.market || record.market) + " under Near Mint");
        }
        if (record.foil && record.normal && record.foil.market > 0 && record.normal.market > 0) {
            var premium = record.foil.market / record.normal.market;
            if (premium < 1.5 && byName["foil value"].value >= 60) {
                reasons.push("Foil is only " + (premium >= 1 ? "×" + premium.toFixed(1) : "under the") + " Normal price");
            }
        }
        if (byName["liquidity"].hasData && byName["liquidity"].value >= 70) {
            reasons.push("Deep coverage - priced in " + (record.rc ? Object.keys(record.rc).length : 0) + " markets");
        }
        if (byName["market tightness"].hasData && byName["market tightness"].value >= 70) {
            reasons.push("Tight market - low is close to the market price");
        }
        if (fc && fc.ready && byName["price forecast"].hasData) {
            if (fc.direction === "up") {
                reasons.push("Forecast: +" + fc.pct30 + "% in 30 days (trend + momentum, " + fc.confidence + "% conf)");
            } else if (fc.direction === "down") {
                reasons.push("Forecast: -" + Math.abs(fc.pct30) + "% in 30 days - price likely still falling");
            } else {
                reasons.push("Forecast: flat over 30 days (" + fc.confidence + "% conf)");
            }
        } else if (fc && !fc.ready) {
            reasons.push("Collecting price history - forecast arrives after " + window.RIFTZAY_PREDICT.MIN_DAYS + " days");
        }
        if (fc && fc.meta && fc.meta.signal >= 0.3) {
            reasons.push("Tournament tier - Tier " + fc.meta.tier + " champion (" + fc.meta.name + ")" +
                " on the riftbound.gg weekly list");
        }
        if (!reasons.length && record.market > 0) {
            reasons.push("Average value at this price - no standout discount");
        }
        return reasons;
    }

    function pctLabel(a, b) {
        return Math.round(Math.abs(pct(a, b)) * 100) + "%";
    }

    /* Rank every priced card. cards = RIFTZAY_CARDS, prices = RIFTZAY_PRICES.
     * Returns [{slug, card, record, result}] sorted by score desc. */
    function rankAll(cards, prices) {
        var out = [];
        (cards || []).forEach(function (card) {
            var record = prices && prices[card.slug];
            if (!record || !(record.market > 0)) return;
            var result = score(record, card.slug);
            if (!result) return;
            out.push({ slug: card.slug, card: card, record: record, result: result });
        });
        out.sort(function (a, b) { return b.result.score - a.result.score; });
        return out;
    }

    window.RIFTZAY_BUYS = {
        score: score,
        rankAll: rankAll,
        MARKET_NAMES: MARKET_NAMES,
    };
})();
