/* RiftZay - per-user price-drop email alerts
 *
 * Compares the two most recent daily snapshots in data/price_history.js and
 * emails every opted-in user (Supabase profiles.email_alerts = true) whose
 * watchlist contains a card that dropped >= 5% in a day.
 *
 * Runs nightly via .github/workflows/notify-price-alerts.yml after the daily
 * collector. Requires these GitHub Actions secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY   (Project Settings > API > service_role)
 *   RESEND_API_KEY         (https://resend.com - free tier, 100/day)
 *   ALERT_FROM_EMAIL       (e.g. RiftZay <alerts@yourdomain.com>)
 *
 * Dry run locally (prints what would be sent, no API calls):
 *   node tools/notify_price_alerts.js --dry
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_FILE = path.join(ROOT, 'data', 'price_history.js');
const CARDS_FILE = path.join(ROOT, 'data', 'cards.js');
const CONFIG_FILE = path.join(ROOT, 'js', 'config.js');

const DROP_PCT = 5;   // alert threshold: watched card dropped >= 5% in a day
const DRY = process.argv.indexOf('--dry') !== -1;

function parseGlobal(src, name) {
    const m = src.match(new RegExp('window\\.' + name + '\\s*=\\s*([\\s\\S]*?);\\s*$'));
    if (!m) throw new Error(name + ' not found');
    return JSON.parse(m[1]);
}

function readConfig() {
    const src = fs.readFileSync(CONFIG_FILE, 'utf8');
    const m = src.match(/MMK_PER_USD:\s*([0-9.]+)/);
    return { mmkPerUsd: m ? Number(m[1]) : 4400 };
}

function fmtUSD(v) {
    if (v == null || !(v > 0)) return "n/a";
    return '$' + (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(3));
}

async function fetchJson(url, headers) {
    const r = await fetch(url, { headers: headers || {} });
    if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status);
    return r.json();
}

/* Cards that dropped >= DROP_PCT between the two latest snapshots. */
function computeDrops() {
    const history = parseGlobal(fs.readFileSync(HISTORY_FILE, 'utf8'), 'RIFTZAY_PRICE_HISTORY');
    const dates = history.dates || [];
    const series = history.series || {};
    if (dates.length < 2) return { drops: {}, prevDate: null, curDate: null };

    const prevIdx = dates.length - 2;
    const curIdx = dates.length - 1;
    const drops = {};
    for (const [slug, arr] of Object.entries(series)) {
        const prev = arr[prevIdx];
        const cur = arr[curIdx];
        if (prev == null || cur == null || prev <= 0) continue;
        const pct = ((cur - prev) / prev) * 100;
        if (pct <= -DROP_PCT) {
            drops[slug] = { pct: pct, prev: prev, cur: cur };
        }
    }
    return { drops: drops, prevDate: dates[prevIdx], curDate: dates[curIdx] };
}

async function fetchUsers() {
    const rows = await fetchJson(
        process.env.SUPABASE_URL + '/rest/v1/profiles?select=user_id,email&email_alerts=eq.true',
        { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY }
    );
    return rows || [];
}

async function fetchWatchlist() {
    const rows = await fetchJson(
        process.env.SUPABASE_URL + '/rest/v1/watchlist?select=user_id,card_slug',
        { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY }
    );
    return rows || [];
}

async function sendEmail(to, subject, html) {
    const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        },
        body: JSON.stringify({
            from: process.env.ALERT_FROM_EMAIL,
            to: to,
            subject: subject,
            html: html,
        }),
    });
    if (!r.ok) throw new Error('Resend HTTP ' + r.status + ': ' + (await r.text()));
    return r.json();
}

