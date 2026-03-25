/**
 * sheets.js — Sheets feature (page-based routing)
 *
 * Routes:
 *   sheets.html            → list of all sheets
 *   sheets.html#<id>       → view a sheet (read mode)
 *   sheets.html#<id>/edit  → edit a sheet
 *
 * Quote selection flow:
 *   1. User clicks "Insert Quote" in editor
 *   2. We save editor state + pending info to sessionStorage
 *   3. Navigate to index.html — sheets.js detects the flag on load and
 *      enters quote-select mode (banner, tint, tap-to-select)
 *   4. User taps a sentence → confirm → we write selection to sessionStorage
 *   5. Navigate back to sheets.html#<id>/edit — editor picks up the
 *      pending quote and inserts it
 *
 * Data stored in localStorage under key 'sheets'.
 *
 * Depends on: notes.js (formatNoteText, formatEditorText, _lucideIcon,
 *             window.app event bus)
 */

/* ── State ── */
let sheetsData = [];
let sheetEditorBlocks = [];     // working copy while editing
let quoteSelectMode = false;

/* ── Page detection ── */
const _onSheetsPage = window.location.pathname.endsWith('sheets.html');
const _onBookPage = window.location.pathname.endsWith('index.html') ||
                    window.location.pathname.endsWith('/');

/* ── Persistence ── */
function loadSheets() {
    try {
        sheetsData = JSON.parse(localStorage.getItem('sheets') || '[]');
    } catch (e) {
        sheetsData = [];
    }
}

function saveSheets() {
    localStorage.setItem('sheets', JSON.stringify(sheetsData));
    if (typeof notesModule !== 'undefined' && notesModule.syncAllToFolder) {
        notesModule.syncAllToFolder();
    }
}

