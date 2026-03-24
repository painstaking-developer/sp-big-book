/**
 * highlight.js — Text highlighting
 *
 * Responsibility: apply, remove, and persist colored highlight marks on
 * sentences; exposes a color-picker panel in the FAB.
 *
 * Public interface (on window via IIFE):
 *   updateFabExpanded(expanded) — show/hide the highlight color picker in FAB
 *
 * Listens to: highlight:added, highlight:removed, fab:update-expanded (app event bus)
 */

(function () {
'use strict';

let highlightsData = {};

const HL_COLORS = ['yellow', 'green', 'red', 'purple', 'blue'];

window.addEventListener('load', () => {
    const stored = localStorage.getItem('highlightsData');
    if (stored) {
        try {
            highlightsData = JSON.parse(stored);
            migrateHighlightsData();
            restoreAllHighlights();
        } catch (e) {
            console.warn('Could not parse stored highlights; starting fresh.', e);
            localStorage.removeItem('highlightsData');
        }
    }
    createFabHighlightButtons();
});

// ── Migration: add start/end offsets to old text-only entries ──

function migrateHighlightsData() {
    let changed = false;
    for (const [elementId, hlList] of Object.entries(highlightsData)) {
        const element = document.getElementById(elementId);
        if (!element) continue;
        const fullText = element.textContent;

        hlList.forEach(hl => {
            if (hl.start != null && hl.end != null) return;
            const idx = fullText.indexOf(hl.text);
            if (idx !== -1) {
                hl.start = idx;
                hl.end = idx + hl.text.length;
                changed = true;
            }
        });
    }
    if (changed) {
        localStorage.setItem('highlightsData', JSON.stringify(highlightsData));
    }
}

// ── FAB highlight buttons ──

function createFabHighlightButtons() {
    const container = document.getElementById('hl-fab-colors');
    if (!container) return;
    if (container.children.length > 0) return; // guard against duplicate init

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

// ── Offset helper ──

function getTextOffset(element, node, offset) {
    const r = document.createRange();
    r.selectNodeContents(element);
    r.setEnd(node, offset);
    return r.toString().length;
}

function trimmedOffsets(fullText, start, end) {
    const raw = fullText.substring(start, end);
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const leftTrim = raw.indexOf(trimmed);
    return { start: start + leftTrim, end: start + leftTrim + trimmed.length, text: trimmed };
}

function collectHighlightsFromRange(range) {
    const result = [];

    const startSpan = findSentenceSpan(range.startContainer);
    const endSpan = findSentenceSpan(range.endContainer);

    if (!startSpan && !endSpan) return result;

    // Single span selection
    if (startSpan && startSpan === endSpan) {
        const rawStart = getTextOffset(startSpan, range.startContainer, range.startOffset);
        const rawEnd = getTextOffset(startSpan, range.endContainer, range.endOffset);
        const trimmed = trimmedOffsets(startSpan.textContent, rawStart, rawEnd);
        if (trimmed && startSpan.id) result.push({ elementId: startSpan.id, ...trimmed });
        return result;
    }

    // Cross-span selection
    const ancestor = range.commonAncestorContainer;
    const ancestorEl = ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentElement : ancestor;
    const spans = ancestorEl.querySelectorAll('span[id]');

    spans.forEach(span => {
        if (!/-s\d+$/.test(span.id)) return;
        if (!range.intersectsNode(span)) return;

        let rawStart, rawEnd;
        if (span === startSpan) {
            rawStart = getTextOffset(span, range.startContainer, range.startOffset);
            rawEnd = span.textContent.length;
        } else if (span === endSpan) {
            rawStart = 0;
            rawEnd = getTextOffset(span, range.endContainer, range.endOffset);
        } else {
            rawStart = 0;
            rawEnd = span.textContent.length;
        }

        const trimmed = trimmedOffsets(span.textContent, rawStart, rawEnd);
        if (trimmed) result.push({ elementId: span.id, ...trimmed });
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

    entries.forEach(({ elementId, text, start, end }) => {
        if (!highlightsData[elementId]) highlightsData[elementId] = [];

        const el = document.getElementById(elementId);
        const fullText = el ? el.textContent : '';

        // Split existing highlights around the new range
        const newList = [];
        highlightsData[elementId].forEach(h => {
            const hStart = h.start != null ? h.start : 0;
            const hEnd = h.end != null ? h.end : hStart + (h.text || '').length;

            if (hEnd <= start || hStart >= end) {
                // No overlap — keep as-is
                newList.push(h);
            } else {
                // Keep non-overlapping fragments
                if (hStart < start) {
                    newList.push({ ...h, text: fullText.substring(hStart, start), start: hStart, end: start });
                }
                if (hEnd > end) {
                    newList.push({ ...h, text: fullText.substring(end, hEnd), start: end, end: hEnd });
                }
            }
        });

        newList.push({
            text, color, start, end,
            createdDate: new Date().toISOString().substring(0, 19).replace('T', ' ')
        });

        highlightsData[elementId] = newList;
    });

    saveHighlights();
    entries.forEach(({ elementId }) => restoreHighlightsForElement(elementId));
    sel.removeAllRanges();
    hideFabColors();
}

function clearHighlightFromSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const entries = collectHighlightsFromRange(range);
    if (entries.length === 0) return;

    entries.forEach(({ elementId, start, end }) => {
        if (!highlightsData[elementId]) return;

        const el = document.getElementById(elementId);
        const fullText = el ? el.textContent : '';

        const newList = [];
        highlightsData[elementId].forEach(h => {
            const hStart = h.start != null ? h.start : 0;
            const hEnd = h.end != null ? h.end : hStart + (h.text || '').length;

            if (hEnd <= start || hStart >= end) {
                // No overlap — keep
                newList.push(h);
            } else {
                // Keep non-overlapping fragments
                if (hStart < start) {
                    newList.push({ ...h, text: fullText.substring(hStart, start), start: hStart, end: start });
                }
                if (hEnd > end) {
                    newList.push({ ...h, text: fullText.substring(end, hEnd), start: end, end: hEnd });
                }
            }
        });

        highlightsData[elementId] = newList;
        if (newList.length === 0) delete highlightsData[elementId];
    });

    saveHighlights();
    entries.forEach(({ elementId }) => restoreHighlightsForElement(elementId));
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

    stripHighlightMarks(element);

    const highlights = highlightsData[elementId];
    if (!highlights || highlights.length === 0) return;

    const fullText = element.textContent;

    // Build character-level color map
    const colorMap = new Array(fullText.length).fill(null);
    highlights.forEach(hl => {
        let start = hl.start;
        let end = hl.end;

        // Fallback for entries without offsets
        if (start == null || end == null) {
            const idx = fullText.indexOf(hl.text);
            if (idx === -1) return;
            start = idx;
            end = idx + hl.text.length;
        }

        for (let i = start; i < end && i < fullText.length; i++) {
            colorMap[i] = hl.color;
        }
    });

    // Convert to runs of contiguous same-color
    const runs = [];
    let i = 0;
    while (i < colorMap.length) {
        if (colorMap[i] === null) { i++; continue; }
        const color = colorMap[i];
        const runStart = i;
        while (i < colorMap.length && colorMap[i] === color) i++;
        runs.push({ start: runStart, end: i, color });
    }

    if (runs.length === 0) return;

    applyColorRuns(element, runs);
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

function applyColorRuns(element, runs) {
    // Collect text nodes with their character positions
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    let pos = 0;
    const textNodes = [];
    while (node = walker.nextNode()) {
        textNodes.push({ node, start: pos, end: pos + node.nodeValue.length });
        pos += node.nodeValue.length;
    }

    // Process each text node in reverse (to keep earlier positions stable)
    for (let t = textNodes.length - 1; t >= 0; t--) {
        const tn = textNodes[t];
        const nodeText = tn.node.nodeValue;

        // Find runs overlapping this text node
        const overlapping = [];
        for (const run of runs) {
            if (run.end <= tn.start || run.start >= tn.end) continue;
            overlapping.push({
                start: Math.max(0, run.start - tn.start),
                end: Math.min(nodeText.length, run.end - tn.start),
                color: run.color
            });
        }

        if (overlapping.length === 0) continue;
        overlapping.sort((a, b) => a.start - b.start);

        // Build segments
        const segments = [];
        let cursor = 0;
        for (const ov of overlapping) {
            if (cursor < ov.start) {
                segments.push({ text: nodeText.substring(cursor, ov.start), color: null });
            }
            segments.push({ text: nodeText.substring(ov.start, ov.end), color: ov.color });
            cursor = ov.end;
        }
        if (cursor < nodeText.length) {
            segments.push({ text: nodeText.substring(cursor), color: null });
        }

        // Replace text node with segments
        const parent = tn.node.parentNode;
        const nextSib = tn.node.nextSibling;
        parent.removeChild(tn.node);

        for (const seg of segments) {
            if (seg.color) {
                const mark = document.createElement('mark');
                mark.className = 'hl-mark hl-' + seg.color;
                mark.textContent = seg.text;
                parent.insertBefore(mark, nextSib);
            } else {
                parent.insertBefore(document.createTextNode(seg.text), nextSib);
            }
        }
    }
}

// ── Folder sync ──

function syncHighlightsToFolder() {
    if (typeof notesModule !== 'undefined') notesModule.syncAllToFolder();
}

window.highlightsModule = {
    mergeAndRestore(newData) {
        let count = 0;
        for (const [id, list] of Object.entries(newData)) {
            if (!highlightsData[id]) {
                highlightsData[id] = list;
                count += list.length;
            }
        }
        saveHighlights();
        restoreAllHighlights();
        return count;
    }
};

app.on('fab:update-expanded', updateFabExpanded);

})();
