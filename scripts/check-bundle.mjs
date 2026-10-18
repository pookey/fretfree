#!/usr/bin/env node
// First-load JS budget (design §10): the JS a cold start must download, gzip,
// stays at or under BUDGET_KB (1 KB = 1000 bytes, as Vite reports it). Lazily loaded chunks (audio, and anything else
// behind a dynamic import()) don't count, but audio must stay lazy: if Tone.js
// or its Web Audio dependencies land in the first-load graph, the check fails.
//
// First-load JS is the entry <script> and <link rel="modulepreload"> tags in
// app/dist/index.html plus every chunk they import statically. Run after
// `pnpm build`; `pnpm verify` does both.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 250;
// Packages whose sources (from the sourcemap) mark a chunk as audio. The small
// app/src/audio loader is meant to be first-load; it imports Tone lazily.
const AUDIO_PACKAGES = /\/node_modules\/(?:tone|standardized-audio-context|automation-events)\//;

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'dist');
const indexPath = join(dist, 'index.html');
if (!existsSync(indexPath)) {
  console.error(`check-bundle: ${indexPath} is missing. Run \`pnpm build\` first.`);
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
const entries = [
  ...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g),
  ...html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g),
].map((m) => m[1].replace(/^\//, ''));
if (entries.length === 0) {
  console.error('check-bundle: no module entry found in index.html.');
  process.exit(1);
}

// Static imports in minified ESM: `import"./a.js"`, `import{x}from"./b.js"`,
// `export*from"./c.js"`. Dynamic `import("./d.js")` is skipped: no `from`, and
// a parenthesis before the quote.
const STATIC_IMPORT = /(?:\bfrom\s*|\bimport\s*)["']([^"']+\.js)["']/g;

const seen = new Set();
const queue = [...entries];
while (queue.length > 0) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  const code = readFileSync(join(dist, file), 'utf8');
  for (const [, spec] of code.matchAll(STATIC_IMPORT)) {
    if (!spec.startsWith('.') && !spec.startsWith('/')) continue;
    const resolved = spec.startsWith('/')
      ? spec.slice(1)
      : posix.normalize(posix.join(posix.dirname(file), spec));
    // A match inside a string literal is not a real import; ignore it.
    if (existsSync(join(dist, resolved))) queue.push(resolved);
  }
}

const audioIn = (file) => {
  const map = join(dist, `${file}.map`);
  if (!existsSync(map)) return [];
  const { sources = [] } = JSON.parse(readFileSync(map, 'utf8'));
  return sources.filter((s) => AUDIO_PACKAGES.test(s));
};

let total = 0;
const failures = [];
const rows = [...seen].sort().map((file) => {
  const gz = gzipSync(readFileSync(join(dist, file))).length;
  total += gz;
  const audio = audioIn(file);
  if (audio.length > 0) {
    failures.push(`${file} is first-load JS but bundles audio code (${audio[0]}, …).`);
  }
  return `  ${(gz / 1000).toFixed(1).padStart(7)} KB  ${file}`;
});

const totalKb = total / 1000;
console.log('check-bundle: first-load JS (gzip)');
console.log(rows.join('\n'));
console.log(`  ${totalKb.toFixed(1).padStart(7)} KB  total (budget ${BUDGET_KB} KB)`);
if (totalKb > BUDGET_KB) {
  failures.push(`first-load JS is ${totalKb.toFixed(1)} KB gzip, over the ${BUDGET_KB} KB budget.`);
}
if (failures.length > 0) {
  for (const f of failures) console.error(`check-bundle: ${f}`);
  process.exit(1);
}
console.log('check-bundle: OK');