function _generateId() {
    return 'sh_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

function _now() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function _parseRef(elementId) {
    const parts = [];
    const pgMatch = elementId.match(/pg(.+?)(?=-p|$)/);
    const parMatch = elementId.match(/-p(\d+)/);
    const senMatch = elementId.match(/-s(\d+)/);
    if (pgMatch) parts.push('Page ' + pgMatch[1].replace(/_/g, ' '));
    if (parMatch) parts.push('Par. ' + parMatch[1]);
    if (senMatch) parts.push('Sen. ' + senMatch[1]);
    return parts.length ? parts.join(' / ') : null;
}

/* ── Parse current hash route ── */
function _parseRoute() {
    const hash = window.location.hash.slice(1); // strip leading #
    if (!hash) return { view: 'list' };
    const parts = hash.split('/');
    const id = parts[0];
    const mode = parts[1]; // 'edit' or undefined
    return { view: mode === 'edit' ? 'edit' : 'view', id: id };
}

/* ══════════════════════════════════════════════════════════
   SHEETS PAGE RENDERING (sheets.html)
   ══════════════════════════════════════════════════════════ */

function _renderSheetsPage() {
    const root = document.getElementById('sheets-root');
    if (!root) return;

    loadSheets();

    // Check for a pending quote to insert (returning from index.html)
    const pendingQuote = sessionStorage.getItem('sheets_pending_quote');
    if (pendingQuote) {
        sessionStorage.removeItem('sheets_pending_quote');
        try {
            const q = JSON.parse(pendingQuote);
            const savedBlocks = sessionStorage.getItem('sheets_editor_blocks');
            const savedSheetId = sessionStorage.getItem('sheets_editor_id');
            const savedMeta = sessionStorage.getItem('sheets_editor_meta');
            sessionStorage.removeItem('sheets_editor_blocks');
            sessionStorage.removeItem('sheets_editor_id');
            sessionStorage.removeItem('sheets_editor_meta');
            if (savedBlocks && savedSheetId) {
                // Restore blocks in memory and insert the quote
                sheetEditorBlocks = JSON.parse(savedBlocks);
                _insertQuoteBlock(q.elementId, q.text, q.insertIndex);

                // Ensure the sheet exists in the in-memory array
                // (it may not if it was never saved to localStorage)
                let sheet = sheetsData.find(s => s.id === savedSheetId);
                if (!sheet && savedMeta) {
                    const meta = JSON.parse(savedMeta);
                    sheet = {
                        id: meta.id,
                        name: meta.name,
                        createdDate: meta.createdDate,
                        updatedDate: meta.updatedDate,
                        blocks: []
                    };
                    sheetsData.unshift(sheet);
                }

                // Render the editor directly with the restored blocks
                // Do NOT save to localStorage — the user must hit Save
                if (sheet) {
                    window.location.hash = savedSheetId + '/edit';
                    _renderEditorWithBlocks(root, savedSheetId, sheetEditorBlocks);
                    return;
                }
            }
        } catch (e) {
            console.warn('Failed to restore pending quote', e);
        }
    }

    const route = _parseRoute();

    if (route.view === 'list') {
        _renderList(root);
    } else if (route.view === 'view') {
        _renderViewer(root, route.id);
    } else if (route.view === 'edit') {
        _renderEditor(root, route.id);
    }
}

/* ─── List View ─── */
function _renderList(root) {
    root.innerHTML = '';

    _updateTopBar('list');

    const heading = document.createElement('h1');
    heading.className = 'about-heading';
    heading.textContent = 'Sheets';
    root.appendChild(heading);

    const desc = document.createElement('p');
    desc.className = 'notes-description';
    desc.textContent = 'Create documents with notes and book quotes.';
    root.appendChild(desc);

    // New sheet button
    const newBtn = document.createElement('button');
    newBtn.className = 'notes-btn';
    newBtn.innerHTML = _lucideIcon('plus', 14) + ' New Sheet';
    newBtn.addEventListener('click', () => {
        const sheet = {
            id: _generateId(),
            name: 'Untitled Sheet',
            createdDate: _now(),
            updatedDate: _now(),
            blocks: []
        };
        // Don't persist yet — only saved when the user hits Save in the editor
        sheetsData.unshift(sheet);
        // Set hash without triggering a reload, then render directly
        history.pushState(null, '', '#' + sheet.id + '/edit');
        _renderEditorWithBlocks(root, sheet.id, []);
    });
    root.appendChild(newBtn);

    if (sheetsData.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'notes-empty';
        empty.textContent = 'No sheets yet.';
        root.appendChild(empty);
    } else {
        const list = document.createElement('div');
        list.className = 'sheets-list';

        sheetsData.forEach(sheet => {
            const card = document.createElement('div');
            card.className = 'note-card note-card-clickable';

            const title = document.createElement('div');
            title.className = 'sheets-card-title';
            title.textContent = sheet.name;
            card.appendChild(title);

            const meta = document.createElement('div');
            meta.className = 'note-date';
            const quoteCount = sheet.blocks ? sheet.blocks.filter(b => b.type === 'quote').length : 0;
            let metaText = (sheet.updatedDate || sheet.createdDate || '').substring(0, 10);
            if (quoteCount > 0) metaText += ' \u00b7 ' + quoteCount + ' quote' + (quoteCount !== 1 ? 's' : '');
            meta.textContent = metaText;
            card.appendChild(meta);

            card.addEventListener('click', () => {
                window.location.hash = sheet.id;
            });

            list.appendChild(card);
        });

        root.appendChild(list);
    }
}

/* ─── Viewer (Read Mode) ─── */
function _renderViewer(root, sheetId) {
    const sheet = sheetsData.find(s => s.id === sheetId);
    if (!sheet) {
        window.location.hash = '';
        return;
    }

    root.innerHTML = '';

    _updateTopBar('view', sheetId);

    // Title
    const titleRow = document.createElement('div');
    titleRow.className = 'sheets-viewer-header';

    const titleEl = document.createElement('h1');
    titleEl.className = 'about-heading';
    titleEl.textContent = sheet.name;
    titleRow.appendChild(titleEl);

    const actions = document.createElement('div');
    actions.className = 'sheets-viewer-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'sheets-viewer-icon-btn';
    editBtn.title = 'Edit';
    editBtn.innerHTML = _lucideIcon('pencil', 18);
    editBtn.addEventListener('click', () => {
        window.location.hash = sheetId + '/edit';
    });
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'sheets-viewer-icon-btn sheets-viewer-delete-btn';
    deleteBtn.title = 'Delete';
    deleteBtn.innerHTML = _lucideIcon('trash-2', 18);
    deleteBtn.addEventListener('click', () => {
        if (confirm('Delete \u201c' + sheet.name + '\u201d? This cannot be undone.')) {
            sheetsData = sheetsData.filter(s => s.id !== sheetId);
            saveSheets();
            window.location.hash = '';
        }
    });
    actions.appendChild(deleteBtn);

    titleRow.appendChild(actions);
    root.appendChild(titleRow);

    // Date
    const dateLine = document.createElement('div');
    dateLine.className = 'sheets-viewer-date';
    dateLine.textContent = 'Last updated ' + (sheet.updatedDate || sheet.createdDate || '').substring(0, 10);
    root.appendChild(dateLine);

    // Content
    if (!sheet.blocks || sheet.blocks.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'notes-empty';
        empty.textContent = 'This sheet is empty. Tap Edit to start writing.';
        root.appendChild(empty);
    } else {
        const content = document.createElement('div');
        content.className = 'sheets-viewer-content';

        sheet.blocks.forEach(block => {
            if (block.type === 'text') {
                if (!block.content || !block.content.trim()) return;
                const div = document.createElement('div');
                div.className = 'sheets-text-block';
                div.innerHTML = formatNoteText(block.content);
                content.appendChild(div);
            } else if (block.type === 'quote') {
                const quoteBox = document.createElement('div');
                quoteBox.className = 'sheets-quote-block';

                const quoteText = document.createElement('div');
                quoteText.className = 'sheets-quote-text';
                quoteText.textContent = block.text || '';
                quoteBox.appendChild(quoteText);

                if (block.elementId) {
                    const ref = _parseRef(block.elementId);
                    if (ref) {
                        const refLine = document.createElement('div');
                        refLine.className = 'sheets-quote-ref';
                        refLine.textContent = ref;
                        quoteBox.appendChild(refLine);
                    }
                    quoteBox.classList.add('sheets-quote-clickable');
                    quoteBox.addEventListener('click', () => {
                        window.location.href = 'index.html#' + block.elementId;
                    });
                }

                content.appendChild(quoteBox);
            }
        });

        root.appendChild(content);
    }
}

/* Render editor with pre-loaded blocks (used when returning from quote selection) */
function _renderEditorWithBlocks(root, sheetId, blocks) {
    sheetEditorBlocks = blocks;
    _renderEditorUI(root, sheetId);
}

/* ─── Editor (Edit Mode) ─── */
function _renderEditor(root, sheetId) {
    const sheet = sheetsData.find(s => s.id === sheetId);
    if (!sheet) {
        window.location.hash = '';
        return;
    }

    sheetEditorBlocks = JSON.parse(JSON.stringify(sheet.blocks || []));
    _renderEditorUI(root, sheetId);
}

function _renderEditorUI(root, sheetId) {
    const sheet = sheetsData.find(s => s.id === sheetId);
    if (!sheet) return;

    root.innerHTML = '';

    _updateTopBar('edit', sheetId);

    // Title input row
    const titleRow = document.createElement('div');
    titleRow.className = 'sheets-editor-title-row';

    const titleInput = document.createElement('input');
    titleInput.className = 'sheets-title-input';
    titleInput.type = 'text';
    titleInput.value = sheet.name;
    titleInput.placeholder = 'Sheet name...';
    titleRow.appendChild(titleInput);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'notes-btn sheets-save-btn';
    saveBtn.innerHTML = _lucideIcon('check', 14) + ' Save';
    saveBtn.addEventListener('click', () => {
        _saveEditorBlocksFromDOM(root);
        sheet.name = titleInput.value.trim() || 'Untitled Sheet';
        sheet.blocks = sheetEditorBlocks;
        sheet.updatedDate = _now();
        saveSheets();
        window.location.hash = sheetId;
    });
    titleRow.appendChild(saveBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'notes-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
        // Check if the sheet was ever persisted (exists in localStorage)
        const persisted = JSON.parse(localStorage.getItem('sheets') || '[]');
        const wasSaved = persisted.some(s => s.id === sheetId);
        if (!wasSaved) {
            // New sheet that was never saved — discard it
            sheetsData = sheetsData.filter(s => s.id !== sheetId);
            window.location.hash = '';
        } else {
            window.location.hash = sheetId;
        }
    });
    titleRow.appendChild(cancelBtn);

    root.appendChild(titleRow);

    // Editor body
    const body = document.createElement('div');
    body.className = 'sheets-editor-body';
    body.id = 'sheets-editor-body';

    _renderEditorBlocks(body, sheetId);

    root.appendChild(body);
}

