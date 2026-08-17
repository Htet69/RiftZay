/* RiftZay - main application logic (TCGplayer-style price tracker) */

(function () {
    "use strict";

    const $ = function (sel) {
        return document.querySelector(sel);
    };

    /* Card art sometimes fails to load on the first try (transient CDN
     * hiccup) even though the URL is valid - retry once before giving up
     * and showing the placeholder. Exposed on window so inline onerror=""
     * attributes (which run in global scope) can reach it. */
    window.riftzayImgRetry = function (img) {
        if (img.dataset.retried) {
            img.style.display = "none";
            return;
        }
        img.dataset.retried = "1";
        const src = img.getAttribute("src");
        img.removeAttribute("src");
        setTimeout(function () { img.setAttribute("src", src); }, 500);
    };

    const API = window.RIFTZAY_API;

    // Populated from js/cards.js once the real catalog has loaded (see init)
    let CARDS = [];
    let CARD_BY_SLUG = {};
    let SETS = {};

    let currentUser = null;
    let myWatchlist = [];
    let allListings = [];
    let soldListings = [];
    let currentSlug = null; // card currently shown on product page
    let listingsSort = "price"; // "price" | "newest" for community offers on the product page

    // Filter / pagination state
    let filterSet = "";
    let filterRarity = "";
    let filterType = "";
    let currentPage = 1;
    const PAGE_SIZE = 24;

    // Suggestion dropdown state (TCGplayer-style autocomplete)
    let suggestActiveSource = null; // "header" | "hero"
    let suggestIndex = -1;
    let suggestCards = [];

    /* ---------- Helpers ---------- */

    const CFG = window.RIFTZAY_CONFIG || {};
    const MMK_PER_USD = Number(CFG.MMK_PER_USD) > 0 ? CFG.MMK_PER_USD : 4400;

    const fmt = function (value) {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "MMK",
            maximumFractionDigits: 0,
        }).format(Number(value));
    };

    const fmtUSD = function (mmk) {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 2,
        }).format(Number(mmk) / MMK_PER_USD);
    };

    /* MMK price with a small approximate USD equivalent underneath/next to it */
    function priceDual(mmk) {
        return fmt(mmk) + ' <span class="usd-approx">≈ ' + fmtUSD(mmk) + "</span>";
    }

    /* USD market price (from the real price feed) with an approximate MMK
     * equivalent next to it, e.g. "$1.24 ≈ MMK 5,456". */
    function marketDual(usd) {
        const v = Number(usd);
        if (!(v > 0)) return "—";
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 2,
        }).format(v) + ' <span class="usd-approx">≈ ' + fmt(Math.round(v * MMK_PER_USD)) + "</span>";
    }

    /* Real market price record for a card slug, or null */
    function marketPrice(slug) {
        const p = (window.RIFTZAY_PRICES || {})[slug];
        return p && p.market != null ? p : null;
    }

    /* Multi-market store price record for a card slug, or null.
     * rc = {AU, NZ, US, UK, SG, CA} in native-currency cents. */
    function marketCents(slug) {
        const p = (window.RIFTZAY_PRICES || {})[slug];
        return p && p.rc ? p.rc : null;
    }

    /* Native-currency price with an approximate USD + MMK equivalent,
     * e.g. "$4.12 · ≈ MMK 18,128" for the US market. */
    const MARKET_CURRENCIES = { AU: "AUD", NZ: "NZD", US: "USD", UK: "GBP", SG: "SGD", CA: "CAD" };
    const MARKET_NAMES = { AU: "Australia", NZ: "New Zealand", US: "United States", UK: "United Kingdom", SG: "Singapore", CA: "Canada" };
    const FX_TO_USD = CFG.FX_TO_USD || {};

    function marketDualFromCents(code, cents) {
        const usd = (Number(cents) / 100) * (FX_TO_USD[code] || 1);
        const cur = MARKET_CURRENCIES[code] || "USD";
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: cur,
            maximumFractionDigits: cents >= 10000 ? 0 : 2,
        }).format(Number(cents) / 100) + ' <span class="usd-approx">≈ ' + fmt(Math.round(usd * MMK_PER_USD)) + "</span>";
    }

    function listingsForCard(slug) {
        const active = allListings.filter(function (listing) {
            return listing.card_slug === slug && Number(listing.quantity) > 0;
        });
        if (listingsSort === "newest") {
            return active.sort(function (a, b) {
                return String(b.created_at || "").localeCompare(String(a.created_at || ""));
            });
        }
        return active.sort(function (a, b) { return Number(a.price_mmk) - Number(b.price_mmk); });
    }

    function lowestListing(card) {
        return listingsForCard(card.slug)[0] || null;
    }

    const cap = function (s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    };

    function showToast(message, type) {
        const toast = $("#toast");
        if (!toast) return;
        toast.textContent = message;
        toast.className = "toast" + (type ? " " + type : "");
        toast.hidden = false;
        clearTimeout(toast._t);
        toast._t = setTimeout(function () {
            toast.hidden = true;
        }, 3200);
    }

    /* ---------- Views / navigation ---------- */

    function showView(name, slug) {
        ["home", "product", "watchlist", "listings", "buys"].forEach(function (v) {
            $("#view-" + v).hidden = v !== name;
        });
        $("#view-product").hidden = name !== "product";
        document.querySelectorAll(".main-nav a").forEach(function (a) {
            const nav = a.getAttribute("data-nav");
            a.classList.toggle("active", nav === name || (name === "product" && nav === "home"));
        });

        const titles = {
            home: "Browse Cards — RiftZay",
            buys: "Buy Now — RiftZay",
            watchlist: "My Watchlist — RiftZay",
            listings: "My Listings — RiftZay",
            product: "Card — RiftZay",
        };
        document.title = titles[name] || "RiftZay — Riftbound TCG Price Tracker";

        if (name === "product" && slug) {
            openProduct(slug);
        } else if (name === "buys") {
            requestNotificationPermission();
            renderBuys();
        } else if (name === "watchlist") {
            renderWatchlist();
        } else if (name === "listings") {
            renderMyListings();
        } else if (name === "home") {
            renderCards($("#search-input").value, $("#sort-select").value);
        }

        if (window.RIFTZAY_REVEAL) window.RIFTZAY_REVEAL();
    }

    /* ---------- Auth UI ---------- */

    function updateAuthUI() {
        const btn = $("#auth-btn");
        const chip = $("#user-chip");
        if (currentUser) {
            chip.hidden = false;
            chip.textContent = currentUser.username;
            btn.textContent = "Sign Out";
        } else {
            chip.hidden = true;
            btn.textContent = "Sign In";
        }
    }

    function updateModeBanner() {
        const isCloud = API.mode() === "cloud";
        const modeDot = $("#mode-dot");
        if (!modeDot) return;
        modeDot.classList.toggle("cloud", isCloud);
        $("#mode-text").textContent = isCloud
            ? "Cloud mode — shared online database"
            : "Local mode — accounts and watchlists stay in this browser.";
    }

    function updateModeChip() {
        const chip = $("#mode-chip");
        if (!chip) return;
        const isCloud = API.mode() === "cloud";
        chip.classList.toggle("cloud", isCloud);
        chip.classList.toggle("local", !isCloud);
        chip.textContent = isCloud
            ? "● Live — listings shared with the community"
            : "● Local preview — listings stay in this browser";
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
            updateStats();

            const view = $("#view-product").hidden ? "home" : "product";
            if (view === "product") {
                openProduct(currentSlug);
            } else {
                renderCards($("#search-input").value, $("#sort-select").value);
                renderWatchlist();
            }
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
        const view = $("#view-product").hidden ? "home" : "product";
        if (view === "product") {
            openProduct(currentSlug);
        } else {
            renderCards($("#search-input").value, $("#sort-select").value);
            renderWatchlist();
        }
        updateStats();
    }

    /* ---------- Card grid (search results) ---------- */

    function cardHTML(card) {
        const watched = currentUser && myWatchlist.indexOf(card.slug) !== -1;
        const offers = listingsForCard(card.slug);
        const low = offers[0] || null;
        const market = marketPrice(card.slug);
        const buyResult = market && window.RIFTZAY_BUYS ? window.RIFTZAY_BUYS.score(market, card.slug) : null;

        const typeLabel = card.type ? cap(card.type) : "";
        const champTag = card.champion ? ' <span class="champ-tag">Champion</span>' : "";

        const marketStrip = market
            ? '<span class="strip-label">Market</span><span class="strip-price best">' + marketDual(market.market) + '</span>' +
            '<span class="market-note">' + (market.finish === "Foil" ? "Foil" : "Near Mint") + " · TCGplayer</span>"
            : (low
                ? '<span class="strip-label">From</span><span class="strip-price best">' + priceDual(low.price_mmk) + '</span><span class="listing-count">' + offers.length + (offers.length === 1 ? " listing" : " listings") + "</span>"
                : '<span class="no-listings">No market data</span>');

        const communityStrip = market && offers.length
            ? '<div class="community-strip">' +
            '<span class="strip-label">From</span><span class="strip-price">' + priceDual(low.price_mmk) + '</span>' +
            '<span class="listing-count">' + offers.length + (offers.length === 1 ? " listing" : " listings") + "</span>" +
            "</div>"
            : "";

        const buyChip = buyResult
            ? '<span class="buy-chip chip-' + (buyResult.tier === "Buy Now" ? "now" : buyResult.tier === "Watch" ? "watch" : "wait") + '" title="' +
            escapeHTML(buyResult.reasons.join(" · ")) + '">' + buyResult.tier + " " + buyResult.score + "</span>"
            : "";

        return (
            '<article class="tcg-card">' +
            '<button class="watch-btn' + (watched ? " watched" : "") + '" data-watch="' + card.slug + '" title="' +
            (watched ? "Remove from watchlist" : "Add to watchlist") + '">' +
            (watched ? "★" : "☆") + "</button>" +
            '<div class="tcg-thumb">' +
            '<img loading="lazy" decoding="async" src="' + card.art + '" alt="' + escapeHTML(card.name) + '" onerror="riftzayImgRetry(this)">' +
            '<div class="tcg-thumb-fallback"></div>' +
            "</div>" +
            '<div class="tcg-card-header">' +
            "<div>" +
            '<h3 data-detail="' + card.slug + '">' + escapeHTML(card.name) + "</h3>" +
            '<div class="set-name">' + card.set + ' · ' + card.setCode + " " + card.number + "</div>" +
            "</div>" +
            '<div class="card-header-side">' +
            '<span class="rarity rarity-' + card.rarity + '">' + cap(card.rarity) + "</span>" +
            buyChip +
            "</div>" +
            "</div>" +
            (typeLabel ? '<div class="card-type">' + typeLabel + champTag + "</div>" : "") +
            '<div class="market-strip">' + marketStrip + "</div>" +
            (market ? '<div class="card-forecast">' + forecastChip(card.slug, true) + "</div>" : "") +
            communityStrip +
            '<div class="card-foot">' +
            '<span class="best-deal">' + (low ? '<strong>' + low.condition + '</strong> · ' + low.location : (market ? 'Market price from TCGplayer' : "Be the first seller")) + "</span>" +
            '<span class="more-link" data-detail="' + card.slug + '">View Offers →</span>' +
            "</div>" +
            "</article>"
        );
    }

    /* Fuzzy-ish search: match if every word in the query appears somewhere */
    function matchesQuery(card, q) {
        if (!q) return true;
        const words = q.split(/\s+/).filter(Boolean);
        const haystack = (
            card.name + " " +
            card.set + " " +
            card.setCode + " " +
            card.rarity + " " +
            (card.type || "") + " " +
            (card.flavor || "")
        ).toLowerCase();
        return words.every(function (w) {
            return haystack.indexOf(w) !== -1;
        });
    }

    function renderCards(query, sortKey) {
        const grid = $("#card-grid");
        const empty = $("#empty-state");
        const count = $("#results-count");
        const title = $("#results-title");
        const q = (query || "").trim().toLowerCase();

        let filtered = CARDS.filter(function (card) {
            if (!matchesQuery(card, q)) return false;
            if (filterSet && card.set !== filterSet) return false;
            if (filterRarity && card.rarity !== filterRarity) return false;
            if (filterType && card.type !== filterType) return false;
            return true;
        });

        switch (sortKey) {
            case "market-low":
                filtered = filtered.slice().sort(function (a, b) {
                    const ap = marketPrice(a.slug);
                    const bp = marketPrice(b.slug);
                    return (ap ? ap.market : Infinity) - (bp ? bp.market : Infinity);
                });
                break;
            case "market-high":
                filtered = filtered.slice().sort(function (a, b) {
                    const ap = marketPrice(a.slug);
                    const bp = marketPrice(b.slug);
                    return (bp ? bp.market : -1) - (ap ? ap.market : -1);
                });
                break;
            case "lowest":
                filtered = filtered.slice().sort(function (a, b) {
                    const ap = lowestListing(a);
                    const bp = lowestListing(b);
                    return (ap ? ap.price_mmk : Infinity) - (bp ? bp.price_mmk : Infinity);
                });
                break;
            case "highest":
                filtered = filtered.slice().sort(function (a, b) {
                    const ap = lowestListing(a);
                    const bp = lowestListing(b);
                    return (bp ? bp.price_mmk : -1) - (ap ? ap.price_mmk : -1);
                });
                break;
            case "offers":
                filtered = filtered.slice().sort(function (a, b) {
                    return listingsForCard(b.slug).length - listingsForCard(a.slug).length;
                });
                break;
            case "newest":
                filtered = filtered.slice().sort(function (a, b) {
                    const ya = parseInt(a.setYear, 10) || 0;
                    const yb = parseInt(b.setYear, 10) || 0;
                    if (yb !== ya) return yb - ya;
                    return cardNumber(a) - cardNumber(b);
                });
                break;
            default:
                filtered = filtered.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
        }

        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = totalPages;
        const start = (currentPage - 1) * PAGE_SIZE;
        const pageCards = filtered.slice(start, start + PAGE_SIZE);

        grid.innerHTML = pageCards.map(function (c) { return cardHTML(c); }).join("");
        empty.hidden = filtered.length !== 0;
        count.textContent = filtered.length + (filtered.length === 1 ? " result" : " results");
        title.textContent = q ? "Results for \u201c" + query.trim() + "\u201d" : "All Cards";

        renderPagination(filtered.length, totalPages);

        /* Re-arm scroll-reveal for freshly rendered cards */
        if (window.RIFTZAY_REVEAL) {
            window.RIFTZAY_REVEAL();
        }
    }

    function renderPagination(total, totalPages) {
        const pag = $("#pagination");
        if (!pag) return;
        if (totalPages <= 1) {
            pag.innerHTML = "";
            pag.hidden = true;
            return;
        }
        pag.hidden = false;

        let html = '<div class="pagination-inner">';
        html += '<button class="page-btn" data-page="' + (currentPage - 1) + '"' + (currentPage <= 1 ? " disabled" : "") + '>‹ Prev</button>';
        html += '<span class="page-info">Page ' + currentPage + " of " + totalPages + " · " + total + " cards</span>";
        html += '<button class="page-btn" data-page="' + (currentPage + 1) + '"' + (currentPage >= totalPages ? " disabled" : "") + '>Next ›</button>';
        html += "</div>";
        pag.innerHTML = html;
    }

    /* ---------- TCGplayer-style live search suggestions ---------- */

    const RARITY_ORDER = { showcase: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };

    function escapeHTML(s) {
        const div = document.createElement("div");
        div.textContent = String(s);
        return div.innerHTML;
    }

    function buildSuggestCards(query) {
        if (!query) return [];
        const ql = query.toLowerCase();
        const words = ql.split(/\s+/).filter(Boolean);
        const scored = [];

        CARDS.forEach(function (card) {
            const nameLower = card.name.toLowerCase();
            const hay = (
                card.name + " " + card.set + " " + card.setCode + " " +
                card.rarity + " " + (card.type || "") + " " + (card.flavor || "")
            ).toLowerCase();

            let score = 0;
            if (nameLower === ql) score += 100;
            else if (nameLower.indexOf(ql) === 0) score += 60;
            else if (nameLower.indexOf(ql) !== -1) score += 35;
            if (words.length > 1) {
                const all = words.every(function (w) { return hay.indexOf(w) !== -1; });
                if (all) score += 20;
            }

            if (score > 0) {
                scored.push({ card: card, score: score });
            }
        });

        scored.sort(function (a, b) {
            if (b.score !== a.score) return b.score - a.score;
            const r = (RARITY_ORDER[b.card.rarity] || 0) - (RARITY_ORDER[a.card.rarity] || 0);
            if (r !== 0) return r;
            return a.card.name.localeCompare(b.card.name);
        });

        return scored.slice(0, 7).map(function (s) { return s.card; });
    }

    function suggestionHTML(card, i) {
        const isActive = i === suggestIndex;
        const rarityClass = "rarity-" + card.rarity;
        const market = marketPrice(card.slug);
        const low = lowestListing(card);
        const price = market
            ? '<div class="sp-label">Market</div><div class="sp-value">' + marketDual(market.market) + "</div>"
            : '<div class="sp-label">' + (low ? "From" : "Community") + '</div><div class="sp-value">' +
            (low ? priceDual(low.price_mmk) : "No listings") + "</div>";
        return (
            '<div class="suggest-item' + (isActive ? " active" : "") + '" data-suggest-card="' + card.slug + '">' +
            '<div class="suggest-art">' +
            '<img loading="lazy" decoding="async" src="' + card.art + '" alt="" onerror="riftzayImgRetry(this)">' +
            '<span class="suggest-art-fallback"></span>' +
            "</div>" +
            '<div class="suggest-info">' +
            '<div class="suggest-name">' + escapeHTML(card.name) + "</div>" +
            '<div class="suggest-set">' + card.set + " · " + card.setCode + " " + card.number + "</div>" +
            '<span class="suggest-rarity ' + rarityClass + '">' + cap(card.rarity) + "</span>" +
            "</div>" +
            '<div class="suggest-price">' + price + "</div>" +
            "</div>"
        );
    }

    function getSuggestBox() {
        return $("#search-suggest");
    }

    function renderSuggestions(source, query) {
        const box = getSuggestBox(source);
        if (!box) return;

        const q = (query || "").trim();
        if (!q) {
            box.hidden = true;
            box.innerHTML = "";
            suggestIndex = -1;
            suggestCards = [];
            return;
        }

        suggestCards = buildSuggestCards(q);
        suggestIndex = -1;

        if (suggestCards.length === 0) {
            box.innerHTML = '<div class="suggest-none">No cards found for \u201c' + escapeHTML(q) + "\u201d</div>";
            box.hidden = false;
            return;
        }

        let html = '<div class="suggest-group">Cards</div>';
        html += suggestCards.map(function (card, i) { return suggestionHTML(card, i); }).join("");
        html += '<div class="suggest-footer" data-suggest-all="1">View all results for \u201c' + escapeHTML(q) + '\u201d →</div>';
        box.innerHTML = html;
        box.hidden = false;
    }

    function highlightSuggestion(box) {
        if (!box) return;
        const items = box.querySelectorAll(".suggest-item");
        items.forEach(function (el, i) {
            el.classList.toggle("active", i === suggestIndex);
        });
        const active = box.querySelector(".suggest-item.active");
        if (active) {
            active.scrollIntoView({ block: "nearest" });
        }
    }

    function handleSearchKeydown(source, e) {
        const box = getSuggestBox(source);

        if (e.key === "Escape") {
            closeSuggestions();
            return;
        }

        if (!box || box.hidden) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            suggestIndex = Math.min(suggestIndex + 1, suggestCards.length - 1);
            highlightSuggestion(box);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            suggestIndex = Math.max(suggestIndex - 1, -1);
            highlightSuggestion(box);
        } else if (e.key === "Enter") {
            if (suggestIndex >= 0 && suggestCards[suggestIndex]) {
                e.preventDefault();
                openCardFromSuggestion(source, suggestCards[suggestIndex].slug);
            } else {
                closeSuggestions();
            }
        }
    }

    function openCardFromSuggestion(source, slug) {
        closeSuggestions();
        $("#search-input").value = "";
        $("#search-clear").hidden = true;
        showView("product", slug);
    }

    function closeSuggestions() {
        const el = $("#search-suggest");
        if (el) el.hidden = true;
        suggestIndex = -1;
        suggestCards = [];
        suggestActiveSource = null;
    }

    /* ---------- Product page (single card) ---------- */

    function openProduct(slug) {
        const card = CARD_BY_SLUG[slug];
        if (!card) {
            showView("home");
            return;
        }
        currentSlug = slug;
        const watched = currentUser && myWatchlist.indexOf(card.slug) !== -1;
        const offers = listingsForCard(card.slug);
        const low = offers[0] || null;
        const average = offers.length
            ? offers.reduce(function (sum, listing) { return sum + Number(listing.price_mmk); }, 0) / offers.length
            : 0;

        $("#crumb-card").textContent = card.name;
        document.title = card.name + " — RiftZay";

        const marketRows = offers.map(function (listing, index) {
            const isBest = listingsSort === "price" && index === 0;
            const isMine = currentUser && listing.seller_id === currentUser.id;
            return (
                '<div class="market-row ' + (isBest ? "best-row" : "") + '">' +
                '<div class="seller-avatar">' + escapeHTML(String(listing.seller_name || "S").charAt(0).toUpperCase()) + "</div>" +
                '<div class="market-info">' +
                '<div class="market-name">' + escapeHTML(listing.seller_name) + (isBest ? ' <span class="best-tag">Lowest</span>' : "") + (isMine ? ' <span class="mine-tag">Yours</span>' : "") + "</div>" +
                '<div class="market-region">' + escapeHTML(listing.condition) + " · " + escapeHTML(listing.variant) + " · Qty " + Number(listing.quantity) + "</div>" +
                '<div class="listing-location">' + escapeHTML(listing.location) + "</div>" +
                "</div>" +
                '<div class="listing-buy">' +
                '<div class="market-price">' + priceDual(listing.price_mmk) + "</div>" +
                '<div class="seller-contact">' + escapeHTML(listing.contact) + "</div>" +
                "</div>" +
                "</div>"
            );
        }).join("") || '<div class="listing-empty"><strong>No active listings yet.</strong><span>Be the first community member to offer this card.</span></div>';

        const typeLabel = card.type ? cap(card.type) : "Card";
        const champTag = card.champion ? ' <span class="champ-tag">Champion</span>' : "";

        const stats = [];
        if (card.energy !== null && card.energy !== undefined) stats.push("Energy " + card.energy);
        if (card.power !== null && card.power !== undefined) stats.push("Power " + card.power);
        if (card.might !== null && card.might !== undefined) stats.push("Might " + card.might);
        const statsHTML = stats.length ? '<div class="card-stats">' + stats.join(" · ") + "</div>" : "";

        /* Store prices across six markets, from RiftCompare's aggregated
         * retailer feed (native-currency cents, lowest in-stock offer). */
        const rc = marketCents(card.slug);
        let marketRowsHTML = "";
        if (rc) {
            const codes = ["US", "UK", "AU", "NZ", "SG", "CA"];
            const body = codes
                .map(function (code) {
                    if (rc[code] == null) return "";
                    return (
                        '<div class="pg-row pg-cond-row">' +
                        '<span class="pg-finish">' + MARKET_NAMES[code] + "</span>" +
                        '<span class="pg-market">' + marketDualFromCents(code, rc[code]) + "</span>" +
                        '<span class="pg-low">' + (MARKET_CURRENCIES[code] === "USD" ? "from" : "lowest") + " store</span>" +
                        "</div>"
                    );
                })
                .join("");
            if (body) {
                const marketsUpdated = window.RIFTZAY_MARKETS_UPDATED
                    ? new Date(window.RIFTZAY_MARKETS_UPDATED).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "";
                marketRowsHTML =
                    '<div class="pg-conds">' +
                    '<div class="pg-row pg-cond-head">' +
                    '<span class="pg-finish">Store Prices Worldwide</span>' +
                    '<span class="pg-market">Lowest Offer</span>' +
                    '<span class="pg-low">Market</span>' +
                    "</div>" +
                    body +
                    '<div class="pg-note">Aggregated from local stores &amp; eBay by RiftCompare · ' + marketsUpdated + "</div>" +
                    "</div>";
            }
        }

        /* Real TCGplayer market prices (from the Open TCG API) */
        const market = marketPrice(card.slug);
        let priceGuide = "";
        if (market) {
            const rows = [];
            const addRow = function (label, p) {
                if (p && p.market != null) {
                    rows.push(
                        '<div class="pg-row">' +
                        '<span class="pg-finish">' + label + "</span>" +
                        '<span class="pg-market">' + marketDual(p.market) + "</span>" +
                        '<span class="pg-low">Low ' + marketDual(p.low) + "</span>" +
                        "</div>"
                    );
                }
            };
            addRow("Near Mint", market.normal);
            addRow("Foil", market.foil);
            const updated = window.RIFTZAY_PRICES_UPDATED
                ? new Date(window.RIFTZAY_PRICES_UPDATED).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "";

            /* Per-condition prices from the SKU matrix (NM/LP/MP/HP/DMG).
             * Shown for each finish that has condition data. */
            const COND_NAMES = {
                NM: "Near Mint",
                LP: "Lightly Played",
                MP: "Moderately Played",
                HP: "Heavily Played",
                DMG: "Damaged",
            };
            let condRows = "";
            if (market.conds) {
                const conds = market.conds;
                ["Normal", "Foil"].forEach(function (fin) {
                    const c = conds[fin];
                    if (!c) return;
                    const head =
                        '<div class="pg-row pg-cond-head">' +
                        '<span class="pg-finish">By Condition · ' + fin + "</span>" +
                        '<span class="pg-market">Market</span>' +
                        '<span class="pg-low">Low</span>' +
                        "</div>";
                    const body = Object.keys(COND_NAMES)
                        .map(function (cnd) {
                            const v = c[cnd];
                            if (!v) return "";
                            return (
                                '<div class="pg-row pg-cond-row">' +
                                '<span class="pg-finish">' + COND_NAMES[cnd] + "</span>" +
                                '<span class="pg-market">' + marketDual(v[0]) + "</span>" +
                                '<span class="pg-low">' + (v[1] != null ? marketDual(v[1]) : "—") + "</span>" +
                                "</div>"
                            );
                        })
                        .join("");
                    if (body) condRows += head + body;
                });
            }

            const buyResult = window.RIFTZAY_BUYS ? window.RIFTZAY_BUYS.score(market, slug) : null;
            const buyChip = buyResult
                ? '<span class="buy-chip chip-' + (buyResult.tier === "Buy Now" ? "now" : buyResult.tier === "Watch" ? "watch" : "wait") + '">' +
                buyResult.tier + " · Score " + buyResult.score + "</span>"
                : "";

            priceGuide =
                '<div class="price-guide">' +
                '<div class="price-guide-title">Market Price Guide <span class="guide-badge">TCGplayer · updated ' + updated + "</span>" + buyChip + "</div>" +
                rows.join("") +
                (condRows ? '<div class="pg-conds">' + condRows + "</div>" : "") +
                marketRowsHTML +
                (window.RIFTZAY_PREDICT ? '<div class="pg-note">' + forecastChip(slug) + "</div>" : "") +
                "</div>";
        }

        $("#product-content").innerHTML =
            '<div class="product-layout">' +
            '<div class="product-art">' +
            '<div class="card-art-frame">' +
            '<div class="card-art-holder">' +
            '<div class="art-fallback"></div>' +
            '<img class="card-art-img" src="' + card.art + '" alt="' + escapeHTML(card.name) + '" onerror="riftzayImgRetry(this)">' +
            "</div>" +
            '<div class="art-meta">' +
            '<div class="art-number">' + card.setCode + " " + card.number + "</div>" +
            '<div class="art-set">' + card.set + " · " + card.setYear + "</div>" +
            '<div><span class="rarity rarity-' + card.rarity + '">' + cap(card.rarity) + "</span></div>" +
            '<div class="art-type">' + typeLabel + champTag + "</div>" +
            "</div>" +
            "</div>" +
            "</div>" +
            '<div class="product-info">' +
            "<h1>" + escapeHTML(card.name) + "</h1>" +
            '<div class="product-sub"><strong>' + card.set + "</strong> · #" + card.number + " · " + typeLabel + champTag + "</div>" +
            statsHTML +
            '<div class="price-summary">' +
            '<div class="price-box best-box">' +
            '<div class="pb-label">Lowest Listing</div>' +
            '<div class="pb-value green">' + (low ? priceDual(low.price_mmk) : "—") + "</div>" +
            '<div class="pb-note">' + (low ? escapeHTML(low.condition) : "No offers") + "</div>" +
            "</div>" +
            '<div class="price-box">' +
            '<div class="pb-label">Market Average</div>' +
            '<div class="pb-value">' + (offers.length ? priceDual(average) : "—") + "</div>" +
            '<div class="pb-note">Across active offers</div>' +
            "</div>" +
            '<div class="price-box">' +
            '<div class="pb-label">Available</div>' +
            '<div class="pb-value">' + offers.reduce(function (sum, listing) { return sum + Number(listing.quantity); }, 0) + "</div>" +
            '<div class="pb-note">' + offers.length + (offers.length === 1 ? " seller" : " sellers") + "</div>" +
            "</div>" +
            "</div>" +
            priceGuide +
            priceTrendHTML(slug) +
            '<div class="product-actions">' +
            '<button class="btn btn-primary" data-watch="' + card.slug + '">' +
            (watched ? "★ In Watchlist" : "☆ Add to Watchlist") +
            "</button>" +
            '<button class="btn btn-outline" data-sell="' + card.slug + '">Sell this card</button>' +
            "</div>" +
            '<div class="market-list">' +
            '<div class="market-list-header">' +
            '<span>Community Listings <span class="guide-badge">Live offers</span></span>' +
            '<div class="listings-sort" role="group" aria-label="Sort community listings">' +
            '<button class="listings-sort-btn' + (listingsSort === "price" ? " active" : "") + '" data-sort-listings="price">Cheapest</button>' +
            '<button class="listings-sort-btn' + (listingsSort === "newest" ? " active" : "") + '" data-sort-listings="newest">Newest</button>' +
            "</div>" +
            "</div>" +
            marketRows +
            "</div>" +
            '<p class="price-disclaimer">RiftZay connects buyers and sellers. Confirm card condition, identity, payment, and delivery details before completing a trade.</p>' +
            (card.flavor
                ? '<div class="product-flavor">' +
                '<div class="flavor-label">Card Text</div>' +
                '<div class="ability-text">' + escapeHTML(card.flavor) + "</div>" +
                "</div>"
                : "") +
            (card.artist
                ? '<div class="product-artist">Art by ' + escapeHTML(card.artist) + "</div>"
                : "") +
            "</div>" +
            "</div>";
    }

    /* ---------- Watchlist ---------- */

    function renderWatchlist() {
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

    /* ---------- Buy Now (smart picks) ---------- */

    /* Buy score ring colors by tier */
    function tierColor(tier) {
        if (tier === "Buy Now") return "var(--green)";
        if (tier === "Watch") return "var(--gold)";
        return "var(--text-muted)";
    }

    /* Forecast chip: ▲ +12% / 30d · conf 78%. Hidden while collecting. */
    function forecastChip(slug, inline) {
        if (!window.RIFTZAY_PREDICT) return "";
        const fc = window.RIFTZAY_PREDICT.forecast(slug);
        if (!fc || !fc.ready) return "";
        const cls = fc.direction === "up" ? "pred-up" : fc.direction === "down" ? "pred-down" : "pred-flat";
        const arrow = fc.direction === "up" ? "▲" : fc.direction === "down" ? "▼" : "—";
        const pct = fc.direction === "flat" ? "flat" : (fc.pct30 >= 0 ? "+" : "") + fc.pct30 + "%";
        const title = "Price forecast: " + pct + " over 30 days · " + fc.confidence + "% confidence";
        return '<span class="pred-chip ' + cls + (inline ? " pred-inline" : "") + '" title="' + escapeHTML(title) + '">' +
            arrow + " " + pct + ' · ' + fc.confidence + '%</span>';
    }

    /* Tournament metagame chip: win rate + play rate from riftdecks.com
     * tournament results. Shown when a card has competitive data. */
    function tournamentChip(slug) {
        if (!window.RIFTZAY_PREDICT) return "";
        const meta = window.RIFTZAY_PREDICT.meta(slug);
        if (!meta || meta.win == null) return "";
        const cls = meta.win >= 55 ? "meta-hot" : meta.win >= 48 ? "meta-ok" : "meta-cold";
        const title = meta.name + " in tournaments: " + meta.win + "% win rate, " +
            (meta.play != null ? meta.play + "% of decks, " : "") +
            (meta.games != null ? meta.games + " games, " : "") +
            (meta.decks != null ? meta.decks + " decks" : "");
        return '<span class="pred-chip meta-chip ' + cls + (cls === "meta-ok" ? " pred-flat" : "") + '" title="' + escapeHTML(title) + '">' +
            meta.win + "% win</span>";
    }

    /* Mini trend chart + "why buy/wait" explanation. Renders an SVG line of
     * the collected market history with a dashed 30-day projection, plus a
     * plain-language reason tied to the direction. */
    function priceTrendHTML(slug) {
        if (!window.RIFTZAY_PREDICT) return "";
        const pts = window.RIFTZAY_PREDICT.seriesFor(slug);
        const fc = window.RIFTZAY_PREDICT.forecast(slug);

        let body = "";
        let why = "";
        if (!pts.length) {
            body = '<div class="trend-empty">No price history for this card yet.</div>';
            why = "RiftZay started snapshotting daily prices — trends appear as history builds.";
        } else if (!fc || !fc.ready) {
            body = '<div class="trend-empty">Collecting history… ' + pts.length + "/" + window.RIFTZAY_PREDICT.MIN_DAYS + " days</div>";
            why = "Forecasts need a week of daily snapshots. Check back in a few days for this card's trend.";
        } else {
            body = sparklineSVG(pts, fc);
            const pct = fc.pct30 >= 0 ? "+" + fc.pct30 + "%" : fc.pct30 + "%";
            if (fc.direction === "up") {
                why = 'The price is trending <strong>up</strong> — projected <strong>' + pct +
                    "</strong> in 30 days. Buying now locks in today's price before it climbs further.";
            } else if (fc.direction === "down") {
                why = 'The price is trending <strong>down</strong> — projected <strong>' + pct +
                    "</strong> in 30 days. If you're flexible, waiting could get a better deal, but the discount may not last.";
            } else {
                why = "The price has been <strong>stable</strong> over the collected window. With no clear move either way, the decision comes down to today's value signals.";
            }
            if (fc.meta && fc.meta.signal >= 0.3) {
                why += ' <span class="trend-meta">Hot in tournaments — ' + fc.meta.win + "% win rate" +
                    (fc.meta.play != null ? ", " + fc.meta.play + "% of decks" : "") + " — tournament demand tends to push prices up.</span>";
            }
            why += ' <span class="trend-conf">(confidence ' + fc.confidence + "%)</span>";
        }

        return (
            '<div class="trend-block">' +
            '<div class="trend-head">' +
            '<span class="trend-title">Price Trend</span>' +
            tournamentChip(slug) +
            forecastChip(slug) +
            "</div>" +
            body +
            '<div class="trend-why">' + why + "</div>" +
            "</div>"
        );
    }

    /* Compact SVG line of history + dashed projection to +30 days. */
    function sparklineSVG(pts, fc) {
        const W = 320, H = 88, PAD = 6;
        const vals = pts.map(function (p) { return p.v; });
        const last = vals[vals.length - 1];
        const proj = last * (1 + fc.pct30 / 100);
        const maxV = Math.max.apply(null, vals.concat([proj]));
        const minV = Math.min.apply(null, vals.concat([proj]));
        const span = (maxV - minV) || 1;

        const xAt = function (i) { return PAD + (i / Math.max(pts.length, 1)) * (W - PAD * 2); };
        const yAt = function (v) { return H - PAD - ((v - minV) / span) * (H - PAD * 2); };

        let hist = "";
        vals.forEach(function (v, i) {
            hist += (i ? " L" : "M") + xAt(i).toFixed(1) + " " + yAt(v).toFixed(1);
        });
        const projX = W - PAD;
        const lastX = xAt(vals.length - 1);
        const projPath = "M" + lastX.toFixed(1) + " " + yAt(last).toFixed(1) + " L" + projX + " " + yAt(proj).toFixed(1);

        // area fill under the history line
        let area = hist + " L" + xAt(vals.length - 1).toFixed(1) + " " + (H - PAD) + " L" + PAD + " " + (H - PAD) + " Z";

        const cls = fc.direction === "up" ? "tr-up" : fc.direction === "down" ? "tr-down" : "tr-flat";
        return (
            '<svg class="trend-chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-label="Price trend chart">' +
            '<path class="trend-area" d="' + area + '" />' +
            '<path class="trend-line ' + cls + '" d="' + hist + '" />' +
            '<path class="trend-proj" d="' + projPath + '" />' +
            '<circle class="trend-dot" cx="' + lastX.toFixed(1) + '" cy="' + yAt(last).toFixed(1) + '" r="2.5" />' +
            "</svg>" +
            '<div class="trend-labels"><span>oldest</span><span>today</span><span>+30d</span></div>'
        );
    }

    /* Compact 3-4cm sparkline for list rows (no labels, tiny). */
    function miniSparkline(slug) {
        if (!window.RIFTZAY_PREDICT) return "";
        const pts = window.RIFTZAY_PREDICT.seriesFor(slug);
        const fc = window.RIFTZAY_PREDICT.forecast(slug);
        if (!pts.length || !fc || !fc.ready) return "";
        const W = 84, H = 28, PAD = 3;
        const vals = pts.map(function (p) { return p.v; });
        const last = vals[vals.length - 1];
        const proj = last * (1 + fc.pct30 / 100);
        const maxV = Math.max.apply(null, vals.concat([proj]));
        const minV = Math.min.apply(null, vals.concat([proj]));
        const span = (maxV - minV) || 1;
        const xAt = function (i) { return PAD + (i / Math.max(pts.length, 1)) * (W - PAD * 2); };
        const yAt = function (v) { return H - PAD - ((v - minV) / span) * (H - PAD * 2); };
        let hist = "";
        vals.forEach(function (v, i) {
            hist += (i ? " L" : "M") + xAt(i).toFixed(1) + " " + yAt(v).toFixed(1);
        });
        const projPath = "M" + xAt(vals.length - 1).toFixed(1) + " " + yAt(last).toFixed(1) + " L" + (W - PAD) + " " + yAt(proj).toFixed(1);
        const cls = fc.direction === "up" ? "tr-up" : fc.direction === "down" ? "tr-down" : "tr-flat";
        return (
            '<svg class="mini-spark" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true">' +
            '<path class="trend-line ' + cls + '" d="' + hist + '" />' +
            '<path class="trend-proj" d="' + projPath + '" />' +
            "</svg>"
        );
    }

    function buysCardHTML(entry) {
        const card = entry.card;
        const result = entry.result;
        const rec = entry.record;
        const watched = currentUser && myWatchlist.indexOf(card.slug) !== -1;
        const tier = result.tier;
        const color = tierColor(tier);

        return (
            '<div class="buys-row">' +
            '<div class="buys-score" style="--score-color:' + color + '">' +
            '<svg viewBox="0 0 36 36" class="buys-ring">' +
            '<circle cx="18" cy="18" r="15.9" class="buys-ring-bg" />' +
            '<circle cx="18" cy="18" r="15.9" class="buys-ring-fg" stroke-dasharray="100" stroke-dashoffset="' + (100 - result.score) + '" />' +
            "</svg>" +
            '<span class="buys-score-num">' + result.score + "</span>" +
            "</div>" +
            '<div class="buys-thumb">' +
            '<img loading="lazy" decoding="async" src="' + card.art + '" alt="' + escapeHTML(card.name) + '" onerror="riftzayImgRetry(this)">' +
            '<div class="tcg-thumb-fallback"></div>' +
            "</div>" +
            '<div class="buys-info">' +
            '<div class="buys-title">' +
            '<a href="#" data-detail="' + card.slug + '">' + escapeHTML(card.name) + "</a>" +
            '<span class="rarity rarity-' + card.rarity + '">' + cap(card.rarity) + "</span>" +
            "</div>" +
            '<div class="set-name">' + card.set + ' · ' + card.setCode + " " + card.number + "</div>" +
            '<div class="buys-price">' + marketDual(rec.market) + (rec.finish === "Foil" ? ' <span class="foil-tag">Foil</span>' : "") + "</div>" +
            '<div class="buys-forecast">' + forecastChip(card.slug) + miniSparkline(card.slug) + "</div>" +
            '<div class="buys-reasons">' + result.reasons.map(function (r) {
                return '<span class="buy-reason">' + escapeHTML(r) + "</span>";
            }).join("") + "</div>" +
            "</div>" +
            '<div class="buys-actions">' +
            '<span class="buys-tier tier-' + (tier === "Buy Now" ? "now" : tier === "Watch" ? "watch" : "wait") + '">' + tier + "</span>" +
            '<button class="watch-btn' + (watched ? " watched" : "") + '" data-watch="' + card.slug + '" title="' +
            (watched ? "Remove from watchlist" : "Add to watchlist") + '">' +
            (watched ? "★" : "☆") + " Watchlist</button>" +
            '<button class="btn btn-outline btn-sm" data-detail="' + card.slug + '">View →</button>' +
            "</div>" +
            "</div>"
        );
    }

    function trendingCardHTML(entry) {
        const card = entry.card;
        const meta = entry.meta;
        return (
            '<a class="trend-pick" data-detail="' + card.slug + '">' +
            '<div class="trend-pick-thumb">' +
            '<img loading="lazy" decoding="async" src="' + card.art + '" alt="' + escapeHTML(card.name) + '" onerror="riftzayImgRetry(this)">' +
            '<div class="tcg-thumb-fallback"></div>' +
            "</div>" +
            '<div class="trend-pick-name">' + escapeHTML(card.name) + "</div>" +
            '<div class="trend-pick-set">' + card.set + "</div>" +
            '<div class="trend-pick-stats">' +
            '<span class="trend-pick-win">' + meta.win + "% win</span>" +
            (meta.play != null ? '<span class="trend-pick-play">' + meta.play + "% of decks</span>" : "") +
            "</div>" +
            "</a>"
        );
    }

    /* Homepage strip: cards with the most tournament play + best win rates,
     * from the riftdecks.com metagame snapshot (data/meta.js). Populated
     * immediately (no price-history warmup needed, unlike price forecasts). */
    function renderTrending() {
        const section = $("#trending-section");
        const row = $("#trending-row");
        if (!section || !row) return;

        if (!window.RIFTZAY_PREDICT) {
            section.hidden = true;
            return;
        }

        const entries = [];
        CARDS.forEach(function (card) {
            if (card.type === "Rune") return;
            const meta = window.RIFTZAY_PREDICT.meta(card.slug);
            if (meta && meta.win != null) entries.push({ card: card, meta: meta });
        });
        entries.sort(function (a, b) {
            return (b.meta.play || 0) - (a.meta.play || 0) || (b.meta.win || 0) - (a.meta.win || 0);
        });
        const top = entries.slice(0, 10);

        if (!top.length) {
            section.hidden = true;
            return;
        }
        row.innerHTML = top.map(trendingCardHTML).join("");
        section.hidden = false;
    }

    /* Homepage banner: the single best Buy Now pick right now (falls back to
     * the top-ranked card of any tier if nothing clears the Buy Now bar). */
    function renderTopPick() {
        const box = $("#top-pick");
        if (!box) return;

        const ranked = window.RIFTZAY_BUYS
            ? window.RIFTZAY_BUYS.rankAll(CARDS, window.RIFTZAY_PRICES || {})
            : [];
        const top = ranked.find(function (e) { return e.result.tier === "Buy Now"; }) || ranked[0];
        if (!top) {
            box.hidden = true;
            return;
        }

        const card = top.card;
        const result = top.result;
        const ring = $("#top-pick-ring");
        ring.style.setProperty("--score-color", tierColor(result.tier));
        ring.setAttribute("stroke-dasharray", "100");
        ring.setAttribute("stroke-dashoffset", String(100 - result.score));
        $("#top-pick-score").textContent = result.score;
        const topThumb = $("#top-pick-thumb");
        topThumb.removeAttribute("data-retried");
        topThumb.onerror = function () { riftzayImgRetry(this); };
        topThumb.src = card.art;
        topThumb.alt = card.name;
        const nameEl = $("#top-pick-name");
        nameEl.textContent = card.name;
        nameEl.setAttribute("data-detail", card.slug);
        $("#top-pick-set").textContent = card.set + " · " + card.setCode + " " + card.number;
        $("#top-pick-reason").textContent = result.reasons[0] || "Solid value at today's price.";
        box.hidden = false;
    }

    function renderBuys() {
        const list = $("#buys-list");
        const empty = $("#buys-empty");
        if (!list) return;

        const ranked = window.RIFTZAY_BUYS
            ? window.RIFTZAY_BUYS.rankAll(CARDS, window.RIFTZAY_PRICES || {})
            : [];

        const tierFilter = $("#buys-tier").value;
        const limit = Number($("#buys-limit").value) || 24;

        const filtered = ranked.filter(function (e) {
            return tierFilter === "all" || e.result.tier === tierFilter;
        });
        const shown = filtered.slice(0, limit);

        list.innerHTML = shown.map(buysCardHTML).join("");
        empty.hidden = shown.length !== 0;
    }

    /* Watch a signed-in user's list for Buy Now cards and surface alerts
     * (toast + browser notification). Runs after prices + watchlist load. */
    let buysAlertShown = {};

    function checkBuyAlerts() {
        if (!currentUser || !myWatchlist.length || !window.RIFTZAY_BUYS) return;
        myWatchlist.forEach(function (slug) {
            const rec = (window.RIFTZAY_PRICES || {})[slug];
            if (!rec) return;
            const result = window.RIFTZAY_BUYS.score(rec, slug);
            if (!result || result.tier !== "Buy Now") return;
            if (buysAlertShown[slug]) return;
            buysAlertShown[slug] = true;
            const card = CARD_BY_SLUG[slug];
            const label = (card ? card.name : slug) + " is a Buy Now pick (score " + result.score + ")";
            showToast(label, "success");
            if (window.Notification && Notification.permission === "granted") {
                try {
                    new Notification("RiftZay Buy Alert", { body: label });
                } catch (e) { /* notifications not available */ }
            }
        });
    }

    function requestNotificationPermission() {
        if (window.Notification && Notification.permission === "default") {
            Notification.requestPermission();
        }
    }

    /* ---------- Seller listings ---------- */

    function openListingModal(slug) {
        if (!currentUser) {
            openAuth("register");
            showToast("Create an account or sign in before selling.", "");
            return;
        }
        const card = CARD_BY_SLUG[slug];
        if (!card) return;
        $("#listing-card-slug").value = card.slug;
        $("#listing-card-name").textContent = card.name + " · " + card.setCode + " " + card.number;
        $("#listing-price").value = "";
        $("#listing-quantity").value = "1";
        $("#listing-error").hidden = true;
        $("#listing-modal").hidden = false;
    }

    function closeListingModal() {
        $("#listing-modal").hidden = true;
    }

    async function refreshListings() {
        allListings = await API.getAllListings();
        updateStats();
        updateDataSources();
    }

    async function refreshMyListings() {
        if (!currentUser) {
            soldListings = [];
            return;
        }
        soldListings = await API.getMyListings(currentUser.id);
    }

    async function handleListingSubmit(e) {
        e.preventDefault();
        const error = $("#listing-error");
        const values = {
            card_slug: $("#listing-card-slug").value,
            condition: $("#listing-condition").value,
            variant: $("#listing-variant").value,
            price_mmk: Number($("#listing-price").value),
            quantity: Number($("#listing-quantity").value),
            location: $("#listing-location").value.trim(),
            contact: $("#listing-contact").value.trim(),
        };

        if (!currentUser || !CARD_BY_SLUG[values.card_slug]) return;
        if (!Number.isInteger(values.price_mmk) || values.price_mmk < 1 ||
            !Number.isInteger(values.quantity) || values.quantity < 1 || values.quantity > 999) {
            error.textContent = "Enter a valid MMK price and quantity.";
            error.hidden = false;
            return;
        }

        try {
            await API.createListing(currentUser, values);
            await refreshListings();
            closeListingModal();
            showToast("Your listing is now live.", "success");
            openProduct(values.card_slug);
        } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
        }
    }

    function renderMyListings() {
        const container = $("#my-listings");
        const empty = $("#my-listings-empty");
        if (!currentUser) {
            container.innerHTML = "";
            empty.hidden = false;
            empty.textContent = "Sign in to create and manage your listings.";
            return;
        }

        const mine = allListings
            .concat(soldListings)
            .filter(function (listing) {
                return listing.seller_id === currentUser.id;
            })
            .sort(function (a, b) {
                return String(b.created_at || "").localeCompare(String(a.created_at || ""));
            });
        container.innerHTML = mine.map(function (listing) {
            const card = CARD_BY_SLUG[listing.card_slug];
            if (!card) return "";
            const sold = Number(listing.quantity) <= 0;
            const stock = sold
                ? '<span class="sold-tag">Sold</span>'
                : '<strong>' + Number(listing.quantity) + "</strong>";
            const actions = sold
                ? '<div class="seller-listing-actions"><button class="btn btn-sm btn-outline" data-repost-listing="' + listing.id + '">Repost</button>' +
                '<button class="btn btn-danger btn-sm" data-delete-listing="' + listing.id + '">Delete</button></div>'
                : '<div class="seller-listing-actions"><button class="btn btn-sm btn-outline" data-sold-listing="' + listing.id + '">Mark sold</button>' +
                '<button class="btn btn-danger btn-sm" data-delete-listing="' + listing.id + '">Delete</button></div>';
            return (
                '<article class="seller-listing' + (sold ? " sold" : "") + '">' +
                '<div class="seller-listing-card"><strong data-detail="' + card.slug + '">' + escapeHTML(card.name) + '</strong><span>' + card.setCode + " " + card.number + "</span></div>" +
                '<div><span class="listing-label">Condition</span><strong>' + escapeHTML(listing.condition) + "</strong></div>" +
                '<div><span class="listing-label">Version</span><strong>' + escapeHTML(listing.variant) + "</strong></div>" +
                '<div><span class="listing-label">Quantity</span>' + stock + "</div>" +
                '<div class="seller-listing-price">' + priceDual(listing.price_mmk) + "</div>" +
                actions +
                "</article>"
            );
        }).join("");
        empty.hidden = mine.length !== 0;
    }

    async function handleSetSold(id, sold) {
        if (!currentUser) return;
        try {
            await API.setListingQuantity(currentUser.id, id, sold ? 0 : 1);
            await refreshMyListings();
            await refreshListings();
            renderMyListings();
            renderCards($("#search-input").value, $("#sort-select").value);
            showToast(sold ? "Listing marked as sold." : "Listing is back on the market.", "success");
        } catch (err) {
            showToast(err.message, "error");
        }
    }

    async function handleDeleteListing(id) {
        if (!currentUser || !window.confirm("Delete this listing permanently?")) return;
        try {
            await API.deleteListing(currentUser.id, id);
            await refreshMyListings();
            await refreshListings();
            renderMyListings();
            renderCards($("#search-input").value, $("#sort-select").value);
            showToast("Listing removed.", "");
        } catch (err) {
            showToast(err.message, "error");
        }
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
            if (!$("#view-product").hidden && currentSlug === slug) {
                openProduct(slug);
            }
        } catch (e) {
            showToast(e.message, "error");
        }
    }

    /* ---------- Stats ---------- */

    function updateStats() {
        $("#stat-cards").textContent = CARDS.length;
        const priced = Object.keys(window.RIFTZAY_PRICES || {}).filter(function (slug) {
            return CARD_BY_SLUG[slug];
        }).length;
        $("#stat-priced").textContent = priced;
        $("#stat-markets").textContent = allListings.length;
        $("#stat-watchlist").textContent = currentUser ? myWatchlist.length : 0;
    }

    /* ---------- Premium micro-interactions ---------- */

    /* Scroll-reveal with IntersectionObserver */
    function initScrollReveal() {
        let obs = null;
        function scan() {
            const els = document.querySelectorAll(".reveal");
            if (!els.length) return;
            if (!("IntersectionObserver" in window)) {
                els.forEach(function (el) { el.classList.add("revealed"); });
                return;
            }
            if (obs) obs.disconnect();
            obs = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("revealed");
                        obs.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
            const vh = window.innerHeight || document.documentElement.clientHeight;
            els.forEach(function (el) {
                if (el.classList.contains("revealed")) return;
                const rect = el.getBoundingClientRect();
                if (rect.top < vh && rect.bottom > 0) {
                    // already on screen: reveal now, don't wait for a scroll tick
                    el.classList.add("revealed");
                } else {
                    obs.observe(el);
                }
            });
        }
        window.RIFTZAY_REVEAL = scan;
        scan();
        // Safety: re-scan once layout settles (webfont swap can shift sections
        // below the fold; never leave in-viewport content stuck invisible).
        setTimeout(scan, 1200);
    }

    /* Animated stat counters (Apple-style count up) */
    function animateCounters() {
        const el = $("#stat-cards");
        if (!el || !el.textContent) return;
        const counters = document.querySelectorAll(".stat strong");
        counters.forEach(function (counter) {
            const target = parseInt(counter.textContent, 10) || 0;
            const start = 0;
            const duration = 1000;
            const startTime = performance.now();
            function tick(now) {
                const progress = Math.min((now - startTime) / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                counter.textContent = Math.floor(start + (target - start) * eased);
                if (progress < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        });
    }

    /* Card tilt on hover (subtle, Apple-like) */
    function initCardTilt() {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        document.addEventListener("mousemove", function (e) {
            const card = e.target.closest(".tcg-card");
            if (!card) return;
            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            card.style.setProperty("--tilt-x", (y * 4).toFixed(2) + "deg");
            card.style.setProperty("--tilt-y", (x * 4).toFixed(2) + "deg");
        }, { passive: true });
        document.addEventListener("mouseleave", function (e) {
            const card = e.target.closest(".tcg-card");
            if (!card) return;
            card.style.setProperty("--tilt-x", "0deg");
            card.style.setProperty("--tilt-y", "0deg");
        }, { passive: true });
    }

    /* ---------- Data source credibility ---------- */

    function fmtDate(iso) {
        if (!iso) return "";
        try {
            return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        } catch (e) {
            return "";
        }
    }

    function updateDataSources() {
        const set = function (id, text) {
            const el = $("#" + id);
            if (el) el.textContent = text;
        };

        // Catalog: real Riftbound card database
        if (CARDS.length) {
            set("source-catalog", CARDS.length + " cards · riftbound-cards DB");
        } else {
            set("source-catalog", "Loading…");
        }

        // Market prices: Open TCG API (TCGplayer market data)
        const priceUpdated = window.RIFTZAY_PRICES_UPDATED;
        const pricedCount = Object.keys(window.RIFTZAY_PRICES || {}).length;
        if (pricedCount) {
            set("source-prices", pricedCount + " cards · TCGplayer" + (priceUpdated ? " · " + fmtDate(priceUpdated) : ""));
        } else {
            set("source-prices", "Loading…");
        }

        // Store prices: RiftCompare multi-market feed
        const marketsUpdated = window.RIFTZAY_MARKETS_UPDATED;
        const hasMarkets = Object.keys(window.RIFTZAY_PRICES || {}).some(function (slug) {
            return window.RIFTZAY_PRICES[slug] && window.RIFTZAY_PRICES[slug].rc;
        });
        if (hasMarkets) {
            set("source-markets", "6 markets · RiftCompare" + (marketsUpdated ? " · " + fmtDate(marketsUpdated) : ""));
        } else {
            set("source-markets", "6 markets · RiftCompare");
        }

        // Community listings: Supabase shared database
        const isCloud = API.mode() === "cloud";
        if (isCloud) {
            set("source-listings", allListings.length + " live · Supabase");
        } else {
            set("source-listings", "Local preview · this browser");
        }
    }

    /* ---------- Init ---------- */

    /* Leading number of a card number like "139-166" or "sp2-006" */
    function cardNumber(card) {
        const m = String(card.number || "").match(/\d+/);
        return m ? parseInt(m[1], 10) : 0;
    }

    /* Build the set / rarity / type filter dropdowns from the live catalog */
    function populateFilters() {
        const setSel = $("#filter-set");
        setSel.innerHTML = '<option value="">All Sets</option>' + Object.keys(SETS)
            .sort(function (a, b) { return SETS[b].year - SETS[a].year || a.localeCompare(b); })
            .map(function (s) {
                const m = SETS[s];
                return '<option value="' + s + '">' + s + " (" + m.code + ", " + m.count + " cards)</option>";
            }).join("");

        const rarities = [];
        CARDS.forEach(function (c) { if (rarities.indexOf(c.rarity) === -1) rarities.push(c.rarity); });
        rarities.sort(function (a, b) {
            const order = { common: 1, uncommon: 2, rare: 3, epic: 4, showcase: 5 };
            return (order[a] || 0) - (order[b] || 0);
        });
        $("#filter-rarity").innerHTML = '<option value="">All Rarities</option>' + rarities
            .map(function (r) { return '<option value="' + r + '">' + cap(r) + "</option>"; }).join("");

        const types = [];
        CARDS.forEach(function (c) { if (types.indexOf(c.type) === -1) types.push(c.type); });
        types.sort(function (a, b) { return a.localeCompare(b); });
        $("#filter-type").innerHTML = '<option value="">All Types</option>' + types
            .map(function (t) { return '<option value="' + t + '">' + t + "</option>"; }).join("");
    }

    function withTimeout(promise, ms, fallback) {
        return Promise.race([
            Promise.resolve(promise),
            new Promise(function (resolve) {
                setTimeout(function () { resolve(fallback); }, ms);
            }),
        ]);
    }

    /* Load session/watchlist/listings in the background, after the cards
     * have already been painted. A slow or unreachable Supabase should
     * degrade gracefully instead of blocking the site. */
    async function loadCloudData() {
        await API.probeCloud();
        if (API.mode() !== "cloud") {
            updateModeBanner();
            updateModeChip();
            updateStats();
            return;
        }
        try {
            currentUser = await withTimeout(API.getSession(), 6000, null);
        } catch (e) {
            currentUser = null;
        }
        if (currentUser) {
            try {
                myWatchlist = await withTimeout(API.getWatchlist(currentUser.id), 6000, []);
            } catch (e) {
                myWatchlist = [];
            }
            try {
                soldListings = await withTimeout(API.getMyListings(currentUser.id), 8000, []);
            } catch (e) {
                soldListings = [];
            }
        }
        try {
            await withTimeout(refreshListings(), 8000, null);
        } catch (e) {
            allListings = [];
        }
        if (API.mode() === "cloud") {
            API.subscribeListings(async function () {
                try {
                    await refreshListings();
                    renderCards($("#search-input").value, $("#sort-select").value);
                    if (!$("#view-product").hidden && currentSlug) openProduct(currentSlug);
                    if (!$("#view-listings").hidden) renderMyListings();
                } catch (e) {
                    console.warn("Could not refresh listings", e);
                }
            });
        }
        updateAuthUI();
        updateStats();
        updateDataSources();
        updateModeChip();
        checkBuyAlerts();
    }

    async function init() {
        updateModeBanner();
        updateModeChip();
        // Load the real Riftbound catalog (bundled snapshot -> daily live mirror)
        try {
            await window.RIFTZAY_CARDS_READY;
        } catch (e) {
            /* catalog stays empty; error surfaced below */
        }
        CARDS = window.RIFTZAY_CARDS || [];
        CARD_BY_SLUG = window.RIFTZAY_CARD_BY_SLUG || {};
        SETS = window.RIFTZAY_SETS || {};

        // Load real market prices (bundled snapshot -> live Open TCG API)
        try {
            await window.RIFTZAY_PRICES_READY;
        } catch (e) {
            /* prices stay empty; cards still render without them */
        }

        if (!CARDS.length) {
            showToast("The card catalog could not be loaded. Check your connection and refresh.", "error");
        } else {
            populateFilters();
        }
        updateStats();
        animateCounters();
        updateDataSources();
        initCardTilt();

        // Initial render first, so cards appear instantly even if the
        // listings backend (Supabase) is slow or unreachable.
        renderCards("", "name");
        renderTopPick();
        renderTrending();
        initScrollReveal();

        // Then load session/watchlist/listings in the background so a slow
        // or blocked Supabase never delays first paint.
        setTimeout(function () { loadCloudData(); }, 0);

        // Apple-style header: adds subtle elevation + border after scrolling
        function onHeaderScroll() {
            const header = document.querySelector(".site-header");
            if (!header) return;
            header.classList.toggle("scrolled", window.scrollY > 8);
        }
        window.addEventListener("scroll", onHeaderScroll, { passive: true });
        onHeaderScroll();

        // Nav
        document.querySelectorAll("[data-nav]").forEach(function (el) {
            el.addEventListener("click", function (e) {
                e.preventDefault();
                const nav = this.getAttribute("data-nav");
                if (nav === "home") {
                    $("#search-input").value = "";
                    $("#search-clear").hidden = true;
                }
                showView(nav);
            });
        });

        // Search — with TCGplayer-style suggestions
        function onSearch(value) {
            $("#search-input").value = value;
            $("#search-clear").hidden = !value;
            currentPage = 1;
            showView("home");
            renderCards(value, $("#sort-select").value);
        }

        function onSearchInput(source, value) {
            onSearch(value);
            suggestActiveSource = source;
            renderSuggestions(source, value);
        }

        $("#search-input").addEventListener("input", function () {
            onSearchInput("header", this.value);
        });
        $("#search-clear").addEventListener("click", function () {
            closeSuggestions();
            onSearch("");
        });

        // TCGplayer-style suggestion keyboard navigation
        $("#search-input").addEventListener("keydown", function (e) {
            handleSearchKeydown("header", e);
        });

        // Sort
        $("#sort-select").addEventListener("change", function () {
            currentPage = 1;
            renderCards($("#search-input").value, this.value);
        });

        // Buy Now filters
        $("#buys-tier").addEventListener("change", renderBuys);
        $("#buys-limit").addEventListener("change", renderBuys);

        // Filters
        $("#filter-set").addEventListener("change", function () {
            filterSet = this.value;
            currentPage = 1;
            renderCards($("#search-input").value, $("#sort-select").value);
        });
        $("#filter-rarity").addEventListener("change", function () {
            filterRarity = this.value;
            currentPage = 1;
            renderCards($("#search-input").value, $("#sort-select").value);
        });
        $("#filter-type").addEventListener("change", function () {
            filterType = this.value;
            currentPage = 1;
            renderCards($("#search-input").value, $("#sort-select").value);
        });

        // Pagination
        document.addEventListener("click", function (e) {
            const pageBtn = e.target.closest("[data-page]");
            if (pageBtn && !pageBtn.disabled) {
                const page = parseInt(pageBtn.getAttribute("data-page"), 10);
                if (page >= 1) {
                    currentPage = page;
                    renderCards($("#search-input").value, $("#sort-select").value);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                }
            }
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

        // Create listing
        $("#listing-close").addEventListener("click", closeListingModal);
        $("#listing-modal").addEventListener("click", function (e) {
            if (e.target === this) closeListingModal();
        });
        $("#listing-form").addEventListener("submit", handleListingSubmit);

        // Live USD preview while typing an MMK price
        $("#listing-price").addEventListener("input", function () {
            const v = Number(this.value);
            $("#listing-usd-hint").textContent = v > 0
                ? "≈ " + fmtUSD(v) + " USD"
                : "";
        });

        // Delegated: card detail (product page), watch, suggestions
        document.addEventListener("click", async function (e) {
            const detailEl = e.target.closest("[data-detail]");
            if (detailEl) {
                showView("product", detailEl.getAttribute("data-detail"));
                return;
            }

            const watchEl = e.target.closest("[data-watch]");
            if (watchEl) {
                await handleWatchClick(watchEl.getAttribute("data-watch"));
                return;
            }

            const sellEl = e.target.closest("[data-sell]");
            if (sellEl) {
                openListingModal(sellEl.getAttribute("data-sell"));
                return;
            }

            const soldEl = e.target.closest("[data-sold-listing]");
            if (soldEl) {
                await handleSetSold(soldEl.getAttribute("data-sold-listing"), true);
                return;
            }

            const repostEl = e.target.closest("[data-repost-listing]");
            if (repostEl) {
                await handleSetSold(repostEl.getAttribute("data-repost-listing"), false);
                return;
            }

            const deleteListingEl = e.target.closest("[data-delete-listing]");
            if (deleteListingEl) {
                await handleDeleteListing(deleteListingEl.getAttribute("data-delete-listing"));
                return;
            }

            const sortListingsEl = e.target.closest("[data-sort-listings]");
            if (sortListingsEl) {
                listingsSort = sortListingsEl.getAttribute("data-sort-listings");
                if (currentSlug) openProduct(currentSlug);
                return;
            }

            const suggestCardEl = e.target.closest("[data-suggest-card]");
            if (suggestCardEl) {
                openCardFromSuggestion(suggestActiveSource || "header", suggestCardEl.getAttribute("data-suggest-card"));
                return;
            }

            const suggestAllEl = e.target.closest("[data-suggest-all]");
            if (suggestAllEl) {
                closeSuggestions();
                return;
            }
        });

        // Close suggestions when clicking outside the search box
        document.addEventListener("click", function (e) {
            if (!e.target.closest(".header-search")) {
                closeSuggestions();
            }
        });

        // Close suggestions when the search box loses focus
        $("#search-input").addEventListener("blur", function () {
            setTimeout(closeSuggestions, 120);
        });

    }

    document.addEventListener("DOMContentLoaded", init);
})();
