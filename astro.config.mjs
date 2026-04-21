// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import edit from './integrations/edit/index.mjs';

export default defineConfig({
  site: 'https://bartbrinkman.github.io',
  base: '/msa-website',
  integrations: [edit()],
  vite: {
    plugins: [tailwindcss()]
  }
});
