/* RiftZay - Card Assistant (rule-based, runs 100% in the browser)
 *
 * Answers plain-English questions about cards using only the data RiftZay
 * already collects: real market prices, multi-market store prices, the
 * price-forecast engine, tournament metagame, Buy-Now scoring, and live
 * community listings. No external API, no key, no cost.
 *
 * Exposed as window.RIFTZAY_ASSISTANT:
 *   ask(text)   -> { reply: "...", cards: [slugs], action: "product"|null }
 *   matchCard   -> fuzzy card lookup by name/subtitle
 */

(function () {
    "use strict";

    var PRICES = function () { return window.RIFTZAY_PRICES || {}; };
    var CARDS = function () { return window.RIFTZAY_CARDS || []; };
    var BY_SLUG = function () { return window.RIFTZAY_CARD_BY_SLUG || {}; };
    var PREDICT = function () { return window.RIFTZAY_PREDICT; };
    var BUYS = function () { return window.RIFTZAY_BUYS; };
    var MMK_PER_USD = (window.RIFTZAY_CONFIG && window.RIFTZAY_CONFIG.MMK_PER_USD) || 4400;
    var FX = (window.RIFTZAY_CONFIG && window.RIFTZAY_CONFIG.FX_TO_USD) || {};
    var MARKET_NAMES = { AU: "Australia", NZ: "New Zealand", US: "US", UK: "UK", SG: "Singapore", CA: "Canada" };
    var MARKET_CURR = { AU: "AUD", NZ: "NZD", US: "USD", UK: "GBP", SG: "SGD", CA: "CAD" };

    /* ---------- formatting ---------- */

    function slugOf(card) {
        return card ? (card.slug || card.cardCode) : null;
    }

    function fmtUSD(v) {
        if (v == null || !(v > 0)) return "no price yet";
        return "$" + (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(3));
    }

    function fmtMMK(v) {
        return Math.round(v).toLocaleString() + " MMK";
    }

    /* ---------- card matching (fuzzy by name, then subtitle) ---------- */

    function norm(s) {
        return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    }

    function scoreName(card, q) {
        var n = norm(card.name);
        var sub = norm(card.subtitle);
        var score = 0;
        if (n === q) score = 100;
        else if (n.indexOf(q) === 0) score = 90;
        else if (n.indexOf(q) !== -1) score = 80;
        else if (sub && sub.indexOf(q) !== -1) score = 70;
        var words = q.split(" ");
        if (words.length > 1) {
            var hits = 0;
            for (var i = 0; i < words.length; i++) {
                if (n.indexOf(words[i]) !== -1) hits++;
            }
            score = Math.max(score, Math.round((hits / words.length) * 75));
        }
        return score;
    }

    /* Best card match for a query fragment, or null. */
    function matchCard(q) {
        var query = norm(q);
        if (!query) return null;
        var cards = CARDS();
        var best = null, bestScore = 0;
        for (var i = 0; i < cards.length; i++) {
            var s = scoreName(cards[i], query);
            if (s > bestScore) { bestScore = s; best = cards[i]; }
        }
        return bestScore >= 45 ? best : null;
    }

    /* Try to pull a card name out of a question. Handles "price of X",
     * "X price", "should I buy X", "X trend" etc. */
    function extractCard(text) {
        var t = String(text || "").trim();
        var m = t.match(/price\s+of\s+(.+)/i) || t.match(/how much (?:is|does)\s+(.+?)(?:\?|$)/i) ||
            t.match(/should i (?:buy|sell)\s+(.+)/i) || t.match(/(?:buy|sell)\s+(.+)/i) ||
            t.match(/(?:price|cost|value|trend|forecast|listing|sell|sellings?)\s+(?:for\s+|of\s+|on\s+)?(.+)/i);
        if (!m) return matchCard(t);
        return matchCard(m[1]);
    }

    /* ---------- answers ---------- */

    function priceAnswer(card) {
        var rec = PRICES()[slugOf(card)];
        if (!rec || !(rec.market > 0)) {
            return {
                reply: card.name + " has no TCGplayer market price yet — but check the community listings on its page, or " +
                    "a store might still carry it.",
                cards: [slugOf(card)],
                action: "product",
            };
        }

        var lines = [card.name + " — market " + fmtUSD(rec.market) + " (— " + fmtMMK(rec.market * MMK_PER_USD) + ")"];
        if (rec.low != null && rec.low > 0 && rec.low !== rec.market) {
            lines.push("Lowest listed: " + fmtUSD(rec.low));
        }
        if (rec.normal && rec.normal.market > 0) {
            lines.push("Normal finish: " + fmtUSD(rec.normal.market));
        }
        if (rec.foil && rec.foil.market > 0) {
            lines.push("Foil finish: " + fmtUSD(rec.foil.market) +
                (rec.normal && rec.normal.market > 0 && rec.foil.market / rec.normal.market >= 1.4
                    ? " (premium)"
                    : ""));
        }
        if (rec.rc) {
            var best = cheapestStore(rec.rc);
            if (best) {
                lines.push("Cheapest store: " + best.label + " at " + fmtUSD(best.usd) +
                    " (— " + fmtMMK(best.usd * MMK_PER_USD) + ")");
            }
        }
        return { reply: lines.join("\n"), cards: [slugOf(card)], action: "product" };
    }

    function cheapestStore(rc) {
        var best = null;
        Object.keys(rc).forEach(function (code) {
            var usd = (rc[code] / 100) * (FX[code] || 1);
            if (usd > 0 && (best == null || usd < best.usd)) {
                best = { code: code, usd: usd, label: MARKET_NAMES[code] };
            }
        });
        return best;
    }

    function advisorAnswer(card) {
        var rec = PRICES()[slugOf(card)];
        var buy = BUYS() ? BUYS().score(rec, slugOf(card)) : null;
        if (!buy) {
            return { reply: card.name + " has no market data yet, so I can't score a buy/wait verdict on it.",
                cards: [slugOf(card)], action: "product" };
        }

        var lines = [];
        var tier = buy.tier;
        if (tier === "Buy Now") {
            lines.push("Verdict for " + card.name + ": BUY NOW (score " + buy.score + "/100).");
        } else if (tier === "Watch") {
            lines.push("Verdict for " + card.name + ": WATCH — decent value, not screaming (score " + buy.score + "/100).");
        } else {
            lines.push("Verdict for " + card.name + ": WAIT (score " + buy.score + "/100).");
        }
        var reasons = buy.reasons || [];
        for (var i = 0; i < Math.min(reasons.length, 3); i++) {
            lines.push("— " + reasons[i]);
        }
        return { reply: lines.join("\n"), cards: [slugOf(card)], action: "product" };
    }

    function trendAnswer(card) {
        var pred = PREDICT();
        if (!pred) return { reply: "Forecast engine not loaded yet — try again in a moment.", cards: [], action: null };
        var fc = pred.forecast(slugOf(card));
        if (!fc) return { reply: card.name + " has no collected price history yet.", cards: [slugOf(card)], action: "product" };

        var meta = pred.meta(slugOf(card));
        var lines = [];
        if (!fc.ready) {
            lines.push(card.name + " is still building price history (" + fc.days + "/" + pred.MIN_DAYS + " days) — " +
                "the forecast turns on after " + pred.MIN_DAYS + " days of snapshots.");
        } else {
            if (fc.direction === "up") {
                lines.push(card.name + " is trending UP — projected +" + fc.pct30 + "% in 30 days (" + fc.confidence + "% confidence).");
            } else if (fc.direction === "down") {
                lines.push(card.name + " is trending DOWN — projected " + fc.pct30 + "% in 30 days (" + fc.confidence + "% confidence).");
            } else {
                lines.push(card.name + " is roughly FLAT over 30 days (" + fc.confidence + "% confidence).");
            }
            var pts = pred.seriesFor(slugOf(card));
            if (pts.length >= 2) {
                var first = pts[0].v, last = pts[pts.length - 1].v;
                lines.push("History: " + fmtUSD(first) + " — " + fmtUSD(last) + " over " + pts.length + " days.");
            }
        }
        if (meta) {
            lines.push("Tournament: " + meta.win + "% win rate" +
                (meta.play != null ? " in " + meta.play + "% of decks" : "") +
                (meta.decks != null ? " (" + meta.decks + " decks)" : ""));
        }
        return { reply: lines.join("\n"), cards: [slugOf(card)], action: "product" };
    }

    function listingsAnswer(card) {
        var API = window.RIFTZAY_API;
        if (!API || !API.getAllListings) {
            return { reply: "Community listings not loaded yet — try again in a moment.", cards: [slugOf(card)], action: "product" };
        }
        return API.getAllListings().then(function (all) {
            var mine = (all || []).filter(function (l) {
                return l.card_slug === slugOf(card) && Number(l.quantity) > 0;
            }).sort(function (a, b) { return a.price_mmk - b.price_mmk; });

            if (!mine.length) {
                return { reply: card.name + " has no active community listings. Be the first to sell it!", cards: [slugOf(card)], action: "product" };
            }
            var lines = [card.name + " — " + mine.length + " community listing(s):"];
            for (var i = 0; i < Math.min(mine.length, 5); i++) {
                var l = mine[i];
                lines.push("— " + fmtMMK(l.price_mmk) + " (" + l.condition + ", " + l.variant + ", " + l.location +
                    (l.seller_name ? ", " + l.seller_name : "") + ")");
            }
            return { reply: lines.join("\n"), cards: [slugOf(card)], action: "product" };
        });
    }

    function bestBuysAnswer() {
        var buy = BUYS(), cards = CARDS(), prices = PRICES();
        if (!buy) return { reply: "Buy-Now engine not loaded yet.", cards: [], action: null };
        var ranked = buy.rankAll(cards, prices);
        if (!ranked.length) return { reply: "No scored cards yet — market prices are still loading.", cards: [], action: null };

        var top = ranked.slice(0, 5);
        var lines = ["Best value picks right now (top 5 of " + ranked.length + "):"];
        var slugs = [];
        for (var i = 0; i < top.length; i++) {
            var r = top[i];
            lines.push((i + 1) + ". " + r.card.name + " — " + r.result.tier + " (" + r.result.score + "/100), " +
                fmtUSD(r.record.market));
            slugs.push(r.slug);
        }
        lines.push("Ask about any of these for the details.");
        return { reply: lines.join("\n"), cards: slugs, action: "browse" };
    }

    function metaAnswer(card) {
        var pred = PREDICT();
        var meta = pred && pred.meta(slugOf(card));
        if (!meta) {
            return { reply: card.name + " hasn't appeared in tracked tournaments yet.", cards: [slugOf(card)], action: "product" };
        }
        return {
            reply: card.name + " — " + meta.win + "% win rate" +
                (meta.play != null ? " ?? " + meta.play + "% of decks" : "") +
                (meta.decks != null ? " ?? " + meta.decks + " decks" : "") +
                " in competitive play.",
            cards: [slugOf(card)],
            action: "product",
        };
    }

    /* ---------- intent routing ---------- */

    function helpText() {
        return "Try asking:\n" +
            "— \"price of <card>\"\n" +
            "— \"should I buy <card>\"\n" +
            "— \"trend of <card>\" or \"forecast <card>\"\n" +
            "— \"listings for <card>\"\n" +
            "— \"is <card> good in tournaments\"\n" +
            "— \"what should I buy\" (best value right now)\n" +
            "— \"cheapest card to play\" (bonus)";
    }

    function cheapestPlayableAnswer() {
        var buy = BUYS(), cards = CARDS(), prices = PRICES();
        if (!buy || !cards.length) return { reply: "Data still loading — try again in a moment.", cards: [], action: null };
        var priced = cards.filter(function (c) {
            var r = prices[c.slug];
            return r && r.market > 0;
        });
        priced.sort(function (a, b) { return prices[a.slug].market - prices[b.slug].market; });
        var top = priced.slice(0, 5);
        var lines = ["Cheapest priced cards right now:"];
        var slugs = [];
        for (var i = 0; i < top.length; i++) {
            lines.push((i + 1) + ". " + top[i].name + " — " + fmtUSD(prices[top[i].slug].market));
            slugs.push(top[i].slug);
        }
        return { reply: lines.join("\n"), cards: slugs, action: "browse" };
    }

    function route(text) {
        var t = String(text || "").trim();
        if (!t) return { reply: "Ask me about a card, e.g. \"price of Jhin\". Type \"help\" for ideas.", cards: [], action: null };

        var lt = t.toLowerCase();
        if (/^(hi|hello|hey|yo|sup)\b/.test(lt)) {
            return { reply: "Hi! I'm your RiftZay assistant. Ask me about any card — price, trend, tournaments, or whether to buy.", cards: [], action: null };
        }
        if (/help|what can you/.test(lt)) return { reply: helpText(), cards: [], action: null };
        if (/best buy|what should i buy|recommend|good picks|top picks/.test(lt)) return bestBuysAnswer();
        if (/cheapest card|cheap cards|budget pick/.test(lt)) return cheapestPlayableAnswer();

        var card = extractCard(t);
        if (!card) {
            return {
                reply: "I couldn't find that card. Check the spelling, or ask \"help\" to see what I can do.",
                cards: [],
                action: null,
            };
        }

        if (/should i (buy|sell)|worth buying|good buy|buy or wait|buy now or wait/.test(lt)) return advisorAnswer(card);
        if (/trend|forecast|going up|going down|rising|falling|drop|project/.test(lt)) return trendAnswer(card);
        if (/listing|selling|offer|who'?s selling|buy from/.test(lt)) return listingsAnswer(card);
        if (/tournament|competitive|win rate|meta|play rate/.test(lt)) return metaAnswer(card);
        if (/price|cost|how much|worth|value/.test(lt)) return priceAnswer(card);

        return priceAnswer(card);
    }

    function ask(text) {
        var result = route(text);
        if (result && typeof result.then === "function") return result;
        return Promise.resolve(result);
    }

    window.RIFTZAY_ASSISTANT = {
        ask: ask,
        matchCard: matchCard,
    };
})();