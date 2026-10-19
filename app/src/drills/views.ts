/**
 * Every drill's view and context panel, in one chunk that a session loads on
 * demand (design §10 first-load budget). Each drill's `drill.ts` loads its
 * parts from here with `lazyView`, not from its own files: with a chunk per
 * part, the bundler moves modules they share with the entry into extra
 * first-load chunks, which costs gzip. Add one line per part of a new drill.
 */
export { D1View } from './d1-name-the-note/D1View';
export { D2View } from './d2-find-the-note/D2View';
export { D3View } from './d3-note-wheel/D3View';
export { NoteWheelContextPanel } from './d3-note-wheel/ContextPanel';
export { D4View } from './d4-octave-finder/D4View';
export { OctaveContextPanel } from './d4-octave-finder/ContextPanel';
export { D5View } from './d5-interval-name/D5View';
export { IntervalContextPanel } from './d5-interval-name/ContextPanel';
export { D6View } from './d6-interval-tap/D6View';
export { IntervalTapContextPanel } from './d6-interval-tap/ContextPanel';
export { D7View } from './d7-spell-it/D7View';
export { SpellingContextPanel } from './d7-spell-it/ContextPanel';
export { D8View } from './d8-chord-tone/D8View';
export { ChordTonePanel } from './d8-chord-tone/ContextPanel';
export { D9View } from './d9-build-caged/D9View';
export { D10View } from './d10-which-shape/D10View';
export { D39View } from './d39-fret-landmarks/D39View';
export { LandmarksContextPanel } from './d39-fret-landmarks/ContextPanel';
