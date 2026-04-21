// jsdom-based tests for the client-side edit plumbing.
// Verifies that marking, click handling, contenteditable lifecycle and
// POST payloads all behave as expected — covers the "can't select any text"
// class of bugs the author hit in-browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEditor, EDITABLE } from './client.mjs';

function pageWithTags(body) {
  return new JSDOM(
    `<!doctype html><html><head></head><body>${body}</body></html>`,
    { url: 'http://localhost:4321/' }
  );
}

function recordingFetch() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function failingFetch(error = 'boom') {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error }),
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

// --- marking ------------------------------------------------------------

test('enable() marks every editable tag that has Astro source attrs and is a text leaf', () => {
  const dom = pageWithTags(`
    <h1 data-astro-source-file="/x.astro" data-astro-source-loc="1:1">Title</h1>
    <h2 data-astro-source-file="/x.astro" data-astro-source-loc="2:1">Sub</h2>
    <p data-astro-source-file="/x.astro" data-astro-source-loc="3:1">Para</p>
    <h3>no source attrs</h3>
    <section data-astro-source-file="/x.astro" data-astro-source-loc="4:1">non-editable tag</section>
  `);
  const doc = dom.window.document;
  const ed = createEditor(doc, { win: dom.window, fetchImpl: recordingFetch() });
  ed.enable();

  const marked = doc.querySelectorAll('[data-editable]');
  assert.equal(marked.length, 3);
  assert.equal(marked[0].tagName, 'H1');
  assert.equal(marked[1].tagName, 'H2');
  assert.equal(marked[2].tagName, 'P');
});

test('enable() marks <div> and <li> and <span> when they contain only text (footer case)', () => {
  const dom = pageWithTags(`
    <footer>
      <div data-astro-source-file="/layout.astro" data-astro-source-loc="1:1">Koornlaan 23</div>
      <ul>
        <li data-astro-source-file="/layout.astro" data-astro-source-loc="2:1">Item one</li>
      </ul>
      <span data-astro-source-file="/layout.astro" data-astro-source-loc="3:1">inline</span>
    </footer>
  `);
  const ed = createEditor(dom.window.document, { win: dom.window, fetchImpl: recordingFetch() });
  ed.enable();
  assert.equal(dom.window.document.querySelectorAll('[data-editable]').length, 3);
});

test('enable() does NOT mark wrapper <div>s that contain child elements', () => {
  const dom = pageWithTags(`
    <div class="wrapper" data-astro-source-file="/x.astro" data-astro-source-loc="1:1">
      <p data-astro-source-file="/x.astro" data-astro-source-loc="2:1">Inside</p>
    </div>
  `);
  const ed = createEditor(dom.window.document, { win: dom.window, fetchImpl: recordingFetch() });
  ed.enable();
  const marked = dom.window.document.querySelectorAll('[data-editable]');
  assert.equal(marked.length, 1);
  assert.equal(marked[0].tagName, 'P');
});

test('<br> inside a text-leaf element is allowed', () => {
  const dom = pageWithTags(`
    <p data-astro-source-file="/x.astro" data-astro-source-loc="1:1">line 1<br>line 2</p>
  `);
  const ed = createEditor(dom.window.document, { win: dom.window, fetchImpl: recordingFetch() });
  ed.enable();
  assert.equal(dom.window.document.querySelectorAll('[data-editable]').length, 1);
});

test('all EDITABLE tags are covered by enable()', () => {
  const body = EDITABLE.map((t, i) =>
    `<${t} data-astro-source-file="/x.astro" data-astro-source-loc="${i + 1}:1">t${i}</${t}>`
  ).join('\n');
  const dom = pageWithTags(body);
  const ed = createEditor(dom.window.document, { win: dom.window, fetchImpl: recordingFetch() });
  ed.enable();
  const marked = dom.window.document.querySelectorAll('[data-editable]');
  assert.equal(marked.length, EDITABLE.length);
});

