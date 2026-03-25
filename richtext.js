/**
 * richtext.js — Shared rich-text formatting and editor primitives
 *
 * Used by both notes.js (form-style editor) and sheets.js (document-style editor).
 * Must be loaded before notes.js and sheets.js.
 *
 * Public API (all on window):
 *   formatNoteText(text)           — markdown-ish text → display HTML
 *   applyInlineFormat(text)        — inline *bold* _italic_ ~strike~ `highlight`
 *   escapeHtml(text)               — escape < > &
 *   formatEditorText(text)         — markdown-ish text → live-editor HTML (with markers)
 *   applyEditorInlineFormat(text)  — inline formatting with visible syntax markers
 *   createNoteEditor(initial, cb)  — create a form-style contentEditable editor
 */

/* ── Display formatting (markdown → HTML) ── */

function formatNoteText(text) {
    let escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const lines = escaped.split('\n');
    let html = '';
    let inUl = false;
    let inOl = false;
    let inBlockquote = false;

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('&gt; ')) {
            if (inUl) { html += '</ul>'; inUl = false; }
            if (inOl) { html += '</ol>'; inOl = false; }
            if (!inBlockquote) {
                html += '<blockquote class="note-blockquote">';
                inBlockquote = true;
            }
            html += applyInlineFormat(trimmed.substring(5)) + '<br>';
            continue;
        }

        if (inBlockquote) { html += '</blockquote>'; inBlockquote = false; }

        if (trimmed.startsWith('- ')) {
            if (!inUl) {
                if (inOl) { html += '</ol>'; inOl = false; }
                html += '<ul>';
                inUl = true;
            }
            html += '<li>' + applyInlineFormat(trimmed.substring(2)) + '</li>';
            continue;
        }

        const olMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
        if (olMatch) {
            if (!inOl) {
                if (inUl) { html += '</ul>'; inUl = false; }
                html += '<ol>';
                inOl = true;
            }
            html += '<li>' + applyInlineFormat(olMatch[2]) + '</li>';
            continue;
        }

        if (inUl) { html += '</ul>'; inUl = false; }
        if (inOl) { html += '</ol>'; inOl = false; }

        if (trimmed === '') {
            html += '<br>';
        } else {
            html += applyInlineFormat(trimmed) + '<br>';
        }
    }

    if (inUl) html += '</ul>';
    if (inOl) html += '</ol>';
    if (inBlockquote) html += '</blockquote>';

    return html.replace(/<br>$/, '');
}

function applyInlineFormat(text) {
    const codes = [];
    text = text.replace(/`([^`]+)`/g, (_, c) => {
        codes.push(c);
        return '\x00C' + (codes.length - 1) + '\x00';
    });

    text = text.replace(/\*([^\*]+)\*/g, '<strong>$1</strong>');
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
    text = text.replace(/~([^~]+)~/g, '<del>$1</del>');

    text = text.replace(/\x00C(\d+)\x00/g, (_, i) => '<mark>' + codes[parseInt(i)] + '</mark>');

    return text;
}

/* ── Utilities ── */

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/* ── Live-editor formatting (with syntax markers) ── */

function formatEditorText(text) {
    const lines = text.split('\n');
    return lines.map(line => {
        if (line === '') return '<div><br></div>';

        const bqMatch = line.match(/^> (.*)/);
        if (bqMatch) {
            return '<div class="note-editor-bq"><span class="note-editor-mark">&gt; </span>' + applyEditorInlineFormat(escapeHtml(bqMatch[1])) + '</div>';
        }

        const ulMatch = line.match(/^- (.*)/);
        if (ulMatch) {
            return '<div><span class="note-editor-mark">- </span>' + applyEditorInlineFormat(escapeHtml(ulMatch[1])) + '</div>';
        }

        const olMatch = line.match(/^(\d+)\. (.*)/);
        if (olMatch) {
            const prefix = escapeHtml(olMatch[1] + '. ');
            return '<div><span class="note-editor-mark">' + prefix + '</span>' + applyEditorInlineFormat(escapeHtml(olMatch[2])) + '</div>';
        }

        return '<div>' + applyEditorInlineFormat(escapeHtml(line)) + '</div>';
    }).join('');
}

function applyEditorInlineFormat(text) {
    const codes = [];
    text = text.replace(/`([^`]+)`/g, (_, c) => {
        codes.push(c);
        return '\x00C' + (codes.length - 1) + '\x00';
    });

    text = text.replace(/\*([^\*]+)\*/g, '<span class="note-editor-mark">*</span><strong>$1</strong><span class="note-editor-mark">*</span>');
    text = text.replace(/_([^_]+)_/g, '<span class="note-editor-mark">_</span><em>$1</em><span class="note-editor-mark">_</span>');
    text = text.replace(/~([^~]+)~/g, '<span class="note-editor-mark">~</span><del>$1</del><span class="note-editor-mark">~</span>');

    text = text.replace(/\x00C(\d+)\x00/g, (_, i) => '<span class="note-editor-mark">`</span><mark>' + codes[parseInt(i)] + '</mark><span class="note-editor-mark">`</span>');

    return text;
}

/* ── Form-style editor (used by notes) ── */

function createNoteEditor(initialValue, onInput) {
    const editor = document.createElement('div');
    editor.className = 'note-editor';
    editor.contentEditable = 'true';
    editor.setAttribute('data-placeholder', 'Write your note here...');

    function getPlainText() {
        if (editor.children.length > 0) {
            return Array.from(editor.children)
                .map(el => el.textContent)
                .join('\n');
        }
        return editor.textContent || '';
    }

    function saveCursorPos() {
        const sel = window.getSelection();
        if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return null;
        const range = sel.getRangeAt(0);

        if (range.startContainer === editor) {
            return { line: Math.min(range.startOffset, editor.children.length - 1), ch: 0 };
        }

        let lineDiv = range.startContainer;
        while (lineDiv && lineDiv.parentNode !== editor) {
            lineDiv = lineDiv.parentNode;
        }
        if (!lineDiv) return { line: 0, ch: 0 };

        const lineIndex = Array.from(editor.childNodes).indexOf(lineDiv);

        const lineRange = document.createRange();
        lineRange.selectNodeContents(lineDiv);
        lineRange.setEnd(range.startContainer, range.startOffset);
        const charOffset = lineRange.toString().length;

        return { line: lineIndex, ch: charOffset };
    }

    function restoreCursorPos(pos) {
        if (!pos) return;
        const sel = window.getSelection();
        const range = document.createRange();

        const lineDiv = editor.childNodes[pos.line];
        if (!lineDiv) {
            range.selectNodeContents(editor);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
            return;
        }

        let current = 0;
        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const end = current + node.length;
                if (pos.ch <= end) {
                    range.setStart(node, pos.ch - current);
                    range.collapse(true);
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

        if (!walk(lineDiv)) {
            range.setStart(lineDiv, 0);
            range.collapse(true);
        }
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function render() {
        const text = getPlainText();
        if (!text) {
            editor.innerHTML = '';
            if (onInput) onInput('');
            return;
        }
        const pos = saveCursorPos();
        editor.innerHTML = formatEditorText(text);
        restoreCursorPos(pos);
        if (onInput) onInput(text);
    }

    editor.addEventListener('input', render);

    editor.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    });

    if (initialValue) {
        editor.innerHTML = formatEditorText(initialValue);
    }

    return {
        container: editor,
        getValue: () => getPlainText(),
        focus: () => editor.focus()
    };
}
