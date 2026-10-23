// What a worked example asks the learner to tap (M6-11). A target with no
// degree is the `target` style; a target that is a chord tone keeps its
// degree's marker (the root square, the 5th triangle) with the target's ring
// on top, flagged `data-emphasis`.

/** Every worked-example target on the neck, in either form. */
export const TARGET_MARKERS = '[data-testid="marker-target"], [data-emphasis="true"]';

/**
 * Markers of a style, where `target` means every worked-example target and
 * any other style leaves out the ringed ones (they're targets, not givens).
 */
export function markerSelector(style: string): string {
  return style === 'target'
    ? TARGET_MARKERS
    : `[data-testid="marker-${style}"]:not([data-emphasis])`;
}