test('enable() does not mark elements inside the toolbar root', () => {
  const dom = pageWithTags(`
    <astro-dev-toolbar>
      <p data-astro-source-file="/x.astro" data-astro-source-loc="1:1">toolbar internal</p>
    </astro-dev-toolbar>
    <p data-astro-source-file="/x.astro" data-astro-source-loc="2:1">page content</p>
  `);
  const doc = dom.window.document;
  const ed = createEditor(doc, { win: dom.window, fetchImpl: recordingFetch() });
  ed.enable();
  const marked = doc.querySelectorAll('[data-editable]');
  assert.equal(marked.length, 1);
  assert.equal(marked[0].textContent, 'page content');
});

test('disable() un-marks and removes contenteditable', () => {
  const dom = pageWithTags(`
    <p data-astro-source-file="/x.astro" data-astro-source-loc="1:1">hi</p>
  `);
  const doc = dom.window.document;
  const ed = createEditor(doc, { win: dom.window, fetchImpl: recordingFetch() });
  ed.enable();
  const p = doc.querySelector('p');
  // Simulate user click → contenteditable on
  ed._simulateClick(p);
  assert.equal(p.getAttribute('contenteditable'), 'true');
  ed.disable();
  assert.equal(p.getAttribute('contenteditable'), null);
  assert.equal(p.getAttribute('data-editable'), null);
});

test('enable/disable are idempotent', () => {
  const dom = pageWithTags(`<p data-astro-source-file="/x.astro" data-astro-source-loc="1:1">a</p>`);
  const ed = createEditor(dom.window.document, { win: dom.window, fetchImpl: recordingFetch() });
  ed.enable(); ed.enable();
  assert.equal(ed._state().active, true);
  ed.disable(); ed.disable();
  assert.equal(ed._state().active, false);
});

// --- click handling -----------------------------------------------------

test('click on editable element makes it contenteditable', () => {
  const dom = pageWithTags(`
    <h2 data-astro-source-file="/x.astro" data-astro-source-loc="1:1">Hi</h2>
  `);
  const doc = dom.window.document;
  const ed = createEditor(doc, { win: dom.window, fetchImpl: recordingFetch() });
  ed.enable();
  const h2 = doc.querySelector('h2');
  // Build a real Event to exercise the real dispatch path
  const evt = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  h2.dispatchEvent(evt);
  assert.equal(h2.getAttribute('contenteditable'), 'true');
});

test('click outside editable does nothing', () => {
  const dom = pageWithTags(`<p data-astro-source-file="/x.astro" data-astro-source-loc="1:1">tagged</p><div id="other">plain</div>`);
  const doc = dom.window.document;
  const ed = createEditor(doc, { win: dom.window, fetchImpl: recordingFetch() });
  ed.enable();
  const evt = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  doc.getElementById('other').dispatchEvent(evt);
  assert.equal(doc.querySelector('[contenteditable="true"]'), null);
});

test('click handler is removed after disable()', () => {
  const dom = pageWithTags(`<p data-astro-source-file="/x.astro" data-astro-source-loc="1:1">a</p>`);
  const doc = dom.window.document;
  const ed = createEditor(doc, { win: dom.window, fetchImpl: recordingFetch() });
  ed.enable();
  ed.disable();
  const p = doc.querySelector('p');
  const evt = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  p.dispatchEvent(evt);
  assert.equal(p.getAttribute('contenteditable'), null);
});

// --- save lifecycle -----------------------------------------------------

test('blur after edit POSTs the correct payload', async () => {
  const dom = pageWithTags(`
    <h2 data-astro-source-file="/src/pages/de-club.astro" data-astro-source-loc="7:7">Old</h2>
  `);
  const doc = dom.window.document;
  const fetchImpl = recordingFetch();
  const ed = createEditor(doc, { win: dom.window, fetchImpl });
  ed.enable();
  const h2 = doc.querySelector('h2');
  ed._simulateClick(h2);
  h2.innerHTML = 'New';
  // Fire blur
  const blur = new dom.window.Event('blur');
  h2.dispatchEvent(blur);
  // microtask flush
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(fetchImpl.calls.length, 1);
  const call = fetchImpl.calls[0];
  assert.equal(call.url, '/__edit');
  assert.deepEqual(call.body, {
    file: '/src/pages/de-club.astro',
    loc: '7:7',
    tag: 'h2',
    newHtml: 'New',
  });
});