/* ── Update the top bar back link based on context ── */
function _updateTopBar(view, sheetId) {
    const bar = document.getElementById('sheets-top-bar');
    if (!bar) return;
    const link = bar.querySelector('a');
    if (!link) return;

    if (view === 'list') {
        link.href = 'index.html';
        link.innerHTML = '<i data-lucide="arrow-left"></i> Back to book';
    } else if (view === 'view') {
        link.href = 'sheets.html';
        link.onclick = (e) => { e.preventDefault(); window.location.hash = ''; };
        link.innerHTML = '<i data-lucide="arrow-left"></i> All sheets';
    } else if (view === 'edit') {
        link.href = 'sheets.html#' + sheetId;
        link.onclick = (e) => { e.preventDefault(); window.location.hash = sheetId; };
        link.innerHTML = '<i data-lucide="arrow-left"></i> Back to sheet';
    }

    // Re-render lucide icons in the bar
    if (typeof lucide !== 'undefined') {
        lucide.createIcons({ root: bar, attrs: { 'stroke-width': '1.75' } });
    }
}

/* ── Save editor state from DOM ── */
function _saveEditorBlocksFromDOM(container) {
    const editorEls = container.querySelectorAll('[data-block-index]');
    editorEls.forEach(el => {
        const idx = parseInt(el.getAttribute('data-block-index'));
        if (isNaN(idx) || idx >= sheetEditorBlocks.length) return;
        const block = sheetEditorBlocks[idx];
        if (block.type === 'text' && el._getPlainText) {
            block.content = el._getPlainText();
        }
    });
}

