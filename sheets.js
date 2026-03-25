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
const _onSharedPage = window.location.pathname.endsWith('shared.html');

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

/* ── URL-safe Base64 encoding (UTF-8 safe) ── */
function _toUrlSafeBase64(str) {
    return btoa(unescape(encodeURIComponent(str)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _fromUrlSafeBase64(b64) {
    b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return decodeURIComponent(escape(atob(b64)));
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

    const shareBtn = document.createElement('button');
    shareBtn.className = 'sheets-viewer-icon-btn';
    shareBtn.title = 'Copy link';
    shareBtn.innerHTML = _lucideIcon('link', 18);
    shareBtn.addEventListener('click', () => { _shareSheet(sheetId, shareBtn); });
    actions.appendChild(shareBtn);

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

    // Dates
    const dateLine = document.createElement('div');
    dateLine.className = 'sheets-viewer-date';
    const created = (sheet.createdDate || '').substring(0, 10);
    const updated = (sheet.updatedDate || '').substring(0, 10);
    dateLine.textContent = 'Created ' + created + (updated && updated !== created ? ' \u00b7 Updated ' + updated : '');
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

/* ─── Share a sheet ─── */
function _shareSheet(sheetId, btnEl) {
    const sheet = sheetsData.find(s => s.id === sheetId);
    if (!sheet) return;

    const blocks = sheet.blocks.map(b =>
        b.type === 'quote' ? { type: 'quote', elementId: b.elementId } : b
    );
    const payload = JSON.stringify({ id: sheet.id, name: sheet.name, blocks: blocks });
    const encoded = _toUrlSafeBase64(payload);
    const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
    const url = window.location.origin + basePath + 'shared.html#sheet/' + encoded;

    navigator.clipboard.writeText(url).then(() => {
        if (btnEl) {
            btnEl.innerHTML = _lucideIcon('check', 18);
            btnEl.classList.add('sheets-link-copied');
            setTimeout(() => {
                btnEl.innerHTML = _lucideIcon('link', 18);
                btnEl.classList.remove('sheets-link-copied');
            }, 1500);
        }
    });
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
        _readDocEditor();
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
        const persisted = JSON.parse(localStorage.getItem('sheets') || '[]');
        const wasSaved = persisted.some(s => s.id === sheetId);
        if (!wasSaved) {
            sheetsData = sheetsData.filter(s => s.id !== sheetId);
            window.location.hash = '';
        } else {
            window.location.hash = sheetId;
        }
    });
    titleRow.appendChild(cancelBtn);

    root.appendChild(titleRow);

    // Document-style editor
    const doc = document.createElement('div');
    doc.className = 'sheets-doc';
    doc.id = 'sheets-doc';

    _buildDocEditor(doc, sheetId);

    root.appendChild(doc);
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

/* ── Document-style editor ── */

function _buildDocEditor(doc, sheetId) {
    doc.innerHTML = '';

    if (sheetEditorBlocks.length === 0) {
        sheetEditorBlocks.push({ type: 'text', content: '' });
    }

    sheetEditorBlocks.forEach((block, idx) => {
        if (block.type === 'text') {
            const ed = createNoteEditor(block.content || '', null);
            const el = ed.container;
            el.className = 'sheets-doc-text';
            el.setAttribute('data-block-index', idx);
            el.setAttribute('data-placeholder', idx === 0 ? 'Start writing...' : 'Continue writing...');
            el._getValue = ed.getValue;
            doc.appendChild(el);
        } else if (block.type === 'quote') {
            const quoteBox = document.createElement('div');
            quoteBox.className = 'sheets-doc-quote';
            quoteBox.setAttribute('data-block-index', idx);
            quoteBox.draggable = true;

            // Drag handle
            const dragHandle = document.createElement('span');
            dragHandle.className = 'sheets-quote-drag-handle';
            dragHandle.innerHTML = _lucideIcon('grip-vertical', 14);
            dragHandle.title = 'Drag to reorder';
            quoteBox.appendChild(dragHandle);

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
                _readDocEditor();
                sheetEditorBlocks.splice(idx, 1);
                _mergeAdjacentTextBlocks();
                _buildDocEditor(doc, sheetId);
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons({ root: doc, attrs: { 'stroke-width': '1.75' } });
                }
            });
            quoteBox.appendChild(removeBtn);

            // Drag events
            quoteBox.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(idx));
                quoteBox.classList.add('sheets-dragging');
                doc._dragSourceIdx = idx;
            });
            quoteBox.addEventListener('dragend', () => {
                quoteBox.classList.remove('sheets-dragging');
                _clearDropIndicators(doc);
                delete doc._dragSourceIdx;
            });

            doc.appendChild(quoteBox);
        }

        // Insert-quote button: show after quote blocks and after the last text block
        const isQuote = block.type === 'quote';
        const isLastBlock = idx === sheetEditorBlocks.length - 1;
        if (isQuote || isLastBlock) {
            const insertRow = document.createElement('div');
            insertRow.className = 'sheets-doc-insert-row';
            const insertBtn = document.createElement('button');
            insertBtn.className = 'sheets-doc-insert-btn';
            insertBtn.innerHTML = _lucideIcon('plus', 12) + ' <span>Insert Quote</span>';
            insertBtn.title = 'Insert book quote';
            const capturedIdx = idx;
            insertBtn.addEventListener('click', () => {
                _startQuoteSelection(sheetId, capturedIdx + 1);
            });
            insertRow.appendChild(insertBtn);
            doc.appendChild(insertRow);
        }
    });

    // Drag-and-drop: allow reordering quotes within the doc
    doc.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const target = _findDropTarget(doc, e.clientY);
        _showDropIndicator(doc, target);
    });

    doc.addEventListener('dragleave', (e) => {
        if (!doc.contains(e.relatedTarget)) _clearDropIndicators(doc);
    });

    doc.addEventListener('drop', (e) => {
        e.preventDefault();
        _clearDropIndicators(doc);
        const fromIdx = doc._dragSourceIdx;
        if (fromIdx === undefined) return;
        const target = _findDropTarget(doc, e.clientY);
        if (target === null) return;

        _readDocEditor();

        // target is the block index we want to insert *before*
        // If dropping in same position or adjacent (no-op), skip
        if (target === fromIdx || target === fromIdx + 1) return;

        const moved = sheetEditorBlocks.splice(fromIdx, 1)[0];
        const insertAt = target > fromIdx ? target - 1 : target;
        sheetEditorBlocks.splice(insertAt, 0, moved);
        _mergeAdjacentTextBlocks();
        // Ensure text blocks surround quotes
        _ensureTextBlocks();
        _buildDocEditor(doc, sheetId);
        if (typeof lucide !== 'undefined') {
            lucide.createIcons({ root: doc, attrs: { 'stroke-width': '1.75' } });
        }
    });

    if (typeof lucide !== 'undefined') {
        lucide.createIcons({ root: doc, attrs: { 'stroke-width': '1.75' } });
    }
}