test('blur with unchanged content does NOT POST', async () => {
  const dom = pageWithTags(`<p data-astro-source-file="/x.astro" data-astro-source-loc="1:1">Same</p>`);
  const doc = dom.window.document;
  const fetchImpl = recordingFetch();
  const ed = createEditor(doc, { win: dom.window, fetchImpl });
  ed.enable();
  const p = doc.querySelector('p');
  ed._simulateClick(p);
  // Don't change innerHTML
  p.dispatchEvent(new dom.window.Event('blur'));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fetchImpl.calls.length, 0);
});

test('Escape key reverts to original and does NOT POST', async () => {
  const dom = pageWithTags(`<p data-astro-source-file="/x.astro" data-astro-source-loc="1:1">Original</p>`);
  const doc = dom.window.document;
  const fetchImpl = recordingFetch();
  const ed = createEditor(doc, { win: dom.window, fetchImpl });
  ed.enable();
  const p = doc.querySelector('p');
  ed._simulateClick(p);
  p.innerHTML = 'Changed';
  // Fire escape keydown (triggers blur, but innerHTML is reset to original before blur)
  const escEvt = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  p.dispatchEvent(escEvt);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(p.innerHTML, 'Original');
  assert.equal(fetchImpl.calls.length, 0, 'escape should revert before save fires');
});

test('Enter without shift blurs and saves', async () => {
  const dom = pageWithTags(`<p data-astro-source-file="/x.astro" data-astro-source-loc="1:1">A</p>`);
  const doc = dom.window.document;
  const fetchImpl = recordingFetch();
  const ed = createEditor(doc, { win: dom.window, fetchImpl });
  ed.enable();
  const p = doc.querySelector('p');
  ed._simulateClick(p);
  p.innerHTML = 'B';
  p.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].body.newHtml, 'B');
});

test('Shift+Enter does NOT save (allows line-break insert)', async () => {
  const dom = pageWithTags(`<p data-astro-source-file="/x.astro" data-astro-source-loc="1:1">A</p>`);
  const doc = dom.window.document;
  const fetchImpl = recordingFetch();
  const ed = createEditor(doc, { win: dom.window, fetchImpl });
  ed.enable();
  const p = doc.querySelector('p');
  ed._simulateClick(p);
  p.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(p.getAttribute('contenteditable'), 'true', 'still editing');
});

// --- failure handling ---------------------------------------------------

test('server rejection restores original content', async () => {
  const dom = pageWithTags(`<p data-astro-source-file="/x.astro" data-astro-source-loc="1:1">Original</p>`);
  const doc = dom.window.document;
  const fetchImpl = failingFetch('server says no');
  const ed = createEditor(doc, { win: dom.window, fetchImpl });
  ed.enable();
  const p = doc.querySelector('p');
  ed._simulateClick(p);
  p.innerHTML = 'Attempted';
  p.dispatchEvent(new dom.window.Event('blur'));
  // Let the async save resolve
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(p.innerHTML, 'Original');
  assert.equal(fetchImpl.calls.length, 1);
  const results = ed._lastResults();
  assert.equal(results[0].ok, false);
  assert.equal(results[0].error, 'server says no');
});

test('network error restores original content', async () => {
  const dom = pageWithTags(`<p data-astro-source-file="/x.astro" data-astro-source-loc="1:1">Keep</p>`);
  const doc = dom.window.document;
  const fetchImpl = async () => { throw new Error('network down'); };
  const ed = createEditor(doc, { win: dom.window, fetchImpl });
  ed.enable();
  const p = doc.querySelector('p');
  ed._simulateClick(p);
  p.innerHTML = 'Lost';
  p.dispatchEvent(new dom.window.Event('blur'));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(p.innerHTML, 'Keep');
  const results = ed._lastResults();
  assert.equal(results[0].ok, false);
  assert.match(results[0].error, /network/);
});

