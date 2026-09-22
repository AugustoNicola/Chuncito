import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');

export default defineConfig({
  plugins: [react()],
  server: {
    // The vendored Prolog lives outside frontend/; allow Vite to read it so
    // the .pl files have a single source of truth (scorer/mahjonglog/src).
    fs: { allow: [REPO_ROOT] },
    // The FastAPI backend (`backend/`, `uvicorn app.main:app`). Proxied rather
    // than called cross-origin so the PIN cookie is same-origin, as it is in
    // production where the backend serves the app itself.
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  // swipl-wasm ships prebuilt CJS bundles; keep Vite from trying to optimise them.
  optimizeDeps: { exclude: ['swipl-wasm'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as any);
