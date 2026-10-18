import type { GuideLevel } from '../../engine/model';

/**
 * Guide fading for tab (docs/design/tab-track.md, design §3.5): the string
 * names at the left of the lines fade away as the learner improves.
 *
 * | Level | Shows |
 * |---|---|
 * | 3 | every line's name and its string number |
 * | 2 | every line's name |
 * | 1 | only the top and bottom lines' names, as anchors to count from |
 * | 0 | bare lines |
 */
export interface TabGuide {
  names: 'all' | 'ends' | 'none';
  numbers: boolean;
}

export function tabGuide(level: GuideLevel): TabGuide {
  if (level >= 3) return { names: 'all', numbers: true };
  if (level === 2) return { names: 'all', numbers: false };
  if (level === 1) return { names: 'ends', numbers: false };
  return { names: 'none', numbers: false };
}

/** Whether a line's name shows at this guide level. */
export function showsLineName(guide: TabGuide, string: number, lineCount: number): boolean {
  if (guide.names === 'all') return true;
  if (guide.names === 'ends') return string === 1 || string === lineCount;
  return false;
}
