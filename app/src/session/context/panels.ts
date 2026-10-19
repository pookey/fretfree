/**
 * The drills' context panels that load on first use, in one chunk. Each
 * drill's `contextPanel` loads its panel from here, not from its own
 * `ContextPanel.tsx`: with a chunk per panel, the bundler moved modules the
 * panels share with the entry into a shared chunk, which costs first-load
 * gzip (design §10 budget). One chunk keeps them beside the entry instead.
 */
export { SpellingContextPanel } from '../../drills/d7-spell-it/ContextPanel';
export { ChordTonePanel } from '../../drills/d8-chord-tone/ContextPanel';
export { CagedChainPanel } from '../../drills/d9-build-caged/ContextPanel';
