let highlightsData = {};
let hlToolbar = null;

const HL_COLORS = ['yellow', 'green', 'red', 'purple', 'blue'];

window.addEventListener('load', () => {
    const stored = localStorage.getItem('highlightsData');
    if (stored) {
        highlightsData = JSON.parse(stored);
        restoreAllHighlights();
    }
    createToolbar();
});

// ── Toolbar ──

function createToolbar() {
    hlToolbar = document.createElement('div');
    hlToolbar.className = 'hl-toolbar';

    HL_COLORS.forEach(color => {
        const btn = document.createElement('button');
        btn.className = 'hl-color-btn hl-swatch-' + color;
        btn.title = color.charAt(0).toUpperCase() + color.slice(1);
        btn.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();
            applyHighlight(color);
        });
        btn.addEventListener('touchstart', e => {
            e.preventDefault();
            e.stopPropagation();
            applyHighlight(color);
        }, { passive: false });
        hlToolbar.appendChild(btn);
    });

    const divider = document.createElement('div');
    divider.className = 'hl-divider';
    hlToolbar.appendChild(divider);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'hl-clear-btn';
    clearBtn.title = 'Clear highlight';
    clearBtn.innerHTML = '&#10005;';
    clearBtn.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        clearHighlightFromSelection();
    });
    clearBtn.addEventListener('touchstart', e => {
        e.preventDefault();
        e.stopPropagation();
        clearHighlightFromSelection();
    }, { passive: false });
    hlToolbar.appendChild(clearBtn);

    document.body.appendChild(hlToolbar);
}

function showToolbar() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        hideToolbar();
        return;
    }

    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const el = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

    // Don't show inside settings, notes, or the toolbar itself
    if (el.closest('#settings-pane') || el.closest('#notes-pane') || el.closest('.hl-toolbar')) {
        return;
    }

    // Only show if selection touches a sentence span
    if (!findSentenceSpan(range.startContainer) && !findSentenceSpan(range.endContainer)) {
        return;
    }

    const rect = range.getBoundingClientRect();

    // Briefly show to measure, then position
    hlToolbar.style.display = 'flex';
    hlToolbar.style.left = '0px';
    hlToolbar.style.top = '0px';
    const tbWidth = hlToolbar.offsetWidth;

    const left = Math.max(8, Math.min(
        window.innerWidth - tbWidth - 8,
        rect.left + rect.width / 2 - tbWidth / 2
    ));
    const top = rect.bottom + window.scrollY + 6;

    hlToolbar.style.left = left + 'px';
    hlToolbar.style.top = top + 'px';
}

function hideToolbar() {
    if (hlToolbar) hlToolbar.style.display = 'none';
}

// Show on mouseup (desktop)
document.addEventListener('mouseup', e => {
    if (e.target.closest('.hl-toolbar')) return;
    setTimeout(showToolbar, 10);
});

// Hide on mousedown outside toolbar
document.addEventListener('mousedown', e => {
    if (e.target.closest('.hl-toolbar')) return;
    hideToolbar();
});

// Handle touch selection changes (mobile)
let hlSelTimeout;
document.addEventListener('selectionchange', () => {
    clearTimeout(hlSelTimeout);
    hlSelTimeout = setTimeout(() => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim()) {
            showToolbar();
        }
    }, 400);
});

// ── Finding sentence spans ──

function findSentenceSpan(node) {
    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (el) {
        if (el.tagName === 'SPAN' && el.id && /-s\d+$/.test(el.id)) return el;
        if (el.tagName === 'ARTICLE' || el.tagName === 'SECTION' || el.tagName === 'BODY') return null;
        el = el.parentElement;
    }
    return null;
}

function collectHighlightsFromRange(range) {
    const result = [];

    const startSpan = findSentenceSpan(range.startContainer);
    const endSpan = findSentenceSpan(range.endContainer);

    if (!startSpan && !endSpan) return result;

    // Single span selection
    if (startSpan && startSpan === endSpan) {
        const text = range.toString().trim();
        if (text && startSpan.id) result.push({ elementId: startSpan.id, text });
        return result;
    }

    // Cross-span selection
    const ancestor = range.commonAncestorContainer;
    const ancestorEl = ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentElement : ancestor;
    const spans = ancestorEl.querySelectorAll('span[id]');

    spans.forEach(span => {
        if (!/-s\d+$/.test(span.id)) return;
        if (!range.intersectsNode(span)) return;

        const spanRange = document.createRange();
        spanRange.selectNodeContents(span);

        if (span.contains(range.startContainer)) {
            spanRange.setStart(range.startContainer, range.startOffset);
        }
        if (span.contains(range.endContainer)) {
            spanRange.setEnd(range.endContainer, range.endOffset);
        }

        const text = spanRange.toString().trim();
        if (text) result.push({ elementId: span.id, text });
    });

    return result;
}

// ── Apply / Clear ──

