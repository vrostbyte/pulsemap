/**
 * Vite configuration for PulseMap.
 *
 * Key setup:
 * - Path alias @/ → src/ so imports stay clean across deep directories
 * - CSS Modules enabled by default in Vite (*.module.css)
 * - No special plugins needed for MVP; deck.gl and MapLibre are plain ESM
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  // Ensure large WebGL bundles (deck.gl) don't trigger size warnings
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          maplibre: ['maplibre-gl'],
          deckgl: ['@deck.gl/core', '@deck.gl/layers', '@deck.gl/mapbox'],
        },
      },
    },
  },

  // In dev mode, proxy /api/* to Vercel dev server if running separately.
  // For standalone Vite dev, the edge functions won't run — fetchers fall
  // back to mock data automatically.
  server: {
    port: 5173,
  },
});
