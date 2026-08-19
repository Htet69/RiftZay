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
        listings: "riftzay_listings",
        alerts: "riftzay_alerts",
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
    let cloudDown = false; // circuit breaker: stop calling Supabase once it fails

    function getClient() {
        if (supabase || !HAS_SUPABASE) return supabase;
        supabase = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
        return supabase;
    }

    function markCloudDown() {
        if (cloudDown) return;
        cloudDown = true;
        if (supabase) {
            try { supabase.removeAllChannels(); } catch (e) { /* ignore */ }
        }
    }

    function cloudMode() {
        return HAS_SUPABASE && !cloudDown;
    }

    function localSession() {
        return readLS(LS_KEYS.session, null);
    }

    function currentSessionEmail(userId) {
        const s = localSession();
        if (s && s.email) return s.email;
        const users = readLS(LS_KEYS.users, []);
        const u = users.find(function (x) { return x.id === userId; });
        return (u && u.email) || "";
    }

    /* Best-effort: remember this user's email + alert preference in Supabase
     * so the nightly email notifier can find them. Never blocks auth. */
    async function syncProfile(user) {
        if (!user || !cloudMode()) return;
        const prefs = readLS(LS_KEYS.alerts, {});
        const enabled = prefs[user.id] !== false;
        try {
            await getClient()
                .from("profiles")
                .upsert({
                    user_id: user.id,
                    email: user.email,
                    email_alerts: enabled,
                }, { onConflict: "user_id" });
        } catch (e) {
            if (/network|failed to fetch|quic|http/i.test(e.message || "")) markCloudDown();
        }
    }

    /* One fast connectivity check before touching the Supabase client, so an
     * unreachable host or missing table never spins up the realtime websocket
     * and its retry spam. Probes the actual listings table so a missing table
     * (404) or network failure (QUIC) both trip the breaker -> local mode. */
    async function probeCloud() {
        if (!HAS_SUPABASE || cloudDown) return;
        var ctrl = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, 4000);
        try {
            var r = await fetch(
                CFG.SUPABASE_URL + "/rest/v1/listings?select=*&limit=1",
                {
                    method: "GET",
                    headers: {
                        "apikey": CFG.SUPABASE_ANON_KEY,
                        "Authorization": "Bearer " + CFG.SUPABASE_ANON_KEY,
                    },
                    cache: "no-store",
                    signal: ctrl.signal,
                }
            );
            if (!r.ok) throw new Error("HTTP " + r.status);
        } catch (e) {
            markCloudDown();
        } finally {
            clearTimeout(timer);
        }
    }

    const API = {

        mode: function () {
            return cloudMode() ? "cloud" : "local";
        },

        isCloudDown: function () {
            return cloudDown;
        },

        probeCloud: probeCloud,

        /* ---------- AUTH ---------- */

        getSession: async function () {
            if (cloudMode()) {
                try {
                    const { data, error } = await getClient().auth.getSession();
                    if (error) throw error;
                    if (!data.session) return null;
                    const user = {
                        id: data.session.user.id,
                        email: data.session.user.email,
                        username: data.session.user.user_metadata?.username || data.session.user.email,
                    };
                    syncProfile(user);
                    return user;
                } catch (e) {
                    markCloudDown();
                }
            }
            return localSession();
        },

        register: async function (email, password, username) {
            if (cloudMode()) {
                try {
                    const { data, error } = await getClient().auth.signUp({
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
                    const user = {
                        id: data.session.user.id,
                        email: data.session.user.email,
                        username: data.session.user.user_metadata?.username || data.session.user.email,
                    };
                    syncProfile(user);
                    return user;
                } catch (e) {
                    if (/network|failed to fetch|quic|http/i.test(e.message || "")) markCloudDown();
                    throw e;
                }
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
            if (cloudMode()) {
                try {
                    const { data, error } = await getClient().auth.signInWithPassword({
                        email: email,
                        password: password,
                    });
if (error) throw new Error(error.message || "Invalid credentials.");
                    const user = {
                        id: data.session.user.id,
                        email: data.session.user.email,
                        username: data.session.user.user_metadata?.username || data.session.user.email,
                    };
                    syncProfile(user);
                    return user;
                } catch (e) {
                    if (/network|failed to fetch|quic|http/i.test(e.message || "")) markCloudDown();
                    throw e;
                }
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
            if (cloudMode()) {
                try { await getClient().auth.signOut(); } catch (e) { /* ignore */ }
            }
            localStorage.removeItem(LS_KEYS.session);
        },

        /* ---------- WATCHLIST ---------- */

        getWatchlist: async function (userId) {
            if (cloudMode()) {
                try {
                    const { data, error } = await getClient()
                        .from("watchlist")
                        .select("card_slug")
                        .eq("user_id", userId);
                    if (error) throw new Error(error.message);
                    return (data || []).map(function (row) { return row.card_slug; });
                } catch (e) {
                    if (/network|failed to fetch|quic|http/i.test(e.message || "")) markCloudDown();
                }
            }

            const map = readLS(LS_KEYS.watchlist, {}) || {};
            return map[userId] || [];
        },

        toggleWatch: async function (userId, cardSlug) {
            if (cloudMode()) {
                const current = await API.getWatchlist(userId);
                try {
                    const exists = current.indexOf(cardSlug) !== -1;
                    const client = getClient();
                    if (exists) {
                        const { error } = await client
                            .from("watchlist")
                            .delete()
                            .eq("user_id", userId)
                            .eq("card_slug", cardSlug);
                        if (error) throw new Error(error.message);
                        return false;
                    }
                    const { error } = await client
                        .from("watchlist")
                        .insert([{ user_id: userId, card_slug: cardSlug }]);
                    if (error) throw new Error(error.message);
                    return true;
                } catch (e) {
                    if (/network|failed to fetch|quic|http/i.test(e.message || "")) markCloudDown();
                }
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

        /* ---------- PRICE-DROP EMAIL ALERTS ---------- */

        getEmailAlerts: async function (userId) {
            const prefs = readLS(LS_KEYS.alerts, {});
            if (userId && prefs[userId] === false) return false;
            if (cloudMode() && userId) {
                try {
                    const { data, error } = await getClient()
                        .from("profiles")
                        .select("email_alerts")
                        .eq("user_id", userId)
                        .maybeSingle();
                    if (error) throw new Error(error.message);
                    if (data && data.email_alerts != null) return data.email_alerts;
                } catch (e) {
                    if (/network|failed to fetch|quic|http/i.test(e.message || "")) markCloudDown();
                }
            }
            return true;
        },

        setEmailAlerts: async function (userId, enabled) {
            const prefs = readLS(LS_KEYS.alerts, {});
            prefs[userId] = Boolean(enabled);
            writeLS(LS_KEYS.alerts, prefs);
            if (cloudMode() && userId) {
                try {
                    await getClient()
                        .from("profiles")
                        .upsert({
                            user_id: userId,
                            email: currentSessionEmail(userId),
                            email_alerts: Boolean(enabled),
                        }, { onConflict: "user_id" });
                } catch (e) {
                    if (/network|failed to fetch|quic|http/i.test(e.message || "")) markCloudDown();
                }
            }
        },

        /* ---------- COMMUNITY LISTINGS ---------- */

getListings: async function (cardSlug) {
            if (cloudMode()) {
                try {
                    const { data, error } = await getClient()
                        .from("listings")
                        .select("*")
                        .eq("card_slug", cardSlug)
                        .gt("quantity", 0)
                        .order("price_mmk", { ascending: true });
                    if (error) throw new Error(error.message);
                    return data || [];
                } catch (e) {
                    markCloudDown();
                }
            }
            return readLS(LS_KEYS.listings, [])
                .filter(function (listing) {
                    return listing.card_slug === cardSlug && listing.quantity > 0;
                })
                .sort(function (a, b) { return a.price_mmk - b.price_mmk; });
        },

        getAllListings: async function () {
            if (cloudMode()) {
                try {
                    const { data, error } = await getClient()
                        .from("listings")
                        .select("*")
                        .gt("quantity", 0)
                        .order("created_at", { ascending: false });
                    if (error) throw new Error(error.message);
                    return data || [];
                } catch (e) {
                    markCloudDown();
                }
            }
            return readLS(LS_KEYS.listings, []).filter(function (listing) {
                return listing.quantity > 0;
            });
        },

        /* The seller's own listings, including sold ones (quantity = 0) so
         * the "My Listings" page can show a Sold state and offer repost. */
        getMyListings: async function (userId) {
            if (cloudMode()) {
                try {
                    const { data, error } = await getClient()
                        .from("listings")
                        .select("*")
                        .eq("seller_id", userId)
                        .order("created_at", { ascending: false });
                    if (error) throw new Error(error.message);
                    return data || [];
                } catch (e) {
                    markCloudDown();
                }
            }
            return readLS(LS_KEYS.listings, []).filter(function (listing) {
                return listing.seller_id === userId;
            });
        },

        /* Mark sold (quantity 0) or repost (back to a positive quantity). */
        setListingQuantity: async function (userId, listingId, quantity) {
            if (cloudMode()) {
                try {
                    const { error } = await getClient()
                        .from("listings")
                        .update({ quantity: quantity })
                        .eq("id", listingId)
                        .eq("seller_id", userId);
                    if (error) throw new Error(error.message);
                    return;
                } catch (e) {
                    if (/network|failed to fetch|quic|http/i.test(e.message || "")) markCloudDown();
                    throw e;
                }
            }

            const listings = readLS(LS_KEYS.listings, []);
            const target = listings.find(function (listing) {
                return listing.id === listingId && listing.seller_id === userId;
            });
            if (!target) return;
            target.quantity = quantity;
            writeLS(LS_KEYS.listings, listings);
        },

        createListing: async function (user, values) {
            const listing = {
                card_slug: values.card_slug,
                seller_id: user.id,
                seller_name: user.username,
                condition: values.condition,
                variant: values.variant,
                price_mmk: Number(values.price_mmk),
                quantity: Number(values.quantity),
                location: values.location,
                contact: values.contact,
            };

            if (cloudMode()) {
                try {
                    const { data, error } = await getClient()
                        .from("listings")
                        .insert([listing])
                        .select()
                        .single();
                    if (error) throw new Error(error.message);
                    return data;
                } catch (e) {
                    if (/network|failed to fetch|quic|http/i.test(e.message || "")) markCloudDown();
                    throw e;
                }
            }

            listing.id = uid();
            listing.created_at = nowISO();
            const listings = readLS(LS_KEYS.listings, []);
            listings.push(listing);
            writeLS(LS_KEYS.listings, listings);
            return listing;
        },

        deleteListing: async function (userId, listingId) {
            if (cloudMode()) {
                try {
                    const { error } = await getClient()
                        .from("listings")
                        .delete()
                        .eq("id", listingId)
                        .eq("seller_id", userId);
                    if (error) throw new Error(error.message);
                    return;
                } catch (e) {
                    if (/network|failed to fetch|quic|http/i.test(e.message || "")) markCloudDown();
                    throw e;
                }
            }

            const listings = readLS(LS_KEYS.listings, []);
            writeLS(LS_KEYS.listings, listings.filter(function (listing) {
                return !(listing.id === listingId && listing.seller_id === userId);
            }));
        },

        subscribeListings: function (onChange) {
            if (!cloudMode()) return function () {};
            try {
                const channel = getClient()
                    .channel("riftzay-listings")
                    .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, onChange)
                    .subscribe();
                return function () { supabase.removeChannel(channel); };
            } catch (e) {
                return function () {};
            }
        },
    };

    window.RIFTZAY_API = API;
})();
