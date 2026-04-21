// Tests for the dev-toolbar edit integration. Run with `npm run test:edit`.
//
// Covers every known failure mode observed while building this tool,
// so we don't regress on the same issues again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineColToOffset, rewriteTag, parseOpeningTagEnd, findAttributeValueBounds, rewriteAnchor, readAnchorHref } from './rewrite.mjs';

// --- lineColToOffset ----------------------------------------------------

test('lineColToOffset: first char is line 1 col 1', () => {
  assert.equal(lineColToOffset('hello', 1, 1), 0);
});

test('lineColToOffset: mid-line on line 1', () => {
  assert.equal(lineColToOffset('hello', 1, 3), 2); // 'l'
});

test('lineColToOffset: first char of line 2', () => {
  assert.equal(lineColToOffset('a\nbcd', 2, 1), 2);
});

test('lineColToOffset: col past end of line returns position', () => {
  assert.equal(lineColToOffset('ab\ncd', 1, 3), 2); // the '\n'
});

test('lineColToOffset: EOF position is valid', () => {
  const src = 'abc';
  assert.equal(lineColToOffset(src, 1, 4), 3);
});

test('lineColToOffset: out of range returns -1', () => {
  assert.equal(lineColToOffset('abc', 5, 1), -1);
  assert.equal(lineColToOffset('abc', 0, 1), -1);
  assert.equal(lineColToOffset('abc', 1, 0), -1);
});

test('lineColToOffset: multi-byte chars count as one char (JS string indexing)', () => {
  const src = 'héllo'; // 'é' = 1 code unit in UTF-16
  assert.equal(lineColToOffset(src, 1, 3), 2); // 'l'
});

// --- parseOpeningTagEnd -------------------------------------------------

test('parseOpeningTagEnd: simple tag', () => {
  const src = '<p>hi';
  assert.equal(parseOpeningTagEnd(src, 0), 2); // > is at index 2
});

test('parseOpeningTagEnd: with attributes', () => {
  const src = '<p class="foo">hi';
  assert.equal(parseOpeningTagEnd(src, 0), 14);
});

test('parseOpeningTagEnd: attribute value contains `>`', () => {
  const src = '<p data-x="a>b">hi';
  assert.equal(parseOpeningTagEnd(src, 0), 15);
});

test('parseOpeningTagEnd: attribute value contains `<`', () => {
  const src = '<p data-x="a<b">hi';
  assert.equal(parseOpeningTagEnd(src, 0), 15);
});

test('parseOpeningTagEnd: JSX braces in attribute', () => {
  const src = '<p class={cx("a", "b")}>hi';
  assert.equal(parseOpeningTagEnd(src, 0), 23);
});

test('parseOpeningTagEnd: nested braces in attribute', () => {
  const src = '<p data={{x: 1}}>hi';
  assert.equal(parseOpeningTagEnd(src, 0), 16);
});

test('parseOpeningTagEnd: self-closing tag', () => {
  const src = '<br />';
  assert.equal(parseOpeningTagEnd(src, 0), 5);
});

test('parseOpeningTagEnd: unterminated returns -1', () => {
  assert.equal(parseOpeningTagEnd('<p class="unterminated', 0), -1);
});

test('parseOpeningTagEnd: wrong start char returns -1', () => {
  assert.equal(parseOpeningTagEnd('p>', 0), -1);
});

// --- rewriteTag: happy paths --------------------------------------------

// Helper: given a source string, find where the content of the first `<tag>`
// begins (i.e. the char right after the opening-tag `>`). Mimics what Astro's
// dev-toolbar source-loc gives us. Uses the real tag parser so attribute
// values containing `>` are handled correctly.
function contentOffsetOf(src, tag) {
  const re = new RegExp('<' + tag + '[\\s>/]', 'i');
  const m = re.exec(src);
  if (!m) throw new Error(`no <${tag}> in fixture`);
  const gt = parseOpeningTagEnd(src, m.index);
  if (gt < 0) throw new Error(`could not find end of <${tag}> opening`);
  return gt + 1;
}

test('rewriteTag: simple <h2> replacement', () => {
  const src = '  <h2>Hello</h2>\n';
  const r = rewriteTag(src, contentOffsetOf(src, 'h2'), 'h2', 'World');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '  <h2>World</h2>\n');
});

