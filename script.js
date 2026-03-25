/**
 * script.js — Navigation and UI coordinator  (ES module)
 *
 * Responsibility: hash-based navigation, paragraph highlighting, PWA install,
 * theme/font/zoom settings, left-pane and side-pane state, FAB positioning.
 *
 * All public functions used as HTML event-handler attributes are exported
 * to window at the bottom of this file.
 *
 * Depends on: window.app (event bus, provided by notes.js)
 */

let isInitialLoad = true;

/* ── PWA install ── */
var deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    var el = document.getElementById('nav-install-item');
    if (el) el.style.display = '';
});

window.addEventListener('appinstalled', function() {
    deferredInstallPrompt = null;
    var el = document.getElementById('nav-install-item');
    if (el) el.style.display = 'none';
});

function installPwa(e) {
    if (e) e.preventDefault();
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(function() { deferredInstallPrompt = null; });
}

function shareApp(e, el) {
    e.preventDefault();
    var url = window.location.origin + window.location.pathname;
    if (navigator.share) {
        navigator.share({ title: document.title, url: url });
    } else {
        navigator.clipboard.writeText(url);
        var textEl = el.querySelector('.left-nav-text');
        var orig = textEl.textContent;
        textEl.textContent = '\u2713 Copied!';
        setTimeout(function() { textEl.textContent = orig; }, 1500);
    }
}

function highlightParagraph() {
    // Remove existing highlights
    const highlighted = document.querySelector('.highlight');
    if (highlighted) {
        highlighted.classList.remove('highlight');
        app.emit('highlight:removed', highlighted);
    }

    // Highlight the new paragraph
    const hash = window.location.hash;
    if (hash) {
        let element = null;
        try { element = document.querySelector(hash); } catch (e) {
            // querySelector fails for IDs starting with a digit; fall back to getElementById
            element = document.getElementById(hash.slice(1));
        }
        if (element) {
            element.classList.add('highlight');
            app.emit('highlight:added', element);

            // Only scroll to center on initial page load (visiting via URL)
            if (isInitialLoad) {
                const pageContent = element.closest('.text-block');
                if (pageContent) {
                    const elementPosition = element.getBoundingClientRect().top + window.scrollY;
                    const offset = window.innerHeight / 2 - element.clientHeight / 2;
                    const topPosition = elementPosition - offset;
                    window.scrollTo(0, topPosition);
                } else {
                    const offset = 50;
                    const topPosition = element.getBoundingClientRect().top + window.scrollY - offset;
                    window.scrollTo(0, topPosition);
                }
                isInitialLoad = false;
            }
        }
    }
}

function switchPaneTab(tab) {
    document.getElementById('pane-notes-body').style.display = tab === 'notes' ? '' : 'none';
    document.getElementById('pane-bookmarks-body').style.display = tab === 'bookmarks' ? '' : 'none';
    document.getElementById('tab-notes').classList.toggle('active', tab === 'notes');
    document.getElementById('tab-bookmarks').classList.toggle('active', tab === 'bookmarks');
    if (tab === 'notes') {
        const content = document.getElementById('notes-pane-content');
        if (content && !content.hasChildNodes() && typeof notes !== 'undefined') {
            notes.renderAllNotes();
        }
    }
}

function openSidePane(tab) {
    switchPaneTab(tab);
    document.getElementById('side-pane').classList.add('active');
    document.body.classList.add('notes-open');
}

function closeSidePane() {
    document.getElementById('side-pane').classList.remove('active');
    document.body.classList.remove('notes-open');
}

function openSettingsPane() { window.location.href = 'settings.html'; }

function openLeftPane() {
    document.getElementById('left-pane').classList.add('active');
    document.body.classList.add('left-pane-open');
}

function closeLeftPane() {
    document.getElementById('left-pane').classList.remove('active');
    document.body.classList.remove('left-pane-open');
}

function showLeftPaneNav() {
    document.getElementById('left-pane-nav').style.display = '';
    document.getElementById('left-pane-index').style.display = 'none';
}

function showLeftPaneIndex() {
    document.getElementById('left-pane-nav').style.display = 'none';
    document.getElementById('left-pane-index').style.display = '';
}

function toggleLeftPane() { // page-header Index link → index view
    const pane = document.getElementById('left-pane');
    const indexShown = document.getElementById('left-pane-index').style.display !== 'none';
    if (pane.classList.contains('active') && indexShown) {
        closeLeftPane();
    } else {
        showLeftPaneIndex();
        openLeftPane();
    }
}

