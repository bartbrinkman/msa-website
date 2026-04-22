// Pure functions for the edit integration. Kept separate for testing.

export const EDITABLE_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

// Given Tiptap's cleaned HTML output and the original block's tag, return the
// HTML string to send to rewriteBlock as `newOuter`. Rules:
//   - Lists (<ul>/<ol>) keep their tag. If Tiptap didn't produce a list (e.g.
//     content got transformed), wrap with the original tag.
//   - For p/h1-h6, trust whatever top-level p/h* Tiptap produced (the user
//     may have changed the heading level via the bubble-menu dropdown). If
//     Tiptap produced something else, fall back to wrapping in the original tag.
export function reshapeOuterForSave(tag, newContent) {
  if (tag === 'ul' || tag === 'ol') {
    return /^<(ul|ol)[\s>]/i.test(newContent) ? newContent : `<${tag}>${newContent}</${tag}>`;
  }
  if (/^<(p|h[1-6])(?:\s|>)/i.test(newContent)) return newContent;
  return `<${tag}>${newContent}</${tag}>`;
}

// Pretty-print a block element so its direct block children go on their own
// line, indented one step past the outer tag — matches how every .astro file
// in this repo is written. Inline content (text, <strong>, <a>, …) stays on
// the same line as its parent's opening tag.
//
// `indent` is the whitespace prefix of the outer block's opening `<` in the
// source file. `indentStep` is what to add for each nesting level.
//
// Conservative on failure: if parsing runs into anything unexpected, return
// the input unchanged rather than risk corrupting the save.
const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li']);
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);

export function formatBlock(html, indent = '', indentStep = '  ') {
  const trimmed = html.trim();
  const open = parseOpenTag(trimmed, 0);
  if (!open || !BLOCK_TAGS.has(open.name.toLowerCase())) return html;

  const closeTag = '</' + open.name;
  const lower = trimmed.toLowerCase();
  if (!lower.endsWith(closeTag + '>')) return html;
  const innerStart = open.end;
  const innerEnd = trimmed.length - (closeTag.length + 1);
  const inner = trimmed.slice(innerStart, innerEnd);

  const children = splitChildren(inner);
  if (children === null) return html;

  // If every child is inline (or whitespace), keep the block on a single line.
  const hasBlockChild = children.some((c) => c.type === 'element' && BLOCK_TAGS.has(c.name.toLowerCase()));
  if (!hasBlockChild) {
    const innerCompact = children.map((c) => c.raw).join('').trim();
    return `${open.raw}${innerCompact}</${open.name}>`;
  }

  const childIndent = indent + indentStep;
  const lines = [];
  for (const c of children) {
    if (c.type === 'text') {
      if (!c.raw.trim()) continue;
      lines.push(childIndent + c.raw.trim());
    } else {
      lines.push(childIndent + formatBlock(c.raw, childIndent, indentStep));
    }
  }
  return `${open.raw}\n${lines.join('\n')}\n${indent}</${open.name}>`;
}

// Parse an opening tag at `i` in `src`. Returns { name, raw, end, selfClosing }
// or null if `src[i]` isn't `<` or parsing fails. `end` is the index right
// after `>`.
function parseOpenTag(src, i) {
  if (src[i] !== '<') return null;
  if (!/[a-zA-Z]/.test(src[i + 1] || '')) return null;
  let j = i + 1;
  while (j < src.length && /[a-zA-Z0-9]/.test(src[j])) j++;
  const name = src.slice(i + 1, j);
  // Scan to `>` respecting quotes.
  let quote = null;
  while (j < src.length) {
    const ch = src[j];
    if (quote) { if (ch === quote) quote = null; j++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; j++; continue; }
    if (ch === '>') {
      const selfClosing = src[j - 1] === '/' || VOID_TAGS.has(name.toLowerCase());
      return { name, raw: src.slice(i, j + 1), end: j + 1, selfClosing };
    }
    j++;
  }
  return null;
}

