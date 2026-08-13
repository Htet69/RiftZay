/* RiftZay - API layer (price tracker)
 *
 * Auto-detects mode:
 *  - Cloud mode  : Supabase configured -> shared real database, real auth
 *  - Local mode  : no config -> localStorage (this browser only)
 *
 * The app never throws because of mode. Both modes expose the same methods.
 */

(function () {
    "use strict";

    const CFG = window.RIFTZAY_CONFIG || {};
    const HAS_SUPABASE = Boolean(
        CFG.SUPABASE_URL &&
        CFG.SUPABASE_ANON_KEY &&
        window.supabase
    );

    const LS_KEYS = {
        users: "riftzay_users",
        session: "riftzay_session",
        watchlist: "riftzay_watchlist",
    };

    function readLS(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function writeLS(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            /* storage full or unavailable - ignore */
        }
    }

    function uid() {
        return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    }

    function nowISO() {
        return new Date().toISOString();
    }

    let supabase = null;
    if (HAS_SUPABASE) {
        supabase = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    }

    const API = {

        mode: function () {
            return HAS_SUPABASE ? "cloud" : "local";
        },

        /* ---------- AUTH ---------- */

        getSession: async function () {
            if (HAS_SUPABASE) {
                const { data, error } = await supabase.auth.getSession();
                if (error || !data.session) return null;
                return {
                    id: data.session.user.id,
                    email: data.session.user.email,
                    username: data.session.user.user_metadata?.username || data.session.user.email,
                };
            }
            return readLS(LS_KEYS.session, null);
        },

        register: async function (email, password, username) {
            if (HAS_SUPABASE) {
                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: { username: username || email.split("@")[0] },
                    },
                });
                if (error) throw new Error(error.message);
                if (!data.session) {
                    throw new Error("Account created! Check your email to confirm before signing in.");
                }
                return {
                    id: data.session.user.id,
                    email: data.session.user.email,
                    username: data.session.user.user_metadata?.username || email.split("@")[0],
                };
            }

            /* Local mode */
            const users = readLS(LS_KEYS.users, []);
            const exists = users.some(function (u) { return u.email === email; });
            if (exists) throw new Error("An account with this email already exists.");
            const user = {
                id: uid(),
                email: email,
                password: btoa(password), /* simple obfuscation for demo only */
                username: username || email.split("@")[0],
                created_at: nowISO(),
            };
            users.push(user);
            writeLS(LS_KEYS.users, users);
            const session = { id: user.id, email: user.email, username: user.username };
            writeLS(LS_KEYS.session, session);
            return session;
        },

        login: async function (email, password) {
            if (HAS_SUPABASE) {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password,
                });
                if (error) throw new Error(error.message || "Invalid credentials.");
                return {
                    id: data.session.user.id,
                    email: data.session.user.email,
                    username: data.session.user.user_metadata?.username || email.split("@")[0],
                };
            }

            /* Local mode */
            const users = readLS(LS_KEYS.users, []);
            const user = users.find(function (u) {
                return u.email === email && u.password === btoa(password);
            });
            if (!user) throw new Error("Invalid email or password.");
            const session = { id: user.id, email: user.email, username: user.username };
            writeLS(LS_KEYS.session, session);
            return session;
        },

        logout: async function () {
            if (HAS_SUPABASE) {
                await supabase.auth.signOut();
            }
            localStorage.removeItem(LS_KEYS.session);
        },

        /* ---------- WATCHLIST ---------- */

        getWatchlist: async function (userId) {
            if (HAS_SUPABASE) {
                const { data, error } = await supabase
                    .from("watchlist")
                    .select("card_slug")
                    .eq("user_id", userId);
                if (error) throw new Error(error.message);
                return (data || []).map(function (row) { return row.card_slug; });
            }

            const map = readLS(LS_KEYS.watchlist, {}) || {};
            return map[userId] || [];
        },

        toggleWatch: async function (userId, cardSlug) {
            if (HAS_SUPABASE) {
                const current = await API.getWatchlist(userId);
                const exists = current.indexOf(cardSlug) !== -1;
                if (exists) {
                    const { error } = await supabase
                        .from("watchlist")
                        .delete()
                        .eq("user_id", userId)
                        .eq("card_slug", cardSlug);
                    if (error) throw new Error(error.message);
                    return false;
                }
                const { error } = await supabase
                    .from("watchlist")
                    .insert([{ user_id: userId, card_slug: cardSlug }]);
                if (error) throw new Error(error.message);
                return true;
            }

            const map = readLS(LS_KEYS.watchlist, {}) || {};
            const list = map[userId] || [];
            const idx = list.indexOf(cardSlug);
            let added;
            if (idx !== -1) {
                list.splice(idx, 1);
                added = false;
            } else {
                list.push(cardSlug);
                added = true;
            }
            map[userId] = list;
            writeLS(LS_KEYS.watchlist, map);
            return added;
        },
    };

    window.RIFTZAY_API = API;
})();