test('rewriteTag: <p> spanning multiple lines', () => {
  const src = '<p>\n  Hello\n  world\n</p>';
  const r = rewriteTag(src, contentOffsetOf(src, 'p'), 'p', 'New text');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<p>New text</p>');
});

test('rewriteTag: preserves file content outside the edited tag', () => {
  const src = '---\nconst x = 1;\n---\n<p>Old</p>\n<h1>Keep me</h1>';
  const r = rewriteTag(src, contentOffsetOf(src, 'p'), 'p', 'New');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '---\nconst x = 1;\n---\n<p>New</p>\n<h1>Keep me</h1>');
});

test('rewriteTag: works with attributes on the opening tag', () => {
  const src = '<h2 class="foo" id="bar">Title</h2>';
  const r = rewriteTag(src, contentOffsetOf(src, 'h2'), 'h2', 'Updated');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<h2 class="foo" id="bar">Updated</h2>');
});

test('rewriteTag: handles attribute values containing `>`', () => {
  const src = '<p data-x="a>b">Hello</p>';
  const r = rewriteTag(src, contentOffsetOf(src, 'p'), 'p', 'New');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<p data-x="a>b">New</p>');
});

test('rewriteTag: handles attribute values containing `<`', () => {
  const src = '<p data-x="a<b">Hello</p>';
  const r = rewriteTag(src, contentOffsetOf(src, 'p'), 'p', 'New');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<p data-x="a<b">New</p>');
});

test('rewriteTag: overwrites inner with nested tags as plain text (by design)', () => {
  const src = '<p>Hello <strong>world</strong>!</p>';
  const r = rewriteTag(src, contentOffsetOf(src, 'p'), 'p', 'Plain replacement');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<p>Plain replacement</p>');
});

// --- rewriteTag: Astro's loc is content-start, not tag-start ------------

test('rewriteTag: regression — loc points at content-start, not `<`', () => {
  // Astro's data-astro-source-loc gives the content start. Fixture simulates
  // `<h2>Wie zijn wij?</h2>` at line 7 col 3; loc="7:7" points at 'W'.
  const src = '---\nimport X from "y";\n---\n\n\n\n  <h2>Wie zijn wij?</h2>\n';
  const offset = lineColToOffset(src, 7, 7);
  assert.ok(offset > 0, 'offset must be positive');
  assert.equal(src[offset], 'W'); // sanity check
  const r = rewriteTag(src, offset, 'h2', 'Over ons');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '---\nimport X from "y";\n---\n\n\n\n  <h2>Over ons</h2>\n');
});

test('rewriteTag: tolerates whitespace between `>` and content', () => {
  const src = '<p>   Hello   </p>';
  // Astro could place loc at first content char 'H'.
  const offset = src.indexOf('Hello');
  const r = rewriteTag(src, offset, 'p', 'New');
  assert.ok(r.ok, r.error);
  // All whitespace gets replaced along with content since innerStart is at 'H'…
  // Actually innerStart is the offset we were given; whitespace before is preserved.
  assert.equal(r.out, '<p>   New</p>');
});

// --- rewriteTag: tag-name validation -----------------------------------

test('rewriteTag: rejects when tag name mismatches source', () => {
  const src = '<p>Hello</p>';
  const r = rewriteTag(src, contentOffsetOf(src, 'p'), 'h2', 'New');
  assert.equal(r.ok, false);
  assert.match(r.error, /expected <h2>/);
});

test('rewriteTag: is case-insensitive on tag name', () => {
  const src = '<P>Hello</P>';
  const r = rewriteTag(src, contentOffsetOf(src, 'P'), 'p', 'World');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<P>World</P>');
});

// --- rewriteTag: expression guard ---------------------------------------

test('rewriteTag: refuses element containing `{expr}`', () => {
  const src = '<p>{event.description}</p>';
  const r = rewriteTag(src, contentOffsetOf(src, 'p'), 'p', 'Anything');
  assert.equal(r.ok, false);
  assert.match(r.error, /expression/);
});

test('rewriteTag: refuses mixed static + expression inner', () => {
  const src = '<p>Prefix {expr} suffix</p>';
  const r = rewriteTag(src, contentOffsetOf(src, 'p'), 'p', 'New');
  assert.equal(r.ok, false);
  assert.match(r.error, /expression/);
});

