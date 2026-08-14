/* RiftZay - Configuration
 *
 * To enable LIVE SHARED listings so every user in your community
 * sees the same marketplace (not just their own browser):
 *
 *   1. Create a FREE Supabase project at https://supabase.com
 *      (no credit card needed).
 *   2. In Supabase, open the SQL Editor, paste the entire contents
 *      of the "supabase.sql" file in this folder, and click Run.
 *      This creates the listings + watchlist tables and realtime.
 *   3. Optional: in Authentication > Providers, turn OFF
 *      "Confirm email" so members can sign up instantly
 *      (good for a small local community).
 *   4. Copy your Project URL and anon public key from
 *      Project Settings > API and paste them below.
 *   5. Deploy this folder to any static host (Netlify, Vercel,
 *      GitHub Pages, Cloudflare Pages) so everyone can reach it.
 *
 * If the keys are left empty, RiftZay runs in "Local mode" using
 * this browser's localStorage — great for a quick offline preview.
 */
window.RIFTZAY_CONFIG = {
    SUPABASE_URL: "https://qfbfqpcdkmijsysrhbla.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmYmZxcGNka21panN5c3JoYmxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MTA5ODAsImV4cCI6MjEwMjE4Njk4MH0.CWBwiUQwxGbZg8VVNQuy8gvWM3zPgF63q5ClFgp76ss",

    /* MMK -> USD display rate. Listing prices are entered in MMK; the app
     * shows an approximate USD equivalent next to them using this rate.
     * Update it whenever the market rate changes (display-only estimate). */
    MMK_PER_USD: 4400,

    /* Multi-market store prices (from RiftCompare) are stored in each
     * market's native currency; these rates convert them to USD for the
     * "≈ MMK" display. Approximate, display-only. */
    FX_TO_USD: {
        AU: 0.66,   // Australian Dollar
        NZ: 0.61,   // New Zealand Dollar
        US: 1.0,    // US Dollar
        UK: 1.27,   // British Pound
        SG: 0.74,   // Singapore Dollar
        CA: 0.73,   // Canadian Dollar
    },

    APP_NAME: "RiftZay",
};
