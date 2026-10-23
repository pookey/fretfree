import { describe, expect, it } from 'vitest';
import { SEED_CONFUSIONS } from '../../engine/confusions';
import { meterItemId, type MeterFact } from '../../engine/items/meter';
import type { Item } from '../../engine/model';
import { SKILLS } from '../../engine/skills';
import { STANDARD_TUNING } from '../../theory';
import {
  D32_METERS,
  answerOf,
  d32CanTest,
  d32Check,
  d32Choices,
  d32ConceptOf,
  d32DescribeAnswer,
  d32KeyFor,
  d32Keys,
  d32MakePrompt,
  d32ReadKeys,
  d32Sounds,
  display,
  familyOf,
  meterOfChoice,
  signatureOf,
  unitName,
  type D32Prompt,
} from './logic';

const ctx = (scopeLevel = 0) => ({
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp' as const,
  scopeLevel,
  rng: () => 0,
});

const item = (meter: string, fact: MeterFact): Item => ({
  id: meterItemId(meter, fact),
  skillId: 'T2.compound-meters',
});

const prompt = (meter: string, fact: MeterFact, scopeLevel = 0): D32Prompt =>
  d32MakePrompt(item(meter, fact), ctx(scopeLevel));

const d32Items = () => SKILLS.filter((s) => s.drillTypes.includes('simple-compound'));

describe('D32 items', () => {
  it('tests every T1 and T2 item, and only meters it asks about', () => {
    const items = d32Items().flatMap((s) => s.items());
    expect(items.length).toBeGreaterThan(20);
    for (const i of items) expect(d32CanTest(i), i.id).toBe(true);
    expect(d32Items().map((s) => s.topic)).toEqual(['T1', 'T2', 'T2', 'T2']);
    expect(d32CanTest({ id: 'meter:3/8:feltBeats', skillId: 'x' })).toBe(false);
    expect(d32CanTest({ id: 'meter:5/8:kind', skillId: 'x' })).toBe(false);
    expect(d32CanTest({ id: 'note@s6f5', skillId: 'x' })).toBe(false);
    expect(() => d32MakePrompt({ id: 'note@s6f5', skillId: 'x' }, ctx())).toThrow();
  });

  it('asks both directions: a meter’s felt beats, and the meter with those beats', () => {
    const ids = new Set(d32Items().flatMap((s) => s.items().map((i) => i.id)));
    for (const m of ['4/4', '3/4', '2/4', '6/8', '9/8', '12/8', '2/2']) {
      expect(ids, m).toContain(`meter:${m}:feltBeats`);
      expect(ids, m).toContain(`meter:${m}:fromBeats`);
      expect(ids, m).toContain(`meter:${m}:beatUnit`);
      expect(ids, m).toContain(`meter:${m}:kind`);
    }
  });

  it('keys every card by its meter', () => {
    expect(d32ConceptOf(item('6/8', 'kind'))).toBe('meter:6/8');
    expect(d32ConceptOf(item('3/4', 'fromBeats'))).toBe('meter:3/4');
    expect(d32ConceptOf({ id: 'note@s6f5', skillId: 'x' })).toBeNull();
  });

  it('pairs 6/8 with 3/4 in sessions through a seed confusion', () => {
    expect(SEED_CONFUSIONS).toContainEqual(['meter:6/8', 'meter:3/4']);
  });
});

describe('D32 answers', () => {
  it('come from meter theory', () => {
    expect(answerOf('feltBeats', '6/8')).toBe('2');
    expect(answerOf('feltBeats', '12/8')).toBe('4');
    expect(answerOf('feltBeats', '9/8')).toBe('3');
    expect(answerOf('feltBeats', '3/4')).toBe('3');
    expect(answerOf('feltBeats', '2/2')).toBe('2');
    expect(answerOf('beatUnit', '6/8')).toBe('4.');
    expect(answerOf('beatUnit', '4/4')).toBe('4');
    expect(answerOf('beatUnit', '2/2')).toBe('2');
    expect(answerOf('kind', '6/8')).toBe('compound');
    expect(answerOf('kind', '2/2')).toBe('simple');
    expect(answerOf('fromBeats', '6/8')).toBe('6/8');
    expect(() => signatureOf('5/8')).toThrow(RangeError);
  });

  it('sorts meters into families', () => {
    expect(D32_METERS.map(familyOf)).toEqual([
      'simple',
      'simple',
      'simple',
      'cut',
      'compound',
      'compound',
      'compound',
    ]);
  });

  it('always offers the answer, at every scope', () => {
    for (const s of d32Items())
      for (const i of s.items())
        for (const level of [0, 1]) {
          const p = d32MakePrompt(i, ctx(level));
          expect(p.choices, `${i.id} @${level}`).toContain(p.answer);
          expect(new Set(p.choices).size).toBe(p.choices.length);
        }
  });
});