// --- regression: Audit app strips data-astro-source-* attrs -------------
//
// Astro's built-in Audit toolbar app reads data-astro-source-file/loc into
// a WeakMap during boot, then REMOVES them from the DOM. By the time our
// toolbar app is toggled on, those attrs are gone. The integration works
// around this by snapshotting them into data-msa-src-* via a head-inline
// script that runs before the toolbar runtime. These tests lock in that
// fallback behavior.

test('regression: marks elements that only have snapshot attrs (data-msa-src-*)', () => {
  const dom = pageWithTags(`
    <h2 data-edit-src-file="/pages/x.astro" data-edit-src-loc="3:1">Survived audit</h2>
    <p data-edit-src-file="/pages/x.astro" data-edit-src-loc="4:1">Also snapshotted</p>
  `);
  const ed = createEditor(dom.window.document, { win: dom.window, fetchImpl: recordingFetch() });
  ed.enable();
  assert.equal(dom.window.document.querySelectorAll('[data-editable]').length, 2);
});

test('regression: save uses snapshot attrs when astro-source-* are absent', async () => {
  const dom = pageWithTags(`<h2 data-edit-src-file="/p.astro" data-edit-src-loc="9:3">Title</h2>`);
  const doc = dom.window.document;
  const fetchImpl = recordingFetch();
  const ed = createEditor(doc, { win: dom.window, fetchImpl });
  ed.enable();
  const h2 = doc.querySelector('h2');
  ed._simulateClick(h2);
  h2.innerHTML = 'Changed';
  h2.dispatchEvent(new dom.window.Event('blur'));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fetchImpl.calls.length, 1);
  assert.deepEqual(fetchImpl.calls[0].body, {
    file: '/p.astro',
    loc: '9:3',
    tag: 'h2',
    newHtml: 'Changed',
  });
});

test('regression: element with NO source info (neither original nor snapshot) is not editable', () => {
  const dom = pageWithTags(`<p>Lost both attrs</p>`);
  const ed = createEditor(dom.window.document, { win: dom.window, fetchImpl: recordingFetch() });
  ed.enable();
  assert.equal(dom.window.document.querySelectorAll('[data-editable]').length, 0);
});

test('regression: prefers snapshot over stale original attrs (snapshot wins)', async () => {
  // Edge case: both sets present with different values (shouldn't happen in
  // practice, but the code path exists — lock in "snapshot wins").
  const dom = pageWithTags(`<p data-astro-source-file="/old.astro" data-astro-source-loc="1:1" data-edit-src-file="/new.astro" data-edit-src-loc="5:5">text</p>`);
  const doc = dom.window.document;
  const fetchImpl = recordingFetch();
  const ed = createEditor(doc, { win: dom.window, fetchImpl });
  ed.enable();
  const p = doc.querySelector('p');
  ed._simulateClick(p);
  p.innerHTML = 'x';
  p.dispatchEvent(new dom.window.Event('blur'));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fetchImpl.calls[0].body.file, '/new.astro');
  assert.equal(fetchImpl.calls[0].body.loc, '5:5');
});

// --- MutationObserver re-marking ----------------------------------------

test('dynamically inserted editable elements get marked after HMR-like swap', async () => {
  const dom = pageWithTags(`<p data-astro-source-file="/x.astro" data-astro-source-loc="1:1">Initial</p>`);
  const doc = dom.window.document;
  const ed = createEditor(doc, { win: dom.window, fetchImpl: recordingFetch() });
  ed.enable();
  // Simulate HMR adding new elements
  const newH2 = doc.createElement('h2');
  newH2.setAttribute('data-astro-source-file', '/x.astro');
  newH2.setAttribute('data-astro-source-loc', '5:1');
  newH2.textContent = 'Added later';
  doc.body.append(newH2);
  // jsdom MutationObserver fires asynchronously; wait a microtask
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(newH2.getAttribute('data-editable'), '');
});

