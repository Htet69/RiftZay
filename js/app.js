/* RiftZay - main application logic (TCGplayer-style price tracker) */

(function () {
    "use strict";

    const $ = function (sel) {
        return document.querySelector(sel);
    };

    const API = window.RIFTZAY_API;

    // Populated from js/cards.js once the real catalog has loaded (see init)
    let CARDS = [];
    let CARD_BY_SLUG = {};
    let SETS = {};

    let currentUser = null;
    let myWatchlist = [];
    let allListings = [];
    let currentSlug = null; // card currently shown on product page

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

    function listingsForCard(slug) {
        return allListings
            .filter(function (listing) {
                return listing.card_slug === slug && Number(listing.quantity) > 0;
            })
            .sort(function (a, b) { return Number(a.price_mmk) - Number(b.price_mmk); });
    }

function lowestListing(card) {
        return listingsForCard(card.slug)[0] || null;
    }

    const cap = function (s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
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

    function showView(name, slug) {
        ["home", "product", "watchlist", "listings"].forEach(function (v) {
            $("#view-" + v).hidden = v !== name;
        });
        $("#view-product").hidden = name !== "product";
        document.querySelectorAll(".main-nav a").forEach(function (a) {
            const nav = a.getAttribute("data-nav");
            a.classList.toggle("active", nav === name || (name === "product" && nav === "home"));
        });

        if (name === "product" && slug) {
            openProduct(slug);
        } else if (name === "watchlist") {
            renderWatchlist();
        } else if (name === "listings") {
            renderMyListings();
        } else if (name === "home") {
            renderCards($("#search-input").value, $("#sort-select").value);
        }
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

        return (
            '<article class="tcg-card">' +
            '<button class="watch-btn' + (watched ? " watched" : "") + '" data-watch="' + card.slug + '" title="' +
            (watched ? "Remove from watchlist" : "Add to watchlist") + '">' +
            (watched ? "★" : "☆") + "</button>" +
            '<div class="tcg-thumb">' +
            '<img loading="lazy" decoding="async" src="' + card.art + '" alt="' + escapeHTML(card.name) + '" onerror="this.style.display=\'none\'">' +
            '<div class="tcg-thumb-fallback">' + cardInitials(card) + "</div>" +
            "</div>" +
            '<div class="tcg-card-header">' +
            "<div>" +
            '<h3 data-detail="' + card.slug + '">' + escapeHTML(card.name) + "</h3>" +
            '<div class="set-name">' + card.set + ' · ' + card.setCode + " " + card.number + "</div>" +
            "</div>" +
            '<span class="rarity rarity-' + card.rarity + '">' + cap(card.rarity) + "</span>" +
            "</div>" +
            (typeLabel ? '<div class="card-type">' + typeLabel + champTag + "</div>" : "") +
            '<div class="market-strip">' + marketStrip + "</div>" +
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

    function cardInitials(card) {
        const base = card.name.split(",")[0].trim();
        return base.split(/\s+/).map(function (w) { return w.charAt(0); }).join("").slice(0, 2).toUpperCase();
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
            '<img loading="lazy" decoding="async" src="' + card.art + '" alt="" onerror="this.style.display=\'none\'">' +
            '<span class="suggest-art-fallback">' + cardInitials(card) + "</span>" +
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

    function getSuggestBox(source) {
        return source === "header" ? $("#search-suggest") : $("#hero-suggest");
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
        $("#hero-search-input").value = "";
        $("#search-clear").hidden = true;
        showView("product", slug);
    }

    function closeSuggestions() {
        ["search-suggest", "hero-suggest"].forEach(function (id) {
            const el = $("#" + id);
            if (el) el.hidden = true;
        });
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

        const marketRows = offers.map(function (listing, index) {
            const isBest = index === 0;
            const isMine = currentUser && listing.seller_id === currentUser.id;
            return (
                '<div class="market-row ' + (isBest ? "best-row" : "") + '">' +
                '<div class="seller-avatar">' + escapeHTML(String(listing.seller_name || "S").charAt(0).toUpperCase()) + "</div>" +
                '<div class="market-info">' +
                '<div class="market-name">' + escapeHTML(listing.seller_name) + (isBest ? ' <span class="best-tag">Lowest</span>' : "") + (isMine ? ' <span class="mine-tag">Yours</span>' : "") + "</div>" +
                '<div class="market-region">' + escapeHTML(listing.condition) + " · " + escapeHTML(listing.variant) + " · Qty " + Number(listing.quantity) + "</div>" +
                '<div class="listing-location">📍 ' + escapeHTML(listing.location) + "</div>" +
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
            priceGuide =
                '<div class="price-guide">' +
                '<div class="price-guide-title">Market Price Guide <span class="guide-badge">TCGplayer · updated ' + updated + "</span></div>" +
                rows.join("") +
                "</div>";
        }

        $("#product-content").innerHTML =
            '<div class="product-layout">' +
            '<div class="product-art">' +
            '<div class="card-art-frame">' +
            '<div class="card-art-holder">' +
            '<div class="art-fallback">' + cardInitials(card) + "</div>" +
            '<img class="card-art-img" src="' + card.art + '" alt="' + escapeHTML(card.name) + '" onerror="this.style.display=\'none\'">' +
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
            '<div class="product-actions">' +
            '<button class="btn btn-primary" data-watch="' + card.slug + '">' +
            (watched ? "★ In Watchlist" : "☆ Add to Watchlist") +
            "</button>" +
            '<button class="btn btn-outline" data-sell="' + card.slug + '">Sell this card</button>' +
            "</div>" +
            '<div class="market-list">' +
            '<div class="market-list-header">Community Listings <span class="guide-badge">Live offers</span></div>' +
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

        const mine = allListings.filter(function (listing) {
            return listing.seller_id === currentUser.id;
        });
        container.innerHTML = mine.map(function (listing) {
            const card = CARD_BY_SLUG[listing.card_slug];
            if (!card) return "";
            return (
                '<article class="seller-listing">' +
                '<div class="seller-listing-card"><strong data-detail="' + card.slug + '">' + escapeHTML(card.name) + '</strong><span>' + card.setCode + " " + card.number + "</span></div>" +
                '<div><span class="listing-label">Condition</span><strong>' + escapeHTML(listing.condition) + "</strong></div>" +
                '<div><span class="listing-label">Version</span><strong>' + escapeHTML(listing.variant) + "</strong></div>" +
                '<div><span class="listing-label">Quantity</span><strong>' + Number(listing.quantity) + "</strong></div>" +
                '<div class="seller-listing-price">' + priceDual(listing.price_mmk) + "</div>" +
                '<button class="btn btn-danger btn-sm" data-delete-listing="' + listing.id + '">Remove</button>' +
                "</article>"
            );
        }).join("");
        empty.hidden = mine.length !== 0;
    }

    async function handleDeleteListing(id) {
        if (!currentUser || !window.confirm("Remove this listing from the marketplace?")) return;
        try {
            await API.deleteListing(currentUser.id, id);
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
        try {
            await refreshListings();
        } catch (e) {
            allListings = [];
            showToast("Listings could not be loaded: " + e.message, "error");
        }
        updateAuthUI();
        updateStats();

        // Initial render
        renderCards("", "name");

        // Nav
        document.querySelectorAll("[data-nav]").forEach(function (el) {
            el.addEventListener("click", function (e) {
                e.preventDefault();
                const nav = this.getAttribute("data-nav");
                if (nav === "home") {
                    $("#search-input").value = "";
                    $("#hero-search-input").value = "";
                    $("#search-clear").hidden = true;
                }
                showView(nav);
            });
        });

        // Search (header + hero, synced) — with TCGplayer-style suggestions
        function onSearch(value) {
            $("#search-input").value = value;
            $("#hero-search-input").value = value;
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
        $("#hero-search-input").addEventListener("input", function () {
            onSearchInput("hero", this.value);
        });
        $("#search-clear").addEventListener("click", function () {
            closeSuggestions();
            onSearch("");
        });

        // TCGplayer-style suggestion keyboard navigation
        $("#search-input").addEventListener("keydown", function (e) {
            handleSearchKeydown("header", e);
        });
        $("#hero-search-input").addEventListener("keydown", function (e) {
            handleSearchKeydown("hero", e);
        });

        // Sort
        $("#sort-select").addEventListener("change", function () {
            currentPage = 1;
            renderCards($("#search-input").value, this.value);
        });

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

            const deleteListingEl = e.target.closest("[data-delete-listing]");
            if (deleteListingEl) {
                await handleDeleteListing(deleteListingEl.getAttribute("data-delete-listing"));
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

        // Close suggestions when clicking outside a search box
        document.addEventListener("click", function (e) {
            if (!e.target.closest(".header-search") && !e.target.closest(".hero-search")) {
                closeSuggestions();
            }
        });

        // Close suggestions when a search box loses focus
        ["search-input", "hero-search-input"].forEach(function (id) {
            $("#" + id).addEventListener("blur", function () {
                setTimeout(closeSuggestions, 120);
            });
        });

    }

    document.addEventListener("DOMContentLoaded", init);
})();
