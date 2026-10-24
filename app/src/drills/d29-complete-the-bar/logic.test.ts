import { describe, expect, it } from 'vitest';
import { SEED_CONFUSIONS } from '../../engine/confusions';
import { meterItemId, type MeterFact } from '../../engine/items/meter';
import type { Item } from '../../engine/model';
import { SKILLS } from '../../engine/skills';
import {
  STANDARD_TUNING,
  beats,
  checkBar,
  feltBeats,
  frac,
  fracEq,
  parseRhythm,
  rhythmLength,
} from '../../theory';
import type { ClickInfo } from '../../timing/tempo';
import {
  D29_METERS,
  FULL_PALETTE,
  SMALL_PALETTE,
  barHolds,
  beatUnitPlural,
  beatsPhrase,
  beatsToFill,
  buildBar,
  d29Bar,
  d29CanTest,
  d29Check,
  d29ConceptOf,
  d29DescribeAnswer,
  d29GradedResponseMs,
  d29HearOptions,
  d29KeyAction,
  d29MakePrompt,
  d29Palette,
  d29Sounds,
  d29Verdict,
  eighths,
  eventOf,
  hearPlan,
  insertValue,
  lengthName,
  moveValue,
  partnersOf,
  rhythmOf,
  signatureOf,
  valueList,
  valueName,
  valueOf,
  type D29Prompt,
} from './logic';

/** A small seeded generator, so the sweeps are repeatable. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ctx = (scopeLevel = 0, rng: () => number = () => 0) => ({
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp' as const,
  scopeLevel,
  rng,
});

const item = (meter: string, fact: MeterFact = 'feltBeats'): Item => ({
  id: meterItemId(meter, fact),
  skillId: 'T2.compound-meters',
});

/** A hand-made prompt: the given start, and an answer key that doesn't matter here. */
const prompt = (meter: string, given = '', solution = '4'): D29Prompt => ({
  itemId: meterItemId(meter, 'feltBeats'),
  meter,
  given,
  palette: [...FULL_PALETTE],
  solution,
});

const answer = (text: string) => ({ placed: text.split(' ').filter(Boolean) });

describe('D29 meta', () => {
  it("tests the felt-beats cards of T1's and T2's meters only", () => {
    for (const m of D29_METERS) {
      expect(d29CanTest(item(m))).toBe(true);
      expect(d29ConceptOf(item(m))).toBe(`meter:${m}`);
    }
    for (const fact of ['beatUnit', 'kind', 'fromBeats'] as const) {
      expect(d29CanTest(item('6/8', fact))).toBe(false);
    }
    expect(d29CanTest(item('5/4'))).toBe(false);
    expect(d29CanTest({ id: 'note@s6f5', skillId: 'F2.string6-naturals' })).toBe(false);
    expect(d29ConceptOf({ id: 'note@s6f5', skillId: 'F2.string6-naturals' })).toBeNull();
  });

  it('can test every felt-beats card of the skills that name it', () => {
    const skills = SKILLS.filter((s) => s.drillTypes.includes('complete-the-bar'));
    expect(skills.map((s) => s.id)).toEqual(
      expect.arrayContaining(['T1.simple-meters', 'T2.compound-meters', 'T2.cut-time']),
    );
    const felt = skills.flatMap((s) => s.items()).filter((i) => i.id.endsWith(':feltBeats'));
    expect(felt.length).toBe(D29_METERS.length);
    expect(felt.every(d29CanTest)).toBe(true);
  });

  it("keys 6/8 and 3/4 so the session builder's seed pair interleaves them", () => {
    const pair = SEED_CONFUSIONS.find(
      ([a, b]) => [a, b].includes('meter:6/8') && [a, b].includes('meter:3/4'),
    );
    expect(pair).toBeDefined();
  });
});

describe('scope', () => {
  it('offers four values at level 0 and seven above, the same for every meter', () => {
    expect(d29Palette(0)).toEqual(SMALL_PALETTE);
    expect(d29Palette(1)).toEqual(FULL_PALETTE);
    expect(d29Palette(2)).toEqual(FULL_PALETTE);
    // Out-of-range levels clamp.
    expect(d29Palette(-1)).toEqual(SMALL_PALETTE);
    expect(d29Palette(9)).toEqual(FULL_PALETTE);
    // Both quarters are always there, so the palette gives no clue to the meter.
    expect(SMALL_PALETTE).toEqual(expect.arrayContaining(['4', '4.']));
  });

  it('leaves two beats, then all but beat 1, then the whole bar', () => {
    const table = Object.fromEntries(
      D29_METERS.map((m) => [m, [0, 1, 2].map((l) => beatsToFill(m, l))]),
    );
    expect(table).toEqual({
      '2/4': [2, 2, 2],
      '3/4': [2, 2, 3],
      '4/4': [2, 3, 4],
      '2/2': [2, 2, 2],
      '6/8': [2, 2, 2],
      '9/8': [2, 2, 3],
      '12/8': [2, 3, 4],
    });
  });
});

