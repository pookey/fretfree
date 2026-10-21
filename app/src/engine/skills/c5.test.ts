import { describe, expect, it } from 'vitest';
import { d7CanTest, d7ConceptOf } from '../../drills/d7-spell-it/logic';
import {
  C5_CHORD_KINDS,
  chordKindInfo,
  chromaOf,
  isPracticalSpelling,
  spellChord,
} from '../../theory';
import { confusionMatrix, pairConfusables } from '../confusions';
import { parseSpellChordItemId, type Item } from '../model';
import type { SessionEntry } from '../session';
import { c5Roots, skills } from './c5';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

const kindsOf = (skillId: string) => [
  ...new Set(ids(skillId).map((id) => parseSpellChordItemId(id)!.chord)),
];

describe('C5 skills', () => {
  it('runs triads → 7ths → sus/add, after C4', () => {
    expect(skills.map((s) => s.id)).toEqual(['C5.triads', 'C5.sevenths', 'C5.sus-add']);
    const families = skills.map((s) => kindsOf(s.id).map((k) => chordKindInfo(k).family));
    expect(families).toEqual([
      ['triad', 'triad'],
      ['seventh', 'seventh', 'seventh', 'seventh'],
      ['suspended', 'suspended', 'added'],
    ]);
    for (const s of skills) {
      expect(s.topic).toBe('C5');
      expect(s.drillTypes).toEqual(['spell-it', 'play-sequence']);
    }
    const orders = skills.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(orders[0]).toBeGreaterThan(getSkill('C4.flat-key-degrees')!.order);
  });

  it('covers every C5 chord kind once', () => {
    const kinds = skills.flatMap((s) => kindsOf(s.id));
    expect(kinds).toHaveLength(C5_CHORD_KINDS.length);
    expect(new Set(kinds)).toEqual(new Set(C5_CHORD_KINDS));
  });

  it('opens on mastered 3rds (C3) and practised keys (C4), each stage after the last', () => {
    // M10-02: a triad is two stacked 3rds (rule 7); the keys are practised alongside.
    expect(getSkill('C5.triads')!.prerequisites).toEqual(['C3.thirds']);
    expect(getSkill('C5.triads')!.softPrerequisites).toEqual(['C4.sharp-keys']);
    expect(getSkill('C5.sevenths')!.softPrerequisites).toBeUndefined();
    expect(getSkill('C5.sevenths')!.prerequisites).toEqual(['C5.triads', 'C3.sevenths']);
    expect(getSkill('C5.sus-add')!.prerequisites).toEqual(['C5.sevenths', 'C3.seconds']);
    // Rule 7 gates chord construction on mastered intervals: no soft unlock.
    for (const s of skills) expect(s.softUnlock).toBeFalsy();
  });

  it('spells each kind from all 12 roots, every one askable by D7', () => {
    for (const s of skills) {
      const items: Item[] = [...s.items()];
      expect(items).toHaveLength(12 * kindsOf(s.id).length);
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
      for (const item of items) {
        expect(item.skillId).toBe(s.id);
        expect(d7CanTest(item), item.id).toBe(true);
        const { chord, root } = parseSpellChordItemId(item.id)!;
        expect(isPracticalSpelling(spellChord(root, chord)), item.id).toBe(true);
      }
    }
  });

  it('brings each root in with its confusable partner, natural roots first', () => {
    expect(ids('C5.triads').slice(0, 4)).toEqual([
      'spell-chord:major@F',
      'spell-chord:minor@F',
      'spell-chord:major@C',
      'spell-chord:minor@C',
    ]);
    expect(ids('C5.sevenths').slice(0, 4)).toEqual([
      'spell-chord:7@F',
      'spell-chord:maj7@F',
      'spell-chord:m7@F',
      'spell-chord:m7b5@F',
    ]);
    expect(ids('C5.sus-add').slice(0, 3)).toEqual([
      'spell-chord:sus2@F',
      'spell-chord:sus4@F',
      'spell-chord:add9@F',
    ]);
    const roots = ids('C5.triads')
      .filter((id) => id.startsWith('spell-chord:major@'))
      .map((id) => parseSpellChordItemId(id)!.root);
    expect(roots.slice(0, 7).every((r) => r.length === 1)).toBe(true);
    expect(roots.slice(7).every((r) => r.length === 2)).toBe(true);
  });
});

describe('c5Roots', () => {
  it('gives one practical root per pitch class for every kind', () => {
    for (const kind of C5_CHORD_KINDS) {
      const roots = c5Roots(kind);
      expect(new Set(roots.map(chromaOf)).size).toBe(12);
      for (const r of roots)
        expect(isPracticalSpelling(spellChord(r, kind)), `${r}${kind}`).toBe(true);
    }
  });

  it('uses the spellings charts use: D♭ major, C♯ minor', () => {
    expect(c5Roots('major')).toEqual(expect.arrayContaining(['Db', 'Ab', 'Eb', 'Bb', 'F#']));
    expect(c5Roots('minor')).toEqual(expect.arrayContaining(['C#', 'G#', 'Eb', 'Bb', 'F#']));
    expect(c5Roots('sus4')).toEqual(c5Roots('major'));
    expect(c5Roots('m7')).toEqual(c5Roots('minor'));
  });

  it('respells a root whose chord needs a double flat', () => {
    // E♭m7♭5 is E♭ G♭ B𝄫 D♭; D♯m7♭5 is D♯ F♯ A C♯.
    expect(isPracticalSpelling(spellChord('Eb', 'm7b5'))).toBe(false);
    expect(c5Roots('m7b5')).toContain('D#');
    expect(c5Roots('m7b5')).not.toContain('Eb');
  });

  it('throws if no spelling of a root is practical', () => {
    // No C5 kind hits this; F°7 is F A♭ C♭ E𝄫, and F has no twin to fall back on.
    expect(() => c5Roots('dim7')).toThrow(/No practical spelling/);
  });
});

describe('C5 confusable pairing', () => {
  const review = (itemId: string): SessionEntry => ({
    itemId,
    skillId: 'C5.sevenths',
    kind: 'review',
    guided: false,
  });
  const conceptOf = (itemId: string) => d7ConceptOf({ id: itemId, skillId: 'C5.sevenths' });
  const now = new Date('2026-10-18T09:00:00Z');

  it('pairs a due 7 with a due maj7 before any confusion is learned', () => {
    const out = pairConfusables(
      ['spell-chord:7@F', 'spell-chord:major@C', 'spell-chord:sus2@G', 'spell-chord:maj7@D'].map(
        review,
      ),
      confusionMatrix([], now),
      conceptOf,
    );
    expect(out.entries.map((e) => e.itemId).slice(0, 2)).toEqual([
      'spell-chord:7@F',
      'spell-chord:maj7@D',
    ]);
    expect([...out.joined]).toContain(0);
  });

  it('pairs m7 with m7b5 too', () => {
    const out = pairConfusables(
      ['spell-chord:m7b5@B', 'spell-chord:7@C', 'spell-chord:m7@E'].map(review),
      confusionMatrix([], now),
      conceptOf,
    );
    expect(out.entries.map((e) => e.itemId).slice(0, 2)).toEqual([
      'spell-chord:m7b5@B',
      'spell-chord:m7@E',
    ]);
  });
});