/* Find which block index to drop before, based on Y position */
function _findDropTarget(doc, clientY) {
    const blocks = doc.querySelectorAll('[data-block-index]');
    for (const el of blocks) {
        const rect = el.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
            return parseInt(el.getAttribute('data-block-index'));
        }
    }
    return sheetEditorBlocks.length; // drop at end
}

function _showDropIndicator(doc, targetIdx) {
    _clearDropIndicators(doc);
    const blocks = doc.querySelectorAll('[data-block-index]');
    let refEl = null;
    for (const el of blocks) {
        if (parseInt(el.getAttribute('data-block-index')) === targetIdx) {
            refEl = el;
            break;
        }
    }

    const indicator = document.createElement('div');
    indicator.className = 'sheets-drop-indicator';
    if (refEl) {
        doc.insertBefore(indicator, refEl);
    } else {
        doc.appendChild(indicator);
    }
}

function _clearDropIndicators(doc) {
    doc.querySelectorAll('.sheets-drop-indicator').forEach(el => el.remove());
}

/* Ensure text blocks exist between and around quotes */
function _ensureTextBlocks() {
    const result = [];
    for (let i = 0; i < sheetEditorBlocks.length; i++) {
        const block = sheetEditorBlocks[i];
        if (block.type === 'quote') {
            // Ensure a text block before if missing
            if (result.length === 0 || result[result.length - 1].type !== 'text') {
                result.push({ type: 'text', content: '' });
            }
            result.push(block);
        } else {
            result.push(block);
        }
    }
    // Ensure a text block at the end
    if (result.length === 0 || result[result.length - 1].type !== 'text') {
        result.push({ type: 'text', content: '' });
    }
    sheetEditorBlocks = result;
}