describe('buildBar', () => {
  it('builds a right bar in every meter at every level, from palette values', () => {
    const rng = mulberry32(29);
    for (const m of D29_METERS) {
      const ts = signatureOf(m);
      for (const lvl of [0, 1, 2]) {
        const palette = new Set(d29Palette(lvl));
        for (let i = 0; i < 40; i++) {
          const { given, solution } = buildBar(m, lvl, rng);
          const g = rhythmOf(given);
          const s = parseRhythm(solution);
          expect(checkBar([...g, ...s], ts).ok, `${m} ${given} | ${solution}`).toBe(true);
          // The given start covers whole felt beats.
          const givenBeats = feltBeats(ts) - beatsToFill(m, lvl);
          const beatLength = beats(ts)[0]!.length;
          expect(fracEq(rhythmLength(g), frac(givenBeats * beatLength.n, beatLength.d))).toBe(true);
          for (const e of s) {
            expect(e.rest).toBeFalsy();
            expect(palette.has(`${e.value}${'.'.repeat(e.dots ?? 0)}`)).toBe(true);
          }
        }
      }
    }
  });

  it('varies the bar per prompt (rule 12)', () => {
    const rng = mulberry32(7);
    const bars = new Set(Array.from({ length: 30 }, () => JSON.stringify(buildBar('4/4', 2, rng))));
    expect(bars.size).toBeGreaterThan(5);
  });

  it('starts an empty bar of 6/8 even at level 0, so 3/4 can be tried', () => {
    expect(buildBar('6/8', 0, () => 0).given).toBe('');
    expect(buildBar('4/4', 2, () => 0).given).toBe('');
    expect(buildBar('4/4', 0, () => 0).given).not.toBe('');
  });

  it('takes the last cell for an rng of 1', () => {
    expect(
      checkBar(
        parseRhythm(Object.values(buildBar('9/8', 1, () => 1)).join(' ')),
        signatureOf('9/8'),
      ).ok,
    ).toBe(true);
  });

  it('throws for a meter D29 does not build', () => {
    expect(() => signatureOf('5/4')).toThrow(RangeError);
  });
});

describe('d29MakePrompt', () => {
  it('builds a prompt for a felt-beats card', () => {
    const p = d29MakePrompt(item('6/8'), ctx(0));
    expect(p.meter).toBe('6/8');
    expect(p.itemId).toBe('meter:6/8:feltBeats');
    expect(p.palette).toEqual(SMALL_PALETTE);
    expect(d29Check(p, answer(p.solution)).correct).toBe(true);
  });

  it('refuses a card it cannot test', () => {
    expect(() => d29MakePrompt(item('6/8', 'kind'), ctx())).toThrow(/cannot test/);
  });
});

describe('d29Check', () => {
  it('accepts any fill that passes checkBar', () => {
    const p = prompt('6/8', '4.');
    for (const fill of ['4.', '4 8', '8 4', '8 8 8', '16 16 16 16 8']) {
      expect(d29Check(p, answer(fill))).toEqual({
        correct: true,
        expected: '6/8: 2 dotted-quarter beats',
        concept: 'meter:6/8',
      });
    }
  });

  it('logs a 6/8 bar filled as 3/4, and the other way round', () => {
    expect(d29Check(prompt('6/8'), answer('4 4 4'))).toMatchObject({
      correct: false,
      concept: 'meter:6/8',
      confusedWith: 'meter:3/4',
    });
    expect(d29Check(prompt('3/4'), answer('4. 4.'))).toMatchObject({
      correct: false,
      concept: 'meter:3/4',
      confusedWith: 'meter:6/8',
    });
  });

  it('logs a 4/4 bar that hides its middle as cut time', () => {
    expect(d29Check(prompt('4/4'), answer('4 8 4 8 4'))).toMatchObject({
      correct: false,
      confusedWith: 'meter:2/2',
    });
  });

  it('logs no confusion for a bar short or over', () => {
    const short = d29Check(prompt('3/4'), answer('4 4'));
    expect(short.correct).toBe(false);
    expect(short.confusedWith).toBeUndefined();
    expect(d29Check(prompt('9/8'), answer('2. 2.')).confusedWith).toBeUndefined();
  });
});

