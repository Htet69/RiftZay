/* RiftZay - Discord price-move notifier
 *
 * Compares the two most recent daily snapshots in data/price_history.js
 * and posts a Discord embed for the cards that moved the most. Big moves
 * (market price changed >= 5% in a day) are always included; cards listed
 * in tools/watched.json alert at the lower 2% threshold so you hear about
 * your own cards sooner.
 *
 * Runs nightly via .github/workflows/notify-moves.yml. Requires the
 * DISCORD_WEBHOOK environment variable (set it as a GitHub Actions secret).
 * Can be run locally with a dry run:
 *   node tools/notify_moves.js --dry
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_FILE = path.join(ROOT, 'data', 'price_history.js');
const CARDS_FILE = path.join(ROOT, 'data', 'cards.js');
const WATCHED_FILE = path.join(ROOT, 'tools', 'watched.json');

const BIG_MOVE_PCT = 5;      // alert threshold for any card
const WATCHED_MOVE_PCT = 2;  // alert threshold for cards you watch
const MAX_LINES = 10;        // keep the embed readable
const DRY = process.argv.indexOf('--dry') !== -1;

function parseGlobal(src, name) {
    const m = src.match(new RegExp('window\\.' + name + '\\s*=\\s*([\\s\\S]*?);\\s*$'));
    if (!m) throw new Error(name + ' not found');
    return JSON.parse(m[1]);
}

function readJSON(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { return null; }
}

function fmtUSD(v) {
    if (v == null || !(v > 0)) return "n/a";
    return '$' + (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(3));
}

function main() {
    const webhook = process.env.DISCORD_WEBHOOK || '';
    if (!DRY && !webhook) {
        console.log('DISCORD_WEBHOOK not set - skipping (set it as a GitHub Actions secret).');
        return;
    }

    const history = parseGlobal(fs.readFileSync(HISTORY_FILE, 'utf8'), 'RIFTZAY_PRICE_HISTORY');
    const dates = history.dates || [];
    const series = history.series || {};
    if (dates.length < 2) {
        console.log('Need at least 2 snapshots to compare - have ' + dates.length + '. Nothing to do.');
        return;
    }

    const prevIdx = dates.length - 2;
    const curIdx = dates.length - 1;
    const prevDate = dates[prevIdx];
    const curDate = dates[curIdx];

    // card names for readable lines
    let names = {};
    try {
        const bundle = parseGlobal(fs.readFileSync(CARDS_FILE, 'utf8'), 'RIFTZAY_CARDS_BUNDLE');
        (bundle || []).forEach(function (c) { if (c && c.cardCode) names[c.cardCode] = c.name; });
    } catch (e) { /* names are optional */ }

    let watched = readJSON(WATCHED_FILE) || [];
    if (!Array.isArray(watched)) watched = [];

    const moves = [];
    for (const [slug, arr] of Object.entries(series)) {
        const prev = arr[prevIdx];
        const cur = arr[curIdx];
        if (prev == null || cur == null || prev <= 0) continue;
        const pct = ((cur - prev) / prev) * 100;
        const threshold = watched.indexOf(slug) !== -1 ? WATCHED_MOVE_PCT : BIG_MOVE_PCT;
        if (Math.abs(pct) >= threshold) {
            moves.push({ slug: slug, pct: pct, prev: prev, cur: cur, watched: watched.indexOf(slug) !== -1 });
        }
    }

    moves.sort(function (a, b) { return Math.abs(b.pct) - Math.abs(a.pct); });
    const top = moves.slice(0, MAX_LINES);

    console.log('Comparing ' + prevDate + ' -> ' + curDate + ': ' + moves.length + ' cards moved >= thresholds.');

    if (!top.length) {
        console.log('No big moves - not posting.');
        return;
    }

    const ups = top.filter(function (m) { return m.pct > 0; }).length;
    const downs = top.length - ups;

    const lines = top.map(function (m) {
        const arrow = m.pct > 0 ? '▲' : '▼';
        const sign = m.pct > 0 ? '+' : '';
        const name = names[m.slug] || m.slug;
        const tag = m.watched ? ' ⭐' : '';
        return arrow + ' ' + sign + m.pct.toFixed(1) + '% — **' + name + '** (' + fmtUSD(m.cur) + ')'
            + (m.watched ? '' : '') + tag;
    });

    const embed = {
        title: 'RiftZay price alerts · ' + curDate,
        description: lines.join('\n'),
        color: downs > ups ? 0xf07171 : 0x4cc98f,   // red-ish down, green up
        footer: { text: 'Auto-alert · daily TCGplayer snapshots' },
    };

    const payload = { embeds: [embed] };

    if (DRY) {
        console.log('--- DRY RUN: would post ' + top.length + ' lines ---');
        console.log(lines.join('\n'));
        return;
    }

    fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
        .then(function (r) {
            if (!r.ok) throw new Error('Discord webhook HTTP ' + r.status);
            console.log('Posted ' + top.length + ' alerts to Discord.');
        })
        .catch(function (e) {
            console.error('Failed to post to Discord:', e.message);
            process.exit(1);
        });
}

main();