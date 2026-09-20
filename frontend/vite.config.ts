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
  },
  // swipl-wasm ships prebuilt CJS bundles; keep Vite from trying to optimise them.
  optimizeDeps: { exclude: ['swipl-wasm'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as any);
