#!/usr/bin/env node
// Fetch the nylon guitar samples (M4-15) into app/public/samples/nylon/, one
// MP3 per MIDI note across the neck (E2–E6, frets 0–24). They are checked in;
// this script regenerates them from a pinned commit of midi-js-soundfonts,
// which pre-renders the FluidR3 GM soundfont (MIT, Frank Wen) per note.
//
// Usage: node scripts/fetch-samples.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMIT = '044fab8e1456bfafc5776e86dfd6bb8697149aef';
const BASE = `https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/${COMMIT}/FluidR3_GM/acoustic_guitar_nylon-mp3`;
// Keep in step with AUDIO.samples in app/src/audio/config.ts.
const LOW = 40;
const HIGH = 88;
// midi-js-soundfonts spells every black key as a flat.
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'app',
  'public',
  'samples',
  'nylon',
);
mkdirSync(out, { recursive: true });

let bytes = 0;
for (let midi = LOW; midi <= HIGH; midi++) {
  const name = `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
  const res = await fetch(`${BASE}/${name}.mp3`);
  if (!res.ok) throw new Error(`${name}.mp3: HTTP ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  // An MPEG frame sync or an ID3 tag: anything else isn't the sample.
  if (!(data[0] === 0xff || data.subarray(0, 3).toString() === 'ID3')) {
    throw new Error(`${name}.mp3 is not an MP3`);
  }
  writeFileSync(join(out, `${midi}.mp3`), data);
  bytes += data.length;
}
console.log(`fetch-samples: ${HIGH - LOW + 1} notes, ${Math.round(bytes / 1024)} KB in ${out}`);
