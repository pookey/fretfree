import { describe, expect, it } from 'vitest';
import { d37CanTest, d37ConceptOf } from '../../drills/d37-chord-tones-neck/logic';
import { chromaOf, isPracticalSpelling, spellChord } from '../../theory';
import { SEED_CONFUSIONS } from '../confusions';
import { chordTonesItemId, itemId, parseChordTonesItemId, parseItemId, type Item } from '../model';
import { skills } from './c5-tones';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('chord-tones item IDs', () => {
  it('names the chord, and the degree when one is asked', () => {
    expect(chordTonesItemId('C', 'major')).toBe('chord-tones:C');
    expect(chordTonesItemId('C', 'major', '3')).toBe('chord-tones:3@C');
    expect(chordTonesItemId('Bb', 'm7', 'b7')).toBe('chord-tones:b7@Bbm7');
    expect(chordTonesItemId('F#', 'minor', null)).toBe('chord-tones:F#m');
  });

  it('round-trips through parseItemId', () => {
    for (const id of [
      'chord-tones:C',
      'chord-tones:3@C',
      'chord-tones:b3@C#m',
      'chord-tones:Ebmaj7',
    ]) {
      const ref = parseItemId(id);
      expect(ref?.kind, id).toBe('chord-tones');
      expect(itemId(ref!)).toBe(id);
    }
    expect(parseChordTonesItemId('chord-tones:7@Cmaj7')).toEqual({
      root: 'C',
      chord: 'maj7',
      degree: '7',
    });
  });

  it('rejects other kinds, aliases, and degrees the chord lacks', () => {
    expect(parseChordTonesItemId('chord-tone:3@major')).toBeNull();
    expect(parseChordTonesItemId('chord-tones:Cmin7')).toBeNull();
    expect(parseChordTonesItemId('chord-tones:Hm')).toBeNull();
    expect(parseChordTonesItemId('chord-tones:Cxyz')).toBeNull();
    expect(parseChordTonesItemId('chord-tones:b3@C')).toBeNull();
    expect(() => chordTonesItemId('C', 'major', 'b7')).toThrow(/no degree/);
    expect(() => chordTonesItemId('C', 'nope' as never)).toThrow(/Invalid chord kind/);
    expect(() => chordTonesItemId('H', 'major')).toThrow(/Invalid pitch class/);
  });
});

describe('C5 chord tones across the neck', () => {
  it('adds triads, then 7th chords, after spelling them and every octave', () => {
    expect(skills.map((s) => s.id)).toEqual(['C5.neck-triads', 'C5.neck-sevenths']);
    expect(getSkill('C5.neck-triads')!.prerequisites).toEqual(['C5.triads', 'C1.every-octave']);
    expect(getSkill('C5.neck-sevenths')!.prerequisites).toEqual(['C5.neck-triads', 'C5.sevenths']);
    for (const s of skills) {
      expect(s.topic).toBe('C5');
      expect(s.drillTypes).toEqual(['chord-tones-neck']);
      expect(s.softUnlock).toBeFalsy();
      for (const p of s.prerequisites) expect(getSkill(p)!.order).toBeLessThan(s.order);
    }
    expect(skills[1]!.order).toBeLessThan(getSkill('C6.triad-cores')!.order);
  });

  it('asks every root once per card, each one askable by D37', () => {
    const counts = { 'C5.neck-triads': 12 * 4, 'C5.neck-sevenths': 12 * 5 };
    for (const s of skills) {
      const items: Item[] = [...s.items()];
      expect(items).toHaveLength(counts[s.id as keyof typeof counts]);
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
      for (const item of items) {
        expect(d37CanTest(item), item.id).toBe(true);
        const { root, chord } = parseChordTonesItemId(item.id)!;
        expect(isPracticalSpelling(spellChord(root, chord)), item.id).toBe(true);
      }
      const chords = items.filter((i) => parseChordTonesItemId(i.id)!.degree === null);
      const roots = new Set(chords.map((i) => chromaOf(parseChordTonesItemId(i.id)!.root)));
      expect(roots.size).toBe(12);
    }
  });

  it('starts at C, brings in each root with its confusable partner, natural roots first', () => {
    expect(ids('C5.neck-triads').slice(0, 4)).toEqual([
      'chord-tones:C',
      'chord-tones:Cm',
      'chord-tones:3@C',
      'chord-tones:b3@Cm',
    ]);
    expect(ids('C5.neck-sevenths').slice(0, 5)).toEqual([
      'chord-tones:C7',
      'chord-tones:Cmaj7',
      'chord-tones:Cm7',
      'chord-tones:b7@C7',
      'chord-tones:7@Cmaj7',
    ]);
    const roots = ids('C5.neck-triads')
      .filter((id) => /^chord-tones:[A-G][#b]?$/.test(id))
      .map((id) => parseChordTonesItemId(id)!.root);
    expect(roots.slice(0, 7).every((r) => r.length === 1)).toBe(true);
    expect(roots.slice(7).every((r) => r.length === 2)).toBe(true);
  });

  it('asks each degree fact once: no 3rd of a 7th chord, no ♭7 of m7', () => {
    const degrees = ids('C5.neck-sevenths')
      .map((id) => parseChordTonesItemId(id)!)
      .filter((r) => r.degree !== null)
      .map((r) => `${r.degree}@${r.chord}`);
    expect(new Set(degrees)).toEqual(new Set(['b7@7', '7@maj7']));
  });

  it('keys cards by the seed pairs, so the confusable ones interleave (rule 6)', () => {
    const concept = (id: string) => d37ConceptOf({ id, skillId: 'C5.neck-triads' });
    const pairs = SEED_CONFUSIONS.map(([a, b]) => [a, b].sort().join('|'));
    const paired = (a: string, b: string) =>
      pairs.includes([concept(a), concept(b)].sort().join('|'));
    expect(paired('chord-tones:C', 'chord-tones:Cm')).toBe(true);
    expect(paired('chord-tones:3@C', 'chord-tones:b3@Cm')).toBe(true);
    expect(paired('chord-tones:C7', 'chord-tones:Cmaj7')).toBe(true);
    expect(paired('chord-tones:b7@C7', 'chord-tones:7@Cmaj7')).toBe(true);
  });
});