function _readDocEditor() {
    const doc = document.getElementById('sheets-doc');
    if (!doc) return;

    doc.querySelectorAll('[data-block-index]').forEach(el => {
        const idx = parseInt(el.getAttribute('data-block-index'));
        if (isNaN(idx) || idx >= sheetEditorBlocks.length) return;
        const block = sheetEditorBlocks[idx];
        if (block.type === 'text' && el._getValue) {
            block.content = el._getValue();
        }
    });
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
    _readDocEditor();

    // Also save sheet metadata so we can reconstruct a not-yet-persisted sheet
    const sheet = sheetsData.find(s => s.id === sheetId);
    if (sheet) {
        // Capture current title from the input (may have been edited)
        const titleInput = document.querySelector('.sheets-title-input');
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

    showBottomBanner({
        text: 'Tap any sentence to insert as a quote',
        buttons: [{
            label: 'Cancel',
            onClick: () => { _exitQuoteSelectMode(selectInfo.sheetId); }
        }]
    });
}

function _exitQuoteSelectMode(sheetId) {
    quoteSelectMode = false;
    document.body.classList.remove('sheets-quote-select-mode');

    const banner = document.getElementById('bottom-banner');
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

    if (e.target.closest('#bottom-banner')) return;
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
        const banner = document.getElementById('bottom-banner');
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

/* ══════════════════════════════════════════════════════════
   SHARED PAGE (shared.html) — factory for shared content
   ══════════════════════════════════════════════════════════ */

function _renderSharedPage() {
    const root = document.getElementById('shared-root');
    if (!root) return;

    const hash = window.location.hash.slice(1);
    if (!hash) {
        root.innerHTML = '<p class="notes-empty">No shared content found.</p>';
        return;
    }

    const slashIdx = hash.indexOf('/');
    if (slashIdx === -1) {
        root.innerHTML = '<p class="notes-empty">Invalid shared link.</p>';
        return;
    }

    const type = hash.substring(0, slashIdx);
    const data = hash.substring(slashIdx + 1);

    if (type === 'sheet') {
        _handleSharedSheet(root, data);
    } else {
        root.innerHTML = '<p class="notes-empty">Unknown shared content type.</p>';
    }
}

async function _handleSharedSheet(root, encodedData) {
    let sheetData;
    try {
        const json = _fromUrlSafeBase64(encodedData);
        sheetData = JSON.parse(json);
    } catch (e) {
        root.innerHTML = '<p class="notes-empty">Could not decode shared sheet.</p>';
        return;
    }

    loadSheets();
    const existing = sheetsData.find(s => s.id === sheetData.id);
    if (existing) {
        window.location.href = 'sheets.html#' + existing.id;
        return;
    }

    // Resolve quote texts from per-page ref files
    sheetData.blocks = await _resolveQuoteTexts(sheetData.blocks);

    _renderSharedSheetViewer(root, sheetData);
}

async function _resolveQuoteTexts(blocks) {
    // Collect unique page file names from quote refs
    const pageFiles = new Set();
    blocks.forEach(b => {
        if (b.type === 'quote' && b.elementId) {
            const match = b.elementId.match(/^(pg[^-]+)/);
            if (match) pageFiles.add(match[1]);
        }
    });

    // Fetch only the needed page ref files in parallel
    const refMap = {};
    await Promise.all([...pageFiles].map(async pf => {
        try {
            const resp = await fetch('refs/' + pf + '.json');
            if (resp.ok) Object.assign(refMap, await resp.json());
        } catch (e) { /* ref file missing or offline — fall back to embedded text */ }
    }));

    // Fill in text from ref files
    return blocks.map(b => {
        if (b.type === 'quote' && b.elementId) {
            return { ...b, text: refMap[b.elementId] || '' };
        }
        return b;
    });
}

function _renderSharedSheetViewer(root, sheetData) {
    root.innerHTML = '';

    // Title row with share button
    const titleRow = document.createElement('div');
    titleRow.className = 'sheets-viewer-header';

    const titleEl = document.createElement('h1');
    titleEl.className = 'about-heading';
    titleEl.textContent = sheetData.name || 'Untitled Sheet';
    titleRow.appendChild(titleEl);

    const actions = document.createElement('div');
    actions.className = 'sheets-viewer-actions';

    const saveLabel = document.createElement('span');
    saveLabel.className = 'sheets-shared-save-label';
    saveLabel.innerHTML = 'Viewing shared content<br>Save to your device?';
    actions.appendChild(saveLabel);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'notes-btn sheets-shared-save-btn';
    saveBtn.innerHTML = _lucideIcon('download', 14) + ' Save';
    saveBtn.addEventListener('click', () => { _saveSharedSheet(sheetData); });
    actions.appendChild(saveBtn);

    const shareBtn = document.createElement('button');
    shareBtn.className = 'sheets-viewer-icon-btn';
    shareBtn.title = 'Copy link';
    shareBtn.innerHTML = _lucideIcon('link', 18);
    shareBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
            shareBtn.innerHTML = _lucideIcon('check', 18);
            shareBtn.classList.add('sheets-link-copied');
            setTimeout(() => {
                shareBtn.innerHTML = _lucideIcon('link', 18);
                shareBtn.classList.remove('sheets-link-copied');
            }, 1500);
        });
    });
    actions.appendChild(shareBtn);

    titleRow.appendChild(actions);
    root.appendChild(titleRow);

    // Subtitle
    const subtitle = document.createElement('div');
    subtitle.className = 'sheets-viewer-date';
    subtitle.textContent = 'Shared with you';
    root.appendChild(subtitle);

    // Content
    if (!sheetData.blocks || sheetData.blocks.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'notes-empty';
        empty.textContent = 'This sheet is empty.';
        root.appendChild(empty);
    } else {
        const content = document.createElement('div');
        content.className = 'sheets-viewer-content';

        sheetData.blocks.forEach(block => {
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

function _saveSharedSheet(sheetData) {
    loadSheets();

    const newSheet = {
        id: _generateId(),
        name: sheetData.name || 'Untitled Sheet',
        createdDate: _now(),
        updatedDate: _now(),
        blocks: sheetData.blocks || []
    };

    sheetsData.unshift(newSheet);
    saveSheets();

    window.location.href = 'sheets.html#' + newSheet.id;
}

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

    if (_onSharedPage) {
        _renderSharedPage();
    }
});

/* ── Public API (for menu link) ── */
window.sheetsModule = {
    getSheets() { loadSheets(); return sheetsData; }
};