/* ── Render editor blocks ── */
function _renderEditorBlocks(body, sheetId) {
    body.innerHTML = '';

    if (sheetEditorBlocks.length === 0) {
        sheetEditorBlocks.push({ type: 'text', content: '' });
    }

    sheetEditorBlocks.forEach((block, idx) => {
        if (block.type === 'text') {
            _renderTextBlock(body, block, idx);
        } else if (block.type === 'quote') {
            _renderQuoteBlockEditor(body, block, idx, sheetId);
        }

        // Insert quote button
        const insertBtn = document.createElement('button');
        insertBtn.className = 'sheets-insert-quote-btn';
        insertBtn.innerHTML = _lucideIcon('plus', 14) + ' Insert Quote';
        const capturedIdx = idx;
        insertBtn.addEventListener('click', () => {
            _startQuoteSelection(sheetId, capturedIdx + 1);
        });
        body.appendChild(insertBtn);
    });
}

function _renderTextBlock(body, block, idx) {
    const wrapper = document.createElement('div');
    wrapper.className = 'sheets-editor-block';

    const editor = document.createElement('div');
    editor.className = 'note-editor sheets-text-editor';
    editor.contentEditable = 'true';
    editor.setAttribute('data-placeholder', 'Write here...');
    editor.setAttribute('data-block-index', idx);

    function getPlainText() {
        if (editor.children.length > 0) {
            return Array.from(editor.children)
                .map(el => el.textContent)
                .join('\n');
        }
        return editor.textContent || '';
    }

    editor._getPlainText = getPlainText;

    function render() {
        const text = getPlainText();
        if (!text) { editor.innerHTML = ''; return; }

        const sel = window.getSelection();
        let pos = null;
        if (sel.rangeCount && editor.contains(sel.anchorNode)) {
            const range = sel.getRangeAt(0);
            let lineDiv = range.startContainer;
            while (lineDiv && lineDiv.parentNode !== editor) lineDiv = lineDiv.parentNode;
            if (lineDiv) {
                const lineIndex = Array.from(editor.childNodes).indexOf(lineDiv);
                const lineRange = document.createRange();
                lineRange.selectNodeContents(lineDiv);
                lineRange.setEnd(range.startContainer, range.startOffset);
                pos = { line: lineIndex, ch: lineRange.toString().length };
            }
        }

        editor.innerHTML = formatEditorText(text);

        if (pos) {
            const newSel = window.getSelection();
            const newRange = document.createRange();
            const targetLine = editor.childNodes[pos.line];
            if (targetLine) {
                let current = 0;
                function walk(node) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const end = current + node.length;
                        if (pos.ch <= end) {
                            newRange.setStart(node, pos.ch - current);
                            newRange.collapse(true);
                            return true;
                        }
                        current = end;
                    } else {
                        for (const child of node.childNodes) {
                            if (walk(child)) return true;
                        }
                    }
                    return false;
                }
                if (!walk(targetLine)) {
                    newRange.setStart(targetLine, 0);
                    newRange.collapse(true);
                }
                newSel.removeAllRanges();
                newSel.addRange(newRange);
            }
        }
    }

    editor.addEventListener('input', render);
    editor.addEventListener('paste', (e) => {
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });

    if (block.content) {
        editor.innerHTML = formatEditorText(block.content);
    }

    wrapper.appendChild(editor);
    body.appendChild(wrapper);
}

