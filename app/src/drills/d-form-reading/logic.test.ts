import { describe, expect, it } from 'vitest';
import { getSkill } from '../../engine/skills';
import type { Item } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import { getDrill } from '../registry';
import {
  FORM_READING_ID,
  barPulses,
  expectedText,
  firstWrongTap,
  formReadingCanTest,
  formReadingCheck,
  formReadingConceptOf,
  formReadingDescribeAnswer,
  formReadingGradedResponseMs,
  formReadingKeys,
  formReadingMakePrompt,
  formReadingSounds,
  misreadShape,
  nextChoices,
  pickupStart,
  pulseWord,
  type FormReadingPrompt,
} from './logic';
import { FORMS } from './forms';

const T6 = ['T6.pickups', 'T6.repeats', 'T6.endings', 'T6.pickups-compound'];

function ctx(scopeLevel = 0, rng: () => number = () => 0.4) {
  return { tuning: STANDARD_TUNING, accidentalPref: 'sharp' as const, scopeLevel, rng };
}

const item = (id: string): Item => ({ id, skillId: 'T6.repeats' });
const prompt = (id: string, scope = 0, rng?: () => number): FormReadingPrompt =>
  formReadingMakePrompt(item(id), ctx(scope, rng));

describe('form reading prompts', () => {
  it('is registered for every T6 skill, and tests all their items', () => {
    const drill = getDrill(FORM_READING_ID);
    expect(drill?.skills).toEqual(expect.arrayContaining(T6));
    for (const id of T6) {
      for (const it of getSkill(id)!.items()) {
        expect(formReadingCanTest(it), it.id).toBe(true);
        for (const scope of [0, 1]) {
          const p = formReadingMakePrompt(it, ctx(scope, Math.random));
          // The right answer always gets the card right.
          expect(formReadingCheck(p, p.answer).correct, it.id).toBe(true);
          if (p.choices.length) expect(p.choices).toEqual(expect.arrayContaining(p.answer));
        }
      }
    }
    expect(formReadingCanTest(item('meter:6/8:kind'))).toBe(false);
    expect(() => prompt('meter:6/8:kind')).toThrow();
  });

  it('builds a pickup tune and asks for bar 1 or 2, or up to bar 3 at scope 1', () => {
    const low = prompt('pickup:4/4:1:bar', 0, () => 0.99);
    expect(low).toMatchObject({ task: 'bar', target: 2, answer: [2], pickup: 1, meter: '4/4' });
    expect(low.bars.map((b) => b.number)).toEqual([null, 1, 2, 3, 4]);
    expect(low.order).toEqual([0, 1, 2, 3, 4]);
    expect(prompt('pickup:4/4:1:bar', 1, () => 0.99).target).toBe(3);
    expect(prompt('pickup:4/4:1:bar', 0, () => 0).target).toBe(1);
  });

  it('asks where a pickup starts, from a full row of beats or eighths', () => {
    expect(prompt('pickup:4/4:1:start')).toMatchObject({ choices: [1, 2, 3, 4], answer: [4] });
    expect(prompt('pickup:3/4:2:start')).toMatchObject({ choices: [1, 2, 3], answer: [2] });
    expect(prompt('pickup:6/8:1:start').answer).toEqual([6]);
    expect(prompt('pickup:6/8:3:start').choices).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pickupStart('4/4', 3)).toBe(2);
    expect(barPulses('6/8')).toBe(6);
    expect(pulseWord('6/8')).toBe('eighth');
    expect(pulseWord('3/4')).toBe('beat');
  });

  it('numbers a road map’s bars and asks for its turn', () => {
    const p = prompt('form:repeat-inner:next');
    expect(p.bars.map((b) => b.number)).toEqual([1, 2, 3, 4]);
    expect(p.bars[1]?.repeatStart).toBe(true);
    expect(p.bars[2]?.repeatEnd).toBe(true);
    expect(p).toMatchObject({ task: 'next', ask: { bar: 2, time: 1 }, answer: [1], pickup: 0 });
    expect(['4/4', '3/4']).toContain(p.meter);
    expect(prompt('form:repeat-inner:order').answer).toEqual([0, 1, 2, 1, 2, 3]);
  });

  it('varies the meter between prompts (rule 12)', () => {
    expect(prompt('form:endings:next', 0, () => 0).meter).toBe('4/4');
    expect(prompt('form:endings:next', 0, () => 0.9).meter).toBe('3/4');
  });

  it('offers the bars a reader turns to at scope 0, and every bar at scope 1', () => {
    expect(prompt('form:repeat-inner:next').choices).toEqual([0, 1, 3]);
    expect(prompt('form:endings:next').choices).toEqual([0, 3, 4]);
    expect(prompt('form:endings-inner:next').choices).toEqual([0, 1, 3, 4]);
    // Too few turns: every bar.
    expect(prompt('form:repeat-all:next').choices).toEqual([0, 1, 2, 3]);
    expect(prompt('form:endings-long:next', 1).choices).toEqual([0, 1, 2, 3, 4, 5]);
    expect(nextChoices(FORMS['repeat-inner'].bars, { bar: 2 }, 1, 5)).toEqual([0, 1, 2, 3]);
  });
});

