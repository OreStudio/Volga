import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The browser bundle.
 *
 * The BFF runs on a different origin in development, so `/api` is proxied
 * rather than called cross-origin. That keeps the session cookie first-party and
 * means the production build needs no CORS configuration at all.
 *
 * Both ports sit in the environment's own block, beside the environment's HTTP
 * server on 21800 and its NATS on 21805, rather than on the crowded 8080 and
 * 5173 defaults. The BFF port is read from the same variable the BFF reads, so
 * there is one number rather than two that can disagree.
 */
const BFF_PORT = process.env['VOLGA_BFF_PORT'] ?? '21801';
const WEB_PORT = Number(process.env['VOLGA_WEB_PORT'] ?? '21802');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: WEB_PORT,
    // Fail rather than slide to another port: a dev server that quietly moves is
    // a dev server whose URL somebody writes down and then cannot reach.
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${BFF_PORT}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
