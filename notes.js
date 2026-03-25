/**
 * notes.js — Annotation feature
 *
 * Responsibility: create, read, update, delete per-sentence notes stored in
 * localStorage; optional folder-sync via File System Access API.
 *
 * Public interface (on window.notes):
 *   notes.renderPane(elementId)   — open pane for a specific sentence
 *   notes.renderAllNotes()        — open the all-notes view
 *   notes.closePane()             — close the notes pane
 *   notes.exportData()             — download all data as .json
 *   notes.importData()             — import data from a .json file
 *   notes.syncToFolder()          — connect a folder for auto-sync
 *   notes.disconnectFolder()      — disconnect the sync folder
 *
 * Also reads: window.app (event bus, defined in this file)
 * Emits: highlight:added, highlight:removed, pane:open-notes, fab:update-expanded
 */

/* ── Lucide icon helper ── */
function _lucideIcon(name, size) {
    var tmp = document.createElement('span');
    tmp.innerHTML = '<i data-lucide="' + name + '"></i>';
    if (typeof lucide !== 'undefined') {
        lucide.createIcons({ root: tmp, attrs: { width: String(size), height: String(size), 'stroke-width': '1.75' } });
    }
    return tmp.innerHTML;
}

/* ── Cross-module event bus ── */
window.app = (function () {
    const h = {};
    return {
        on(e, fn) { (h[e] || (h[e] = [])).push(fn); },
        emit(e, d) { (h[e] || []).slice().forEach(fn => fn(d)); }
    };
})();

const notesEnabled = true;
let currentNoteContent = '';
let notesById = {};
let syncDirHandle = null;
let currentNoteElementId = '';
let currentHighlightedId = null;

