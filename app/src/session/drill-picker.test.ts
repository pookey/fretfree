import { describe, expect, it } from 'vitest';
import { getDrill } from '../drills/registry';
import type { AnyDrillType } from '../drills/types';
import type { Skill } from '../engine';
import { getTuning } from '../theory/tunings';
import { createDrillPicker, factOf } from './drill-picker';

const d1 = getDrill('name-the-note')!;
const d2 = getDrill('find-the-note')!;
// A second drill that tests the same items as D1, e.g. a future mic drill.
const echo: AnyDrillType = { ...d1, id: 'echo' };

const skill = (drillTypes: string[]): Skill => ({
  id: 'sk',
  topic: 'T',
  order: 0,
  title: 'Test skill',
  prerequisites: [],
  drillTypes,
  items: () => [],
});

const note = { id: 'note@s6f5', skillId: 'sk' };
const find = { id: 'find:A@s6', skillId: 'sk' };

describe('createDrillPicker', () => {
  it('serves each direction with the drill that can test it', () => {
    const picker = createDrillPicker([skill(['name-the-note', 'find-the-note'])], [d1, d2]);
    expect(picker.pick(note)?.id).toBe('name-the-note');
    expect(picker.pick(find)?.id).toBe('find-the-note');
    expect(picker.canServe({ id: 'step:+2@E', skillId: 'sk' })).toBe(false);
  });

  it('only offers drills the skill lists, in its preference order', () => {
    const picker = createDrillPicker([skill(['echo', 'name-the-note'])], [d1, d2, echo]);
    expect(picker.candidates(note).map((d) => d.id)).toEqual(['echo', 'name-the-note']);
    expect(picker.candidates(find)).toEqual([]);
    expect(picker.candidates({ id: 'note@s6f5', skillId: 'unknown' })).toEqual([]);
    expect(picker.pick({ id: 'note@s6f5', skillId: 'unknown' })).toBeUndefined();
  });

  it('moves away from the drill that served the item last', () => {
    const picker = createDrillPicker([skill(['name-the-note', 'echo'])], [d1, echo]);
    expect(picker.pick(note)?.id).toBe('name-the-note');
    expect(picker.pick(note, 'name-the-note')?.id).toBe('echo');
    expect(picker.pick(note, 'echo')?.id).toBe('name-the-note');
    // With one candidate there is nothing to vary.
    const single = createDrillPicker([skill(['name-the-note'])], [d1, echo]);
    expect(single.pick(note, 'name-the-note')?.id).toBe('name-the-note');
  });
});

describe('factOf', () => {
  const standard = getTuning('standard');

  it('gives both directions of a fact the same key', () => {
    expect(factOf(note, standard)).toEqual({ fact: 's6:9', direction: 'name' });
    expect(factOf(find, standard)).toEqual({ fact: 's6:9', direction: 'find' });
    expect(factOf({ id: 'note@s6f17', skillId: 'sk' }, standard)?.fact).toBe('s6:9');
    expect(factOf({ id: 'note@s5f5', skillId: 'sk' }, standard)?.fact).not.toBe('s6:9');
    expect(factOf({ id: 'find:A#@s6', skillId: 'sk' }, standard)?.fact).toBe('s6:10');
  });

  it('pairs the two directions of an interval shape (D5 and D6)', () => {
    expect(factOf({ id: 'interval-name:M3@s6→s5', skillId: 'sk' }, standard)).toEqual({
      fact: 'interval:M3@s6→s5',
      direction: 'name',
    });
    expect(factOf({ id: 'interval:M3@s6→s5', skillId: 'sk' }, standard)).toEqual({
      fact: 'interval:M3@s6→s5',
      direction: 'find',
    });
    // Another shape of the same interval is another fact.
    expect(factOf({ id: 'interval:M3@s3→s2', skillId: 'sk' }, standard)?.fact).toBe(
      'interval:M3@s3→s2',
    );
    // A string the tuning lacks has no fact.
    const bass = { id: 'bass', name: 'Bass (EADG)', notes: ['E1', 'A1', 'D2', 'G2'] };
    expect(factOf({ id: 'interval:M3@s6→s5', skillId: 'sk' }, bass)).toBeNull();
    expect(factOf({ id: 'interval-name:M3@s4→s3', skillId: 'sk' }, bass)?.fact).toBe(
      'interval:M3@s4→s3',
    );
  });

  it('pairs inlay-marker items and has no key for one-way items', () => {
    expect(factOf({ id: 'marker:f7', skillId: 'sk' }, standard)).toEqual({
      fact: 'marker:7',
      direction: 'name',
    });
    expect(factOf({ id: 'find-marker:f7', skillId: 'sk' }, standard)).toEqual({
      fact: 'marker:7',
      direction: 'find',
    });
    expect(factOf({ id: 'step:+2@E', skillId: 'sk' }, standard)).toBeNull();
    expect(factOf({ id: 'nonsense', skillId: 'sk' }, standard)).toBeNull();
  });

  it('has no key for a position the tuning lacks', () => {
    const bass = { id: 'bass', name: 'Bass', notes: ['E1', 'A1', 'D2', 'G2'] };
    expect(factOf({ id: 'note@s6f5', skillId: 'sk' }, bass)).toBeNull();
  });
});
