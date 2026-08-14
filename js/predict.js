/* RiftZay - price prediction engine
 *
 * Real time-series forecasting on the daily market-price history RiftZay
 * collects itself (data/price_history.js, fed nightly by the
 * collect-history GitHub Action). For each card with enough history we fit
 * a robust trend and project the likely 7-day and 30-day change, with a
 * confidence score. This is honest statistical forecasting (trend +
 * momentum on logged prices), not a made-up number - the more days of
 * history a card has, the more confident the projection.
 *
 * Tournament metagame (data/meta.js, from riftdecks.com tournament
 * results) is used as a leading indicator: cards that show up in winning
 * tournament decks tend to move in price before the TCGplayer market
 * catches up. When a card has competitive data it nudges the forecast
 * direction and boosts confidence.
 *
 * Output of forecast(slug):
 *   null                      - no history at all
 *   {ready:false, days:n}     - collecting history, need >= MIN_DAYS
 *   {ready:true, pct7, pct30, direction, confidence, trend, meta}
 *
 * Exposed as window.RIFTZAY_PREDICT.
 */

(function () {
    "use strict";

    var MIN_DAYS = 7;      // need at least a week of snapshots
    var CONFIDENCE_MIN = 30;
    var CONFIDENCE_MAX = 95;

    function history() {
        return window.RIFTZAY_PRICE_HISTORY || { dates: [], series: {} };
    }

    /* Tournament metagame snapshot (data/meta.js): slug -> {decks, play, win, ...} */
    function metaData() {
        return (window.RIFTZAY_TOURNAMENT_META && window.RIFTZAY_TOURNAMENT_META.cards) || {};
    }

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    /* Tournament signal for a card, or null if it has no competitive data.
     * Returns a score roughly in [-1, 1] (win edge), plus the raw stats. */
    function metaFor(slug) {
        var m = metaData()[slug];
        if (!m) return null;
        var edge = (m.win != null ? m.win : 50) - 50;          // win rate vs break-even
        var sig = clamp(edge / 25, -1, 1);                     // +-25pt win = full signal
        if (m.play != null && m.play >= 20) sig = Math.max(sig, 0.4); // metagame staple floor
        return { edge: edge, signal: sig, decks: m.decks, play: m.play, games: m.games, win: m.win, name: m.name };
    }

    /* Build the [date, price] pairs for a slug, oldest first. */
    function seriesFor(slug) {
        var h = history();
        var arr = h.series[slug];
        var dates = h.dates;
        if (!arr || !dates || !dates.length) return [];
        var out = [];
        for (var i = 0; i < dates.length; i++) {
            var v = arr[i];
            if (v != null && v > 0 && dates[i]) out.push({ d: dates[i], v: v });
        }
        return out;
    }

    /* Linear regression slope + intercept + R2 on y over x (logs of price). */
    function fit(xs, ys) {
        var n = xs.length;
        var sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
        for (var i = 0; i < n; i++) {
            sx += xs[i]; sy += ys[i];
            sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; syy += ys[i] * ys[i];
        }
        var denom = n * sxx - sx * sx;
        var slope = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
        var intercept = (sy - slope * sx) / n;
        var sst = syy - sy * sy / n;
        var sse = sst - slope * (n * sxy - sx * sy);
        var r2 = sst > 0 ? clamp(1 - sse / sst, 0, 1) : 0;
        return { slope: slope, intercept: intercept, r2: r2 };
    }

    /* Mean of an array of numbers. */
    function mean(a) {
        if (!a.length) return 0;
        var s = 0;
        for (var i = 0; i < a.length; i++) s += a[i];
        return s / a.length;
    }

    /* Forecast for a single card slug. Pure - no DOM, no IO. */
    function forecast(slug) {
        var pts = seriesFor(slug);
        var meta = metaFor(slug);
        if (!pts.length) {
            if (meta) return { ready: false, days: 0, meta: meta };
            return null;
        }
        if (pts.length < MIN_DAYS) {
            if (meta) return { ready: false, days: pts.length, meta: meta };
            return { ready: false, days: pts.length };
        }

        /* Work in log-space so % moves are symmetric and the trend is a
         * compounding rate rather than a dollar drift. */
        var xs = [], ys = [];
        for (var i = 0; i < pts.length; i++) {
            xs.push(i);
            ys.push(Math.log(Math.max(pts[i].v, 0.001)));
        }
        var reg = fit(xs, ys);

        /* Momentum: recent avg vs older avg (in log space). */
        var n = pts.length;
        var recent = mean(ys.slice(Math.max(0, n - 4)));
        var older = mean(ys.slice(0, Math.max(1, n - 4)));
        var momentum = recent - older; // log diff over the recent window

        /* Blend the long-run regression slope with recent momentum. */
        var perDay = 0.6 * reg.slope + 0.4 * (momentum / 4);

        /* Tournament metagame as a leading indicator: a card winning in
         * competitive play tends to climb in price before the market fully
         * reacts, so nudge the rate toward the meta signal (cap at +-0.8%
         * per day so a hot card can add up to ~25% over 30 days). */
        if (meta) {
            perDay += clamp(meta.signal * 0.004, -0.008, 0.008);
        }

        var pct7 = (Math.exp(perDay * 7) - 1) * 100;
        var pct30 = (Math.exp(perDay * 30) - 1) * 100;

        var direction = pct30 >= 3 ? "up" : (pct30 <= -3 ? "down" : "flat");

        /* Confidence: more days + tighter fit + more movement = higher.
         * Competitive data with a decent sample raises confidence too. */
        var confidence = Math.round(
            clamp(CONFIDENCE_MIN + (n / 60) * 30 + reg.r2 * 25 + Math.min(Math.abs(momentum), 0.25) * 10, CONFIDENCE_MIN, CONFIDENCE_MAX)
        );
        if (meta && meta.decks >= 50) confidence = clamp(confidence + 8, CONFIDENCE_MIN, CONFIDENCE_MAX);

        var out = {
            ready: true,
            days: n,
            pct7: Math.round(pct7 * 10) / 10,
            pct30: Math.round(pct30 * 10) / 10,
            direction: direction,
            confidence: confidence,
            trend: Math.round((Math.exp(reg.slope * 30) - 1) * 1000) / 10,
        };
        if (meta) out.meta = meta;
        return out;
    }

    /* Tournament stats for a card slug (raw + normalized signal). */
    function meta(slug) {
        return metaFor(slug);
    }

    /* Total number of days collected so far. */
    function daysCollected() {
        return history().dates ? history().dates.length : 0;
    }

    window.RIFTZAY_PREDICT = {
        forecast: forecast,
        daysCollected: daysCollected,
        seriesFor: seriesFor,
        meta: meta,
        MIN_DAYS: MIN_DAYS,
    };
})();