/// <reference types="vitest/config" />
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * pdf.js reads its character maps, standard fonts and JavaScript image decoders from the application
 * itself: no CDN, and no WebAssembly (ARCHITECTURE §8). They are copied from the package into
 * public/pdfjs/ (not versioned) before development and build.
 */
function pdfjsAssets(): Plugin {
  return {
    name: 'archive:pdfjs-assets',
    configResolved(config) {
      const source = fileURLToPath(new URL('./node_modules/pdfjs-dist/', import.meta.url));
      const target = join(config.publicDir, 'pdfjs');
      cpSync(join(source, 'cmaps'), join(target, 'cmaps'), { recursive: true });
      cpSync(join(source, 'standard_fonts'), join(target, 'standard_fonts'), { recursive: true });
      mkdirSync(join(target, 'wasm'), { recursive: true });
      for (const file of readdirSync(join(source, 'wasm'))) {
        if (file.endsWith('_nowasm_fallback.js')) {
          cpSync(join(source, 'wasm', file), join(target, 'wasm', file));
        }
      }
    },
  };
}

// Set by the Tauri CLI when developing on a remote device; unset for local development.
const tauriDevHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsAssets()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Tauri expects a fixed port and its own output must stay visible in the terminal.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: tauriDevHost ?? false,
    hmr: tauriDevHost ? { protocol: 'ws', host: tauriDevHost, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Vitest replaces CSS modules with empty ones; the design token tests read tokens.css as raw text.
    css: { include: [/tokens\.css/] },
    restoreMocks: true,
  },
});