// --- anchor editing -----------------------------------------------------

function anchorFetch({ raw = '"/old"' } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    if (typeof url === 'string' && url.startsWith('/__edit/href')) {
      return { ok: true, status: 200, json: async () => ({ raw }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('enable() marks <a> elements with source info', () => {
  const dom = pageWithTags(`
    <a href="/x" data-astro-source-file="/x.astro" data-astro-source-loc="10:3">link</a>
    <a href="/y">no source</a>
  `);
  const ed = createEditor(dom.window.document, { win: dom.window, fetchImpl: anchorFetch() });
  ed.enable();
  const marked = dom.window.document.querySelectorAll('[data-editable-anchor]');
  assert.equal(marked.length, 1);
  assert.equal(marked[0].getAttribute('href'), '/x');
});

test('paragraphs wrapping an <a> are not marked as text-editable (would destroy the link on save)', () => {
  const dom = pageWithTags(`
    <p data-astro-source-file="/x.astro" data-astro-source-loc="1:1">
      Visit <a href="/x" data-astro-source-file="/x.astro" data-astro-source-loc="1:10">here</a>.
    </p>
  `);
  const doc = dom.window.document;
  const ed = createEditor(doc, { win: dom.window, fetchImpl: anchorFetch() });
  ed.enable();
  // The paragraph has child elements, so it's NOT a text-leaf → not editable.
  assert.equal(doc.querySelectorAll('[data-editable]').length, 0);
  // The anchor itself is still editable.
  assert.equal(doc.querySelectorAll('[data-editable-anchor]').length, 1);

  // Click the anchor → popover opens.
  const a = doc.querySelector('a');
  a.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.ok(ed._currentPopover(), 'anchor click opens popover');
});

test('clicking an editable anchor opens the popover', async () => {
  const dom = pageWithTags(`<a href="/old" data-astro-source-file="/x.astro" data-astro-source-loc="1:1">Old</a>`);
  const doc = dom.window.document;
  const ed = createEditor(doc, { win: dom.window, fetchImpl: anchorFetch({ raw: '"/old"' }) });
  ed.enable();
  const a = doc.querySelector('a');
  const evt = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  a.dispatchEvent(evt);
  const pop = ed._currentPopover();
  assert.ok(pop, 'popover created');
  assert.equal(pop.getAttribute('role'), 'dialog');
  const inputs = pop.querySelectorAll('input');
  assert.equal(inputs.length, 2);
  assert.equal(inputs[0].value, 'Old', 'text input shows current innerHTML');
});

test('popover href input loads the raw source value from server', async () => {
  const dom = pageWithTags(`<a href="/resolved" data-astro-source-file="/x.astro" data-astro-source-loc="1:1">x</a>`);
  const doc = dom.window.document;
  const fetchImpl = anchorFetch({ raw: '{asset("/agenda")}' });
  const ed = createEditor(doc, { win: dom.window, fetchImpl });
  ed.enable();
  ed._simulateClick(doc.querySelector('a'));
  // Wait for fetchRawHref promise
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const pop = ed._currentPopover();
  const hrefIn = pop.querySelectorAll('input')[1];
  assert.equal(hrefIn.value, '{asset("/agenda")}');
  assert.equal(hrefIn.disabled, false);
});

test('popover falls back to attribute href if raw-read fails', async () => {
  const dom = pageWithTags(`<a href="/fallback" data-astro-source-file="/x.astro" data-astro-source-loc="1:1">x</a>`);
  const doc = dom.window.document;
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith('/__edit/href')) {
      return { ok: false, status: 400, json: async () => ({ error: 'nope' }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  };
  const ed = createEditor(doc, { win: dom.window, fetchImpl });
  ed.enable();
  ed._simulateClick(doc.querySelector('a'));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const pop = ed._currentPopover();
  const hrefIn = pop.querySelectorAll('input')[1];
  assert.equal(hrefIn.value, '"/fallback"', 'falls back to quoted attribute href');
});

test('popover Save button POSTs correct payload to /__edit/anchor', async () => {
  const dom = pageWithTags(`<a href="/old" data-astro-source-file="/pages/x.astro" data-astro-source-loc="4:5">Old</a>`);
  const doc = dom.window.document;
  const fetchImpl = anchorFetch({ raw: '"/old"' });
  const ed = createEditor(doc, { win: dom.window, fetchImpl });
  ed.enable();
  ed._simulateClick(doc.querySelector('a'));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const pop = ed._currentPopover();
  const inputs = pop.querySelectorAll('input');
  inputs[0].value = 'New text';
  inputs[1].value = '"/new"';
  // Find Save button (second button in actions)
  const buttons = pop.querySelectorAll('button');
  const saveBtn = buttons[buttons.length - 1];
  saveBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const anchorCall = fetchImpl.calls.find((c) => c.url === '/__edit/anchor');
  assert.ok(anchorCall, 'POST to /__edit/anchor');
  assert.deepEqual(anchorCall.body, {
    file: '/pages/x.astro',
    loc: '4:5',
    newText: 'New text',
    newHref: '"/new"',
  });
  // Popover closes on success
  assert.equal(ed._currentPopover(), null);
});

test('popover Cancel button closes without POSTing', async () => {
  const dom = pageWithTags(`<a href="/x" data-astro-source-file="/x.astro" data-astro-source-loc="1:1">x</a>`);
  const doc = dom.window.document;
  const fetchImpl = anchorFetch();
  const ed = createEditor(doc, { win: dom.window, fetchImpl });
  ed.enable();
  ed._simulateClick(doc.querySelector('a'));
  const pop = ed._currentPopover();
  const cancelBtn = pop.querySelectorAll('button')[0];
  cancelBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(ed._currentPopover(), null);
  // Only the GET for raw href should be in calls (or nothing if not yet fired)
  const posts = fetchImpl.calls.filter((c) => c.init?.method === 'POST');
  assert.equal(posts.length, 0);
});

test('popover Escape key closes', async () => {
  const dom = pageWithTags(`<a href="/x" data-astro-source-file="/x.astro" data-astro-source-loc="1:1">x</a>`);
  const doc = dom.window.document;
  const ed = createEditor(doc, { win: dom.window, fetchImpl: anchorFetch() });
  ed.enable();
  ed._simulateClick(doc.querySelector('a'));
  const pop = ed._currentPopover();
  pop.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(ed._currentPopover(), null);
});

test('popover server rejection shows error and keeps popover open', async () => {
  const dom = pageWithTags(`<a href="/x" data-astro-source-file="/x.astro" data-astro-source-loc="1:1">x</a>`);
  const doc = dom.window.document;
  const fetchImpl = async (url) => {
    if (url.startsWith('/__edit/href')) return { ok: true, json: async () => ({ raw: '"/x"' }) };
    return { ok: false, status: 400, json: async () => ({ error: 'href not found' }) };
  };
  const ed = createEditor(doc, { win: dom.window, fetchImpl });
  ed.enable();
  ed._simulateClick(doc.querySelector('a'));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const pop = ed._currentPopover();
  const saveBtn = pop.querySelectorAll('button')[1];
  saveBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(ed._currentPopover(), 'popover stays open on error');
  const err = pop.textContent;
  assert.match(err, /href not found/);
});

test('disable() closes any open popover', () => {
  const dom = pageWithTags(`<a href="/x" data-astro-source-file="/x.astro" data-astro-source-loc="1:1">x</a>`);
  const doc = dom.window.document;
  const ed = createEditor(doc, { win: dom.window, fetchImpl: anchorFetch() });
  ed.enable();
  ed._simulateClick(doc.querySelector('a'));
  assert.ok(ed._currentPopover());
  ed.disable();
  assert.equal(ed._currentPopover(), null);
});
