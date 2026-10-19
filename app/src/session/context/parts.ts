import { lazyPart } from './lazy-part';

/**
 * Context-panel parts that load on first render (design §10 first-load
 * budget). Import these, not the modules behind them, from a drill's panel:
 * a static import would pull the module back into first-load JS.
 */

/** The chord's CAGED chain over a small neck (`CagedChainMap`). */
export const LazyCagedChainMap = lazyPart(() =>
  import('./CagedChainMap').then((m) => m.CagedChainMap),
);
