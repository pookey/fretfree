/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FretFree',
        short_name: 'FretFree',
        description:
          'Open the page. Pick up the guitar. A free, open-source fretboard trainer: notes, intervals, chords, CAGED and harmony.',
        theme_color: '#1b1626',
        background_color: '#1b1626',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    // The persistent transform cache keys on file content, so an unchanged
    // module that uses import.meta.glob (the registries) keeps a stale file
    // list after new siblings land. The quality gate must never see that.
    fsModuleCache: false,
    environment: 'jsdom',
    // Verify runs while several worktrees verify at once (load 40–50 on 10
    // cores). The 5 s default failed healthy tests in the integration lane.
    testTimeout: 20_000,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: [
        'src/theory/**',
        'src/engine/**',
        'src/storage/**',
        'src/drills/**',
        'src/session/**',
        'src/mic/**',
      ],
      exclude: ['**/*.test.*', '**/index.ts', '**/*.tsx'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});