test('rewriteTag: allows inner with only braces in attribute (not in inner)', () => {
  // The guard only looks at inner. Attributes can contain {expr} safely.
  const src = '<p class={cx("a", "b")}>Hello</p>';
  const r = rewriteTag(src, contentOffsetOf(src, 'p'), 'p', 'New');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<p class={cx("a", "b")}>New</p>');
});

// --- rewriteTag: nesting ------------------------------------------------

test('rewriteTag: handles nested same-tag (<p> inside <p> is unusual but possible)', () => {
  const src = '<p>outer <p>inner</p> more</p>';
  const outerOffset = contentOffsetOf(src, 'p');
  const r = rewriteTag(src, outerOffset, 'p', 'replaced');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<p>replaced</p>');
});

test('rewriteTag: rewriting an inner <h2> does not consume outer', () => {
  const src = '<section><h2>First</h2><h2>Second</h2></section>';
  // Target the first h2 — offset is just after `<h2>`
  const firstH2 = src.indexOf('First');
  const r = rewriteTag(src, firstH2, 'h2', 'Changed');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<section><h2>Changed</h2><h2>Second</h2></section>');
});

// --- rewriteTag: error cases --------------------------------------------

test('rewriteTag: missing closing tag returns error', () => {
  const src = '<p>Hello';
  const r = rewriteTag(src, contentOffsetOf(src, 'p'), 'p', 'New');
  assert.equal(r.ok, false);
  assert.match(r.error, /closing tag/);
});

test('rewriteTag: offset before any `>` returns error', () => {
  const src = 'no tags here';
  const r = rewriteTag(src, 5, 'p', 'New');
  assert.equal(r.ok, false);
});

test('rewriteTag: offset out of range returns error', () => {
  const src = '<p>Hi</p>';
  const r = rewriteTag(src, 9999, 'p', 'New');
  assert.equal(r.ok, false);
});

test('rewriteTag: negative offset returns error', () => {
  const r = rewriteTag('<p>Hi</p>', -1, 'p', 'New');
  assert.equal(r.ok, false);
});

// --- rewriteTag: unicode + HTML entities --------------------------------

test('rewriteTag: preserves unicode in source outside the tag', () => {
  const src = '<p>Hello</p>\n// émoji 🎉 comment';
  const r = rewriteTag(src, contentOffsetOf(src, 'p'), 'p', 'Hi');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<p>Hi</p>\n// émoji 🎉 comment');
});

test('rewriteTag: new content can contain HTML entities and special chars', () => {
  const src = '<p>old</p>';
  const r = rewriteTag(src, contentOffsetOf(src, 'p'), 'p', 'A &amp; B < C > D');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<p>A &amp; B < C > D</p>');
});

// --- end-to-end: real-looking Astro page --------------------------------

// --- findAttributeValueBounds -------------------------------------------

function parseTag(src) {
  const lt = src.indexOf('<');
  const gt = parseOpeningTagEnd(src, lt);
  return { lt, gt };
}

test('findAttributeValueBounds: double-quoted value', () => {
  const src = '<a href="/x">Hi</a>';
  const { lt, gt } = parseTag(src);
  const b = findAttributeValueBounds(src, lt, gt, 'href');
  assert.ok(b);
  assert.equal(src.slice(b.valueStart, b.valueEnd), '"/x"');
});

test('findAttributeValueBounds: single-quoted value', () => {
  const src = "<a href='/x'>Hi</a>";
  const { lt, gt } = parseTag(src);
  const b = findAttributeValueBounds(src, lt, gt, 'href');
  assert.equal(src.slice(b.valueStart, b.valueEnd), "'/x'");
});

test('findAttributeValueBounds: JSX expression value', () => {
  const src = '<a href={asset("/x")}>Hi</a>';
  const { lt, gt } = parseTag(src);
  const b = findAttributeValueBounds(src, lt, gt, 'href');
  assert.equal(src.slice(b.valueStart, b.valueEnd), '{asset("/x")}');
});

test('findAttributeValueBounds: nested braces in expression', () => {
  const src = '<a href={{x: 1}}>Hi</a>';
  const { lt, gt } = parseTag(src);
  const b = findAttributeValueBounds(src, lt, gt, 'href');
  assert.equal(src.slice(b.valueStart, b.valueEnd), '{{x: 1}}');
});