// IndexedDB helpers for persisting the directory handle across sessions
function openSyncDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('notesSyncDB', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('handles');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveDirHandle(handle) {
    const db = await openSyncDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'syncDir');
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

async function loadDirHandle() {
    const db = await openSyncDB();
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get('syncDir');
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

async function clearDirHandle() {
    const db = await openSyncDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').delete('syncDir');
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

window.addEventListener('load', async () => {
    const storedNotes = localStorage.getItem('notesById');
    if (storedNotes) {
        try {
            notesById = JSON.parse(storedNotes);
            notes.placeNoteToggles();
        } catch (e) {
            console.warn('Could not parse stored notes; starting fresh.', e);
            localStorage.removeItem('notesById');
        }
    }

    // Restore folder sync handle from previous session
    if ('showDirectoryPicker' in window) {
        try {
            const handle = await loadDirHandle();
            if (handle) {
                const perm = await handle.queryPermission({ mode: 'readwrite' });
                if (perm === 'granted') {
                    syncDirHandle = handle;
                    updateSyncButton();
                }
            }
        } catch (e) {
            console.log('Could not restore sync folder:', e);
        }
    }
});

/* Rich-text functions (formatNoteText, createNoteEditor, etc.) are in richtext.js */

const notesModule = {
  addEmojiAfterElement(element, emoji = '\u2710') {
    if (!notesEnabled) return;
    if (!element.querySelector('.notes-toggle')) {
        const emojiSpan = document.createElement('span');
        emojiSpan.innerHTML = _lucideIcon('pencil-line', 13);
        emojiSpan.className = 'notes-toggle';
        element.insertAdjacentElement('afterend', emojiSpan);
    }
  },

  removeEmojiAfterElement() {
      if (!notesEnabled) return;

      const emojiElements = document.querySelectorAll('.notes-toggle');
      emojiElements.forEach(emoji => {
          const previousElement = emoji.previousElementSibling;
          if (previousElement && !notesById.hasOwnProperty(previousElement.id)) {
              emoji.remove();
          }
      });
    },

  elementAlreadyHasToggleBtn(element) {
    const nextSibling = element.nextElementSibling;
    return nextSibling && nextSibling.classList.contains('notes-toggle');
  },

  highlightAdded(element) {
    if (!notesEnabled) return;
    currentHighlightedId = element.id;
    updateFabNotesLabel(element.id);
  },

  highlightRemoved(highlighted) {
    if (!notesEnabled) return;
    currentHighlightedId = null;
    updateFabNotesLabel(null);
  },

  openPane() {
    app.emit('pane:open-notes');
    const label = document.getElementById('fab-notes-label');
    if (label) { label.classList.remove('active'); label.textContent = ''; }
    app.emit('fab:update-expanded');
  },

  closePane() {
    app.emit('pane:close');
    currentNoteElementId = '';
    currentNoteContent = '';
    if (currentHighlightedId) updateFabNotesLabel(currentHighlightedId);
  },

  parseElementRef(elementId) {
    const parts = {};
    const pgMatch = elementId.match(/pg(.+?)(?=-par|$)/);
    const parMatch = elementId.match(/par(\d+)/);
    const senMatch = elementId.match(/sen(\d+)/);
    if (pgMatch) parts.page = pgMatch[1].replace(/_/g, ' ');
    if (parMatch) parts.paragraph = parMatch[1];
    if (senMatch) parts.sentence = senMatch[1];
    return parts;
  },

  buildQuoteBox(elementId) {
    const element = document.getElementById(elementId);
    const quoteText = element ? element.textContent.trim() : elementId;

    const quoteBox = document.createElement('div');
    quoteBox.className = 'notes-quote-box notes-quote-clickable';

    const text = document.createElement('div');
    text.className = 'notes-quote-text';
    text.textContent = quoteText;
    quoteBox.appendChild(text);

    const ref = notesModule.parseElementRef(elementId);
    if (ref.page) {
        const refLine = document.createElement('div');
        refLine.className = 'notes-quote-ref';
        const parts = [];
        parts.push('Page ' + ref.page);
        if (ref.paragraph) parts.push('Paragraph ' + ref.paragraph);
        if (ref.sentence) parts.push('Sentence ' + ref.sentence);
        refLine.textContent = parts.join(' / ');
        quoteBox.appendChild(refLine);
    }

    quoteBox.addEventListener('click', () => {
        notesModule.closePane();
        window.location.hash = elementId;
    });

    return quoteBox;
  },

  renderPane(elementId, expandIndex) {
    currentNoteElementId = elementId;
    currentNoteContent = '';
    const container = document.getElementById('notes-pane-content');
    container.innerHTML = '';

    // Quote box
    container.appendChild(notesModule.buildQuoteBox(elementId));

    // Existing notes
    if (notesById[elementId] && notesById[elementId].length > 0) {
        const notesForElement = notesById[elementId];

        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.alignItems = 'center';
        headerRow.style.marginBottom = '8px';

        const sectionLabel = document.createElement('div');
        sectionLabel.className = 'notes-section-label';
        sectionLabel.textContent = notesForElement.length === 1 ? '1 Note' : notesForElement.length + ' Notes';
        headerRow.appendChild(sectionLabel);

        if (notesForElement.length > 1) {
            const expandAllBtn = document.createElement('button');
            expandAllBtn.textContent = 'Expand All';
            expandAllBtn.className = 'notes-expand-all';
            expandAllBtn.addEventListener('click', () => {
                const allContent = container.querySelectorAll('.note-card-body');
                const allExpanded = Array.from(allContent).every(el => el.classList.contains('note-expanded'));
                allContent.forEach(el => {
                    if (allExpanded) el.classList.remove('note-expanded');
                    else el.classList.add('note-expanded');
                });
                expandAllBtn.textContent = allExpanded ? 'Expand All' : 'Collapse All';
            });
            headerRow.appendChild(expandAllBtn);
        }

        container.appendChild(headerRow);

        notesForElement.forEach((note, index) => {
            const card = notesModule.renderNoteItem(note, index, elementId);
            if (expandIndex === index) {
                card.querySelector('.note-card-body').classList.add('note-expanded');
            }
            container.appendChild(card);
        });

        const divider = document.createElement('hr');
        divider.className = 'notes-divider';
        container.appendChild(divider);
    }

    // New note form
    const addLabel = document.createElement('div');
    addLabel.className = 'notes-section-label';
    addLabel.textContent = 'Add a Note';
    container.appendChild(addLabel);

    const editor = createNoteEditor('', (value) => { currentNoteContent = value; });
    container.appendChild(editor.container);

    const msg = document.createElement('small');
    msg.id = 'note-message';
    msg.textContent = '';
    container.appendChild(msg);

    const btnRow = document.createElement('div');
    btnRow.classList.add('note-btn-row');

    const saveBtn = document.createElement('button');
    saveBtn.id = 'note-save-btn';
    saveBtn.className = 'notes-btn';
    const saveIcon = document.createElement('span');
    saveIcon.className = 'notes-btn-icon';
    saveIcon.innerHTML = _lucideIcon('check', 14);
    saveBtn.appendChild(saveIcon);
    saveBtn.appendChild(document.createTextNode('Save'));
    saveBtn.addEventListener('click', () => notesModule.saveNote());
    btnRow.appendChild(saveBtn);

    container.appendChild(btnRow);

    const allLink = document.createElement('a');
    allLink.className = 'notes-see-all';
    allLink.textContent = 'See all notes';
    allLink.href = '#';
    allLink.addEventListener('click', (e) => {
        e.preventDefault();
        notesModule.renderAllNotes();
    });
    container.appendChild(allLink);

    notesModule.openPane();
  },

  toggleNoteContent(targetElement) {
    const previousElement = targetElement.previousElementSibling;
    if (previousElement) {
        const elementId = previousElement.id;
        // If pane is already open for this element, close it
        if (document.getElementById('side-pane').classList.contains('active') && currentNoteElementId === elementId) {
            notesModule.closePane();
            return;
        }
        notesModule.renderPane(elementId);
    }
  },

  renderNoteItem(note, index, elementId) {
    const card = document.createElement('div');
    card.classList.add('note-card');

    const body = document.createElement('div');
    body.classList.add('note-card-body');
    body.innerHTML = formatNoteText(note.contents);
    body.addEventListener('click', () => {
        body.classList.toggle('note-expanded');
    });
    card.appendChild(body);

    const footer = document.createElement('div');
    footer.classList.add('note-card-footer');

    const dateEl = document.createElement('span');
    dateEl.classList.add('note-date');
    dateEl.textContent = note.createdDate ? note.createdDate.substring(0, 10) : '';
    footer.appendChild(dateEl);

    const actions = document.createElement('div');
    actions.classList.add('note-card-actions');

    const copyBtn = document.createElement('span');
    copyBtn.classList.add('note-action-btn');
    copyBtn.title = 'Copy';
    copyBtn.innerHTML = _lucideIcon('copy', 14);
    copyBtn.addEventListener('click', () => {
        const element = document.getElementById(elementId);
        const quoteText = element ? element.textContent.trim() : '';
        const ref = notesModule.parseElementRef(elementId);
        const parts = [];
        if (ref.page) parts.push('Page ' + ref.page);
        if (ref.paragraph) parts.push('Paragraph ' + ref.paragraph);
        if (ref.sentence) parts.push('Sentence ' + ref.sentence);
        const cleanQuote = quoteText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        let text = '';
        if (cleanQuote) text += '> ' + cleanQuote + '\n';
        if (parts.length) text += parts.join(' / ') + '\n';
        if (note.createdDate) text += note.createdDate + '\n';
        text += '\n' + note.contents;
        navigator.clipboard.writeText(text).then(() => {
            copyBtn.innerHTML = _lucideIcon('check', 14);
            setTimeout(() => { copyBtn.innerHTML = _lucideIcon('copy', 14); }, 1500);
        });
    });
    actions.appendChild(copyBtn);

    const editBtn = document.createElement('span');
    editBtn.classList.add('note-action-btn');
    editBtn.title = 'Edit';
    editBtn.innerHTML = _lucideIcon('pencil', 14);
    editBtn.addEventListener('click', () => {
        notesModule.enterEditMode(elementId, index);
    });
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('span');
    deleteBtn.classList.add('note-action-btn', 'note-action-delete');
    deleteBtn.title = 'Delete';
    deleteBtn.innerHTML = _lucideIcon('trash-2', 14);
    deleteBtn.addEventListener('click', () => {
        if (confirm('Delete this note? This action cannot be undone.')) {
            notesModule.deleteNote(elementId, index);
            notesModule.renderPane(elementId);
        }
    });
    actions.appendChild(deleteBtn);

    footer.appendChild(actions);
    card.appendChild(footer);
    return card;
  },

  enterEditMode(elementId, noteIndex) {
    const note = notesById[elementId][noteIndex];
    const container = document.getElementById('notes-pane-content');
    container.innerHTML = '';

    // Quote box (always shown)
    container.appendChild(notesModule.buildQuoteBox(elementId));

    const heading = document.createElement('h4');
    heading.textContent = 'Edit Note';
    container.appendChild(heading);

    const editor = createNoteEditor(note.contents);
    container.appendChild(editor.container);

    const msg = document.createElement('small');
    msg.id = 'note-message';
    msg.textContent = '';
    container.appendChild(msg);

    const btnRow = document.createElement('div');
    btnRow.classList.add('note-btn-row');

    const saveBtn = document.createElement('button');
    saveBtn.className = 'notes-btn';
    const saveIcon = document.createElement('span');
    saveIcon.className = 'notes-btn-icon';
    saveIcon.innerHTML = _lucideIcon('check', 14);
    saveBtn.appendChild(saveIcon);
    saveBtn.appendChild(document.createTextNode('Save'));
    saveBtn.addEventListener('click', () => {
        const newContent = editor.getValue().trim();
        if (!newContent) {
            msg.textContent = 'Please write something first.';
            msg.style.color = 'red';
            return;
        }
        notesById[elementId][noteIndex].contents = newContent;
        localStorage.setItem('notesById', JSON.stringify(notesById));
        notesModule.syncAllToFolder();
        notesModule.renderPane(elementId);
    });
    btnRow.appendChild(saveBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'notes-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
        notesModule.renderPane(elementId);
    });
    btnRow.appendChild(cancelBtn);

    container.appendChild(btnRow);
    editor.focus();
  },

  async syncAllToFolder() {
    if (!syncDirHandle) return;
    try {
        const data = {
            notes: notesById,
            bookmarks: JSON.parse(localStorage.getItem('bookmarks') || '[]'),
            highlights: JSON.parse(localStorage.getItem('highlightsData') || '{}'),
            sheets: JSON.parse(localStorage.getItem('sheets') || '[]'),
        };
        const fileHandle = await syncDirHandle.getFileHandle('data.json', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
    } catch (err) {
        console.error('Sync error:', err);
    }
  },

  saveNote() {
    const currentDate = getFormattedDateTime();
    const elementId = currentNoteElementId;

    if (!currentNoteContent.trim()) {
        const noteMsg = document.getElementById('note-message');
        noteMsg.textContent = 'Please write something first.';
        noteMsg.style.color = 'red';
        return;
    }

    if (!notesById[elementId]) {
        notesById[elementId] = [];
    }

    notesById[elementId].push({
        contents: currentNoteContent,
        createdDate: currentDate,
        id: elementId
    });

    localStorage.setItem('notesById', JSON.stringify(notesById));
    currentNoteContent = '';

    notesModule.placeNoteToggles();
    notesModule.syncAllToFolder();
    notesModule.renderPane(elementId);
    if (currentHighlightedId) updateFabNotesLabel(currentHighlightedId);
  },

  deleteNote(elementId, noteIndex) {
    if (notesById[elementId]) {
        notesById[elementId].splice(noteIndex, 1);
        if (notesById[elementId].length === 0) {
            delete notesById[elementId];
            // Remove the toggle emoji if no notes remain
            const element = document.getElementById(elementId);
            if (element) {
                const nextSibling = element.nextElementSibling;
                if (nextSibling && nextSibling.classList.contains('notes-toggle')) {
                    nextSibling.remove();
                }
            }
        }
        localStorage.setItem('notesById', JSON.stringify(notesById));
        notesModule.syncAllToFolder();
        if (currentHighlightedId) updateFabNotesLabel(currentHighlightedId);
    }
  },

  exportData() {
    const data = {
        notes: notesById,
        bookmarks: JSON.parse(localStorage.getItem('bookmarks') || '[]'),
        highlights: JSON.parse(localStorage.getItem('highlightsData') || '{}'),
        sheets: JSON.parse(localStorage.getItem('sheets') || '[]'),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            let data;
            try { data = JSON.parse(event.target.result); }
            catch (e) { alert('Could not parse file.'); return; }

            let noteCount = 0, bookmarkCount = 0, highlightCount = 0;

            if (data.notes) {
                for (const [elementId, notesList] of Object.entries(data.notes)) {
                    if (!notesById[elementId]) notesById[elementId] = [];
                    notesList.forEach(note => {
                        const exists = notesById[elementId].some(
                            n => n.contents === note.contents && n.createdDate === note.createdDate
                        );
                        if (!exists) { notesById[elementId].push(note); noteCount++; }
                    });
                }
                localStorage.setItem('notesById', JSON.stringify(notesById));
                notesModule.placeNoteToggles();
            }

            if (data.bookmarks) {
                const existing = JSON.parse(localStorage.getItem('bookmarks') || '[]');
                data.bookmarks.forEach(bm => {
                    if (!existing.some(b => b.anchor === bm.anchor)) {
                        existing.push(bm);
                        bookmarkCount++;
                    }
                });
                localStorage.setItem('bookmarks', JSON.stringify(existing));
                if (window.bookmarks) bookmarks.render();
            }

            if (data.highlights && window.highlightsModule) {
                highlightCount = window.highlightsModule.mergeAndRestore(data.highlights);
            }

            let sheetCount = 0;
            if (data.sheets) {
                const existing = JSON.parse(localStorage.getItem('sheets') || '[]');
                data.sheets.forEach(sheet => {
                    if (!existing.some(s => s.id === sheet.id)) {
                        existing.push(sheet);
                        sheetCount++;
                    }
                });
                localStorage.setItem('sheets', JSON.stringify(existing));
            }

            alert(`Imported ${noteCount} note(s), ${bookmarkCount} bookmark(s), ${highlightCount} highlight(s), ${sheetCount} sheet(s).`);
        };
        reader.readAsText(file);
    });
    input.click();
  },

  async syncToFolder() {
    if (!('showDirectoryPicker' in window)) {
        alert('Your browser does not support folder sync. Try Chrome or Edge.');
        return;
    }

    try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        syncDirHandle = dirHandle;
        await saveDirHandle(dirHandle);
        updateSyncButton();

        await notesModule.syncAllToFolder();

        alert(`Folder sync enabled. Notes will auto-save to this folder.`);
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Folder sync error:', err);
            alert('Error syncing to folder.');
        }
    }
  },

  async disconnectFolder() {
    if (!confirm('Disconnect folder sync? Notes will no longer auto-save to the folder. Your existing notes in the browser and any files already written will not be deleted.')) {
        return;
    }
    syncDirHandle = null;
    await clearDirHandle();
    updateSyncButton();
  },

  renderAllNotes() {
    const container = document.getElementById('notes-pane-content');
    container.innerHTML = '';

    const desc = document.createElement('p');
    desc.className = 'notes-description';
    desc.textContent = 'Double-click any sentence to highlight it, then tap the \u2710 icon to add a note.';
    container.appendChild(desc);

    // Flatten all notes with their elementId and original index
    const allNotes = [];
    for (const [elementId, notesList] of Object.entries(notesById)) {
        notesList.forEach((note, index) => {
            allNotes.push({ note, elementId, index });
        });
    }

    if (allNotes.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'notes-empty';
        empty.textContent = 'No notes yet.';
        container.appendChild(empty);
        notesModule.openPane();
        return;
    }

    // Sort by most recent first
    allNotes.sort((a, b) => (b.note.createdDate || '').localeCompare(a.note.createdDate || ''));

    const label = document.createElement('div');
    label.className = 'notes-section-label';
    label.textContent = allNotes.length === 1 ? '1 Note' : allNotes.length + ' Notes';
    container.appendChild(label);

    allNotes.forEach(({ note, elementId, index }) => {
        const card = document.createElement('div');
        card.classList.add('note-card', 'note-card-clickable');

        // Inline quote context
        const quoteCtx = document.createElement('div');
        quoteCtx.className = 'note-card-quote';
        const element = document.getElementById(elementId);
        const quoteText = element ? element.textContent.trim() : elementId;
        quoteCtx.textContent = quoteText;

        const ref = notesModule.parseElementRef(elementId);
        if (ref.page) {
            const refSpan = document.createElement('span');
            refSpan.className = 'note-card-quote-ref';
            const parts = [];
            parts.push('Page ' + ref.page);
            if (ref.paragraph) parts.push('Par. ' + ref.paragraph);
            if (ref.sentence) parts.push('Sen. ' + ref.sentence);
            refSpan.textContent = ' \u2014 ' + parts.join(' / ');
            quoteCtx.appendChild(refSpan);
        }
        card.appendChild(quoteCtx);

        // Note body
        const body = document.createElement('div');
        body.classList.add('note-card-body');
        body.innerHTML = formatNoteText(note.contents);
        card.appendChild(body);

        // Footer (date only)
        const footer = document.createElement('div');
        footer.classList.add('note-card-footer');

        const dateEl = document.createElement('span');
        dateEl.classList.add('note-date');
        dateEl.textContent = note.createdDate ? note.createdDate.substring(0, 10) : '';
        footer.appendChild(dateEl);

        card.appendChild(footer);

        // Clicking the card opens the per-quote pane with this note expanded
        card.addEventListener('click', () => {
            notesModule.renderPane(elementId, index);
        });

        container.appendChild(card);
    });

    notesModule.openPane();
  },

  placeNoteToggles() {
    Object.keys(notesById).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            if (!notes.elementAlreadyHasToggleBtn(element)) {
                notesModule.addEmojiAfterElement(element);
            }
        }
    });
  }
};

