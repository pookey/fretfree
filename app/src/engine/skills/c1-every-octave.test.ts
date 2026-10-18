import { describe, expect, it } from 'vitest';
import { parseItemId } from '../model';
import { getSkill } from './index';

describe('C1 every-octave skill', () => {
  const skill = getSkill('C1.every-octave')!;

  it('has one whole-neck item per pitch class, naturals first', () => {
    expect(skill.items().map((i) => i.id)).toEqual([
      'octaves:C',
      'octaves:D',
      'octaves:E',
      'octaves:F',
      'octaves:G',
      'octaves:A',
      'octaves:B',
      'octaves:C#',
      'octaves:D#',
      'octaves:F#',
      'octaves:G#',
      'octaves:A#',
    ]);
    for (const item of skill.items()) expect(parseItemId(item.id)?.kind).toBe('octaves');
  });

  it('follows the single octave shapes, softly, and is tested by the octave finder', () => {
    expect(skill.prerequisites).toEqual(['C1.octaves', 'C1.octaves-gb-shift']);
    expect(skill.softUnlock).toBe(true);
    expect(skill.drillTypes).toEqual(['octave-finder']);
  });
});
