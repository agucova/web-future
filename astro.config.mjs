// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath, URL } from 'node:url';

import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://agucova.dev',
  trailingSlash: 'never',
  integrations: [svelte()],

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '$lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
      },
    },
  },
});