window.notes = notesModule;

// Event listener for the emoji button
document.addEventListener('click', (event) => {
    if (!notesEnabled) return;
    if (event.target.classList.contains('notes-toggle')) {
        notesModule.toggleNoteContent(event.target);
    }
});

function getFormattedDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function updateSyncButton() {
  const syncCard = document.getElementById('sync-folder-card');
  const syncStatus = document.getElementById('sync-status');
  if (!syncCard) return;

  if (syncDirHandle) {
    syncCard.style.display = 'none';
    if (syncStatus) {
      syncStatus.style.display = '';
      const folderNameEl = document.getElementById('sync-folder-name');
      if (folderNameEl) folderNameEl.textContent = syncDirHandle.name;
    }
  } else {
    syncCard.style.display = '';
    if (syncStatus) syncStatus.style.display = 'none';
  }
}

function updateFabNotesLabel(elementId) {
    const label = document.getElementById('fab-notes-label');
    if (!label) return;

    if (!elementId) {
        label.classList.remove('active');
        label.textContent = '';
        app.emit('fab:update-expanded');
        return;
    }

    app.emit('fab:update-expanded');
}

function handleFabNotesClick() {
    if (currentHighlightedId) {
        notesModule.renderPane(currentHighlightedId);
    } else {
        notesModule.renderAllNotes();
    }
}

