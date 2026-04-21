// Astro Dev Toolbar App. All real logic lives in `client.mjs` (testable).
// This file wires the toolbar's `onToggled` to the editor's enable/disable,
// and injects minimal CSS for the editable state.

import { defineToolbarApp } from 'astro/toolbar';
import { createEditor } from './client.mjs';

const STYLE_ID = '__edit-style';

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    [data-editable] { outline: 1px dashed rgba(0,24,136,0.4); outline-offset: 2px; cursor: text; }
    [data-editable]:hover { outline: 2px solid #001888; background: rgba(0,24,136,0.05); }
    [data-editable][contenteditable="true"] { outline: 2px solid #ffc400; background: rgba(255,196,0,0.08); }
  `;
  doc.head.append(s);
}

export default defineToolbarApp({
  init(_canvas, app) {
    ensureStyle(document);
    const editor = createEditor(document);

    app.onToggled(({ state }) => {
      if (state) editor.enable();
      else editor.disable();
    });
  },
});