// Split the inner HTML of a block into a flat list of direct children:
//   { type: 'text', raw } or { type: 'element', name, raw }
// Nested elements keep their own inner contents in `raw` verbatim.
// Returns null on parse failure.
function splitChildren(inner) {
  const children = [];
  let i = 0;
  let textStart = 0;
  while (i < inner.length) {
    if (inner[i] !== '<') { i++; continue; }
    // Flush any pending text.
    if (i > textStart) children.push({ type: 'text', raw: inner.slice(textStart, i) });

    const open = parseOpenTag(inner, i);
    if (!open) { i++; textStart = i; continue; }
    if (open.selfClosing) {
      children.push({ type: 'element', name: open.name, raw: open.raw });
      i = open.end;
      textStart = i;
      continue;
    }
    // Find matching closer, counting nested same-named tags.
    const close = '</' + open.name;
    const lower = inner.toLowerCase();
    const nameLen = open.name.length;
    let depth = 1, k = open.end;
    while (k < inner.length) {
      if (lower.startsWith('<' + open.name.toLowerCase(), k) && /[\s>/]/.test(inner[k + 1 + nameLen] || '')) {
        depth++; k += 1 + nameLen; continue;
      }
      if (lower.startsWith(close.toLowerCase(), k) && /[\s>]/.test(inner[k + close.length] || '')) {
        depth--;
        if (depth === 0) {
          const gt = inner.indexOf('>', k);
          if (gt < 0) return null;
          children.push({ type: 'element', name: open.name, raw: inner.slice(i, gt + 1) });
          i = gt + 1;
          textStart = i;
          break;
        }
        k += close.length; continue;
      }
      k++;
    }
    if (depth !== 0) return null;
  }
  if (textStart < inner.length) children.push({ type: 'text', raw: inner.slice(textStart) });
  return children;
}

// Given the full source and an offset to the opening `<` of an element, return
// the whitespace prefix on that line up to the `<`. Used to match the source's
// existing indent when we pretty-print a replacement block. Returns an empty
// string if the line has non-whitespace before the `<` (unusual — means the
// element shares a line with other code).
export function indentBefore(src, ltIndex) {
  let lineStart = ltIndex;
  while (lineStart > 0 && src[lineStart - 1] !== '\n') lineStart--;
  const prefix = src.slice(lineStart, ltIndex);
  return /^\s*$/.test(prefix) ? prefix : '';
}

// Clean Tiptap's getHTML output before it hits disk:
//   - Drop trailing empty <p> selection anchors (<p></p>, <p><br ...></p>).
//   - Unwrap single <p> children inside <li> so list items stay as plain text.
//   - Strip Tiptap-internal helper classes (e.g. ProseMirror-trailingBreak).
export function cleanTiptapHtml(html) {
  let out = html;

  out = out.replace(/\s*<br\s+class="ProseMirror-trailingBreak"[^>]*>\s*/gi, '');

  // Repeatedly strip trailing empty <p>…</p> blocks.
  let prev;
  do {
    prev = out;
    out = out.replace(/<p>\s*<\/p>\s*$/i, '').trim();
  } while (out !== prev);

  // Unwrap <li><p>text</p></li>  →  <li>text</li>. Only when the <li> contains
  // exactly one <p> and nothing else. The inner must not itself contain </p>.
  out = out.replace(/<li>\s*<p>((?:(?!<\/?p[\s>]).)*?)<\/p>\s*<\/li>/gis, (_m, inner) => `<li>${inner}</li>`);

  return out;
}

// Within a slice of source starting at `<tag` and ending at `>`, find the
// bounds of the value portion of the named attribute. Returns
// { valueStart, valueEnd } with absolute offsets into the full source, or
// null if the attribute isn't present. The value bounds include the
// surrounding quotes or `{…}` so the caller can overwrite the whole thing.
//
// Handles:
//   name="foo"      → valueStart = index of `"`, valueEnd = index AFTER closing `"`
//   name='foo'      → same for `'`
//   name={expr}     → valueStart = index of `{`, valueEnd = index AFTER matching `}`
//   name            → (boolean attr) — not matched, returns null since there's no value to replace
export function findAttributeValueBounds(src, ltIndex, gtIndex, attrName) {
  // Scan only within the opening tag, respecting the same quote/brace state.
  let i = ltIndex + 1;
  let quote = null;
  let brace = 0;
  const lowerAttr = attrName.toLowerCase();
  while (i < gtIndex) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (brace > 0) {
      if (ch === '{') brace++;
      else if (ch === '}') brace--;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
    if (ch === '{') { brace++; i++; continue; }

    // Look for `attrName` as a word followed by `=`.
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < gtIndex && /[a-zA-Z0-9_:-]/.test(src[j])) j++;
      const name = src.slice(i, j).toLowerCase();
      // Skip whitespace
      let k = j;
      while (k < gtIndex && /\s/.test(src[k])) k++;
      if (name === lowerAttr && src[k] === '=') {
        // Found it. Skip `=` and optional whitespace.
        let v = k + 1;
        while (v < gtIndex && /\s/.test(src[v])) v++;
        if (src[v] === '"' || src[v] === "'") {
          const q = src[v];
          const end = src.indexOf(q, v + 1);
          if (end < 0 || end >= gtIndex) return null;
          return { valueStart: v, valueEnd: end + 1 };
        }
        if (src[v] === '{') {
          // Match braces
          let depth = 1;
          let m = v + 1;
          let vq = null;
          while (m < gtIndex && depth > 0) {
            const mc = src[m];
            if (vq) {
              if (mc === vq) vq = null;
            } else if (mc === '"' || mc === "'") {
              vq = mc;
            } else if (mc === '{') {
              depth++;
            } else if (mc === '}') {
              depth--;
            }
            m++;
          }
          if (depth !== 0) return null;
          return { valueStart: v, valueEnd: m };
        }
        // Unquoted attribute value (rare in JSX/astro but legal in raw HTML)
        let u = v;
        while (u < gtIndex && !/\s/.test(src[u]) && src[u] !== '>') u++;
        if (u === v) return null;
        return { valueStart: v, valueEnd: u };
      }
      i = j;
      continue;
    }
    i++;
  }
  return null;
}