function toggleLeftPaneNav() { // FAB burger → nav view
    const pane = document.getElementById('left-pane');
    const navShown = document.getElementById('left-pane-nav').style.display !== 'none';
    if (pane.classList.contains('active') && navShown) {
        closeLeftPane();
    } else {
        showLeftPaneNav();
        openLeftPane();
    }
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeSidePane();
        closeLeftPane();
        app.emit('dialog:close');
    }
});

function toggleDarkMode() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeToggle(newTheme);
}

function updateThemeToggle(theme) {
    const track = document.getElementById('dark-mode-track');
    if (track) {
        if (theme === 'dark') track.classList.add('active');
        else track.classList.remove('active');
    }
}

function setFont(font) {
    document.documentElement.setAttribute('data-font', font);
    localStorage.setItem('font', font);
    updateFontToggle(font);
}

function setMenuPosition(position) {
    localStorage.setItem('menuPosition', position);
    document.documentElement.setAttribute('data-menu-position', position);
    updateMenuPositionToggle(position);
    updateFabTop();
}

function updateMenuPositionToggle(position) {
    document.querySelectorAll('.settings-position-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.position === position);
    });
}

function updateFontToggle(font) {
    document.querySelectorAll('.settings-font-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.font === font);
    });
}

let zoomLevel = parseInt(localStorage.getItem('zoom') || '100', 10);

function adjustZoom(delta) {
    zoomLevel = Math.max(50, Math.min(200, zoomLevel + delta));
    localStorage.setItem('zoom', zoomLevel);
    applyZoom();
}

function applyZoom() {
    document.body.style.zoom = zoomLevel + '%';
    document.querySelectorAll('.zoom-level-display').forEach(el => {
        el.textContent = zoomLevel + '%';
    });
}

app.on('pane:open-notes', function() { openSidePane('notes'); });
app.on('pane:close', closeSidePane);

document.addEventListener("DOMContentLoaded", function() {
    highlightParagraph();
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    updateThemeToggle(theme);
    const font = document.documentElement.getAttribute('data-font') || 'serif';
    updateFontToggle(font);
    const menuPosition = localStorage.getItem('menuPosition') || 'top-left';
    updateMenuPositionToggle(menuPosition);
    applyZoom();
    updateFabTop();

    // Auto-close left pane when navigating via any index link
    const leftPaneIndex = document.getElementById('left-pane-index');
    if (leftPaneIndex) {
        leftPaneIndex.addEventListener('click', function(e) {
            if (e.target.closest('a[href]')) closeLeftPane();
        });
    }
});
window.addEventListener("hashchange", highlightParagraph);

function updateFabTop() {
    const pos = document.documentElement.getAttribute('data-menu-position') || 'top-left';
    if (!pos.startsWith('top-')) return;
    const firstHeader = document.querySelector('article header');
    if (!firstHeader) return;
    const bottom = firstHeader.getBoundingClientRect().bottom;
    const top = Math.max(39, (bottom + 8) * 0.5 + 10);
    document.documentElement.style.setProperty('--fab-top', top + 'px');
}

window.addEventListener('scroll', function() {
    const headers = document.querySelectorAll('header');
    headers.forEach(header => {
        const rect = header.getBoundingClientRect();
        if (rect.top <= 0) {
            header.classList.add('shadow');
        } else {
            header.classList.remove('shadow');
        }
    });
    updateFabTop();
});

// Click outside highlighted text clears the highlight without changing URL
document.addEventListener('click', function(event) {
    const highlighted = document.querySelector('.highlight');
    if (!highlighted) return;

    // Don't clear if clicking inside panes, fab, or notes toggles
    if (event.target.closest('#side-pane') || event.target.closest('#left-pane') || event.target.closest('.fab-group')) return;
    if (event.target.classList.contains('notes-toggle')) return;

    // Don't clear if clicking on the highlighted element itself
    if (highlighted.contains(event.target) || event.target === highlighted) return;

    highlighted.classList.remove('highlight');
    app.emit('highlight:removed', highlighted);
});

document.addEventListener('dblclick', function (event) {
    // Prevent browser's default text selection on double-click
    event.preventDefault();
    window.getSelection().removeAllRanges();

    // Ignore double-clicks inside panes
    if (event.target.closest('#side-pane') || event.target.closest('#left-pane')) return;

    // Get the element that was double-clicked
    const targetElement = event.target;

    // Get the ID of the clicked element
    let elementId = targetElement.id;

    // Check if the element does not have an ID, and get the parent ID if necessary
    if (!elementId && targetElement.parentElement) {
        elementId = targetElement.parentElement.id;
    }

    // Only proceed if we have an ID
    if (elementId) {
        // Get the current URL without the fragment identifier
        const currentUrl = window.location.href.split('#')[0];

        // Construct the target URL by appending the element ID as a fragment
        const targetUrl = `${currentUrl}#${elementId}`;

        // Use pushState to update URL without native scroll-to-hash
        history.pushState(null, '', '#' + elementId);
        highlightParagraph();
        notes.closePane();

        // Copy the target URL (with the element ID) to the clipboard
        navigator.clipboard.writeText(targetUrl)
            .then(() => {
                console.log('URL copied to clipboard:', targetUrl);
            })
            .catch(err => {
                console.error('Failed to copy: ', err);
            });
    }
});