function _renderQuoteBlockEditor(body, block, idx, sheetId) {
    const wrapper = document.createElement('div');
    wrapper.className = 'sheets-editor-block';

    const quoteBox = document.createElement('div');
    quoteBox.className = 'sheets-quote-block sheets-quote-in-editor';

    const quoteText = document.createElement('div');
    quoteText.className = 'sheets-quote-text';
    quoteText.textContent = block.text || '';
    quoteBox.appendChild(quoteText);

    if (block.elementId) {
        const ref = _parseRef(block.elementId);
        if (ref) {
            const refLine = document.createElement('div');
            refLine.className = 'sheets-quote-ref';
            refLine.textContent = ref;
            quoteBox.appendChild(refLine);
        }
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'sheets-quote-remove-btn';
    removeBtn.innerHTML = _lucideIcon('x', 14);
    removeBtn.title = 'Remove quote';
    removeBtn.addEventListener('click', () => {
        const root = document.getElementById('sheets-root');
        if (root) _saveEditorBlocksFromDOM(root);
        sheetEditorBlocks.splice(idx, 1);
        _mergeAdjacentTextBlocks();
        const editorBody = document.getElementById('sheets-editor-body');
        if (editorBody) _renderEditorBlocks(editorBody, sheetId);
    });
    quoteBox.appendChild(removeBtn);

    wrapper.appendChild(quoteBox);
    body.appendChild(wrapper);
}

function _mergeAdjacentTextBlocks() {
    const merged = [];
    for (const block of sheetEditorBlocks) {
        if (block.type === 'text' && merged.length > 0 && merged[merged.length - 1].type === 'text') {
            const prev = merged[merged.length - 1];
            const a = (prev.content || '').trimEnd();
            const b = (block.content || '').trimStart();
            prev.content = a + (a && b ? '\n' : '') + b;
        } else {
            merged.push(block);
        }
    }
    sheetEditorBlocks = merged;
}

/* ══════════════════════════════════════════════════════════
   QUOTE SELECTION (on index.html)
   ══════════════════════════════════════════════════════════ */

/* Called from the editor: save state, navigate to book */
function _startQuoteSelection(sheetId, insertIndex) {
    // Save current editor blocks to sessionStorage
    const root = document.getElementById('sheets-root');
    if (root) _saveEditorBlocksFromDOM(root);

    // Also save sheet metadata so we can reconstruct a not-yet-persisted sheet
    const sheet = sheetsData.find(s => s.id === sheetId);
    if (sheet) {
        // Capture current title from the input (may have been edited)
        const titleInput = root ? root.querySelector('.sheets-title-input') : null;
        const currentName = titleInput ? titleInput.value.trim() || sheet.name : sheet.name;
        sessionStorage.setItem('sheets_editor_meta', JSON.stringify({
            id: sheet.id,
            name: currentName,
            createdDate: sheet.createdDate,
            updatedDate: sheet.updatedDate
        }));
    }

    sessionStorage.setItem('sheets_editor_blocks', JSON.stringify(sheetEditorBlocks));
    sessionStorage.setItem('sheets_editor_id', sheetId);
    sessionStorage.setItem('sheets_quote_select', JSON.stringify({ sheetId, insertIndex }));

    // Navigate to the book
    window.location.href = 'index.html';
}

/* Called on index.html load: check if we should enter quote-select mode */
function _checkQuoteSelectMode() {
    const flag = sessionStorage.getItem('sheets_quote_select');
    if (!flag) return;

    let selectInfo;
    try { selectInfo = JSON.parse(flag); } catch (e) { return; }

    quoteSelectMode = true;
    document.body.classList.add('sheets-quote-select-mode');

    // Create floating banner
    const banner = document.createElement('div');
    banner.id = 'sheets-select-banner';
    banner.className = 'sheets-select-banner';

    const msg = document.createElement('span');
    msg.className = 'sheets-select-banner-text';
    msg.textContent = 'Tap any sentence to insert as a quote';
    banner.appendChild(msg);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'sheets-select-banner-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
        _exitQuoteSelectMode(selectInfo.sheetId);
    });
    banner.appendChild(cancelBtn);

    document.body.appendChild(banner);
}