app.on('highlight:added', el => notesModule.highlightAdded(el));
app.on('highlight:removed', el => notesModule.highlightRemoved(el));

/* ══════════════════════════════════════════════════════════
   Bottom banner / toast message utility
   ══════════════════════════════════════════════════════════ */

/**
 * Show an interactive bottom banner with text and action buttons.
 * options: { text, buttons: [{ label, icon?, className?, onClick }] }
 * Returns the banner element (remove it manually when done).
 */
function showBottomBanner(options) {
    const existing = document.getElementById('bottom-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'bottom-banner';
    banner.className = 'bottom-banner';

    const msg = document.createElement('span');
    msg.className = 'bottom-banner-text';
    msg.textContent = options.text;
    banner.appendChild(msg);

    if (options.buttons) {
        options.buttons.forEach(btn => {
            const button = document.createElement('button');
            button.className = 'bottom-banner-btn' + (btn.className ? ' ' + btn.className : '');
            button.innerHTML = (btn.icon ? _lucideIcon(btn.icon, 14) + ' ' : '') + btn.label;
            button.addEventListener('click', btn.onClick);
            banner.appendChild(button);
        });
    }

    document.body.appendChild(banner);
    return banner;
}

/**
 * Show a temporary bottom message that auto-dismisses.
 * type: 'success' | 'error' | 'info'
 * duration: milliseconds (default 3000)
 * Returns the banner element.
 */
function showBottomMessage(text, type, duration) {
    duration = duration || 3000;
    const existing = document.getElementById('bottom-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'bottom-banner';
    banner.className = 'bottom-banner bottom-banner-' + (type || 'info');

    const msg = document.createElement('span');
    msg.className = 'bottom-banner-text';
    msg.textContent = text;
    banner.appendChild(msg);

    document.body.appendChild(banner);
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, duration);
    return banner;
}
