import type { SkillStatus } from './model';

/**
 * A status overlay (M1-36): a view-only change to derived skill statuses,
 * for the development build's "unlock every skill" switch. Callers derive the
 * real statuses first, then pass them through `overlayStatus`. The overlay is
 * never stored, so without it the real statuses come back unchanged.
 */
export interface StatusOverlay {
  /** Treat every locked skill as unlocked, so it joins the frontier. */
  readonly unlockAll?: boolean;
}

/**
 * A derived status with the overlay applied. Mastered skills stay mastered:
 * they have no new items to feed, and serving their stable cards early would
 * be cramming (research/02 rule 11).
 */
export function overlayStatus(status: SkillStatus, overlay?: StatusOverlay | null): SkillStatus {
  return overlay?.unlockAll === true && status === 'locked' ? 'unlocked' : status;
}