// Replace the entire outer element (opening tag + inner + closing tag) whose
// content starts at `offset`. `newOuter` must be valid HTML (an element).
// Unlike rewriteTag this preserves nothing about the original element — the
// caller is expected to produce a reasonable replacement.
//
// The caller still specifies `tag` as a safety check: we only rewrite if the
// element at `offset` matches. This prevents a stale (line,col) accidentally
// overwriting the wrong element after a file edit.
export function rewriteBlock(src, offset, tag, newOuter) {
  const innerStart = offset;
  if (innerStart < 0 || innerStart > src.length) return { ok: false, error: 'offset out of range' };

  let gt = innerStart - 1;
  while (gt > 0 && /\s/.test(src[gt])) gt--;
  if (src[gt] !== '>') return { ok: false, error: 'did not find end of opening tag before loc' };

  let lt = -1;
  for (let k = gt - 1; k >= 0; k--) {
    if (src[k] !== '<') continue;
    if (src[k + 1] === '!' || src[k + 1] === '/') continue;
    if (!/[a-zA-Z]/.test(src[k + 1] || '')) continue;
    if (parseOpeningTagEnd(src, k) === gt) { lt = k; break; }
  }
  if (lt < 0) return { ok: false, error: 'opening tag start not found' };

  const opener = src.slice(lt, gt + 1);
  const tagMatch = opener.match(/^<\s*([a-zA-Z][a-zA-Z0-9]*)/);
  if (!tagMatch || tagMatch[1].toLowerCase() !== tag.toLowerCase()) {
    return { ok: false, error: `expected <${tag}>, found ${opener.slice(0, 40)}` };
  }

  const closeTag = '</' + tag;
  const lower = src.toLowerCase();
  const tagLen = tag.length;
  let depth = 0;
  let j = innerStart;
  while (j < src.length) {
    if (lower.startsWith('<' + tag, j) && /[\s>/]/.test(src[j + 1 + tagLen] || '')) {
      depth++;
      j += 1 + tagLen;
      continue;
    }
    if (lower.startsWith(closeTag, j)) {
      if (depth === 0) break;
      depth--;
      j += closeTag.length;
      continue;
    }
    j++;
  }
  if (j >= src.length) return { ok: false, error: 'closing tag not found' };
  // Advance past `</tag>`
  const closeStart = j;
  let closeEnd = j + closeTag.length;
  while (closeEnd < src.length && src[closeEnd] !== '>') closeEnd++;
  if (closeEnd >= src.length) return { ok: false, error: 'unterminated closing tag' };
  const elementEnd = closeEnd + 1;

  // Refuse if the current inner contains an Astro expression — same policy as rewriteTag.
  const currentInner = src.slice(innerStart, closeStart);
  if (/[{}]/.test(currentInner)) {
    return { ok: false, error: 'element contains an expression; edit source directly' };
  }

  const formatted = formatBlock(newOuter, indentBefore(src, lt));
  return { ok: true, out: src.slice(0, lt) + formatted + src.slice(elementEnd) };
}

