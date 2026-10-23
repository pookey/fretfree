import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../../engine/config';
import { EAR_METERS, type EarMeter } from '../../engine/items/meter-ear';
import { STANDARD_TUNING, parseTimeSignature } from '../../theory';
import {
  D30_CHORDS,
  D30_GROUPINGS,
  D30_SCOPE,
  d30Accents,
  d30Bars,
  d30BeatNotes,
  d30CanTest,
  d30Check,
  d30Choices,
  d30Clip,
  d30ClipSeconds,
  d30ConceptOf,
  d30DescribeAnswer,
  d30GradedResponseMs,
  d30KeyFor,
  d30KeyToAnswer,
  d30MakePrompt,
  d30Sounds,
  eighthsPerBar,
  type D30Accent,
  type D30Prompt,
} from './logic';

const CONFIG = ENGINE_CONFIG.hearTheMeter;

const ctx = (rng: () => number, scopeLevel = 0) => ({
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp' as const,
  scopeLevel,
  rng,
});

const item = (meter: string) => ({ id: `meter-ear:${meter}`, skillId: 'T4.test' });

/** A prompt with every random draw at `r`. */
const promptFor = (meter: EarMeter, r = 0, scopeLevel = 0) =>
  d30MakePrompt(item(meter), ctx(() => r, scopeLevel));

const prompt = (over: Partial<D30Prompt> = {}): D30Prompt => ({
  itemId: 'meter-ear:3/4',
  meter: '3/4',
  signature: '3/4',
  choices: ['3/4', '4/4'],
  style: 'strum',
  eighthsPerMinute: 180,
  chord: 0,
  ...over,
});

const short: Record<D30Accent, string> = { bar: 'B', group: 'G', beat: 'b', off: '.' };
const accents = (signature: string) =>
  d30Accents(parseTimeSignature(signature))
    .map((a) => short[a])
    .join('');

describe('D30 items', () => {
  it('tests meter-ear items only, keyed by the meter', () => {
    expect(d30CanTest(item('6/8'))).toBe(true);
    expect(d30CanTest({ id: 'meter-ear:2/4', skillId: 'x' })).toBe(false);
    expect(d30CanTest({ id: 'ear-chord:minor', skillId: 'x' })).toBe(false);
    expect(d30ConceptOf(item('12/8'))).toBe('meter:12/8');
    expect(d30ConceptOf({ id: 'note@s6f0', skillId: 'x' })).toBeNull();
    expect(() => d30MakePrompt({ id: 'note@s6f0', skillId: 'x' }, ctx(() => 0))).toThrow();
  });
});

describe('d30Choices', () => {
  it('counts the beats at the narrowest scope, then splits the bar, then offers all six', () => {
    expect(d30Choices('3/4', 0)).toEqual(['3/4', '4/4']);
    expect(d30Choices('12/8', 0)).toEqual(['6/8', '12/8']);
    expect(d30Choices('7/8', 0)).toEqual(['5/4', '7/8']);
    // The confusable pairs (design §12): the same bar, split another way.
    expect(d30Choices('6/8', 1)).toEqual(['3/4', '6/8']);
    expect(d30Choices('4/4', 1)).toEqual(['4/4', '12/8']);
    expect(d30Choices('5/4', 2)).toEqual([...EAR_METERS]);
    // Out-of-range levels are clamped.
    expect(d30Choices('3/4', -1)).toEqual(d30Choices('3/4', D30_SCOPE.minLevel));
    expect(d30Choices('3/4', 9)).toEqual(d30Choices('3/4', D30_SCOPE.maxLevel));
  });

  it('never gives the answer away: every button in a set could be its answer', () => {
    for (let lvl = D30_SCOPE.minLevel; lvl <= D30_SCOPE.maxLevel; lvl++) {
      for (const meter of EAR_METERS) {
        const set = d30Choices(meter, lvl);
        expect(set).toContain(meter);
        for (const other of set) expect(d30Choices(other, lvl), `${other} @${lvl}`).toEqual(set);
      }
    }
  });
});