function _exitQuoteSelectMode(sheetId) {
    quoteSelectMode = false;
    document.body.classList.remove('sheets-quote-select-mode');

    const banner = document.getElementById('sheets-select-banner');
    if (banner) banner.remove();

    sessionStorage.removeItem('sheets_quote_select');

    // Navigate back to editor
    if (sheetId) {
        window.location.href = 'sheets.html#' + sheetId + '/edit';
    }
}

function _insertQuoteBlock(elementId, text, insertIndex) {
    const quoteBlock = { type: 'quote', elementId, text };

    sheetEditorBlocks.splice(insertIndex, 0, quoteBlock);

    // Ensure text block after
    if (insertIndex >= sheetEditorBlocks.length - 1 ||
        sheetEditorBlocks[insertIndex + 1].type !== 'text') {
        sheetEditorBlocks.splice(insertIndex + 1, 0, { type: 'text', content: '' });
    }
    // Ensure text block before
    if (insertIndex === 0 || sheetEditorBlocks[insertIndex - 1].type !== 'text') {
        sheetEditorBlocks.splice(insertIndex, 0, { type: 'text', content: '' });
    }
}

/* ── Click handler on index.html during quote-select mode ── */
document.addEventListener('click', function (e) {
    if (!quoteSelectMode) return;
    if (!_onBookPage) return;

    if (e.target.closest('#sheets-select-banner')) return;
    if (e.target.closest('#side-pane') || e.target.closest('#left-pane') || e.target.closest('.fab-group')) return;

    let target = e.target;
    while (target && !target.id) target = target.parentElement;
    if (!target || !target.id || !target.id.match(/^pg/)) return;

    e.preventDefault();
    e.stopPropagation();

    _showQuoteConfirm(target.id, target.textContent.trim());
}, true);