// Read the raw `href` attribute source (quotes/braces included) for the
// `<a>` whose content starts at `offset`. Returns { ok, raw } or { ok:false, error }.
export function readAnchorHref(src, offset) {
  const innerStart = offset;
  if (innerStart < 0 || innerStart > src.length) return { ok: false, error: 'offset out of range' };
  let gt = innerStart - 1;
  while (gt > 0 && /\s/.test(src[gt])) gt--;
  if (src[gt] !== '>') return { ok: false, error: 'did not find end of opening tag' };
  let lt = -1;
  for (let k = gt - 1; k >= 0; k--) {
    if (src[k] !== '<') continue;
    if (src[k + 1] === '!' || src[k + 1] === '/') continue;
    if (!/[a-zA-Z]/.test(src[k + 1] || '')) continue;
    if (parseOpeningTagEnd(src, k) === gt) { lt = k; break; }
  }
  if (lt < 0) return { ok: false, error: 'opening tag start not found' };
  const opener = src.slice(lt, gt + 1);
  const tagMatch = opener.match(/^<\s*([a-zA-Z][a-zA-Z0-9]*)/);
  if (!tagMatch || tagMatch[1].toLowerCase() !== 'a') {
    return { ok: false, error: 'expected <a>' };
  }
  const bounds = findAttributeValueBounds(src, lt, gt, 'href');
  if (!bounds) return { ok: false, error: 'href not found' };
  return { ok: true, raw: src.slice(bounds.valueStart, bounds.valueEnd) };
}

// Rewrite both the inner HTML and the `href` attribute of an `<a>` tag
// whose content starts at `offset` (Astro's data-astro-source-loc style).
// `newHref` is injected verbatim as the attribute value — the caller is
// responsible for including the quotes / braces, matching the source style.
// Examples:
//   newHref === '"/foo"'            → href="/foo"
//   newHref === "'/foo'"            → href='/foo'
//   newHref === '{asset("/foo")}'   → href={asset("/foo")}
export function rewriteAnchor(src, offset, newInnerHtml, newHrefRaw) {
  const innerStart = offset;
  if (innerStart < 0 || innerStart > src.length) return { ok: false, error: 'offset out of range' };

  // Find the `>` ending the opening <a> tag (tolerate whitespace before content).
  let gt = innerStart - 1;
  while (gt > 0 && /\s/.test(src[gt])) gt--;
  if (src[gt] !== '>') return { ok: false, error: 'did not find end of opening tag before loc' };

  // Find matching `<` via forward verification.
  let lt = -1;
  for (let k = gt - 1; k >= 0; k--) {
    if (src[k] !== '<') continue;
    if (src[k + 1] === '!' || src[k + 1] === '/') continue;
    if (!/[a-zA-Z]/.test(src[k + 1] || '')) continue;
    if (parseOpeningTagEnd(src, k) === gt) { lt = k; break; }
  }
  if (lt < 0) return { ok: false, error: 'opening tag start not found' };

  const opener = src.slice(lt, gt + 1);
  const tagMatch = opener.match(/^<\s*([a-zA-Z][a-zA-Z0-9]*)/);
  if (!tagMatch || tagMatch[1].toLowerCase() !== 'a') {
    return { ok: false, error: `expected <a>, found ${opener.slice(0, 40)}` };
  }

  // Find matching `</a>` accounting for potential nesting (invalid HTML, but possible).
  const lower = src.toLowerCase();
  let depth = 0;
  let j = innerStart;
  while (j < src.length) {
    if (lower.startsWith('<a', j) && /[\s>/]/.test(src[j + 2] || '')) {
      depth++; j += 2; continue;
    }
    if (lower.startsWith('</a', j)) {
      if (depth === 0) break;
      depth--; j += 3; continue;
    }
    j++;
  }
  if (j >= src.length) return { ok: false, error: 'closing tag not found' };
  const innerEnd = j;

  // Refuse edits where inner contains an expression — matches rewriteTag behavior.
  const currentInner = src.slice(innerStart, innerEnd);
  if (/[{}]/.test(currentInner)) {
    return { ok: false, error: 'element contains an expression; edit source directly' };
  }

  // Locate href inside the opening tag.
  const hrefBounds = findAttributeValueBounds(src, lt, gt, 'href');
  if (!hrefBounds) return { ok: false, error: 'href attribute not found on <a>' };

  // Apply both edits in one pass (href first since it's earlier in the source).
  let out = src.slice(0, hrefBounds.valueStart)
    + newHrefRaw
    + src.slice(hrefBounds.valueEnd, innerStart)
    + newInnerHtml
    + src.slice(innerEnd);

  return { ok: true, out };
}

