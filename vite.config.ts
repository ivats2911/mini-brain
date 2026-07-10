import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Same-origin proxy for AI providers: keeps the authorization header off
    // cross-origin requests (no CORS preflight), which some environments and
    // corporate proxies block. Dev-server only; production builds call the
    // providers directly.
    proxy: {
      '/ai-proxy/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ai-proxy\/openai/, ''),
      },
      '/ai-proxy/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ai-proxy\/anthropic/, ''),
      },
      // Capture bridge (server/capture.mjs) — phone/Telegram/OpenClaw thoughts.
      '/ingest': {
        target: 'http://127.0.0.1:4820',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ingest/, ''),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
