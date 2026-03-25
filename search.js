/* search.js — Fuse.js powered fuzzy search */

let _fuseInstance = null;
let _searchData = null;
let _searchLoaded = false;
let _searchLoading = false;

async function loadSearchIndex() {
    if (_searchLoaded || _searchLoading) return;
    _searchLoading = true;
    try {
        const resp = await fetch('search-index.json');
        const data = await resp.json();
        _searchData = data;
        _fuseInstance = new Fuse(data, {
            keys: ['text'],
            threshold: 0.1,
            ignoreLocation: true,
            minMatchCharLength: 3,
            includeScore: true,
            includeMatches: true,
        });
        _searchLoaded = true;
    } catch (e) {
        console.error('Failed to load search index', e);
    }
    _searchLoading = false;
}

function openSearch() {
    const bar = document.getElementById('search-bar');
    const input = document.getElementById('search-input');
    if (!bar) return;
    bar.classList.add('active');
    document.body.classList.add('search-open');
    // Small delay lets the CSS transition start before focus (avoids layout jump on mobile)
    setTimeout(() => input.focus(), 50);
    // Lazy-load the index on first open
    loadSearchIndex();
}

function closeSearch() {
    const bar = document.getElementById('search-bar');
    const results = document.getElementById('search-results');
    const backdrop = document.getElementById('search-backdrop');
    if (!bar) return;
    bar.classList.remove('active');
    document.body.classList.remove('search-open');
    if (results) { results.classList.remove('active'); results.innerHTML = ''; }
    if (backdrop) backdrop.classList.remove('active');
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    setResultCount(null);
}

function setResultCount(n) {
    const el = document.getElementById('search-result-count');
    const pipe = el && el.nextElementSibling;
    if (!el) return;
    if (n === null) {
        el.textContent = '';
        el.classList.remove('visible');
        if (pipe) pipe.classList.remove('visible');
    } else {
        el.textContent = n + '\u00a0Results';
        el.classList.add('visible');
        if (pipe) pipe.classList.add('visible');
    }
}

let _searchDebounce = null;
function handleSearchInput(e) {
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => runSearch(e.target.value.trim()), 120);
}

function highlightMatches(text, matches) {
    if (!matches || matches.length === 0) return esc(text);
    const textMatch = matches.find(m => m.key === 'text');
    if (!textMatch || !textMatch.indices || textMatch.indices.length === 0) return esc(text);
    // Merge overlapping intervals, then build highlighted string
    const indices = textMatch.indices.slice().sort((a, b) => a[0] - b[0]);
    let result = '';
    let cursor = 0;
    for (const [start, end] of indices) {
        if (start > cursor) result += esc(text.slice(cursor, start));
        result += '<mark class="search-highlight">' + esc(text.slice(start, end + 1)) + '</mark>';
        cursor = end + 1;
    }
    if (cursor < text.length) result += esc(text.slice(cursor));
    return result;
}

function esc(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightExact(text, query) {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let result = '';
    let cursor = 0;
    let idx;
    while ((idx = lowerText.indexOf(lowerQuery, cursor)) !== -1) {
        if (idx > cursor) result += esc(text.slice(cursor, idx));
        result += '<mark class="search-highlight">' + esc(text.slice(idx, idx + query.length)) + '</mark>';
        cursor = idx + query.length;
    }
    if (cursor < text.length) result += esc(text.slice(cursor));
    return result;
}

function runSearch(query) {
    const results = document.getElementById('search-results');
    const backdrop = document.getElementById('search-backdrop');
    if (!query) {
        results.classList.remove('active');
        results.innerHTML = '';
        if (backdrop) backdrop.classList.remove('active');
        setResultCount(null);
        return;
    }
    if (!_searchLoaded) {
        results.innerHTML = '<div class="search-no-results">Loading\u2026</div>';
        results.classList.add('active');
        return;
    }
    const exactMode = document.getElementById('search-exact-toggle').checked;
    let hits;
    if (exactMode) {
        const lower = query.toLowerCase();
        hits = _searchData
            .filter(item => item.text.toLowerCase().includes(lower))
            .map(item => ({ item, exact: true }));
    } else {
        hits = _fuseInstance.search(query).sort((a, b) => a.item.order - b.item.order);
    }
    setResultCount(hits.length);
    if (hits.length === 0) {
        results.innerHTML = '<div class="search-no-results">No results</div>';
    } else {
        results.innerHTML = hits.map(hit => {
            const item = hit.item;
            const highlightedText = hit.exact
                ? highlightExact(item.text, query)
                : highlightMatches(item.text, hit.matches);
            const safeChapter = esc(item.chapter);
            const safePage = esc(item.page);
            const safeId = item.id.replace(/'/g, '');
            return `<a class="search-result" href="#${safeId}" onclick="handleResultClick(event,'${safeId}')">` +
                `<div class="search-result-text">${highlightedText}</div>` +
                `<div class="search-result-meta">${safeChapter} \u203a ${safePage}</div>` +
                `</a>`;
        }).join('');
    }
    results.classList.add('active');
    if (backdrop) backdrop.classList.add('active');
}

function handleResultClick(e, id) {
    e.preventDefault();
    closeSearch();
    window.location.hash = id;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.body.classList.contains('search-open')) {
        closeSearch();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
    }
});

Object.assign(window, { openSearch, closeSearch, handleSearchInput, handleResultClick });