describe('d29Verdict', () => {
  it('finds the quarter that runs into beat 2 of 6/8', () => {
    const v = d29Verdict(prompt('6/8'), answer('4 4 4'));
    expect(v.check.fill).toBe('exact');
    expect(v.hidden).toEqual([
      { placed: 1, code: '4', beat: 1, count: 'li', eighth: 3, hides: 2, middle: false },
    ]);
    expect(v.partner).toBe('3/4');
  });

  it('finds a half from beat 1 that ends inside beat 2 of 6/8', () => {
    expect(d29Verdict(prompt('6/8'), answer('2 4')).hidden).toEqual([
      { placed: 0, code: '2', beat: 1, count: '1', eighth: 1, hides: 2, middle: false },
    ]);
  });

  it('counts placed values after the given start', () => {
    const v = d29Verdict(prompt('12/8', '4. 4.'), answer('4 4 4'));
    expect(v.hidden).toEqual([
      { placed: 1, code: '4', beat: 3, count: 'li', eighth: 9, hides: 4, middle: false },
    ]);
  });

  it('flags a note across the middle of 4/4, and one across a simple beat', () => {
    expect(d29Verdict(prompt('4/4'), answer('4 8 4 8 4')).hidden).toEqual([
      { placed: 2, code: '4', beat: 2, count: '&', eighth: 4, hides: 3, middle: true },
    ]);
    expect(d29Verdict(prompt('3/4'), answer('8 4. 4')).hidden).toEqual([
      { placed: 1, code: '4.', beat: 1, count: '&', eighth: 2, hides: 2, middle: false },
    ]);
  });

  it('has no partner for a right bar', () => {
    expect(d29Verdict(prompt('6/8'), answer('4. 4.')).partner).toBeNull();
  });
});

describe('partnersOf', () => {
  it('pairs meters with the same bar felt another way', () => {
    expect(partnersOf('6/8')).toEqual(['3/4']);
    expect(partnersOf('3/4')).toEqual(['6/8']);
    expect(partnersOf('4/4')).toEqual(['2/2']);
    expect(partnersOf('2/2')).toEqual(['4/4']);
    expect(partnersOf('9/8')).toEqual([]);
  });
});

describe('values', () => {
  it('reads one value, a note or (given) a rest', () => {
    expect(eventOf('4.')).toEqual({ value: 4, dots: 1 });
    expect(valueOf('r4')).toEqual({ value: 4, rest: true });
    expect(() => eventOf('r4')).toThrow(/Not a note value/);
    expect(() => valueOf('4 4')).toThrow(/Not one value/);
    expect(() => valueOf('3[8 8 8]')).toThrow(/Not one value/);
    expect(() => valueOf('4~')).toThrow(/Not one value/);
  });

  it('joins the given start and the placed values', () => {
    expect(d29Bar(prompt('3/4', 'r4'), answer('2'))).toEqual(parseRhythm('r4 2'));
    expect(rhythmOf('')).toEqual([]);
  });

  it('names lengths as notes', () => {
    expect(lengthName(frac(1, 8))).toBe('an eighth');
    expect(lengthName(frac(3, 8))).toBe('a dotted quarter');
    expect(lengthName(frac(1, 1))).toBe('a whole');
    expect(lengthName(frac(1, 2))).toBe('a half');
    expect(lengthName(frac(5, 16))).toBe('5 sixteenths');
    expect(lengthName(frac(5, 8))).toBe('5 eighths');
    expect(barHolds('6/8')).toBe('6 eighths');
    expect(barHolds('2/2')).toBe('2 halves');
    expect(beatUnitPlural('6/8')).toBe('dotted quarters');
    expect(beatUnitPlural('4/4')).toBe('quarters');
    expect(beatUnitPlural('2/2')).toBe('halves');
    expect(beatsPhrase('6/8')).toBe('2 dotted-quarter beats');
    expect(beatsPhrase('3/4')).toBe('3 quarter-note beats');
    expect(beatsPhrase('2/2')).toBe('2 half-note beats');
  });

  it('names values and lists them', () => {
    expect(valueName('4.')).toBe('dotted quarter');
    expect(valueName('r4')).toBe('quarter rest');
    expect(valueList(['4.'])).toBe('a dotted quarter');
    expect(valueList(['4', '8'])).toBe('a quarter and an eighth');
    expect(valueList(['8', '8', '8'])).toBe('an eighth, an eighth and an eighth');
    expect(valueList([])).toBe('');
  });
});

