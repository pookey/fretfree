import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING } from '../../theory';
import {
  d1CanTest,
  d1Check,
  d1Choices,
  d1ConceptOf,
  d1CountLine,
  d1Explain,
  d1FeedbackPositions,
  d1GuideMarkers,
  d1KeyToAnswer,
  d1MakePrompt,
  d1Sounds,
} from './logic';

const ctx = {
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp' as const,
  scopeLevel: 0,
  rng: () => 0,
};
const item = (id: string) => ({ id, skillId: 'F2.string6-naturals' });

describe('D1 prompts', () => {
  it('builds a prompt for the highlighted position', () => {
    const p = d1MakePrompt(item('note@s6f5'), ctx);
    expect(p).toMatchObject({
      position: { string: 6, fret: 5 },
      expectedPc: 'A',
      expectedName: 'A2',
    });
    expect(p.choices).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  });

  it('uses 12 buttons at wider scope or for accidental targets', () => {
    expect(d1MakePrompt(item('note@s6f5'), { ...ctx, scopeLevel: 1 }).choices).toHaveLength(12);
    expect(d1MakePrompt(item('note@s6f2'), ctx).choices).toContain('F#');
    expect(d1Choices('Bb', 0, 'flat')).toContain('Bb');
  });

  it('rejects items it cannot test', () => {
    expect(d1CanTest(item('note@s1f0'))).toBe(true);
    expect(d1CanTest(item('find:G@s5'))).toBe(false);
    expect(() => d1MakePrompt(item('find:G@s5'), ctx)).toThrow(/cannot test/);
  });
});

describe('D1 checking', () => {
  const p = d1MakePrompt(item('note@s6f6'), { ...ctx, scopeLevel: 1 });

  it('accepts enharmonic spellings, and shows the answer with ♯', () => {
    expect(d1Check(p, 'A#')).toEqual({ correct: true, expected: 'A♯', concept: 'A#' });
    expect(d1Check(p, 'Bb').correct).toBe(true);
  });

  it('reports what the learner confused it with', () => {
    expect(d1Check(p, 'B')).toEqual({
      correct: false,
      expected: 'A♯',
      concept: 'A#',
      confusedWith: 'B',
    });
    expect(d1Check(p, 'garbage').correct).toBe(false);
  });
});

describe('D1 feedback', () => {
  const p = d1MakePrompt(item('note@s6f1'), ctx); // F2

  it('plays only the target when correct', () => {
    expect(d1Sounds(p, { answer: 'F', result: d1Check(p, 'F') })).toEqual({ expected: ['F2'] });
  });

  it('plays both notes, in the nearest octave, when wrong', () => {
    expect(d1Sounds(p, { answer: 'E', result: d1Check(p, 'E') })).toEqual({
      expected: ['F2'],
      given: ['E2'],
    });
    expect(d1Sounds(p, { answer: 'B', result: d1Check(p, 'B') }).given).toEqual(['B2']);
    const hi = d1MakePrompt(item('note@s6f7'), ctx); // B2
    expect(d1Sounds(hi, { answer: 'C', result: d1Check(hi, 'C') }).given).toEqual(['C3']);
    expect(d1Sounds(p, { answer: 'zz', result: d1Check(p, 'zz') })).toEqual({ expected: ['F2'] });
  });

  it('shows the chosen note on the same string when wrong', () => {
    expect(
      d1FeedbackPositions(p, { answer: 'F', result: d1Check(p, 'F') }, STANDARD_TUNING),
    ).toEqual({
      expected: [{ string: 6, fret: 1 }],
      given: [],
    });
    expect(
      d1FeedbackPositions(p, { answer: 'E', result: d1Check(p, 'E') }, STANDARD_TUNING).given,
    ).toEqual([{ string: 6, fret: 0 }]);
    expect(
      d1FeedbackPositions(p, { answer: '??', result: d1Check(p, '??') }, STANDARD_TUNING).given,
    ).toEqual([]);
  });

  it('keys confusions by pitch class', () => {
    expect(d1ConceptOf(item('note@s5f2'), ctx)).toBe('B');
    expect(d1ConceptOf(item('other'), ctx)).toBeNull();
  });
});

describe('D1 keyboard shortcuts', () => {
  const naturals = d1Choices('A', 0, 'sharp');
  const chromatic = d1Choices('A', 1, 'sharp');

  it('maps letters, shifted letters and digits', () => {
    expect(d1KeyToAnswer('a', false, naturals, 'sharp')).toBe('A');
    expect(d1KeyToAnswer('F', true, chromatic, 'sharp')).toBe('F#');
    expect(d1KeyToAnswer('B', true, d1Choices('A', 1, 'flat'), 'flat')).toBe('Bb');
    expect(d1KeyToAnswer('1', false, naturals, 'sharp')).toBe('C');
  });

  it('ignores keys that do not map to a visible choice', () => {
    expect(d1KeyToAnswer('F', true, naturals, 'sharp')).toBeNull();
    expect(d1KeyToAnswer('9', false, naturals, 'sharp')).toBeNull();
    expect(d1KeyToAnswer('x', false, naturals, 'sharp')).toBeNull();
    expect(d1KeyToAnswer('E', true, chromatic, 'sharp')).toBeNull();
  });
});

