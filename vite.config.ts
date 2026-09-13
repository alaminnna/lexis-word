import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
     host: true,
    proxy: {
      // Dev-only proxy for the dictionary API (see README + DictionaryService).
      // Usage: set VITE_DICT_PROXY=1 and call /api-dict/... instead of the origin.
      // Browser-like headers: the API sits behind Cloudflare bot management,
      // which challenges Node's default TLS/header fingerprint but serves
      // real browsers (and curl) normally.
      '/api-dict': {
        target: 'https://www.jumpinto.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-dict/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.jumpinto.com/ielts/vocabulary',
          'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
      },
      // Same-origin proxy contract used in production (api/dict-search.ts on
      // Vercel). Mirrored here so `vite dev` exercises the exact same
      // `/api/dict-search?sword=WORD` URL the production build uses.
      '/api/dict-search': {
        target: 'https://www.jumpinto.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/dict-search/, '/api/v1/assessment/ielts/vocab/vocabulary/search'),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.jumpinto.com/ielts/vocabulary',
          'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
      },
      // Dev-only proxy for the Cline AI gateway (same CORS reality as the
      // dictionary API: browsers are blocked, so dev goes same-origin).
      // Usage: VITE_AI_PROXY=1 and call /api-cline/... instead of the origin.
      '/api-cline': {
        target: 'https://api.cline.bot',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-cline/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
