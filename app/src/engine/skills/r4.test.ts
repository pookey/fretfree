import { describe, expect, it } from 'vitest';
import { RHYTHM_CELLS, rhythmCell } from '../../theory/rhythm';
import { SEED_CONFUSIONS } from '../confusions';
import { moduleOfTopic } from '../frontier';
import { parseRhythmCellItemId } from '../items/rhythm-cell';
import { getSkill } from './index';
import { R4_DRILLS, skills } from './r4';

const ids = (id: string) =>
  getSkill(id)!
    .items()
    .map((i) => i.id);

describe('R4 rhythm-cell skills', () => {
  it('teaches the cells in stages: eighths, sixteenths, dotted, triplets, syncopation, then 6/8', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'R4.eighths',
      'R4.sixteenths',
      'R4.dotted',
      'R4.triplets',
      'R4.syncopation',
      'R4.compound',
      'R4.compound-dotted',
    ]);
    expect(ids('R4.eighths')).toEqual([
      'rhythm:quarter',
      'rhythm:quarter-rest',
      'rhythm:two-8ths',
      'rhythm:half',
      'rhythm:two-quarters',
    ]);
    expect(ids('R4.dotted')).toEqual([
      'rhythm:dotted-8th-16th',
      'rhythm:16th-dotted-8th',
      'rhythm:dotted-quarter-8th',
    ]);
    expect(ids('R4.compound')).toEqual([
      'rhythm:dotted-quarter',
      'rhythm:three-8ths',
      'rhythm:quarter-8th',
      'rhythm:six-16ths',
    ]);
    // Orders rise with the stages.
    const orders = skills.map((s) => s.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it('holds every cell of the catalogue exactly once, as rhythm-cell items', () => {
    const all = skills.flatMap((s) => s.items());
    expect(all.map((i) => i.id).sort()).toEqual(RHYTHM_CELLS.map((c) => c.id).sort());
    for (const s of skills) {
      for (const item of s.items()) {
        expect(item.skillId).toBe(s.id);
        expect(parseRhythmCellItemId(item.id)?.kind).toBe('rhythm');
      }
      // A skill's cells share a feel: compound cells wait for 6/8.
      const feels = new Set(s.items().map((i) => rhythmCell(i.id).feel));
      expect(feels.size).toBe(1);
    }
  });

  it('opens after reading a time signature and tapping eighths, and 6/8 once it is heard', () => {
    expect(getSkill('R4.eighths')!.prerequisites).toEqual(['T1.simple-meters', 'F4.eighths']);
    expect(getSkill('R4.compound')!.prerequisites).toEqual(['R4.eighths', 'T4.compound']);
    for (const s of skills) {
      expect(s).toMatchObject({ topic: 'R4', softUnlock: true, skipPlacement: true });
      expect(s.drillTypes).toEqual(R4_DRILLS);
      for (const p of s.prerequisites) expect(getSkill(p), p).toBeDefined();
    }
    expect(moduleOfTopic('R4')?.id).toBe('reading');
  });

  it('seeds the dotted-vs-straight pairs so a session mixes them from the start', () => {
    const seeds = SEED_CONFUSIONS.map(([a, b]) => [a, b].sort().join('|'));
    for (const [a, b] of [
      ['rhythm:dotted-8th-16th', 'rhythm:two-8ths'],
      ['rhythm:dotted-quarter-8th', 'rhythm:two-quarters'],
      ['rhythm:siciliano', 'rhythm:three-8ths'],
    ] as const) {
      expect(seeds).toContain([a, b].sort().join('|'));
      // Both are real cards, and each names the other (or its straight partner) as confusable.
      expect(parseRhythmCellItemId(a)).not.toBeNull();
      expect(parseRhythmCellItemId(b)).not.toBeNull();
      expect(rhythmCell(a).confusable).toBe(rhythmCell(b).slug);
    }
  });
});