describe('d30MakePrompt', () => {
  it('draws the tempo from the meter’s range, in steps', () => {
    for (const meter of EAR_METERS) {
      const range = CONFIG.eighthsPerMinute[meter];
      expect(promptFor(meter, 0).eighthsPerMinute).toBe(range.from);
      const top = promptFor(meter, 0.9999).eighthsPerMinute;
      expect(top).toBeLessThanOrEqual(range.to);
      expect(top).toBeGreaterThan(range.to - CONFIG.tempoStep);
      // An rng that returns 1 stays in range.
      expect(promptFor(meter, 1).eighthsPerMinute).toBeLessThanOrEqual(range.to);
      expect((top - range.from) % CONFIG.tempoStep).toBe(0);
    }
  });

  it('overlaps the tempos of meters that share a bar, so speed is no clue', () => {
    const { eighthsPerMinute: t } = CONFIG;
    for (const [a, b] of [
      ['3/4', '6/8'],
      ['4/4', '12/8'],
    ] as const) {
      expect(Math.min(t[a].to, t[b].to)).toBeGreaterThan(Math.max(t[a].from, t[b].from));
    }
  });

  it('varies the sound, the chord and the grouping (rule 12)', () => {
    expect(promptFor('3/4', 0).style).toBe('strum');
    expect(promptFor('3/4', 0.9).style).toBe('drums');
    expect(promptFor('3/4', 0).chord).toBe(0);
    expect(promptFor('3/4', 0.9999).chord).toBe(D30_CHORDS.length - 1);
    expect(promptFor('7/8', 0).signature).toBe('7/8 (2+2+3)');
    expect(promptFor('7/8', 0.9999).signature).toBe('7/8 (2+3+2)');
    expect(promptFor('5/4', 0.9999).signature).toBe('5/4 (2+3)');
    expect(promptFor('6/8', 0.5).signature).toBe('6/8');
    for (const meter of EAR_METERS) {
      for (const g of D30_GROUPINGS[meter]) {
        expect(parseTimeSignature(g).top, g).toBe(parseTimeSignature(meter).top);
      }
    }
  });

  it('asks the item’s meter, with buttons for the scope level', () => {
    const p = promptFor('6/8', 0.3, 1);
    expect(p).toMatchObject({ itemId: 'meter-ear:6/8', meter: '6/8', choices: ['3/4', '6/8'] });
  });
});

describe('the bar', () => {
  it('stresses the downbeat, a later group, each felt beat, then the eighths between', () => {
    expect(accents('3/4')).toBe('B.b.b.');
    expect(accents('4/4')).toBe('B.b.G.b.');
    expect(accents('6/8')).toBe('B..b..');
    expect(accents('12/8')).toBe('B..b..G..b..');
    expect(accents('5/4 (3+2)')).toBe('B.b.b.G.b.');
    expect(accents('5/4 (2+3)')).toBe('B.b.G.b.b.');
    expect(accents('7/8 (2+2+3)')).toBe('B.b.b..');
    expect(accents('7/8 (3+2+2)')).toBe('B..b.b.');
  });

  it('keeps the confusable pairs one bar long, apart only in where the beats fall', () => {
    expect(eighthsPerBar(parseTimeSignature('3/4'))).toBe(eighthsPerBar(parseTimeSignature('6/8')));
    expect(accents('3/4')).not.toBe(accents('6/8'));
    expect(accents('4/4').replace(/\./g, '')).toBe(accents('12/8').replace(/\./g, ''));
  });

  it('plays enough bars to be heard, within bounds', () => {
    // 3/4 at 240 eighths a minute: 1.5 s a bar, so the 4-bar cap.
    expect(d30Bars(parseTimeSignature('3/4'), 240)).toBe(CONFIG.maxBars);
    // 12/8 at 150: 4.8 s a bar, so the 2-bar floor.
    expect(d30Bars(parseTimeSignature('12/8'), 150)).toBe(CONFIG.minBars);
    // 4/4 at 160: 3 s a bar, exactly 6 s in 2.
    expect(d30Bars(parseTimeSignature('4/4'), 160)).toBe(2);
    expect(d30Bars(parseTimeSignature('4/4'), 200)).toBe(3);
  });
});