test('findAttributeValueBounds: expression containing `>` character', () => {
  const src = '<a href={a > b ? "/y" : "/n"}>Hi</a>';
  const { lt, gt } = parseTag(src);
  const b = findAttributeValueBounds(src, lt, gt, 'href');
  assert.equal(src.slice(b.valueStart, b.valueEnd), '{a > b ? "/y" : "/n"}');
});

test('findAttributeValueBounds: picks the correct attribute when multiple exist', () => {
  const src = '<a class="foo" href="/x" target="_blank">Hi</a>';
  const { lt, gt } = parseTag(src);
  const b = findAttributeValueBounds(src, lt, gt, 'href');
  assert.equal(src.slice(b.valueStart, b.valueEnd), '"/x"');
});

test('findAttributeValueBounds: missing attribute returns null', () => {
  const src = '<a class="foo">Hi</a>';
  const { lt, gt } = parseTag(src);
  assert.equal(findAttributeValueBounds(src, lt, gt, 'href'), null);
});

test('findAttributeValueBounds: is case-insensitive on attribute name', () => {
  const src = '<a HREF="/x">Hi</a>';
  const { lt, gt } = parseTag(src);
  const b = findAttributeValueBounds(src, lt, gt, 'href');
  assert.equal(src.slice(b.valueStart, b.valueEnd), '"/x"');
});

test('findAttributeValueBounds: does NOT match a longer attribute with href as prefix', () => {
  const src = '<a hreflang="en" href="/x">Hi</a>';
  const { lt, gt } = parseTag(src);
  const b = findAttributeValueBounds(src, lt, gt, 'href');
  assert.equal(src.slice(b.valueStart, b.valueEnd), '"/x"');
});

// --- readAnchorHref -----------------------------------------------------

function anchorOffset(src) {
  const re = /<a[\s>]/i;
  const m = re.exec(src);
  if (!m) throw new Error('no anchor');
  return parseOpeningTagEnd(src, m.index) + 1;
}

test('readAnchorHref: quoted href', () => {
  const src = '<a href="/agenda">Agenda</a>';
  const r = readAnchorHref(src, anchorOffset(src));
  assert.deepEqual(r, { ok: true, raw: '"/agenda"' });
});

test('readAnchorHref: asset-wrapped href', () => {
  const src = '<a href={asset("/agenda")}>Agenda</a>';
  const r = readAnchorHref(src, anchorOffset(src));
  assert.deepEqual(r, { ok: true, raw: '{asset("/agenda")}' });
});

test('readAnchorHref: tag without href returns error', () => {
  const src = '<a>just text</a>';
  const r = readAnchorHref(src, anchorOffset(src));
  assert.equal(r.ok, false);
});

test('readAnchorHref: not an <a> tag returns error', () => {
  const src = '<p href="/x">notlink</p>';
  const offset = src.indexOf('notlink');
  const r = readAnchorHref(src, offset);
  assert.equal(r.ok, false);
});

// --- rewriteAnchor ------------------------------------------------------

test('rewriteAnchor: rewrites both text and href (quoted → quoted)', () => {
  const src = '<a href="/old">Old text</a>';
  const r = rewriteAnchor(src, anchorOffset(src), 'New text', '"/new"');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<a href="/new">New text</a>');
});

test('rewriteAnchor: preserves other attributes and their order', () => {
  const src = '<a class="btn" href="/old" target="_blank" rel="noopener">Old</a>';
  const r = rewriteAnchor(src, anchorOffset(src), 'New', '"/new"');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<a class="btn" href="/new" target="_blank" rel="noopener">New</a>');
});

test('rewriteAnchor: asset() wrapper preserved when user submits it', () => {
  const src = '<a href={asset("/a")}>A</a>';
  const r = rewriteAnchor(src, anchorOffset(src), 'B', '{asset("/b")}');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<a href={asset("/b")}>B</a>');
});

test('rewriteAnchor: user can switch from quoted to expression form', () => {
  const src = '<a href="/a">A</a>';
  const r = rewriteAnchor(src, anchorOffset(src), 'A', '{asset("/a")}');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<a href={asset("/a")}>A</a>');
});

