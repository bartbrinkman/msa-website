// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import edit from './integrations/edit/index.mjs';

export default defineConfig({
  site: 'https://bartbrinkman.github.io',
  base: '/msa-website',
  integrations: [edit()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['@tiptap/core', '@tiptap/starter-kit', '@tiptap/extension-link', '@tiptap/extension-bubble-menu'],
    },
    resolve: {
      dedupe: [
        '@tiptap/core',
        'prosemirror-state',
        'prosemirror-view',
        'prosemirror-model',
        'prosemirror-transform',
        'prosemirror-commands',
        'prosemirror-keymap',
      ],
    },
  }
});
