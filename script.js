let isInitialLoad = true;

function highlightParagraph() {
    // Remove existing highlights
    const highlighted = document.querySelector('.highlight');
    if (highlighted) {
        highlighted.classList.remove('highlight');
        notes.highlightRemoved(highlighted);
    }

    // Highlight the new paragraph
    const hash = window.location.hash;
    if (hash) {
        const element = document.querySelector(hash);
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

function openSettingsPane() {
    document.getElementById('settings-overlay').classList.add('active');
    document.getElementById('settings-pane').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSettingsPane() {
    document.getElementById('settings-overlay').classList.remove('active');
    document.getElementById('settings-pane').classList.remove('active');
    document.body.style.overflow = '';
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeSettingsPane();
        notes.closePane();
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
    applyZoom();
});
window.addEventListener("hashchange", highlightParagraph);

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
});

document.addEventListener('dblclick', function (event) {
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
