/* RiftZay - Legend meta tier list collector
 *
 * Fetches the competitive Legend (champion) tier list from riftbound.gg
 * (the most up-to-date public metagame list, updated weekly around each
 * Regional Qualifier) and writes a compact snapshot to data/meta_legends.js.
 *
 * The metagame view shows this as a champion tier list (Tier 1-5 mapped to
 * S/A/B/C/D), linking each legend to its RiftZay product page.
 *
 * Source: https://riftbound.gg/tier-list/ - champions ranked by tournament
 * results (wins + top cuts across Regional Qualifiers and 64+ player
 * events). riftbound.gg updates the list on a reliable weekly cadence and
 * does not sit behind Cloudflare bot protection that blocks CI collection.
 *
 * Runs nightly with the other collectors. Can be run locally:
 *   node tools/collect_legends.js
 *
 * Data layout:
 *   window.RIFTZAY_TOURNAMENT_LEGENDS = {
 *     "updated": "2026-08-19",
 *     "source": "riftbound.gg",
 *     "tiers": ["S", "A", "B", "C", "D"],
 *     "legends": { "ogs-019-024": { "name": "Master Yi",
 *         "tier": "S", "epithet": "Wuju Bladesman" } }
 *   };
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'data', 'meta_legends.js');
const CARDS_FILE = path.join(ROOT, 'data', 'cards.js');

const URL = 'https://riftbound.gg/tier-list/';

/* Tier 1..5 on the site -> S/A/B/C/D letter tiers (matches the app's
 * existing tier-badge styling and lets us filter the metagame view). */
const TIER_LETTERS = { 1: 'S', 2: 'A', 3: 'B', 4: 'C', 5: 'D' };

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

async function fetchHtml(url) {
    const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' },
    });
    if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status);
    return r.text();
}

/* Load the card catalog so we can resolve a legend card code to the exact
 * RiftZay slug (cardCode). Legends are matched by card code (e.g. OGS-019)
 * and fall back to matching by champion tag (e.g. "Nasus") for codes that
 * differ between sites. */
function loadCards() {
    const src = fs.readFileSync(CARDS_FILE, 'utf8');
    const m = src.match(/window\.RIFTZAY_CARDS_BUNDLE\s*=\s*(\[.*?\]);/s);
    if (!m) return [];
    return JSON.parse(m[1]).filter((c) => c && c.cardType === 'Legend');
}

function resolveLegend(cards, code, championName) {
    if (code) {
        const byCode = cards.find((c) => c.cardCode.startsWith(code.toLowerCase() + '-'));
        if (byCode) return byCode;
    }
    if (championName) {
        const byTag = cards.find((c) => c.tags && c.tags.indexOf(championName) !== -1);
        if (byTag) return byTag;
    }
    return null;
}

function parseTiers(html) {
    /* The page lists legends as grouped figures inside tier sections:
     *   <strong>Tier 1</strong> ... <figure><a href="...guide/"><img
     *   src="https://static.dotgg.gg/riftbound/cards/OGS-019.webp" .../></a>
     *   <figcaption class="wp-element-caption"><a ...>Master Yi</a></figcaption></figure>
     */
    const tiers = {};
    const secRe = /<strong>Tier (\d)<\/strong>/g;
    let tier = null;
    let lastIdx = -1;
    let m;
    const sections = [];
    while ((m = secRe.exec(html)) !== null) {
        if (lastIdx !== -1) sections.push({ tier, text: html.slice(lastIdx, m.index) });
        tier = m[1];
        lastIdx = m.index;
    }
    sections.push({ tier, text: html.slice(lastIdx) });

    for (const s of sections) {
        const figRe = /<figure[\s\S]*?<img[^>]*src="https:\/\/static\.dotgg\.gg\/riftbound\/cards\/([A-Z0-9]+-[A-Z0-9]+)\.webp"[^>]*\/?>[\s\S]*?<figcaption[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/figcaption><\/figure>/g;
        const entries = [];
        while ((m = figRe.exec(s.text)) !== null) {
            entries.push({ code: m[1], name: m[2].trim() });
        }
        if (entries.length) tiers[s.tier] = entries;
    }
    return tiers;
}

function main() {
    console.log('fetching', URL);
    let html;
    try {
        html = fetchHtml(URL);
    } catch (e) {
        console.log('Could not reach ' + URL + ' - keeping existing data/meta_legends.js');
        console.log('EXIT: skipped (no fresh data)');
        return;
    }
    html.then(function (h) {
        const tiers = parseTiers(h);
        const tierKeys = Object.keys(tiers).sort(function (a, b) { return Number(a) - Number(b); });
        if (!tierKeys.length) {
            console.log('No tier sections found - keeping existing data/meta_legends.js');
            console.log('EXIT: skipped (no fresh data)');
            return;
        }
        console.log('tiers parsed:', tierKeys.join(', '));
        for (const k of tierKeys) console.log('  Tier ' + k + ': ' + tiers[k].length + ' legends');

        const cards = loadCards();
        const legends = {};
        let mapped = 0;
        for (const k of tierKeys) {
            const letter = TIER_LETTERS[k] || k;
            for (const e of tiers[k]) {
                const card = resolveLegend(cards, e.code, e.name);
                if (!card) {
                    console.log('  unmapped: ' + e.code + ' (' + e.name + ')');
                    continue;
                }
                const epithet = card.fullName || card.name || e.name;
                legends[card.cardCode] = {
                    name: e.name,
                    tier: letter,
                    epithet: epithet,
                };
                mapped++;
            }
        }
        console.log('legends mapped:', mapped);
        if (!mapped) {
            console.log('No legends mapped - keeping existing data/meta_legends.js');
            console.log('EXIT: skipped (no fresh data)');
            return;
        }

        const out =
            '// Generated by tools/collect_legends.js from the riftbound.gg meta tier list.\n' +
            '// Legend (champion) tiers by competitive tournament results. Do not edit by hand.\n' +
            'window.RIFTZAY_TOURNAMENT_LEGENDS = ' +
            JSON.stringify({ updated: todayStr(), source: 'riftbound.gg', tiers: tierKeys.map((k) => TIER_LETTERS[k] || k), legends: legends }) +
            ';\n';

        fs.writeFileSync(OUT_FILE, out, 'utf8');
        console.log('wrote', OUT_FILE, Buffer.byteLength(out, 'utf8'), 'bytes,', mapped, 'legends');
    }).catch(function (e) {
        console.log('fetch failed:', e.message, '- keeping existing data/meta_legends.js');
        console.log('EXIT: skipped (no fresh data)');
    });
}

main();
