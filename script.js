let isInitialLoad = true;

function highlightParagraph() {
    // Remove existing highlights
    const highlighted = document.querySelector('.highlight');
    if (highlighted) {
        highlighted.classList.remove('highlight');
        notes.highlightRemoved(highlighted);
        if (typeof bookmarks !== 'undefined') bookmarks.setCurrentHighlight(null);
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
            notes.highlightAdded(element);

            // Only scroll to center on initial page load (visiting via URL)
            if (isInitialLoad) {
                const pageContent = element.closest('.p');
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
    document.getElementById('pane-settings-body').style.display = tab === 'settings' ? '' : 'none';
    document.getElementById('tab-notes').classList.toggle('active', tab === 'notes');
    document.getElementById('tab-settings').classList.toggle('active', tab === 'settings');
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

function openSettingsPane() { openSidePane('settings'); }
function closeSettingsPane() { closeSidePane(); }

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeSidePane();
        if (typeof bookmarks !== 'undefined') bookmarks.hideAddDialog();
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
    const icon = document.getElementById('theme-icon');
    if (track) {
        if (theme === 'dark') track.classList.add('active');
        else track.classList.remove('active');
    }
    if (icon) icon.innerHTML = theme === 'dark' ? '&#9790;&#65038;' : '&#9728;&#65038;';
}

function setFont(font) {
    document.documentElement.setAttribute('data-font', font);
    localStorage.setItem('font', font);
    updateFontToggle(font);
}

function setMenuPosition(position) {
    localStorage.setItem('menuPosition', position);
    if (position === 'bottom-right') {
        document.documentElement.removeAttribute('data-menu-position');
    } else {
        document.documentElement.setAttribute('data-menu-position', position);
    }
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

document.addEventListener("DOMContentLoaded", function() {
    highlightParagraph();
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    updateThemeToggle(theme);
    const font = document.documentElement.getAttribute('data-font') || 'serif';
    updateFontToggle(font);
    const menuPosition = localStorage.getItem('menuPosition') || 'bottom-right';
    updateMenuPositionToggle(menuPosition);
    applyZoom();
    updateFabTop();
});
window.addEventListener("hashchange", highlightParagraph);

function updateFabTop() {
    const pos = localStorage.getItem('menuPosition') || 'bottom-right';
    if (pos !== 'top-right' && pos !== 'top-left') return;
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
    if (event.target.closest('#settings-pane') || event.target.closest('#notes-pane') || event.target.closest('.fab-group')) return;
    if (event.target.classList.contains('notes-toggle')) return;

    // Don't clear if clicking on the highlighted element itself
    if (highlighted.contains(event.target) || event.target === highlighted) return;

    highlighted.classList.remove('highlight');
    notes.highlightRemoved(highlighted);
    if (typeof bookmarks !== 'undefined') bookmarks.setCurrentHighlight(null);
});

document.addEventListener('dblclick', function (event) {
    // Prevent browser's default text selection on double-click
    event.preventDefault();
    window.getSelection().removeAllRanges();

    // Ignore double-clicks inside the settings pane
    if (event.target.closest('#settings-pane')) return;

    // Get the element that was double-clicked
    const targetElement = event.target;

    // Get the ID of the clicked element
    elementId = targetElement.id; // Get the current element ID

    // Check if the element does not have an ID, and get the parent ID if necessary
    if (!elementId && targetElement.parentElement) {
        elementId = targetElement.parentElement.id; // Get the parent element ID
    }

    console.log("elementId", elementId)

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
        if (typeof bookmarks !== 'undefined') bookmarks.setCurrentHighlight('#' + elementId);

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
