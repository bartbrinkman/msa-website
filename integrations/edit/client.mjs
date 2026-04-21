// Client-side logic for the edit toolbar app. Split out so it can be
// exercised by jsdom-based tests — see `client.test.mjs`.
//
// Exports a factory `createEditor(doc, { fetchImpl, win })` that returns an
// object with `enable()`, `disable()`, and for tests: `_state()`.
//
// Nothing in here references `window` or global `document` directly; both
// come in as params so tests can substitute them.

export const EDITABLE_TEXT_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'span', 'div'];
// Legacy export name kept for existing test imports
export const EDITABLE = EDITABLE_TEXT_TAGS;
const TEXT_ATTR = 'data-editable';
const ANCHOR_ATTR = 'data-editable-anchor';

export function createEditor(doc, opts = {}) {
  const fetchImpl = opts.fetchImpl || (globalThis.fetch && globalThis.fetch.bind(globalThis));
  const win = opts.win || doc.defaultView || globalThis;

  let active = false;
  let mo = null;
  let clickHandler = null;
  let currentPopover = null;

  function hasSourceInfo(el) {
    return (el.getAttribute('data-edit-src-file') || el.getAttribute('data-astro-source-file'))
      && (el.getAttribute('data-edit-src-loc') || el.getAttribute('data-astro-source-loc'));
  }

  function sourceOf(el) {
    return {
      file: el.getAttribute('data-edit-src-file') || el.getAttribute('data-astro-source-file'),
      loc: el.getAttribute('data-edit-src-loc') || el.getAttribute('data-astro-source-loc'),
    };
  }

  // Treat an element as a "text leaf" when its only children are text nodes
  // (or `<br>`). We'd corrupt layout if we marked a wrapping div editable.
  function isTextLeaf(el) {
    for (const child of el.childNodes) {
      if (child.nodeType === 3 /* text */) continue;
      if (child.nodeType === 1 /* element */) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'br') continue;
        return false;
      }
    }
    return true;
  }

  function markEditable() {
    for (const n of doc.querySelectorAll(EDITABLE_TEXT_TAGS.join(','))) {
      if (!hasSourceInfo(n)) continue;
      if (n.closest('astro-dev-toolbar, astro-dev-overlay')) continue;
      if (!isTextLeaf(n)) continue;
      n.setAttribute(TEXT_ATTR, '');
    }
    for (const a of doc.querySelectorAll('a')) {
      if (!hasSourceInfo(a)) continue;
      if (a.closest('astro-dev-toolbar, astro-dev-overlay')) continue;
      // Anchors can coexist with an editable parent paragraph. onClick gives
      // anchors priority, so clicking the link body opens the popover, while
      // clicking surrounding text engages the paragraph text editor.
      a.setAttribute(ANCHOR_ATTR, '');
    }
  }

  function unmarkEditable() {
    for (const n of doc.querySelectorAll('[' + TEXT_ATTR + ']')) {
      n.removeAttribute(TEXT_ATTR);
      n.removeAttribute('contenteditable');
    }
    for (const a of doc.querySelectorAll('[' + ANCHOR_ATTR + ']')) {
      a.removeAttribute(ANCHOR_ATTR);
    }
    closePopover();
  }

  const lastResults = [];

  // --- text edits (p, h*) ------------------------------------------------

  async function saveText(el, originalHtml) {
    const { file, loc } = sourceOf(el);
    const tag = el.tagName.toLowerCase();
    const newHtml = el.innerHTML;
    if (newHtml === originalHtml) return { ok: true, noop: true };
    try {
      const res = await fetchImpl('/__edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, loc, tag, newHtml }),
      });
      if (!res.ok) {
        let err = {};
        try { err = await res.json(); } catch {}
        el.innerHTML = originalHtml;
        return { ok: false, error: err.error || res.statusText };
      }
      return { ok: true };
    } catch (err) {
      el.innerHTML = originalHtml;
      return { ok: false, error: err.message };
    }
  }

  function beginTextEdit(el) {
    if (el.getAttribute('contenteditable') === 'true') return;
    const original = el.innerHTML;
    el.setAttribute('contenteditable', 'true');
    el.focus();

    const done = async () => {
      el.removeEventListener('blur', done);
      el.removeEventListener('keydown', onKey);
      el.removeAttribute('contenteditable');
      const result = await saveText(el, original);
      lastResults.push(result);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); el.innerHTML = original; el.blur(); }
      else if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); el.blur(); }
    };
    el.addEventListener('blur', done);
    el.addEventListener('keydown', onKey);
  }

  // --- anchor edits (popover) --------------------------------------------

  // Read the raw source attribute `href` value for this anchor so the user
  // sees the literal source (e.g. `{asset("/agenda")}` or `"/agenda"`).
  async function fetchRawHref(el) {
    const { file, loc } = sourceOf(el);
    try {
      const res = await fetchImpl('/__edit/href?' + new URLSearchParams({ file, loc }).toString(), {
        method: 'GET',
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.raw;
    } catch {
      return null;
    }
  }

  async function saveAnchor(el, newText, newHref) {
    const { file, loc } = sourceOf(el);
    try {
      const res = await fetchImpl('/__edit/anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, loc, newText, newHref }),
      });
      if (!res.ok) {
        let err = {};
        try { err = await res.json(); } catch {}
        return { ok: false, error: err.error || res.statusText };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  function closePopover() {
    if (currentPopover && currentPopover.parentNode) {
      currentPopover.parentNode.removeChild(currentPopover);
    }
    currentPopover = null;
  }

  function openAnchorPopover(a) {
    closePopover();
    const rect = a.getBoundingClientRect();
    const pop = doc.createElement('div');
    pop.className = 'edit-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Edit link');
    pop.style.cssText = `
      position: fixed;
      top: ${Math.round(rect.bottom + 6)}px;
      left: ${Math.round(rect.left)}px;
      z-index: 2147483600;
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 6px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.18);
      padding: 10px;
      font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1a1a1a;
      min-width: 320px;
      display: grid;
      gap: 6px;
    `;

    const mkRow = (label, input) => {
      const row = doc.createElement('label');
      row.style.cssText = 'display:grid;gap:2px;font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.05em;';
      row.textContent = label;
      row.append(input);
      return row;
    };

    const textIn = doc.createElement('input');
    textIn.type = 'text';
    textIn.value = a.innerHTML;
    textIn.style.cssText = 'padding:5px 7px;border:1px solid #ddd;border-radius:4px;font:13px inherit;color:#1a1a1a;text-transform:none;letter-spacing:0;';

    const hrefIn = doc.createElement('input');
    hrefIn.type = 'text';
    hrefIn.value = 'loading…';
    hrefIn.disabled = true;
    hrefIn.style.cssText = textIn.style.cssText + 'font-family:ui-monospace,monospace;';

    const actions = doc.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;margin-top:2px;';
    const cancelBtn = doc.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:4px 10px;border:1px solid #ccc;background:#f6f6f8;border-radius:4px;cursor:pointer;font:inherit;';
    const saveBtn = doc.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = 'padding:4px 10px;border:1px solid #001888;background:#001888;color:#fff;border-radius:4px;cursor:pointer;font:inherit;';
    actions.append(cancelBtn, saveBtn);

    const errLine = doc.createElement('div');
    errLine.style.cssText = 'color:#c00;font-size:11px;min-height:0;';

    pop.append(mkRow('Text', textIn), mkRow('URL (raw source)', hrefIn), errLine, actions);
    doc.body.append(pop);
    currentPopover = pop;

    // Fetch the raw href; fall back to resolved href if the endpoint isn't available.
    fetchRawHref(a).then((raw) => {
      if (pop !== currentPopover) return;
      hrefIn.disabled = false;
      hrefIn.value = raw != null ? raw : ('"' + a.getAttribute('href') + '"');
      textIn.focus();
      textIn.select();
    });

    const close = () => closePopover();
    const submit = async () => {
      saveBtn.disabled = true;
      errLine.textContent = '';
      const result = await saveAnchor(a, textIn.value, hrefIn.value);
      lastResults.push(result);
      if (!result.ok) {
        errLine.textContent = result.error;
        saveBtn.disabled = false;
        return;
      }
      close();
    };

    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', submit);
    pop.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); close(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
    });

    // Click outside popover closes it.
    const outside = (ev) => {
      if (currentPopover && !currentPopover.contains(ev.target)) {
        doc.removeEventListener('click', outside, true);
        close();
      }
    };
    // Defer so the click that opened the popover doesn't immediately close it.
    setTimeout(() => {
      if (currentPopover) doc.addEventListener('click', outside, true);
    }, 0);
  }

  function onClick(e) {
    const closest = e.target.closest ? e.target.closest.bind(e.target) : null;
    if (!closest) return;
    if (currentPopover && currentPopover.contains(e.target)) return;

    const anchor = closest('[' + ANCHOR_ATTR + ']');
    if (anchor) {
      e.preventDefault();
      e.stopPropagation();
      openAnchorPopover(anchor);
      return;
    }
    const textEl = closest('[' + TEXT_ATTR + ']');
    if (textEl) {
      e.preventDefault();
      e.stopPropagation();
      beginTextEdit(textEl);
    }
  }

  function enable() {
    if (active) return;
    active = true;
    markEditable();
    clickHandler = onClick;
    doc.addEventListener('click', clickHandler, true);
    if (typeof win.MutationObserver === 'function') {
      mo = new win.MutationObserver(() => markEditable());
      mo.observe(doc.documentElement, { childList: true, subtree: true });
    }
  }

  function disable() {
    if (!active) return;
    active = false;
    if (clickHandler) doc.removeEventListener('click', clickHandler, true);
    clickHandler = null;
    if (mo) { mo.disconnect(); mo = null; }
    unmarkEditable();
  }

  return {
    enable,
    disable,
    _state: () => ({ active, editable: doc.querySelectorAll('[' + TEXT_ATTR + '], [' + ANCHOR_ATTR + ']').length }),
    _simulateClick: (el) => onClick({ target: el, preventDefault() {}, stopPropagation() {} }),
    _beginEdit: beginTextEdit,
    _openAnchorPopover: openAnchorPopover,
    _currentPopover: () => currentPopover,
    _lastResults: () => lastResults.slice(),
  };
}
