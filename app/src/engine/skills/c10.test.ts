import { describe, expect, it } from 'vitest';
import { OPEN_SHAPE_KEYS, keyLabel } from '../../theory';
import { capoItemId, itemId, parseCapoItemId, parseItemId } from '../model';
import { capoIds, skills } from './c10';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('capo item IDs', () => {
  it('round-trip through the item-ID parser', () => {
    for (const id of ['capo-sound:G', 'capo-shape:Am', 'capo-fret:Bb', 'capo-fret:F#m']) {
      const ref = parseItemId(id);
      expect(ref, id).not.toBeNull();
      expect(itemId(ref!)).toBe(id);
    }
    expect(parseCapoItemId('capo-shape:Am')).toEqual({ kind: 'capo-shape', shape: 'Am' });
  });

  it('rejects anything but a key label', () => {
    expect(parseCapoItemId('capo-sound:H')).toBeNull();
    expect(parseCapoItemId('capo-sound:G+3')).toBeNull();
    expect(parseCapoItemId('capo-tune:G')).toBeNull();
    expect(() => capoItemId('capo-sound', 'Gmaj')).toThrow(RangeError);
    expect(() => capoItemId('capo-sound', 'H')).toThrow(RangeError);
  });
});

describe('C10 skills', () => {
  it('runs G, C and D shapes → A and E → the minor shapes, all on D13', () => {
    expect(skills.map((s) => s.id)).toEqual(['C10.capo-g-c-d', 'C10.capo-a-e', 'C10.capo-minor']);
    for (const s of skills) {
      expect(s.topic).toBe('C10');
      expect(s.drillTypes).toEqual(['capo']);
    }
    // The first stage waits for mastery (rule 7); the later ones only for practice.
    expect(skills.map((s) => s.softUnlock)).toEqual([false, true, true]);
    const orders = skills.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('opens once keys and triads are practising, then on the first stage', () => {
    // M10-02: a capo question needs "which key sounds", not mastered spelling.
    expect(getSkill('C10.capo-g-c-d')!.prerequisites).toEqual([]);
    expect(getSkill('C10.capo-g-c-d')!.softPrerequisites).toEqual(['C4.sharp-keys', 'C5.triads']);
    expect(getSkill('C10.capo-g-c-d')!.softUnlock).toBe(false);
    expect(getSkill('C10.capo-a-e')!.prerequisites).toEqual(['C10.capo-g-c-d']);
    expect(getSkill('C10.capo-minor')!.prerequisites).toEqual(['C10.capo-g-c-d']);
  });

  it('brings each shape in with both directions side by side, then the fret (rule 6)', () => {
    expect(ids('C10.capo-g-c-d')).toEqual([
      'capo-sound:G',
      'capo-shape:G',
      'capo-fret:G',
      'capo-sound:C',
      'capo-shape:C',
      'capo-fret:C',
      'capo-sound:D',
      'capo-shape:D',
      'capo-fret:D',
    ]);
    expect(ids('C10.capo-minor')).toContain('capo-fret:Em');
  });

  it('covers every open-shape key once, in every direction', () => {
    const all = skills.flatMap((s) => s.items().map((i) => i.id));
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(capoIds(OPEN_SHAPE_KEYS.map(keyLabel)).sort());
  });
});
