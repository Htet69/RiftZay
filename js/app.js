/* RiftZay - main application logic (price tracker) */

(function () {
    "use strict";

    const $ = function (sel) {
        return document.querySelector(sel);
    };

    const API = window.RIFTZAY_API;
    const MARKETS = RIFTZAY_MARKETS;
    const CARDS = RIFTZAY_CARDS;
    const CARD_BY_SLUG = RIFTZAY_CARD_BY_SLUG;

    let currentUser = null;
    let myWatchlist = [];

    /* ---------- Helpers ---------- */

    const fmt = function (value) {
        return "US$" + Number(value).toFixed(2);
    };

    const marketName = function (key) {
        const m = MARKETS.find(function (m) { return m.key === key; });
        return m ? m.name : key;
    };

    const marketLogo = function (key) {
        const m = MARKETS.find(function (m) { return m.key === key; });
        return m ? m.logo : "🏪";
    };

    function showToast(message, type) {
        const toast = $("#toast");
        toast.textContent = message;
        toast.className = "toast" + (type ? " " + type : "");
        toast.hidden = false;
        clearTimeout(toast._t);
        toast._t = setTimeout(function () {
            toast.hidden = true;
        }, 3200);
    }

    /* ---------- Views / navigation ---------- */

    function showView(name) {
        ["browse", "watchlist"].forEach(function (v) {
            $("#view-" + v).hidden = v !== name;
        });
        document.querySelectorAll(".main-nav a").forEach(function (a) {
            a.classList.toggle("active", a.getAttribute("data-nav") === name);
        });

        if (name === "watchlist") renderWatchlist();
    }

    /* ---------- Auth UI ---------- */

    function updateAuthUI() {
        const btn = $("#auth-btn");
        const chip = $("#user-chip");
        if (currentUser) {
            chip.hidden = false;
            chip.textContent = "👤 " + currentUser.username;
            btn.textContent = "Sign Out";
        } else {
            chip.hidden = true;
            btn.textContent = "Sign In";
        }
    }

    function updateModeBanner() {
        const isCloud = API.mode() === "cloud";
        $("#mode-dot").classList.toggle("cloud", isCloud);
        $("#mode-text").textContent = isCloud
            ? "Cloud mode — shared online database"
            : "Local mode — data stored in this browser. Add free Supabase keys in js/config.js to go live.";
    }

    let authMode = "register";

    function openAuth(mode) {
        authMode = mode || "register";
        const isRegister = authMode === "register";
        $("#auth-title").textContent = isRegister ? "Welcome to RiftZay" : "Welcome back";
        $("#auth-sub").textContent = isRegister
            ? "Create an account to track Riftbound card prices."
            : "Sign in to manage your watchlist.";
        $("#auth-switch-label").textContent = isRegister
            ? "Already have an account?"
            : "New to RiftZay?";
        $("#auth-switch").textContent = isRegister ? "Sign In" : "Create Account";
        $("#username-field").hidden = !isRegister;
        $("#auth-submit").textContent = isRegister ? "Create Account" : "Sign In";
        $("#auth-error").hidden = true;
        $("#auth-email").value = "";
        $("#auth-password").value = "";
        $("#auth-username").value = "";
        $("#auth-modal").hidden = false;
    }

    function closeAuth() {
        $("#auth-modal").hidden = true;
    }

    async function handleAuthSubmit(e) {
        e.preventDefault();
        const email = $("#auth-email").value.trim();
        const password = $("#auth-password").value;
        const username = $("#auth-username").value.trim();
        const errEl = $("#auth-error");

        try {
            if (authMode === "register") {
                currentUser = await API.register(email, password, username);
                showToast("Account created. Welcome to RiftZay!", "success");
            } else {
                currentUser = await API.login(email, password);
                showToast("Signed in as " + currentUser.username, "success");
            }
            errEl.hidden = true;
            closeAuth();
            myWatchlist = currentUser ? await API.getWatchlist(currentUser.id) : [];
            updateAuthUI();
            renderCards($("#search-input").value, $("#sort-select").value);
            renderWatchlist();
            updateStats();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
        }
    }

    async function handleLogout() {
        await API.logout();
        currentUser = null;
        myWatchlist = [];
        updateAuthUI();
        showToast("Signed out.", "");
        renderCards($("#search-input").value, $("#sort-select").value);
        renderWatchlist();
        updateStats();
    }

    /* ---------- Card grid (browse) ---------- */

    function cardHTML(card, opts) {
        opts = opts || {};
        const rows = card.marketEntries.map(function (entry) {
            const isBest = entry.market === card.lowest.market;
            const bestTag = isBest ? '<span class="best-price-tag">BEST</span>' : "";
            const cls = isBest ? ' class="best"' : "";
            return (
                "<tr>" +
                "<td>" + marketLogo(entry.market) + " " + marketName(entry.market) + "</td>" +
                "<td" + cls + ">" + fmt(entry.price) + bestTag + "</td>" +
                "</tr>"
            );
        }).join("");

        const watched = currentUser && myWatchlist.indexOf(card.slug) !== -1;

        return (
            '<article class="tcg-card">' +
            '<button class="watch-btn' + (watched ? " watched" : "") + '" data-watch="' + card.slug + '" title="' +
            (watched ? "Remove from watchlist" : "Add to watchlist") + '">' +
            (watched ? "★" : "☆") + "</button>" +
            '<div class="tcg-card-header">' +
            "<div>" +
            '<h3 data-detail="' + card.slug + '">' + card.name + "</h3>" +
            '<div class="set-name">' + card.set + "</div>" +
            "</div>" +
            '<span class="rarity rarity-' + card.rarity + '">' + card.rarity + "</span>" +
            "</div>" +
            '<table class="price-table">' +
            "<thead><tr><th>Market</th><th>Price</th></tr></thead>" +
            "<tbody>" + rows + "</tbody>" +
            "</table>" +
            '<div class="price-gap">' +
            "Best deal: <strong>" + marketName(card.lowest.market) + "</strong> at " + fmt(card.lowest.price) +
            " — saving up to " + fmt(card.spread) + " vs the highest market." +
            "</div>" +
            "</article>"
        );
    }

    function renderCards(query, sortKey) {
        const grid = $("#card-grid");
        const empty = $("#empty-state");
        const q = (query || "").trim().toLowerCase();

        let filtered = CARDS.filter(function (card) {
            if (!q) return true;
            return (
                card.name.toLowerCase().indexOf(q) !== -1 ||
                card.set.toLowerCase().indexOf(q) !== -1 ||
                card.rarity.toLowerCase().indexOf(q) !== -1
            );
        });

        switch (sortKey) {
            case "lowest":
                filtered = filtered.slice().sort(function (a, b) { return a.lowest.price - b.lowest.price; });
                break;
            case "highest":
                filtered = filtered.slice().sort(function (a, b) { return b.lowest.price - a.lowest.price; });
                break;
            case "spread":
                filtered = filtered.slice().sort(function (a, b) { return b.spread - a.spread; });
                break;
            default:
                filtered = filtered.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
        }

        grid.innerHTML = filtered.map(function (c) { return cardHTML(c); }).join("");
        empty.hidden = filtered.length !== 0;
    }

    /* ---------- Watchlist ---------- */

    async function renderWatchlist() {
        const grid = $("#watchlist-grid");
        const empty = $("#watchlist-empty");

        if (!currentUser) {
            grid.innerHTML = "";
            empty.hidden = false;
            empty.textContent = "Sign in to track cards with your watchlist.";
            return;
        }

        const watched = CARDS.filter(function (c) {
            return myWatchlist.indexOf(c.slug) !== -1;
        });
        grid.innerHTML = watched.map(function (c) { return cardHTML(c); }).join("");
        empty.hidden = watched.length !== 0;
    }

    /* ---------- Card detail modal ---------- */

    function openCardDetail(slug) {
        const card = CARD_BY_SLUG[slug];
        if (!card) return;

        const rows = card.marketEntries.map(function (entry) {
            const isBest = entry.market === card.lowest.market;
            const bestTag = isBest ? '<span class="best-price-tag">BEST</span>' : "";
            const cls = isBest ? ' class="best"' : "";
            return (
                "<tr>" +
                "<td>" + marketLogo(entry.market) + " " + marketName(entry.market) + "</td>" +
                "<td" + cls + ">" + fmt(entry.price) + bestTag + "</td>" +
                "</tr>"
            );
        }).join("");

        const watched = currentUser && myWatchlist.indexOf(card.slug) !== -1;

        $("#card-modal-content").innerHTML =
            '<div class="card-detail-header">' +
            "<div>" +
            "<h3>" + card.name + "</h3>" +
            '<div class="set-name">' + card.set + "</div>" +
            "</div>" +
            '<span class="rarity rarity-' + card.rarity + '">' + card.rarity + "</span>" +
            "</div>" +
            '<table class="detail-table">' +
            "<thead><tr><th>Market</th><th>Price</th></tr></thead>" +
            "<tbody>" + rows + "</tbody>" +
            "</table>" +
            '<div class="price-gap">' +
            "Best deal: <strong>" + marketName(card.lowest.market) + "</strong> at " + fmt(card.lowest.price) +
            " — saving up to " + fmt(card.spread) + " vs the highest market." +
            "</div>" +
            '<div class="detail-actions">' +
            '<button class="btn btn-ghost" data-watch="' + card.slug + '">' +
            (watched ? "★ Remove from Watchlist" : "☆ Add to Watchlist") +
            "</button>" +
            "</div>";

        $("#card-modal").hidden = false;
    }

    function closeCardDetail() {
        $("#card-modal").hidden = true;
    }

    /* ---------- Event handlers ---------- */

    async function handleWatchClick(slug) {
        if (!currentUser) {
            openAuth("register");
            showToast("Sign in to use your watchlist.", "");
            return;
        }
        try {
            const added = await API.toggleWatch(currentUser.id, slug);
            if (added) {
                myWatchlist.push(slug);
                showToast("Added to watchlist ★", "success");
            } else {
                myWatchlist = myWatchlist.filter(function (s) { return s !== slug; });
                showToast("Removed from watchlist.", "");
            }
            renderCards($("#search-input").value, $("#sort-select").value);
            renderWatchlist();
            updateStats();
            const detailOpen = !$("#card-modal").hidden;
            if (detailOpen) openCardDetail(slug);
        } catch (e) {
            showToast(e.message, "error");
        }
    }

    /* ---------- "Live" price simulation ---------- */

    function jitterPrices() {
        CARDS.forEach(function (card) {
            Object.keys(card.prices).forEach(function (market) {
                const base = card.prices[market];
                // random walk: ±4% of the base
                const delta = base * (Math.random() * 0.08 - 0.04);
                card.prices[market] = Math.max(0.03, base + delta);
            });
            // Recompute enrichments
            const entries = Object.keys(card.prices).map(function (key) {
                return { market: key, price: card.prices[key] };
            });
            const sorted = entries.slice().sort(function (a, b) { return a.price - b.price; });
            card.marketEntries = entries;
            card.lowest = sorted[0];
            card.highest = sorted[sorted.length - 1];
            card.spread = card.highest.price - card.lowest.price;
        });

        renderCards($("#search-input").value, $("#sort-select").value);
        const detailOpen = !$("#card-modal").hidden;
        if (detailOpen) {
            const slug = $("#card-modal-content").querySelector("[data-watch]");
            if (slug) openCardDetail(slug.getAttribute("data-watch"));
        }
        showToast("Prices refreshed with the latest market ticks.", "");
    }

    /* ---------- Stats ---------- */

    function updateStats() {
        $("#stat-cards").textContent = CARDS.length;
        $("#stat-markets").textContent = MARKETS.length;
        $("#stat-watchlist").textContent = currentUser ? myWatchlist.length : 0;
    }

    /* ---------- Init ---------- */

    async function init() {
        updateModeBanner();

        // Hero stats
        updateStats();

        // Restore session
        try {
            currentUser = await API.getSession();
        } catch (e) {
            currentUser = null;
        }
        if (currentUser) {
            try {
                myWatchlist = await API.getWatchlist(currentUser.id);
            } catch (e) {
                myWatchlist = [];
            }
        }
        updateAuthUI();
        updateStats();

        // Initial renders
        renderCards("", "name");

        // Nav
        document.querySelectorAll("[data-nav]").forEach(function (el) {
            el.addEventListener("click", function (e) {
                e.preventDefault();
                const nav = this.getAttribute("data-nav");
                showView(nav);
            });
        });

        // Search & sort
        $("#search-input").addEventListener("input", function () {
            renderCards(this.value, $("#sort-select").value);
        });
        $("#sort-select").addEventListener("change", function () {
            renderCards($("#search-input").value, this.value);
        });

        // Auth
        $("#auth-btn").addEventListener("click", function () {
            if (currentUser) {
                handleLogout();
            } else {
                openAuth("register");
            }
        });
        $("#auth-close").addEventListener("click", closeAuth);
        $("#auth-switch").addEventListener("click", function () {
            openAuth(authMode === "register" ? "login" : "register");
        });
        $("#auth-modal").addEventListener("click", function (e) {
            if (e.target === this) closeAuth();
        });
        $("#auth-form").addEventListener("submit", handleAuthSubmit);

        // Card modal
        $("#card-modal-close").addEventListener("click", closeCardDetail);
        $("#card-modal").addEventListener("click", function (e) {
            if (e.target === this) closeCardDetail();
        });

        // Delegated: card detail, watch
        document.addEventListener("click", async function (e) {
            const detailEl = e.target.closest("[data-detail]");
            if (detailEl) {
                openCardDetail(detailEl.getAttribute("data-detail"));
                return;
            }

            const watchEl = e.target.closest("[data-watch]");
            if (watchEl) {
                await handleWatchClick(watchEl.getAttribute("data-watch"));
                return;
            }
        });

        // Refresh prices
        $("#refresh-prices-btn").addEventListener("click", jitterPrices);

        // Auto-refresh prices every 45 seconds to feel "live"
        setInterval(function () {
            renderCards($("#search-input").value, $("#sort-select").value);
        }, 45000);
    }

    document.addEventListener("DOMContentLoaded", init);
})();