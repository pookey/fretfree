import { describe, expect, it } from 'vitest';
import { SHAPE_INTERVALS, crossesGBShift, positionForInterval } from '../../theory';
import { parseIntervalItemId } from '../model';
import { c3Shapes, isGbShiftItem, shapeOfItem, skills } from './c3';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

const allIds = skills.flatMap((s) => s.items().map((i) => i.id));

describe('C3 skills', () => {
  it('groups intervals by number, chord tones first', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'C3.thirds',
      'C3.fourths-fifths',
      'C3.sevenths',
      'C3.sixths',
      'C3.seconds',
    ]);
    for (const s of skills) {
      expect(s.topic).toBe('C3');
      expect(s.drillTypes).toEqual(['interval-name', 'interval-tap']);
    }
    const orders = skills.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('needs F1 first, then unlocks each group softly from the one before', () => {
    const [first, ...rest] = skills;
    expect(first!.prerequisites).toEqual(['F1.half-steps', 'F1.whole-steps']);
    expect(first!.softUnlock).toBe(false);
    rest.forEach((s, i) => {
      expect(s.prerequisites).toEqual([skills[i]!.id]);
      expect(s.softUnlock).toBe(true);
    });
  });

  it('covers every interval from m2 to M7 exactly once, leaving octaves to C1', () => {
    const intervals = new Set(allIds.map((id) => parseIntervalItemId(id)!.interval));
    expect([...intervals].sort()).toEqual(SHAPE_INTERVALS.filter((i) => i !== 'P8').sort());
    for (const s of skills) {
      const own = new Set(s.items().map((i) => parseIntervalItemId(i.id)!.interval));
      for (const other of skills) {
        if (other === s) continue;
        for (const i of other.items())
          expect(own.has(parseIntervalItemId(i.id)!.interval)).toBe(false);
      }
    }
  });

  it('drills each shape in both directions', () => {
    expect(ids('C3.thirds').slice(0, 4)).toEqual([
      'interval-name:m3@s6→s5',
      'interval:m3@s6→s5',
      'interval-name:M3@s6→s5',
      'interval:M3@s6→s5',
    ]);
    for (const s of skills) {
      const names = s.items().filter((i) => i.id.startsWith('interval-name:'));
      const taps = s.items().filter((i) => i.id.startsWith('interval:'));
      expect(taps.map((i) => i.id)).toEqual(
        names.map((i) => i.id.replace('interval-name:', 'interval:')),
      );
    }
  });

  it('keeps only ascending shapes within reach: 1–2 strings up, at most 4 frets', () => {
    for (const id of allIds) {
      const shape = shapeOfItem(id)!;
      expect(shape.fromString - shape.toString).toBeGreaterThanOrEqual(1);
      expect(shape.fromString - shape.toString).toBeLessThanOrEqual(2);
      expect(Math.abs(shape.fretOffset)).toBeLessThanOrEqual(4);
    }
    expect(allIds).toHaveLength(140);
    expect(skills.map((s) => s.items().length)).toEqual([20, 50, 16, 34, 20]);
  });

  it('puts the 7ths on strings two apart, where they fit the hand', () => {
    expect(ids('C3.sevenths').filter((id) => id.startsWith('interval:'))).toEqual([
      'interval:m7@s6→s4',
      'interval:M7@s6→s4',
      'interval:m7@s5→s3',
      'interval:M7@s5→s3',
      'interval:m7@s4→s2',
      'interval:M7@s4→s2',
      'interval:m7@s3→s1',
      'interval:M7@s3→s1',
    ]);
  });

  it('includes G–B shift items in every group, one fret higher than the fourths shape', () => {
    const gbCounts = skills.map((s) => s.items().filter((i) => isGbShiftItem(i.id)).length / 2);
    expect(gbCounts).toEqual([2, 9, 4, 5, 2]);

    // M3: −1 fret on fourths pairs, 0 across G–B.
    expect(shapeOfItem('interval:M3@s4→s3')).toMatchObject({ fretOffset: -1, gbShift: false });
    expect(shapeOfItem('interval:M3@s3→s2')).toMatchObject({ fretOffset: 0, gbShift: true });
    expect(isGbShiftItem('interval:M3@s3→s2')).toBe(true);
    expect(isGbShiftItem('interval-name:m7@s5→s3')).toBe(false);
    expect(isGbShiftItem('note@s6f5')).toBe(false);
    expect(shapeOfItem('find:G@s5')).toBeNull();

    for (const id of allIds) {
      const shape = shapeOfItem(id)!;
      expect(shape.gbShift).toBe(crossesGBShift(shape.fromString, shape.toString));
    }
  });

  it('matches the pitch-derived position from any root that fits', () => {
    for (const shape of c3Shapes(SHAPE_INTERVALS)) {
      const root = { string: shape.fromString, fret: 5 };
      expect(positionForInterval(root, shape.interval, shape.toString)).toEqual({
        string: shape.toString,
        fret: 5 + shape.fretOffset,
      });
    }
  });
});