// Block double-click in quote-select mode
document.addEventListener('dblclick', function (e) {
    if (quoteSelectMode) { e.preventDefault(); e.stopPropagation(); }
}, true);

function _showQuoteConfirm(elementId, text) {
    const existing = document.getElementById('sheets-quote-confirm');
    if (existing) existing.remove();

    const selectInfo = JSON.parse(sessionStorage.getItem('sheets_quote_select') || '{}');

    const overlay = document.createElement('div');
    overlay.id = 'sheets-quote-confirm';
    overlay.className = 'sheets-confirm-overlay';

    const card = document.createElement('div');
    card.className = 'sheets-confirm-card';

    const label = document.createElement('div');
    label.className = 'notes-section-label';
    label.textContent = 'Insert this quote?';
    card.appendChild(label);

    const preview = document.createElement('div');
    preview.className = 'sheets-quote-block';
    const previewText = document.createElement('div');
    previewText.className = 'sheets-quote-text';
    previewText.textContent = text.length > 300 ? text.substring(0, 300) + '\u2026' : text;
    preview.appendChild(previewText);
    const ref = _parseRef(elementId);
    if (ref) {
        const refLine = document.createElement('div');
        refLine.className = 'sheets-quote-ref';
        refLine.textContent = ref;
        preview.appendChild(refLine);
    }
    card.appendChild(preview);

    const btnRow = document.createElement('div');
    btnRow.className = 'note-btn-row';

    const insertBtn = document.createElement('button');
    insertBtn.className = 'notes-btn sheets-save-btn';
    insertBtn.innerHTML = _lucideIcon('check', 14) + ' Insert';
    insertBtn.addEventListener('click', () => {
        // Store the selected quote in sessionStorage
        sessionStorage.setItem('sheets_pending_quote', JSON.stringify({
            elementId,
            text,
            insertIndex: selectInfo.insertIndex
        }));
        overlay.remove();

        // Clean up select mode and navigate back
        quoteSelectMode = false;
        document.body.classList.remove('sheets-quote-select-mode');
        const banner = document.getElementById('sheets-select-banner');
        if (banner) banner.remove();
        sessionStorage.removeItem('sheets_quote_select');

        window.location.href = 'sheets.html#' + selectInfo.sheetId + '/edit';
    });
    btnRow.appendChild(insertBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'notes-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { overlay.remove(); });
    btnRow.appendChild(cancelBtn);

    card.appendChild(btnRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
}

/* ── Keyboard ── */
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    const confirm = document.getElementById('sheets-quote-confirm');
    if (confirm) { confirm.remove(); return; }

    if (quoteSelectMode) {
        const selectInfo = JSON.parse(sessionStorage.getItem('sheets_quote_select') || '{}');
        _exitQuoteSelectMode(selectInfo.sheetId);
        return;
    }
});

/* ── Hash change on sheets.html re-renders ── */
if (_onSheetsPage) {
    window.addEventListener('hashchange', () => { _renderSheetsPage(); });
}

/* ── Init ── */
window.addEventListener('DOMContentLoaded', () => {
    loadSheets();

    if (_onSheetsPage) {
        _renderSheetsPage();
    }

    if (_onBookPage) {
        _checkQuoteSelectMode();
    }
});

/* ── Public API (for menu link) ── */
window.sheetsModule = {
    getSheets() { loadSheets(); return sheetsData; }
};