// Given `ltIndex` pointing at a `<`, scan forward through the opening tag
// (including any attributes) and return the index of the matching `>`.
// Respects double- and single-quoted attribute values and `{…}` expressions.
// Returns -1 if no matching `>` is found.
export function parseOpeningTagEnd(src, ltIndex) {
  if (src[ltIndex] !== '<') return -1;
  let i = ltIndex + 1;
  let quote = null;
  let brace = 0;
  while (i < src.length) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '{') {
      brace++;
    } else if (ch === '}') {
      if (brace > 0) brace--;
    } else if (ch === '>' && brace === 0) {
      return i;
    }
    i++;
  }
  return -1;
}

// Convert a 1-based (line, col) into a byte offset in `src`.
// Returns -1 if the position is out of range.
export function lineColToOffset(src, line, col) {
  if (line < 1 || col < 1) return -1;
  let l = 1, c = 1;
  for (let i = 0; i < src.length; i++) {
    if (l === line && c === col) return i;
    if (src[i] === '\n') { l++; c = 1; } else { c++; }
  }
  return l === line && c === col ? src.length : -1;
}

// Rewrite inner HTML of a `<tag>` whose inner content starts at `offset`.
// `offset` is Astro's `data-astro-source-loc` — the character right after the `>` of the opening tag.
//
// Returns { ok: true, out } on success, or { ok: false, error } on failure.
//
// Failure cases (intentional):
//   - Opening-tag character preceding `offset` is not `>` (with tolerant whitespace scan).
//   - The backward scan for the matching `<` fails.
//   - The discovered tag name doesn't match the requested `tag`.
//   - The closing `</tag>` is not found.
//   - The current inner content contains `{` or `}` (Astro expression).
export function rewriteTag(src, offset, tag, newHtml) {
  const innerStart = offset;
  if (innerStart < 0 || innerStart > src.length) return { ok: false, error: 'offset out of range' };

  // Expect the char right before `innerStart` to be `>`. Tolerate whitespace
  // (Astro's loc sometimes lands on the first non-whitespace content char).
  let gt = innerStart - 1;
  while (gt > 0 && /\s/.test(src[gt])) gt--;
  if (src[gt] !== '>') return { ok: false, error: 'did not find end of opening tag before loc' };

  // Find the matching `<` of this opening tag. Walking backward has to deal
  // with quoted attribute values that may contain `<` or `>`; that's tricky
  // because we don't know where quoted regions start until we've passed them.
  //
  // Simpler + correct: find candidate `<` positions by scanning backward,
  // then forward-parse each candidate to see if it lands exactly on our `>`.
  let lt = -1;
  for (let k = gt - 1; k >= 0; k--) {
    if (src[k] !== '<') continue;
    // Skip comments and closers that can't be opening tags.
    if (src[k + 1] === '!' || src[k + 1] === '/') continue;
    // Must look like `<tagname…`
    if (!/[a-zA-Z]/.test(src[k + 1] || '')) continue;
    // Forward-parse from k, respecting quotes/braces. If we reach exactly `gt`, it's our match.
    const fwdEnd = parseOpeningTagEnd(src, k);
    if (fwdEnd === gt) { lt = k; break; }
  }
  if (lt < 0) return { ok: false, error: 'opening tag start not found' };

  const opener = src.slice(lt, gt + 1);
  const tagMatch = opener.match(/^<\s*([a-zA-Z][a-zA-Z0-9]*)/);
  if (!tagMatch || tagMatch[1].toLowerCase() !== tag.toLowerCase()) {
    return { ok: false, error: `expected <${tag}>, found ${opener.slice(0, 40)}` };
  }

  // Scan forward for the matching `</tag>`, tracking nested same-named tags.
  const closeTag = '</' + tag;
  const lower = src.toLowerCase();
  const tagLen = tag.length;
  let depth = 0;
  let j = innerStart;
  while (j < src.length) {
    if (lower.startsWith('<' + tag, j) && /[\s>/]/.test(src[j + 1 + tagLen] || '')) {
      depth++;
      j += 1 + tagLen;
      continue;
    }
    if (lower.startsWith(closeTag, j)) {
      if (depth === 0) break;
      depth--;
      j += closeTag.length;
      continue;
    }
    j++;
  }
  if (j >= src.length) return { ok: false, error: 'closing tag not found' };
  const innerEnd = j;

  const currentInner = src.slice(innerStart, innerEnd);
  if (/[{}]/.test(currentInner)) {
    return { ok: false, error: 'element contains an expression; edit source directly' };
  }

  return { ok: true, out: src.slice(0, innerStart) + newHtml + src.slice(innerEnd) };
}
