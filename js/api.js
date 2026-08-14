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

        /* ---------- COMMUNITY LISTINGS ---------- */

        getListings: async function (cardSlug) {
            if (HAS_SUPABASE) {
                const { data, error } = await supabase
                    .from("listings")
                    .select("*")
                    .eq("card_slug", cardSlug)
                    .gt("quantity", 0)
                    .order("price_mmk", { ascending: true });
                if (error) throw new Error(error.message);
                return data || [];
            }
            return readLS(LS_KEYS.listings, [])
                .filter(function (listing) {
                    return listing.card_slug === cardSlug && listing.quantity > 0;
                })
                .sort(function (a, b) { return a.price_mmk - b.price_mmk; });
        },

        getAllListings: async function () {
            if (HAS_SUPABASE) {
                const { data, error } = await supabase
                    .from("listings")
                    .select("*")
                    .gt("quantity", 0)
                    .order("created_at", { ascending: false });
                if (error) throw new Error(error.message);
                return data || [];
            }
            return readLS(LS_KEYS.listings, []).filter(function (listing) {
                return listing.quantity > 0;
            });
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

            if (HAS_SUPABASE) {
                const { data, error } = await supabase
                    .from("listings")
                    .insert([listing])
                    .select()
                    .single();
                if (error) throw new Error(error.message);
                return data;
            }

            listing.id = uid();
            listing.created_at = nowISO();
            const listings = readLS(LS_KEYS.listings, []);
            listings.push(listing);
            writeLS(LS_KEYS.listings, listings);
            return listing;
        },

        deleteListing: async function (userId, listingId) {
            if (HAS_SUPABASE) {
                const { error } = await supabase
                    .from("listings")
                    .delete()
                    .eq("id", listingId)
                    .eq("seller_id", userId);
                if (error) throw new Error(error.message);
                return;
            }

            const listings = readLS(LS_KEYS.listings, []);
            writeLS(LS_KEYS.listings, listings.filter(function (listing) {
                return !(listing.id === listingId && listing.seller_id === userId);
            }));
        },

        subscribeListings: function (onChange) {
            if (!HAS_SUPABASE) return function () {};
            const channel = supabase
                .channel("riftzay-listings")
                .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, onChange)
                .subscribe();
            return function () { supabase.removeChannel(channel); };
        },
    };

    window.RIFTZAY_API = API;
})();
