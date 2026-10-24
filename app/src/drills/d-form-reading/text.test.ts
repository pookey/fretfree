import { describe, expect, it } from 'vitest';
import type { Item } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import { formReadingMakePrompt, type FormReadingPrompt } from './logic';
import {
  ENDING_RULES,
  PICKUP_RULES,
  REPEAT_RULES,
  barCount,
  barLabel,
  choiceLabel,
  countIn,
  countText,
  formReadingExplain,
  formReadingFact,
  formReadingGuides,
  formReadingTask,
  orderText,
  rhythmWords,
  roadMapRules,
} from './text';

const prompt = (id: string, rng: () => number = () => 0.99): FormReadingPrompt =>
  formReadingMakePrompt({ id, skillId: 'T6.repeats' } as Item, {
    tuning: STANDARD_TUNING,
    accidentalPref: 'sharp',
    scopeLevel: 0,
    rng,
  });

describe('form reading words', () => {
  it('asks each kind of card, naming the answer in a worked example', () => {
    const bar = prompt('pickup:4/4:1:bar');
    expect(formReadingTask(bar, false)).toBe('Tap bar 2.');
    expect(formReadingTask(bar, true)).toContain('Tap bar 2 to continue.');
    const start = prompt('pickup:6/8:1:start');
    expect(formReadingTask(start, false)).toBe('On which eighth of the bar does the pickup start?');
    expect(formReadingTask(start, true)).toMatch(/Tap 6 to continue\.$/);
    expect(formReadingTask(prompt('form:repeat-inner:next'), false)).toBe(
      'After bar 3, which bar do you play?',
    );
    expect(formReadingTask(prompt('form:endings:next'), true)).toBe(
      'The second time through, after bar 3, which bar do you play? Tap 5 to continue.',
    );
    const order = prompt('form:repeat-tail:order');
    expect(formReadingTask(order, false)).toBe('Tap the bars in the order you play them.');
    expect(formReadingTask(order, true)).toContain('1 2 3 4 3 4, to continue');
  });

  it('states the fact: a pickup and where to count it in, or the order and its turns', () => {
    expect(formReadingFact(prompt('pickup:4/4:1:bar'))).toEqual([
      expect.stringContaining('holds 1 beat of 4'),
    ]);
    expect(formReadingFact(prompt('pickup:4/4:1:start'))[1]).toBe(
      'A pickup fills the end of a bar, so it starts on beat 4: count 1 2 3, then play.',
    );
    expect(formReadingFact(prompt('pickup:6/8:3:start'))[0]).toContain('3 eighths of 6');
    expect(countIn(2)).toBe('count 1, then play');
    const inner = prompt('form:endings-inner:next');
    expect(formReadingFact(inner)).toEqual([
      'Play 1 2 3 4 2 3 5 6.',
      'The end repeat in the 1st ending (bar 4) sends you back to the begin repeat at bar 2.',
      'The second time through, skip the 1st ending and play the 2nd, from bar 5.',
    ]);
    expect(roadMapRules(prompt('form:repeat-from-start:next').bars)).toEqual([
      'The end repeat at bar 3 has no begin repeat before it, so it goes back to the start.',
    ]);
    expect(orderText(prompt('pickup:4/4:1:bar'))).toBe('pickup 1 2 3 4');
  });

  it('explains a wrong pickup bar or start', () => {
    const bar = prompt('pickup:4/4:1:bar');
    expect(formReadingExplain(bar, [2])).toBeNull();
    expect(formReadingExplain(bar, [0])).toBe(
      "That's the pickup: it holds only 1 beat of 4, so it isn't counted.",
    );
    expect(formReadingExplain(bar, [1])).toContain('counting the pickup as bar 1');
    expect(formReadingExplain(bar, [4])).toBe("That's bar 4.");
    const start = prompt('pickup:4/4:1:start');
    expect(formReadingExplain(start, [4])).toBeNull();
    expect(formReadingExplain(start, [1])).toContain('downbeat of bar 1');
    expect(formReadingExplain(start, [3])).toBe('A pickup starting on beat 3 would hold 2 beats.');
  });

  it('explains a wrong turn: straight on, back too far, or the wrong ending', () => {
    const inner = prompt('form:repeat-inner:next');
    expect(formReadingExplain(inner, [1])).toBeNull();
    expect(formReadingExplain(inner, [3])).toBe(
      'Bar 4 is straight on, but the end repeat sends you back first.',
    );
    expect(formReadingExplain(inner, [0])).toContain("there's one at bar 2");
    const endings = prompt('form:endings:next');
    expect(formReadingExplain(endings, [3])).toBe(
      'Bar 4 is the 1st ending: the second time through, skip it.',
    );
    expect(formReadingExplain(endings, [0])).toBe('From bar 3, the road map goes to bar 5.');
    const order = prompt('form:endings:order');
    expect(formReadingExplain(order, [0, 1, 2, 4])).toBe(
      'Bar 5 is the 2nd ending: play the 1st ending the first time.',
    );
    expect(formReadingExplain(order, [1])).toBe('The tune starts at bar 1.');
    expect(formReadingExplain(order, [0, 1])).toBe('The tune goes on.');
    expect(formReadingExplain(order, order.answer)).toBeNull();
  });

  it('names bars by place until numbered, with their signs and notes', () => {
    const bar = prompt('pickup:4/4:1:bar', () => 0);
    expect(barLabel(bar, 0, false)).toBe('1st bar on the page: quarter');
    expect(barLabel(bar, 0, true)).toBe('Pickup: quarter');
    expect(barLabel(bar, 4, true)).toMatch(/^Bar 4, final barline: /);
    expect(barLabel(bar, 9, true)).toBe('');
    const endings = prompt('form:endings:next');
    expect(barLabel(endings, 0, true)).toBe('Bar 1, begin repeat');
    expect(barLabel(endings, 3, true)).toBe('Bar 4, 1st ending, end repeat');
    expect(barLabel(endings, 4, true)).toBe('Bar 5, 2nd ending, final barline');
    expect(choiceLabel(endings, 4)).toBe('Bar 5');
    expect(choiceLabel(prompt('pickup:6/8:1:start'), 6)).toBe('Eighth 6');
    expect(choiceLabel(prompt('pickup:3/4:1:start'), 3)).toBe('Beat 3');
  });

  it('counts a bar’s notes', () => {
    expect(rhythmWords('4. 8 2')).toBe('dotted quarter, eighth, half');
    expect(barCount('4 8 4', '6/8')).toBe(5);
    expect(countText('4', '4/4')).toBe('1 beat');
    expect(countText('4 4 4', '3/4')).toBe('3 beats');
  });

  it('fades the panel: rules from level 1, signs from 2, counts at 3', () => {
    const pickup = prompt('pickup:4/4:1:bar');
    expect(formReadingGuides(pickup, 0)).toEqual({ rules: [], legend: false, counts: false });
    expect(formReadingGuides(pickup, 1)).toEqual({
      rules: PICKUP_RULES,
      legend: false,
      counts: false,
    });
    expect(formReadingGuides(pickup, 3)).toEqual({
      rules: PICKUP_RULES,
      legend: false,
      counts: true,
    });
    expect(formReadingGuides(prompt('form:repeat-all:next'), 2)).toEqual({
      rules: REPEAT_RULES,
      legend: true,
      counts: false,
    });
    expect(formReadingGuides(prompt('form:endings:next'), 1).rules).toBe(ENDING_RULES);
  });
});