/* ── FAB drag-to-corner ── */
(function () {
    const THRESHOLD = 6;
    let dragging = false;
    let _wasDragging = false;

    function cornerFromRect(fab) {
        const r = fab.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const h = cx < window.innerWidth / 2 ? 'left' : 'right';
        const v = cy < window.innerHeight / 2 ? 'top' : 'bottom';
        return v + '-' + h;
    }

    function onStart(e) {
        if (e.button !== undefined && e.button !== 0) return; // left button only
        const fab = document.querySelector('.fab-group');
        if (!fab) return;
        const pt = e.touches ? e.touches[0] : e;
        const startX = pt.clientX;
        const startY = pt.clientY;
        dragging = false;

        function onMove(e) {
            const pt = e.touches ? e.touches[0] : e;
            const dx = pt.clientX - startX;
            const dy = pt.clientY - startY;
            if (!dragging) {
                if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
                dragging = true;
                fab.classList.add('fab-dragging');
            }
            e.preventDefault();
            fab.style.transform = `translate(${dx}px,${dy}px)`;
        }

        function onEnd() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            if (!dragging) return;
            const corner = cornerFromRect(fab);
            fab.style.transform = '';
            fab.classList.remove('fab-dragging');
            dragging = false;
            _wasDragging = true;
            setTimeout(() => { _wasDragging = false; }, 0);
            setMenuPosition(corner);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
    }

    document.addEventListener('DOMContentLoaded', function () {
        const fab = document.querySelector('.fab-group');
        if (!fab) return;
        fab.addEventListener('mousedown', onStart);
        fab.addEventListener('touchstart', onStart, { passive: true });
        fab.addEventListener('click', function (e) {
            if (_wasDragging) { e.stopPropagation(); e.preventDefault(); }
        }, true);
    });
})();

/* ── Swipe gestures for panes ── */
(function () {
    var EDGE      = 30;  // px from screen edge to initiate an open gesture
    var MIN_SWIPE = 60;  // px horizontal travel required to commit

    var startX, startY, gesture;

    document.addEventListener('touchstart', function (e) {
        var t = e.touches[0];
        startX  = t.clientX;
        startY  = t.clientY;
        gesture = null;

        var leftOpen  = document.getElementById('left-pane').classList.contains('active');
        var rightOpen = document.getElementById('side-pane').classList.contains('active');

        if (leftOpen) {
            gesture = 'close-left';   // swipe left anywhere to close
        } else if (rightOpen) {
            gesture = 'close-right';  // swipe right anywhere to close
        } else if (startX <= EDGE) {
            gesture = 'open-left';    // edge-right swipe to open left pane
        } else if (startX >= window.innerWidth - EDGE) {
            gesture = 'open-right';   // edge-left swipe to open right pane
        }
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
        if (!gesture) return;
        var t  = e.changedTouches[0];
        var dx = t.clientX - startX;
        var dy = t.clientY - startY;

        // Require clearly horizontal movement
        if (Math.abs(dy) >= Math.abs(dx)) return;
        if (Math.abs(dx) < MIN_SWIPE) return;

        if (gesture === 'open-left'  && dx > 0) { showLeftPaneNav(); openLeftPane(); }
        if (gesture === 'open-right' && dx < 0) {
            var notesBody = document.getElementById('pane-notes-body');
            var tab = (notesBody && notesBody.style.display !== 'none') ? 'notes' : 'bookmarks';
            openSidePane(tab);
        }
        if (gesture === 'close-left'  && dx < 0) closeLeftPane();
        if (gesture === 'close-right' && dx > 0) closeSidePane();
    }, { passive: true });
})();

// Expose functions used as HTML event-handler attributes
Object.assign(window, {
    installPwa,
    shareApp,
    switchPaneTab,
    openSidePane,
    closeSidePane,
    openSettingsPane,
    openLeftPane,
    closeLeftPane,
    showLeftPaneNav,
    showLeftPaneIndex,
    toggleLeftPane,
    toggleLeftPaneNav,
    toggleDarkMode,
    updateThemeToggle,
    setFont,
    updateFontToggle,
    setMenuPosition,
    updateMenuPositionToggle,
    adjustZoom,
    applyZoom,
    updateFabTop,
});
