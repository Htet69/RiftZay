/* RiftZay - Configuration
 *
 * To enable the cloud (online) database so ALL users share listings:
 *   1. Create a FREE Supabase project at https://supabase.com
 *   2. Copy your "Project URL" and "anon public" key from
 *      Project Settings > API
 *   3. Paste them below between the quotes
 *
 * If these are left empty, RiftZay runs in "Local mode" using
 * this browser's localStorage — great for trying it out instantly
 * with zero setup. No installs required either way.
 */
const RIFTZAY_CONFIG = {
    SUPABASE_URL: "https://qfbfqpcdkmijsysrhbla.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmYmZxcGNka21panN5c3JoYmxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MTA5ODAsImV4cCI6MjEwMjE4Njk4MH0.CWBwiUQwxGbZg8VVNQuy8gvWM3zPgF63q5ClFgp76ss",
    APP_NAME: "RiftZay",
};