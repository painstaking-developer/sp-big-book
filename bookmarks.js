/**
 * bookmarks.js — Bookmark management
 *
 * Responsibility: add, edit, delete, and display named bookmarks that anchor
 * to sentences in the book; persists to localStorage.
 *
 * Public interface (on window.bookmarks):
 *   bookmarks.addBookmarkInline()  — add bookmark inline in the pane (no modal)
 *   bookmarks.toggleEditMode(e)    — toggle edit/delete mode in pane
 *
 * Listens to: (app event bus)
 */

// bookmarks.js – Bookmarks feature for single-page book app

var bookmarks = (function () {
    'use strict';

    var STORAGE_KEY = 'bookmarks';
    var _editMode = false;

    /* ── Storage ── */

    function _load() {
        try {
            var v = localStorage.getItem(STORAGE_KEY);
            if (v !== null) return JSON.parse(v);
        } catch (e) {}
        return null;
    }

    function _save(bms) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bms)); } catch (e) {}
        _syncBookmarksFile();
    }

    // Build defaults from the first few rows of the book's index
    function _generateDefaults() {
        var defaults = [];
        var rows = document.querySelectorAll('#index .index-chapter-section');
        Array.from(rows).slice(0, 4).forEach(function (row, i) {
            var nameLink = row.querySelector('.chapter-name a');
            var pageLink = row.querySelector('.page-number a');
            if (!nameLink) return;
            var name   = (nameLink.textContent || '').trim().replace(/^Chapter \d+ - /i, '');
            var anchor = nameLink.getAttribute('href');
            var ref    = pageLink ? (pageLink.textContent || '').trim() : '';
            if (name && anchor) {
                defaults.push({ id: 'default-' + i, name: name, anchor: anchor, ref: ref });
            }
        });
        if (defaults.length === 0) {
            defaults.push({ id: 'default-index', name: 'Index', anchor: '#index', ref: '' });
        }
        return defaults;
    }

    function _getAll() {
        var stored = _load();
        if (stored !== null) return stored;
        return [];
    }

    function _uid() {
        return 'bm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    }

    /* ── Folder sync ── */

    function _syncBookmarksFile() {
        if (typeof notesModule !== 'undefined') notesModule.syncAllToFolder();
    }

    /* ── Reference extraction ── */

    // Returns just the page number from the element's enclosing section header
    function _extractRef(el) {
        var section = el.closest('section');
        if (!section) return '';
        var links = section.querySelectorAll('header nav .page-link');
        return links.length ? (links[links.length - 1].textContent || '').trim() : '';
    }

    /* ── CRUD ── */

    function add(name, anchor, ref) {
        var bms = _getAll();
        bms.push({ id: _uid(), name: name.trim(), anchor: anchor, ref: ref || '' });
        _save(bms);
        render();
    }

    function remove(id) {
        _save(_getAll().filter(function (b) { return b.id !== id; }));
        render();
    }

    function rename(id, newName) {
        var bms = _getAll();
        var bm = bms.find(function (b) { return b.id === id; });
        if (bm && newName.trim()) { bm.name = newName.trim(); _save(bms); }
        render();
    }

    function moveUp(id) {
        var bms = _getAll();
        var idx = bms.findIndex(function (b) { return b.id === id; });
        if (idx <= 0) return;
        var tmp = bms[idx - 1]; bms[idx - 1] = bms[idx]; bms[idx] = tmp;
        _save(bms);
        render();
    }

    function moveDown(id) {
        var bms = _getAll();
        var idx = bms.findIndex(function (b) { return b.id === id; });
        if (idx < 0 || idx >= bms.length - 1) return;
        var tmp = bms[idx + 1]; bms[idx + 1] = bms[idx]; bms[idx] = tmp;
        _save(bms);
        render();
    }

    function toggleEditMode(e) {
        if (e) e.preventDefault();
        _editMode = !_editMode;
        render();
    }

    /* ── Render ── */

    function _updateEditBtn() {
        var btn = document.getElementById('bookmarks-edit-btn');
        if (!btn) return;
        btn.textContent = _editMode ? '\u2713 Done' : '\u270e Edit';
    }

    function render() {
        var list = document.getElementById('bookmarks-list');
        if (!list) return;

        _updateEditBtn();

        var bms = _getAll();
        list.innerHTML = '';

        var emptyEl = document.getElementById('bookmarks-empty');
        if (bms.length === 0) {
            if (emptyEl) emptyEl.style.display = '';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        bms.forEach(function (bm, idx) {
            var row = document.createElement('div');
            row.className = 'bookmark-row' + (_editMode ? ' bm-edit' : '');

            var section = document.createElement('div');
            section.className = 'index-chapter-section';

            /* ── Left: move buttons (edit mode only) ── */
            if (_editMode) {
                var moveBtns = document.createElement('span');
                moveBtns.className = 'bm-move-btns';

                var upBtn = document.createElement('button');
                upBtn.className = 'bm-move-btn';
                upBtn.textContent = '\u2191';
                upBtn.title = 'Move up';
                upBtn.disabled = idx === 0;
                upBtn.addEventListener('click', function () { moveUp(bm.id); });

                var downBtn = document.createElement('button');
                downBtn.className = 'bm-move-btn';
                downBtn.textContent = '\u2193';
                downBtn.title = 'Move down';
                downBtn.disabled = idx === bms.length - 1;
                downBtn.addEventListener('click', function () { moveDown(bm.id); });

                moveBtns.appendChild(upBtn);
                moveBtns.appendChild(downBtn);
                section.appendChild(moveBtns);
            }

            /* ── Name (chapter-name side) ── */
            var nameH4 = document.createElement('h4');
            nameH4.className = 'chapter-name';

            if (_editMode) {
                var nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.className = 'bm-name-edit';
                nameInput.value = bm.name;
                var _orig = bm.name;
                nameInput.addEventListener('blur', function () {
                    rename(bm.id, nameInput.value || _orig);
                });
                nameInput.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter')  { e.preventDefault(); nameInput.blur(); }
                    if (e.key === 'Escape') { nameInput.value = _orig; nameInput.blur(); }
                });
                nameH4.appendChild(nameInput);
            } else {
                var nameLink = document.createElement('a');
                nameLink.href = 'index.html' + bm.anchor;
                nameLink.textContent = bm.name;
                nameLink.addEventListener('click', function () { app.emit('pane:close'); });
                nameH4.appendChild(nameLink);
            }
            section.appendChild(nameH4);

            /* ── Dots spacer (hidden in edit mode via CSS) ── */
            var dotsDiv = document.createElement('div');
            dotsDiv.className = 'dots';
            section.appendChild(dotsDiv);

            /* ── Ref / page number (page-number side) ── */
            var refH4 = document.createElement('h4');
            refH4.className = 'page-number';
            var refLink = document.createElement('a');
            refLink.href = 'index.html' + bm.anchor;
            refLink.className = 'page-link';
            refLink.textContent = bm.ref || '';
            refLink.addEventListener('click', function () { app.emit('pane:close'); });
            refH4.appendChild(refLink);
            section.appendChild(refH4);

            /* ── Right: delete button (edit mode only) ── */
            if (_editMode) {
                var delWrap = document.createElement('span');
                delWrap.className = 'bm-delete-wrap';
                var delBtn = document.createElement('button');
                delBtn.className = 'bm-delete-btn';
                delBtn.innerHTML = '&#10005;';
                delBtn.title = 'Delete';
                delBtn.addEventListener('click', function () { remove(bm.id); });
                delWrap.appendChild(delBtn);
                section.appendChild(delWrap);
            }

            row.appendChild(section);
            list.appendChild(row);
        });
    }

    /* ── FAB bookmark button ── */

    function setCurrentHighlight(anchor) {
        var bookmarkDiv = document.getElementById('fab-bookmark-divider');
        var btn = document.getElementById('fab-bookmark-btn');
        var notesDiv = document.getElementById('fab-notes-divider');
        var notesBtn = document.querySelector('.fab-btn-notes');
        if (bookmarkDiv) bookmarkDiv.classList.toggle('visible', !!anchor);
        if (btn) btn.classList.toggle('visible', !!anchor);
        if (notesDiv) notesDiv.classList.toggle('visible', !!anchor);
        if (notesBtn) notesBtn.classList.toggle('visible', !!anchor);
    }

    /* ── Inline add (no modal) ── */

    function addBookmarkInline() {
        var highlighted = document.querySelector('.highlight');
        if (!highlighted || !highlighted.id) return;
        var anchor = '#' + highlighted.id;
        var ref    = _extractRef(highlighted);

        // Use first 3 words (or fewer) as the default name
        var text  = (highlighted.textContent || '').trim().replace(/\s+/g, ' ');
        var name  = text.split(' ').slice(0, 3).join(' ') || 'Bookmark';

        var bms   = _getAll();
        var newId = _uid();
        bms.push({ id: newId, name: name, anchor: anchor, ref: ref || '' });
        _save(bms);

        // Enter edit mode so the new row is editable
        _editMode = true;
        render();

        // Open the bookmarks pane
        if (typeof openSidePane === 'function') openSidePane('bookmarks');

        // Focus the new bookmark's name input so the user can rename it
        setTimeout(function () {
            var list = document.getElementById('bookmarks-list');
            if (!list) return;
            var inputs = list.querySelectorAll('.bm-name-edit');
            if (inputs.length) {
                var last = inputs[inputs.length - 1];
                last.focus();
                last.select();
            }
        }, 60);
    }

    /* ── Init ── */

    function _init() {
        render();
        // Attempt initial sync after notes.js has restored the directory handle
        setTimeout(_syncBookmarksFile, 1500);
    }

    document.addEventListener('DOMContentLoaded', _init);

    app.on('highlight:added', function(el) { setCurrentHighlight(el ? '#' + el.id : null); });
    app.on('highlight:removed', function() { setCurrentHighlight(null); });

    return {
        add:                 add,
        remove:              remove,
        rename:              rename,
        moveUp:              moveUp,
        moveDown:            moveDown,
        render:              render,
        toggleEditMode:      toggleEditMode,
        setCurrentHighlight: setCurrentHighlight,
        addBookmarkInline:   addBookmarkInline,
        syncFile:            _syncBookmarksFile
    };
})();
