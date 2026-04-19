// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://bartbrinkman.github.io',
  base: '/msa-website',
  vite: {
    plugins: [tailwindcss()]
  }
});
