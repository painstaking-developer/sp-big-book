let highlightsData = {};

const HL_COLORS = ['yellow', 'green', 'red', 'purple', 'blue'];

window.addEventListener('load', () => {
    const stored = localStorage.getItem('highlightsData');
    if (stored) {
        highlightsData = JSON.parse(stored);
        restoreAllHighlights();
    }
    createFabHighlightButtons();
});

// ── FAB highlight buttons ──

function createFabHighlightButtons() {
    const container = document.getElementById('hl-fab-colors');
    if (!container) return;

    HL_COLORS.forEach(color => {
        const btn = document.createElement('button');
        btn.className = 'hl-fab-swatch hl-swatch-' + color;
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
        container.appendChild(btn);
    });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'hl-fab-clear';
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
    container.appendChild(clearBtn);

    // Trailing divider to separate colors from the notes button
    const divider = document.createElement('div');
    divider.className = 'hl-fab-divider';
    container.appendChild(divider);
}

function showFabColors() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        hideFabColors();
        return;
    }

    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const el = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

    // Don't show inside settings, notes, or fab-group itself
    if (el.closest('#settings-pane') || el.closest('#notes-pane') || el.closest('.fab-group')) {
        return;
    }

    // Only show if selection touches a sentence span
    if (!findSentenceSpan(range.startContainer) && !findSentenceSpan(range.endContainer)) {
        return;
    }

    const fabColors = document.getElementById('hl-fab-colors');
    if (fabColors) {
        fabColors.classList.add('active');
        updateFabExpanded();
    }
}

function hideFabColors() {
    const fabColors = document.getElementById('hl-fab-colors');
    if (fabColors) {
        fabColors.classList.remove('active');
        updateFabExpanded();
    }
}

function updateFabExpanded() {
    const fab = document.querySelector('.fab-group');
    if (!fab) return;
    const colorsActive = document.getElementById('hl-fab-colors')?.classList.contains('active');
    const labelActive = document.getElementById('fab-notes-label')?.classList.contains('active');
    if (colorsActive || labelActive) {
        fab.classList.add('fab-expanded');
    } else {
        fab.classList.remove('fab-expanded');
    }
}

// Show on mouseup (desktop)
document.addEventListener('mouseup', e => {
    if (e.target.closest('.fab-group')) return;
    setTimeout(showFabColors, 10);
});

// Hide on mousedown outside fab-group
document.addEventListener('mousedown', e => {
    if (e.target.closest('.fab-group')) return;
    hideFabColors();
});

// Handle touch selection changes (mobile)
let hlSelTimeout;
document.addEventListener('selectionchange', () => {
    clearTimeout(hlSelTimeout);
    hlSelTimeout = setTimeout(() => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim()) {
            showFabColors();
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
    hideFabColors();
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
    hideFabColors();
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