describe('D1 guide markers (design §3.5)', () => {
  const wide = { from: 0, to: 15 };
  // String 6, fret 3: G.
  const g = d1MakePrompt(item('note@s6f3'), ctx);
  const at = (marks: { fret: number; style: string; label: string }[]) =>
    marks.map((m) => `${m.fret}${m.style === 'root' ? '*' : ''}${m.label}`);

  it('level 3 labels the naturals on the target string and its roots, never the answer', () => {
    const marks = d1GuideMarkers(g, 3, wide, STANDARD_TUNING);
    expect(at(marks)).toEqual(['1F', '5A', '7B', '8C', '10D', '12*E', '13F']);
    expect(marks.every((m) => m.string === 6)).toBe(true);
  });

  it('level 2 shows only the roots', () => {
    expect(at(d1GuideMarkers(g, 2, wide, STANDARD_TUNING))).toEqual(['12*E']);
  });

  it.each([1, 0] as const)('level %i shows nothing', (level) => {
    expect(d1GuideMarkers(g, level, wide, STANDARD_TUNING)).toEqual([]);
  });

  it('skips the nut, and roots that share the target pitch class', () => {
    const e = d1MakePrompt(item('note@s6f12'), ctx);
    const marks = d1GuideMarkers(e, 3, wide, STANDARD_TUNING);
    expect(marks.some((m) => m.label === 'E' || m.fret === 0)).toBe(false);
    expect(d1GuideMarkers(e, 2, wide, STANDARD_TUNING)).toEqual([]);
  });

  it('stays inside the shown window and spells roots with the preference', () => {
    const halfDown = {
      id: 'eb',
      name: 'E♭ standard',
      notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'],
    };
    // String 6 is E♭ here, so fret 6 is A: the root sits at fret 12.
    const a = d1MakePrompt(item('note@s6f6'), { ...ctx, tuning: halfDown });
    expect(at(d1GuideMarkers(a, 3, { from: 4, to: 12 }, halfDown, 'flat'))).toEqual([
      '4G',
      '8B',
      '9C',
      '11D',
      '12*E♭',
    ]);
  });
});

describe('D1 explanations (design §6 D1)', () => {
  const p = (id: string, pref: 'sharp' | 'flat' = 'sharp') =>
    d1MakePrompt(item(id), { ...ctx, accidentalPref: pref, scopeLevel: 1 });
  const explain = (id: string, answer: string, pref: 'sharp' | 'flat' = 'sharp') => {
    const prompt = p(id, pref);
    return d1Explain(prompt, { answer, result: d1Check(prompt, answer) }, STANDARD_TUNING);
  };

  it('a miss by one fret: where the chosen note is, then the count from the open string', () => {
    expect(explain('note@s6f4', 'G')).toBe(
      'You said G. G is one fret lower, at fret 3. Count up from the open E: E F F♯ G G♯.',
    );
    expect(explain('note@s6f4', 'A')).toBe(
      'You said A. A is one fret higher, at fret 5. Count up from the open E: E F F♯ G G♯.',
    );
  });

  it('E–F: no fret between them, so F is one fret above E', () => {
    expect(explain('note@s6f1', 'F#')).toBe(
      'You said F♯. F♯ is one fret higher, at fret 2. Count up from the open E: E F.',
    );
  });

  it('a chosen note at the nut is the open string', () => {
    expect(explain('note@s5f2', 'A')).toBe(
      'You said A. A is 2 frets lower, at the open string. Count up from the open A: A A♯ B.',
    );
  });

  it('spells the walk with the flat preference', () => {
    expect(explain('note@s5f2', 'C', 'flat')).toBe(
      'You said C. C is one fret higher, at fret 3. Count up from the open A: A B♭ B.',
    );
  });

  it('counts down from fret 12 past fret 6, and up from it beyond', () => {
    expect(d1CountLine(p('note@s6f10'), STANDARD_TUNING)).toBe(
      'Count down from fret 12, E: E D♯ D.',
    );
    expect(d1CountLine(p('note@s6f14'), STANDARD_TUNING)).toBe('Count up from fret 12, E: E F F♯.');
    expect(d1CountLine(p('note@s6f6'), STANDARD_TUNING)).toBe(
      'Count up from the open E: E F F♯ G G♯ A A♯.',
    );
  });

  it('names the landmark itself at the nut and at fret 12', () => {
    expect(d1CountLine(p('note@s5f0'), STANDARD_TUNING)).toBe('A is the open string 5.');
    expect(d1CountLine(p('note@s6f12'), STANDARD_TUNING)).toBe(
      "Fret 12 is the open string's note again: E.",
    );
  });

  it('an answer it cannot place still gets the count', () => {
    expect(explain('note@s6f4', 'zz')).toBe('Count up from the open E: E F F♯ G G♯.');
  });

  it('a correct answer gets one confirming line', () => {
    expect(explain('note@s6f4', 'G#')).toBe('G♯: fret 4 on string 6.');
    expect(explain('note@s6f4', 'Ab')).toBe('G♯: fret 4 on string 6.');
    expect(explain('note@s5f0', 'A')).toBe('A: string 5, played open.');
  });
});