describe('d30Clip', () => {
  it('strums the bass on the downbeat, the 5th on a later group, chords on beats, top strings between', () => {
    const p = prompt({ meter: '4/4', signature: '4/4', eighthsPerMinute: 160, chord: 2 });
    const clip = d30Clip(p);
    if (clip.style !== 'strum') throw new Error('strum expected');
    const a = D30_CHORDS[2]!;
    // Two bars of eight eighths, then the closing downbeat.
    expect(clip.strokes).toHaveLength(17);
    expect(clip.strokes[0]).toEqual({ notes: [a.bass, ...a.upper], eighths: 1 });
    expect(clip.strokes[1]!.notes).toEqual(a.top);
    expect(clip.strokes[2]!.notes).toEqual(a.upper);
    expect(clip.strokes[4]!.notes).toEqual([a.alt, ...a.upper]);
    expect(clip.strokes[16]).toEqual({ notes: [a.bass, ...a.upper], eighths: 4 });
    expect(d30ClipSeconds(clip)).toBeCloseTo((20 * 60) / 160);
  });

  it('drums the kick on the downbeat and a later group, the snare on the other beats, a hat on every eighth', () => {
    const clip = d30Clip(prompt({ style: 'drums', meter: '6/8', signature: '6/8' }));
    if (clip.style !== 'drums') throw new Error('drums expected');
    const at = (drum: string) => clip.hits.filter((h) => h.drum === drum).map((h) => h.at);
    // 6/8 at 180: 2 s a bar, so 3 bars, then the closing downbeat.
    expect(at('kick')).toEqual([0, 6, 12, 18]);
    expect(at('snare')).toEqual([3, 9, 15]);
    expect(at('hat')).toEqual(Array.from({ length: 19 }, (_, i) => i));
    const hats = clip.hits.filter((h) => h.drum === 'hat');
    expect(hats[0]!.velocity).toBeGreaterThan(hats[3]!.velocity);
    expect(hats[3]!.velocity).toBeGreaterThan(hats[1]!.velocity);
    expect(clip.length).toBe(22);
    expect(d30ClipSeconds(clip)).toBeCloseTo((22 * 60) / 180);
  });

  it('plays a wrong answer’s meter in the same sound and tempo, in its usual grouping', () => {
    const p = prompt({ meter: '7/8', signature: '7/8 (3+2+2)', style: 'drums', eighthsPerMinute: 210 });
    const mine = d30Clip(p);
    const yours = d30Clip(p, '5/4');
    expect(yours.style).toBe('drums');
    expect(yours.eighthsPerMinute).toBe(210);
    if (mine.style !== 'drums' || yours.style !== 'drums') throw new Error('drums expected');
    // The answer in the grouping heard (kick on 1 only, snares on 4 and 6); 5/4 as 3+2.
    expect(mine.hits.filter((h) => h.drum === 'snare' && h.at < 7).map((h) => h.at)).toEqual([3, 5]);
    expect(yours.hits.filter((h) => h.drum === 'kick' && h.at < 10).map((h) => h.at)).toEqual([0, 6]);
  });

  it('falls back to the first chord for an unknown index', () => {
    const clip = d30Clip(prompt({ chord: 99 }));
    if (clip.style !== 'strum') throw new Error('strum expected');
    expect(clip.strokes[0]!.notes[0]).toBe(D30_CHORDS[0]!.bass);
  });
});

describe('grading', () => {
  it('names the meter, and records what a wrong answer was confused with', () => {
    const p = prompt({ meter: '6/8', signature: '6/8', choices: ['3/4', '6/8'] });
    expect(d30Check(p, '6/8')).toEqual({ correct: true, expected: '6/8', concept: 'meter:6/8' });
    expect(d30Check(p, '3/4')).toEqual({
      correct: false,
      expected: '6/8',
      concept: 'meter:6/8',
      confusedWith: 'meter:3/4',
    });
    // Not a button: no confusion to learn.
    expect(d30Check(p, '7/8').confusedWith).toBeUndefined();
    expect(d30DescribeAnswer('12/8')).toBe('12/8');
    expect(d30Sounds(p, { answer: '3/4', result: d30Check(p, '3/4') })).toEqual({ expected: [] });
  });

  it('starts graded time once the clip has played', () => {
    // 4/4 at 160: 2 bars of 3 s.
    const p = prompt({ meter: '4/4', signature: '4/4', eighthsPerMinute: 160 });
    const heard = 6000 + CONFIG.listenMs;
    expect(d30GradedResponseMs(p, '4/4', heard + 1500)).toBe(1500);
    expect(d30GradedResponseMs(p, '4/4', 2000)).toBe(0);
  });
});

describe('notation', () => {
  it('writes one note per felt beat, its length showing the grouping', () => {
    const notes = (s: string) =>
      d30BeatNotes(parseTimeSignature(s))
        .map((n) => n.value + (n.dots ? '.' : ''))
        .join(' ');
    expect(notes('3/4')).toBe('q q q');
    expect(notes('4/4')).toBe('q q q q');
    expect(notes('6/8')).toBe('q. q.');
    expect(notes('12/8')).toBe('q. q. q. q.');
    expect(notes('5/4 (3+2)')).toBe('q q q q q');
    expect(notes('7/8 (2+2+3)')).toBe('q q q.');
    expect(notes('7/8 (3+2+2)')).toBe('q. q q');
    expect(notes('3/8')).toBe('8 8 8');
    expect(notes('2/2')).toBe('h h');
    expect(notes('6/4')).toBe('h. h.');
    expect(() => notes('6/2')).toThrow(RangeError);
  });
});

describe('keyboard', () => {
  it('answers with the number row, by position', () => {
    const choices: EarMeter[] = ['3/4', '4/4', '6/8'];
    expect(d30KeyFor(0)).toBe('1');
    expect(d30KeyFor(6)).toBeUndefined();
    expect(d30KeyToAnswer('2', choices)).toBe('4/4');
    expect(d30KeyToAnswer('5', choices)).toBeNull();
    expect(d30KeyToAnswer('x', choices)).toBeNull();
  });
});