describe('grading and logging', () => {
  it('stores the placed values in the text form', () => {
    expect(d29DescribeAnswer(answer('4. 8'))).toBe('4. 8');
  });

  it('grades time per value placed', () => {
    expect(d29GradedResponseMs(prompt('6/8'), answer('4. 8 4'), 6000)).toBe(2000);
    expect(d29GradedResponseMs(prompt('6/8'), answer(''), 3000)).toBe(3000);
  });

  it('plucks nothing: the bar is heard on the click', () => {
    expect(d29Sounds()).toEqual({ expected: [] });
  });
});

describe('hearing a bar', () => {
  it('clicks on each note, on a grid fine enough for all of them', () => {
    expect(hearPlan('4. 8 4', '6/8')).toEqual({ subdivide: 1, steps: [0, 3, 4], endPulse: 6 });
    expect(hearPlan('8 16 16 4 2', '4/4')).toEqual({
      subdivide: 4,
      steps: [0, 2, 3, 4, 8],
      endPulse: 4,
    });
    // A rest isn't heard.
    expect(hearPlan('r4 2', '3/4').steps).toEqual([1]);
  });

  it('plays a bar that runs over to its last note', () => {
    expect(hearPlan('2 2 4', '3/4').endPulse).toBe(5);
    expect(hearPlan('4 4 8', '3/4').endPulse).toBe(3);
  });

  it('rounds a note too fine for the grid to the nearest step', () => {
    // A sixteenth in 2/2 is an eighth of a half-note pulse.
    expect(hearPlan('16 16 4. 2', '2/2')).toEqual({
      subdivide: 4,
      steps: [0, 1, 1, 4],
      endPulse: 2,
    });
  });

  it('counts in one bar of beats, then sounds only the notes', () => {
    const opts = d29HearOptions('4 8 4.', '6/8');
    expect(opts).toMatchObject({
      meter: { groups: [3, 3], unit: 8 },
      bpm: 66 * 3,
      subdivide: 1,
      countInBars: 1,
    });
    const rule = opts.fade as (c: ClickInfo) => boolean;
    const click = (pulse: number, countIn = false) =>
      rule({ index: 0, pulse, bar: 0, pulseInBar: pulse, accent: 'pulse', countIn });
    expect(click(-6, true)).toBe(true);
    expect(click(-5.5, true)).toBe(false);
    expect([0, 1, 2, 3, 4, 5].map((p) => click(p))).toEqual([
      true,
      false,
      true,
      true,
      false,
      false,
    ]);
    expect(d29HearOptions('2', '3/4').bpm).toBe(66);
  });
});

describe('editing', () => {
  it('maps keys to actions', () => {
    expect(d29KeyAction('1', 4)).toEqual({ type: 'add', index: 0 });
    expect(d29KeyAction('4', 4)).toEqual({ type: 'add', index: 3 });
    expect(d29KeyAction('5', 4)).toBeNull();
    expect(d29KeyAction('0', 4)).toBeNull();
    expect(d29KeyAction('Backspace', 4)).toEqual({ type: 'undo' });
    expect(d29KeyAction('Enter', 4)).toEqual({ type: 'check' });
    expect(d29KeyAction('x', 4)).toBeNull();
  });

  it('moves and inserts values', () => {
    expect(moveValue(['4', '8', '2'], 0, 2)).toEqual(['8', '2', '4']);
    expect(moveValue(['4', '8'], 1, 0)).toEqual(['8', '4']);
    expect(moveValue(['4', '8'], 0, -1)).toEqual(['4', '8']);
    expect(moveValue(['4', '8'], 1, 2)).toEqual(['4', '8']);
    expect(insertValue(['4', '8'], 1, '2')).toEqual(['4', '2', '8']);
    expect(insertValue(['4'], 9, '2')).toEqual(['4', '2']);
    expect(insertValue([], -1, '2')).toEqual(['2']);
  });

  it('measures lengths in eighths', () => {
    expect(eighths(frac(3, 4))).toBe(6);
  });
});