test('rewriteAnchor: user can switch from expression to plain string', () => {
  const src = '<a href={asset("/a")}>A</a>';
  const r = rewriteAnchor(src, anchorOffset(src), 'A', '"/static-url"');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<a href="/static-url">A</a>');
});

test('rewriteAnchor: external https URL', () => {
  const src = '<a href="https://old.example">Old</a>';
  const r = rewriteAnchor(src, anchorOffset(src), 'Bahnwelt', '"https://www.bahnwelt.de"');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<a href="https://www.bahnwelt.de">Bahnwelt</a>');
});

test('rewriteAnchor: tag without href rejects', () => {
  const src = '<a>text only</a>';
  const r = rewriteAnchor(src, anchorOffset(src), 'x', '"/y"');
  assert.equal(r.ok, false);
  assert.match(r.error, /href/);
});

test('rewriteAnchor: refuses if inner contains expression', () => {
  const src = '<a href="/x">{label}</a>';
  const r = rewriteAnchor(src, anchorOffset(src), 'x', '"/y"');
  assert.equal(r.ok, false);
  assert.match(r.error, /expression/);
});

test('rewriteAnchor: applied to one of two adjacent anchors only affects that one', () => {
  const src = '<a href="/a">A</a> — <a href="/b">B</a>';
  const offsetA = src.indexOf('>A') + 1;
  const r = rewriteAnchor(src, offsetA, 'AA', '"/aa"');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<a href="/aa">AA</a> — <a href="/b">B</a>');
});

test('rewriteAnchor: preserves content outside the anchor', () => {
  const src = '---\nimport X from "y";\n---\n<p>hi <a href="/old">link</a> there</p>';
  const offset = src.indexOf('>link') + 1;
  const r = rewriteAnchor(src, offset, 'link', '"/new"');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '---\nimport X from "y";\n---\n<p>hi <a href="/new">link</a> there</p>');
});

test('rewriteAnchor: tag name mismatch (targeting a <span>)', () => {
  const src = '<span href="/x">text</span>';
  const offset = src.indexOf('text');
  const r = rewriteAnchor(src, offset, 'x', '"/y"');
  assert.equal(r.ok, false);
  assert.match(r.error, /expected <a>/);
});

test('rewriteAnchor: anchor with title attr containing `>`', () => {
  const src = '<a title="x > y" href="/x">Hi</a>';
  const r = rewriteAnchor(src, anchorOffset(src), 'Bye', '"/z"');
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<a title="x > y" href="/z">Bye</a>');
});

test('rewriteAnchor: full round-trip via readAnchorHref', () => {
  const src = '<a href={asset("/agenda")}>Volledige agenda →</a>';
  const offset = anchorOffset(src);
  const read = readAnchorHref(src, offset);
  assert.equal(read.raw, '{asset("/agenda")}');
  // User sees `{asset("/agenda")}`, edits text to "Open de agenda"
  const r = rewriteAnchor(src, offset, 'Open de agenda', read.raw);
  assert.ok(r.ok, r.error);
  assert.equal(r.out, '<a href={asset("/agenda")}>Open de agenda</a>');
});

test('rewriteTag: edits a real-looking Astro page', () => {
  const src = [
    '---',
    'import Page from \'../layouts/Page.astro\';',
    '---',
    '',
    '<Page title="De Club">',
    '  <h2>Wie zijn wij?</h2>',
    '  <p>We zijn een club.</p>',
    '  <h2>Lid worden</h2>',
    '</Page>',
  ].join('\n');

  // Simulate Astro giving us loc "6:7" for the first h2 — "W" of "Wie"
  const offset1 = lineColToOffset(src, 6, 7);
  assert.equal(src[offset1], 'W');
  const r1 = rewriteTag(src, offset1, 'h2', 'Over ons');
  assert.ok(r1.ok, r1.error);

  // And "8:7" for the second h2
  const offset2 = lineColToOffset(r1.out, 8, 7);
  assert.equal(r1.out[offset2], 'L');
  const r2 = rewriteTag(r1.out, offset2, 'h2', 'Word lid');
  assert.ok(r2.ok, r2.error);

  assert.match(r2.out, /<h2>Over ons<\/h2>/);
  assert.match(r2.out, /<h2>Word lid<\/h2>/);
  assert.match(r2.out, /<p>We zijn een club\.<\/p>/);
});