function applyHighlight(color) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const entries = collectHighlightsFromRange(range);
    if (entries.length === 0) return;

    entries.forEach(({ elementId, text }) => {
        if (!highlightsData[elementId]) highlightsData[elementId] = [];

        // Remove existing entry for the same text (allows color change)
        highlightsData[elementId] = highlightsData[elementId].filter(h => h.text !== text);

        highlightsData[elementId].push({
            text: text,
            color: color,
            createdDate: new Date().toISOString().substring(0, 19).replace('T', ' ')
        });
    });

    saveHighlights();

    entries.forEach(({ elementId }) => {
        restoreHighlightsForElement(elementId);
    });

    sel.removeAllRanges();
    hideToolbar();
}

function clearHighlightFromSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const entries = collectHighlightsFromRange(range);
    if (entries.length === 0) return;

    entries.forEach(({ elementId, text }) => {
        if (!highlightsData[elementId]) return;

        // Remove highlights whose text overlaps with the selected text
        highlightsData[elementId] = highlightsData[elementId].filter(h => {
            return !text.includes(h.text) && !h.text.includes(text);
        });

        if (highlightsData[elementId].length === 0) {
            delete highlightsData[elementId];
        }
    });

    saveHighlights();

    entries.forEach(({ elementId }) => {
        restoreHighlightsForElement(elementId);
    });

    sel.removeAllRanges();
    hideToolbar();
}

// ── Persistence ──

function saveHighlights() {
    localStorage.setItem('highlightsData', JSON.stringify(highlightsData));
    syncHighlightsToFolder();
}

function restoreAllHighlights() {
    Object.keys(highlightsData).forEach(elementId => {
        restoreHighlightsForElement(elementId);
    });
}

function restoreHighlightsForElement(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    // Strip existing highlight marks
    stripHighlightMarks(element);

    const highlights = highlightsData[elementId];
    if (!highlights || highlights.length === 0) return;

    highlights.forEach(hl => {
        wrapTextInElement(element, hl.text, hl.color);
    });
}

function stripHighlightMarks(element) {
    const marks = element.querySelectorAll('mark.hl-mark');
    marks.forEach(mark => {
        const parent = mark.parentNode;
        while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
    });
    element.normalize();
}

function wrapTextInElement(element, text, color) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    let fullText = '';
    const textNodes = [];

    while (node = walker.nextNode()) {
        textNodes.push({ node: node, start: fullText.length });
        fullText += node.nodeValue;
    }

    const index = fullText.indexOf(text);
    if (index === -1) return;

    const endIndex = index + text.length;

    // Process in reverse to keep earlier node positions valid
    for (let i = textNodes.length - 1; i >= 0; i--) {
        const tn = textNodes[i];
        const nodeStart = tn.start;
        const nodeEnd = nodeStart + tn.node.nodeValue.length;

        // Skip non-overlapping nodes
        if (nodeEnd <= index || nodeStart >= endIndex) continue;

        // Skip if already inside a highlight mark
        if (tn.node.parentElement.classList.contains('hl-mark')) continue;

        const hlStart = Math.max(0, index - nodeStart);
        const hlEnd = Math.min(tn.node.nodeValue.length, endIndex - nodeStart);

        const nodeText = tn.node.nodeValue;
        const beforeText = nodeText.substring(0, hlStart);
        const middleText = nodeText.substring(hlStart, hlEnd);
        const afterText = nodeText.substring(hlEnd);

        const mark = document.createElement('mark');
        mark.className = 'hl-mark hl-' + color;
        mark.textContent = middleText;

        const parent = tn.node.parentNode;
        const nextSib = tn.node.nextSibling;
        parent.removeChild(tn.node);

        // Insert before, mark, after — all before nextSib to maintain order
        if (beforeText) parent.insertBefore(document.createTextNode(beforeText), nextSib);
        parent.insertBefore(mark, nextSib);
        if (afterText) parent.insertBefore(document.createTextNode(afterText), nextSib);
    }
}

// ── Folder sync (reuses syncDirHandle from notes.js) ──

async function syncHighlightsToFolder() {
    if (typeof syncDirHandle === 'undefined' || !syncDirHandle) return;

    try {
        const filename = '_highlights.md';

        if (Object.keys(highlightsData).length === 0) {
            try { await syncDirHandle.removeEntry(filename); } catch (e) {}
            return;
        }

        let markdown = '# Highlights\n\n';

        for (const [elementId, hlList] of Object.entries(highlightsData)) {
            if (!hlList || hlList.length === 0) continue;

            const element = document.getElementById(elementId);
            const sourceText = element ? element.textContent.trim() : '';

            markdown += '## ' + elementId + '\n\n';
            if (sourceText) {
                markdown += '> ' + sourceText + '\n\n';
            }

            hlList.forEach(hl => {
                markdown += '- **' + hl.color + '**: "' + hl.text + '"';
                if (hl.createdDate) markdown += '  (' + hl.createdDate + ')';
                markdown += '\n';
            });

            markdown += '\n';
        }

        const fileHandle = await syncDirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(markdown);
        await writable.close();
    } catch (err) {
        console.error('Highlights sync error:', err);
    }
}