describe('D32 choices', () => {
  it('offer the classic wrong answers for 6/8: the top number, and 3/4’s', () => {
    expect(d32Choices('feltBeats', '6/8', 0)).toEqual(['2', '3', '4', '6']);
    expect(d32Choices('feltBeats', '12/8', 0)).toEqual(['2', '3', '4', '12']);
    expect(d32Choices('beatUnit', '6/8', 0)).toEqual(['4', '8', '4.']);
    expect(d32Choices('fromBeats', '6/8', 0)).toEqual(['3/4', '6/8', '9/8', '12/8']);
    expect(d32Choices('kind', '6/8', 0)).toEqual(['simple', 'compound']);
  });

  it('stay within the family at scope 0, and cover every meter at scope 1', () => {
    expect(d32Choices('feltBeats', '4/4', 0)).toEqual(['2', '3', '4']);
    expect(d32Choices('fromBeats', '3/4', 0)).toEqual(['2/4', '3/4', '4/4']);
    expect(d32Choices('fromBeats', '2/2', 0)).toEqual(['2/4', '4/4', '2/2']);
    expect(d32Choices('beatUnit', '2/2', 0)).toEqual(['2', '4', '8']);
    expect(d32Choices('fromBeats', '3/4', 1)).toEqual(D32_METERS);
    expect(d32Choices('feltBeats', '3/4', 1)).toEqual(['2', '3', '4', '6', '9', '12']);
    expect(d32Choices('beatUnit', '3/4', 1)).toEqual(['2', '4', '8', '4.']);
    // Out-of-range levels clamp.
    expect(d32Choices('fromBeats', '3/4', 5)).toEqual(D32_METERS);
    expect(d32Choices('fromBeats', '3/4', -2)).toEqual(['2/4', '3/4', '4/4']);
  });

  it('depend on the card’s family, never on its answer', () => {
    for (const fact of ['feltBeats', 'beatUnit', 'kind', 'fromBeats'] as const) {
      const rows = new Set(
        ['2/4', '3/4', '4/4'].map((m) => JSON.stringify(d32Choices(fact, m, 0))),
      );
      expect(rows.size, fact).toBe(1);
    }
  });
});

describe('d32Check', () => {
  it('marks a right answer', () => {
    const p = prompt('6/8', 'feltBeats');
    expect(d32Check(p, '2')).toEqual({ correct: true, expected: '2', concept: 'meter:6/8' });
    expect(d32Check(prompt('6/8', 'beatUnit'), '4.').expected).toBe('dotted quarter');
  });

  it('keys a wrong answer by the meter with the same bar felt that way', () => {
    expect(d32Check(prompt('6/8', 'feltBeats'), '3')).toEqual({
      correct: false,
      expected: '2',
      concept: 'meter:6/8',
      confusedWith: 'meter:3/4',
    });
    expect(d32Check(prompt('3/4', 'feltBeats'), '2').confusedWith).toBe('meter:6/8');
    expect(d32Check(prompt('2/2', 'feltBeats'), '4').confusedWith).toBe('meter:4/4');
    expect(d32Check(prompt('6/8', 'beatUnit'), '4').confusedWith).toBe('meter:3/4');
    expect(d32Check(prompt('6/8', 'kind'), 'simple').confusedWith).toBe('meter:3/4');
    expect(d32Check(prompt('6/8', 'fromBeats'), '3/4').confusedWith).toBe('meter:3/4');
  });

  it('names no confusion when no meter fits', () => {
    expect(d32Check(prompt('6/8', 'feltBeats'), '6').confusedWith).toBeUndefined();
    expect(d32Check(prompt('9/8', 'feltBeats'), '2').confusedWith).toBeUndefined();
    expect(meterOfChoice(prompt('6/8', 'fromBeats'), '5/8')).toBeNull();
  });
});

describe('D32 display and sound', () => {
  it('names choices', () => {
    expect(display('beatUnit', '4.')).toBe('dotted quarter');
    expect(display('beatUnit', '2')).toBe('half');
    expect(display('kind', 'simple')).toBe('Simple');
    expect(display('kind', 'compound')).toBe('Compound');
    expect(display('feltBeats', '12')).toBe('12');
    expect(display('fromBeats', '6/8')).toBe('6/8');
    expect(unitName('16')).toBe('sixteenth');
    expect(unitName('x')).toBe('x');
  });

  it('logs the choice, and plucks nothing: a meter is heard on the click', () => {
    expect(d32DescribeAnswer('6/8')).toBe('6/8');
    expect(d32Sounds()).toEqual({ expected: [] });
  });
});

describe('D32 keyboard', () => {
  it('types beat counts as numbers, 12 as two keys', () => {
    const keys = d32Keys('feltBeats', ['2', '3', '4', '12']);
    expect(d32ReadKeys('', '3', keys)).toEqual({ answer: '3', typed: '' });
    expect(d32ReadKeys('', '1', keys)).toEqual({ answer: null, typed: '1' });
    expect(d32ReadKeys('1', '2', keys)).toEqual({ answer: '12', typed: '' });
    // A key that leads nowhere starts again from itself.
    expect(d32ReadKeys('1', '4', keys)).toEqual({ answer: '4', typed: '' });
    expect(d32ReadKeys('', '7', keys)).toEqual({ answer: null, typed: '' });
    expect(d32KeyFor('feltBeats', ['2', '3', '12'], 0)).toBe('2');
    expect(d32KeyFor('feltBeats', ['2', '3', '12'], 2)).toBeUndefined();
  });

  it('picks other buttons by position, and simple or compound by initial', () => {
    const meters = d32Keys('fromBeats', ['3/4', '6/8']);
    expect(d32ReadKeys('', '2', meters).answer).toBe('6/8');
    const kinds = d32Keys('kind', ['simple', 'compound']);
    expect(d32ReadKeys('', 'c', kinds).answer).toBe('compound');
    expect(d32ReadKeys('', '1', kinds).answer).toBe('simple');
    expect(d32KeyFor('kind', ['simple', 'compound'], 1)).toBe('2 c');
    expect(d32KeyFor('beatUnit', ['2', '4'], 1)).toBe('2');
    expect(d32KeyFor('beatUnit', ['2', '4'], 5)).toBeUndefined();
  });
});
