import { lazyPart } from './lazy-part';

/**
 * Context-panel parts that load on first render (design §10 first-load
 * budget). Import these, not the modules behind them, from a drill's panel:
 * a static import would pull the module back into first-load JS. They share
 * one chunk (`lazy-parts.ts`).
 */

/** The current chord as a chart (components/chord-diagram, design §8). */
export const LazyChordDiagram = lazyPart(() => import('./lazy-parts').then((m) => m.ChordDiagram));

/** The chord's CAGED chain over a small neck (`CagedChainMap`). */
export const LazyCagedChainMap = lazyPart(() =>
  import('./lazy-parts').then((m) => m.CagedChainMap),
);

/** A major key's diatonic chords (`DiatonicChords`). */
export const LazyDiatonicChords = lazyPart(() =>
  import('./lazy-parts').then((m) => m.DiatonicChords),
);