describe('form reading checks', () => {
  it('grades a pickup bar, naming the expected bar', () => {
    const p = prompt('pickup:4/4:2:bar', 0, () => 0.99);
    expect(formReadingCheck(p, [2])).toEqual({
      correct: true,
      expected: 'Bar 2',
      concept: 'pickup:4/4:2',
    });
    expect(formReadingCheck(p, [1])).toEqual({
      correct: false,
      expected: 'Bar 2',
      concept: 'pickup:4/4:2',
    });
  });

  it('reads a wrong start beat as a pickup of another length', () => {
    const p = prompt('pickup:4/4:1:start');
    expect(formReadingCheck(p, [3])).toMatchObject({
      correct: false,
      expected: 'Beat 4',
      confusedWith: 'pickup:4/4:2',
    });
    // Beat 1 is no pickup at all.
    expect(formReadingCheck(p, [1]).confusedWith).toBeUndefined();
    // Only pickups T6 has cards for: 6/8 has 1- and 3-eighth pickups.
    const compound = prompt('pickup:6/8:1:start');
    expect(formReadingCheck(compound, [4]).confusedWith).toBe('pickup:6/8:3');
    for (const eighth of [2, 3, 5]) {
      expect(formReadingCheck(compound, [eighth]).confusedWith, String(eighth)).toBeUndefined();
    }
    expect(formReadingCheck(prompt('pickup:3/4:1:start'), [2]).confusedWith).toBe('pickup:3/4:2');
    expect(expectedText(prompt('pickup:6/8:1:start'))).toBe('Eighth 6');
  });

  it('reads going back to bar 1 past a begin repeat as the road map without it', () => {
    const p = prompt('form:repeat-inner:next');
    expect(formReadingCheck(p, [0])).toMatchObject({
      correct: false,
      expected: 'Bar 2',
      concept: 'form:repeat-inner',
      confusedWith: 'form:repeat-from-start',
    });
    expect(formReadingCheck(p, [3]).confusedWith).toBeUndefined();
    expect(misreadShape(p, 0, 0)).toBeNull();
    expect(misreadShape(prompt('form:repeat-from-start:next'), 0, 1)).toBeNull();
    // |: 1 2 :||: 3 4 :| back to bar 1 is no other road map: playOrder never goes there.
    const twice = prompt('form:repeat-twice:next');
    expect(formReadingCheck(twice, [0])).toMatchObject({ correct: false });
    expect(formReadingCheck(twice, [0]).confusedWith).toBeUndefined();
  });

  it('grades a play order whole, and keys a wrong turn by where it went', () => {
    const p = prompt('form:endings-inner:order');
    expect(expectedText(p)).toBe('1 2 3 4 2 3 5 6');
    expect(formReadingCheck(p, p.answer).correct).toBe(true);
    expect(formReadingCheck(p, [0, 1, 2, 3, 0])).toMatchObject({
      correct: false,
      confusedWith: 'form:endings-from-start',
    });
    expect(formReadingCheck(p, [0, 1, 2, 3, 1, 2, 3]).confusedWith).toBeUndefined();
    // Stopping short is wrong too.
    expect(formReadingCheck(p, [0, 1]).correct).toBe(false);
    expect(firstWrongTap(p, [0, 1, 2, 4])).toBe(3);
    expect(firstWrongTap(p, [0, 1])).toBe(-1);
  });

  it('grades the order per bar tapped, other cards whole', () => {
    const order = prompt('form:repeat-all:order');
    expect(formReadingGradedResponseMs(order, order.answer, 8000)).toBe(1000);
    const next = prompt('form:repeat-all:next');
    expect(formReadingGradedResponseMs(next, next.answer, 3000)).toBe(3000);
  });

  it('describes answers, plays nothing itself, and keys concepts by form', () => {
    expect(formReadingDescribeAnswer([0, 1, 2])).toBe('0 1 2');
    expect(formReadingSounds()).toEqual({ expected: [] });
    expect(formReadingConceptOf(item('form:endings:order'))).toBe('form:endings');
    expect(formReadingConceptOf(item('pickup:6/8:3:start'))).toBe('pickup:6/8:3');
    expect(formReadingConceptOf(item('meter:6/8:kind'))).toBeNull();
  });

  it('answers from the keyboard: bar numbers on road maps, beats on start cards', () => {
    expect([...formReadingKeys(prompt('form:repeat-inner:next'))]).toEqual([
      ['1', 0],
      ['2', 1],
      ['4', 3],
    ]);
    expect(formReadingKeys(prompt('form:repeat-inner:order')).get('4')).toBe(3);
    expect(formReadingKeys(prompt('pickup:3/4:1:start')).get('3')).toBe(3);
    expect(formReadingKeys(prompt('pickup:3/4:1:bar')).size).toBe(0);
  });
});
