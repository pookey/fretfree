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
        name: 'Fretwork',
        short_name: 'Fretwork',
        description: 'Learn the guitar fretboard, intervals, chords, CAGED and harmony.',
        theme_color: '#14110f',
        background_color: '#14110f',
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
      ],
      exclude: ['**/*.test.*', '**/index.ts', '**/*.tsx'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});