async function main() {
    const { drops, prevDate, curDate } = computeDrops();
    if (!Object.keys(drops).length) {
        console.log('No cards dropped >= ' + DROP_PCT + '% between ' + prevDate + ' -> ' + curDate + '. Nothing to email.');
        return;
    }
    console.log('Dropped >= ' + DROP_PCT + '% (' + prevDate + ' -> ' + curDate + '): ' + Object.keys(drops).length + ' cards.');

    if (DRY) {
        console.log('--- DRY RUN: offline check complete. Set SUPABASE_URL / SUPABASE_SERVICE_KEY /');
        console.log('    RESEND_API_KEY / ALERT_FROM_EMAIL env vars to send for real. ---');
        return;
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY ||
        !process.env.RESEND_API_KEY || !process.env.ALERT_FROM_EMAIL) {
        console.log('Missing one of SUPABASE_URL / SUPABASE_SERVICE_KEY / RESEND_API_KEY / ALERT_FROM_EMAIL - skipping.');
        return;
    }

    // Card names for readable alerts
    let names = {};
    try {
        const bundle = parseGlobal(fs.readFileSync(CARDS_FILE, 'utf8'), 'RIFTZAY_CARDS_BUNDLE');
        (bundle || []).forEach(function (c) { if (c && c.cardCode) names[c.cardCode] = c.name; });
    } catch (e) { /* names optional */ }

    const mmkPerUsd = readConfig().mmkPerUsd;

    // Group watchlist by user
    const watchByUser = {};
    for (const row of await fetchWatchlist()) {
        if (!row || !row.user_id || !row.card_slug) continue;
        (watchByUser[row.user_id] = watchByUser[row.user_id] || []).push(row.card_slug);
    }

    const users = await fetchUsers();
    const opted = users.filter(function (u) { return u && u.user_id && u.email; });
    console.log('Opted-in users: ' + opted.length);

    let sent = 0;
    for (const user of opted) {
        const watched = watchByUser[user.user_id] || [];
        const matched = watched
            .filter(function (slug) { return drops[slug]; })
            .map(function (slug) {
                const d = drops[slug];
                const name = names[slug] || slug;
                return { name: name, slug: slug, prev: d.prev, cur: d.cur, pct: d.pct };
            });
        if (!matched.length) continue;

        matched.sort(function (a, b) { return a.pct - b.pct; });
        const lines = matched.map(function (m) {
            return '<li><strong>' + escapeHtml(m.name) + '</strong> — ' + m.pct.toFixed(1) + '% down, ' +
                fmtUSD(m.cur) + ' (was ' + fmtUSD(m.prev) + ') · ≈ ' +
                Math.round(m.cur * mmkPerUsd).toLocaleString() + ' MMK</li>';
        }).join('');

        const subject = 'RiftZay price alert: ' + matched.length + ' watched card' + (matched.length === 1 ? '' : 's') + ' dropped';
        const html =
            '<h2 style="margin:0 0 12px;color:#F09A3E;font-family:sans-serif;">RiftZay price alerts</h2>' +
            '<p style="margin:0 0 16px;color:#d8dee3;font-family:sans-serif;">Prices changed overnight (' + curDate + '). Cards on your watchlist that dropped at least 5%:</p>' +
            '<ul style="margin:0 0 20px;color:#e9edf1;font-family:sans-serif;line-height:1.7;">' + lines + '</ul>' +
            '<p style="margin:0;color:#8b949e;font-family:sans-serif;font-size:12px;">' +
            'Manage alerts in your <a href="https://Htet69.github.io/RiftZay/" style="color:#F09A3E;">RiftZay</a> watchlist. ' +
            'Market prices from daily TCGplayer snapshots.</p>';

        try {
            await sendEmail(user.email, subject, html);
            sent++;
            console.log('Emailed ' + user.email + ' (' + matched.length + ' card(s)).');
        } catch (e) {
            console.error('Failed to email ' + user.email + ': ' + e.message);
        }
    }

    console.log('Done. Emails sent: ' + sent);
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

main().catch(function (e) {
    console.error(e);
    process.exit(1);
});
