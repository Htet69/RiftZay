/* RiftZay - Real Riftbound card catalog (auto-updated)
 *
 * Card data source: LouisCourrian/riftbound-cards
 *   https://github.com/LouisCourrian/riftbound-cards
 * A machine-readable database of every Riftbound TCG card, scraped from the
 * official Card Gallery and published as dated snapshots every day. We pull
 * the freshest snapshot from its Hugging Face mirror (CORS-enabled), cache it
 * locally for speed, and fall back to the bundled snapshot (data/cards.js)
 * when the network is unavailable.
 *
 * Card names, ability text, artwork URLs and set names are (c) Riot Games,
 * mirrored for non-commercial community tooling under Riot's fan-content
 * policy. Not affiliated with Riot Games.
 */

(function () {
    "use strict";

    var HF_URL = "https://huggingface.co/datasets/Wysme/riftbound-cards/resolve/main/cards.json";
    var LS_KEY = "riftzay_real_cards_v1";
    var LS_AGE = 24 * 60 * 60 * 1000; // refresh the network copy at most daily

    var SET_META = {
        "Origins": { code: "ogn", year: 2025 },
        "Proving Grounds": { code: "ogs", year: 2025 },
        "Spiritforged": { code: "sfg", year: 2025 },
        "Unleashed": { code: "unl", year: 2025 },
        "Vendetta": { code: "ven", year: 2026 },
    };

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

    function fetchJSON(url) {
        return fetch(url, { cache: "no-store" }).then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
        });
    }

    function normalize(rawCards) {
        return rawCards.map(function (raw) {
            var set = raw.cardSet || "Unknown";
            var meta = SET_META[set] || { code: raw.setCode || "?", year: 0 };
            var type = raw.cardType || "Card";
            var champion = raw.cardType === "Legend" ||
                (raw.cardTypeLabels || []).indexOf("Champion") !== -1;
            var ability = raw.abilityEffective || raw.abilityOriginal || "";

            return {
                slug: raw.cardCode,
                name: raw.fullName || raw.name,
                set: set,
                setCode: (meta.code || raw.setCode || "?").toUpperCase(),
                setYear: meta.year,
                number: raw.cardNumber || "",
                rarity: String(raw.rarity || "Common").toLowerCase(),
                type: type,
                champion: champion,
                ability: ability,
                flavor: ability,
                artist: raw.artist || "",
                tags: raw.tags || [],
                art: raw.imageUrl || "",
                sourceUrl: raw.sourceUrl || "",
                energy: raw.energy,
                power: raw.power,
                might: raw.might,
            };
        });
    }

    function apply(cards) {
        var bySlug = {};
        cards.forEach(function (c) { bySlug[c.slug] = c; });

        var sets = {};
        cards.forEach(function (c) {
            if (!sets[c.set]) {
                sets[c.set] = { code: c.setCode, year: c.setYear, count: 0 };
            }
            sets[c.set].count += 1;
        });

        window.RIFTZAY_CARDS = cards;
        window.RIFTZAY_CARD_BY_SLUG = bySlug;
        window.RIFTZAY_SETS = sets;
    }

    window.RIFTZAY_CARDS_READY = (function () {
        return (async function () {
            var raw = null;

            // 1) Fresh local cache (fast, offline-friendly)
            var cached = readLS(LS_KEY);
            if (cached && Array.isArray(cached.cards) && cached.cards.length &&
                Date.now() - (cached.ts || 0) < LS_AGE) {
                raw = cached.cards;
            }

            // 2) Live snapshot from the Hugging Face mirror (updates daily)
            if (!raw) {
                try {
                    raw = await fetchJSON(HF_URL);
                } catch (e) {
                    raw = null;
                }
            }

            // 3) Bundled snapshot shipped with the site
            if (!raw) {
                var bundle = window.RIFTZAY_CARDS_BUNDLE;
                if (Array.isArray(bundle) && bundle.length) raw = bundle;
            }

            if (!raw || !raw.length) {
                apply([]);
                return [];
            }

            // Keep a fresh network copy so the next visit is instant
            if (raw !== (cached && cached.cards)) {
                writeLS(LS_KEY, { ts: Date.now(), cards: raw });
            }

            var cards = normalize(raw);
            apply(cards);
            return cards;
        })();
    })();
})();
