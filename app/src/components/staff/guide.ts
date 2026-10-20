import type { GuideLevel } from '../../engine/model';

/**
 * Guide fading for the tab under the staff (design §12, §3.5): tab is a
 * crutch for reading the staff, so it fades away as reading improves.
 *
 * | Level | Tab under the staff |
 * |---|---|
 * | 3, 2 | shown in full |
 * | 1 | faint, there to check against rather than read from |
 * | 0 | gone |
 */
export type TabVisibility = 'full' | 'faint' | 'none';

export function tabVisibility(level: GuideLevel): TabVisibility {
  if (level >= 2) return 'full';
  if (level === 1) return 'faint';
  return 'none';
}
