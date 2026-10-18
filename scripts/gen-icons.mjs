// Renders the placeholder app icon SVG to the PNG sizes the PWA needs.
// Usage: node scripts/gen-icons.mjs  (uses Playwright's bundled Chromium)
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../app/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const pub = fileURLToPath(new URL('../app/public/', import.meta.url));
const svg = await readFile(`${pub}icon.svg`, 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of [
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0">${svg.replace('<svg', `<svg width="${size}" height="${size}"`)}</body></html>`,
  );
  await page.screenshot({ path: `${pub}${name}`, omitBackground: false });
}
await browser.close();
console.log('icons written to', pub);
