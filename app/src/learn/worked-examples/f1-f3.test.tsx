import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useAppStore } from '../../app-store';
import { playNotes } from '../../audio/audio';
import { DEFAULT_SETTINGS, SKILLS, getSkill } from '../../engine';
import { MODULES } from '../../engine/frontier';
import { noteAt, semitonesBetween } from '../../theory';
import alphabet, { fretWord, letterStep, spellFrom } from './f1-alphabet';
import steps, { halfWholeStep } from './f1-steps';
import string5 from './f2-string5';
import markers, { markerStep, repeatStep } from './f3-markers';
import { exampleFor } from './index';
import { START, exampleMarkers, stepRange } from './logic';
import { WorkedExample } from './WorkedExample';

vi.mock('../../audio/audio', () => ({ playNotes: vi.fn(() => Promise.resolve()) }));

beforeEach(() => {
  vi.mocked(playNotes).mockClear();
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS } });
});

describe('worked-example registry: neck basics', () => {
  it('covers every skill of the first module', () => {
    const notes1 = MODULES.find((m) => m.id === 'notes-1')!;
    const covered = Object.fromEntries(
      SKILLS.filter((s) => notes1.topics.includes(s.topic)).map((s) => [s.id, exampleFor(s)?.id]),
    );
    expect(covered).toEqual({
      'F1.alphabet': 'f1-alphabet',
      'F1.b-c-e-f': 'f1-alphabet',
      'F1.half-steps': 'f1-steps',
      'F1.whole-steps': 'f1-steps',
      'F2.string6-naturals': 'f2-landmarks',
      'F2.string5-naturals': 'f2-string5',
      'F3.markers': 'f3-markers',
      'F3.repeat-12': 'f3-markers',
    });
  });

  it('works the trap first, then brings it back unaided, on fresh cells', () => {
    for (const e of [alphabet, steps, string5, markers]) {
      const [worked, , independent] = e.steps;
      // Worked: the misconception is drawn as a ghost (rule 8, as in c5-root-first).
      expect(worked.trap, e.id).toBeDefined();
      expect(
        exampleMarkers(e, START).filter((m) => m.style === 'ghost'),
        e.id,
      ).toEqual([expect.objectContaining(worked.trap!.at)]);
      // Independent: the same misconception, met unaided on another string or note.
      expect(independent.trap, e.id).toBeDefined();
      expect(`${independent.answer.string}:${noteAt(independent.answer).pc}`, e.id).not.toBe(
        `${worked.answer.string}:${noteAt(worked.answer).pc}`,
      );
    }
  });
});

describe('letterStep', () => {
  it('wraps from G to A, two frets up', () => {
    const step = letterStep({ string: 6, fret: 3 }, 1);
    expect(step.prompt).toBe('Find the letter after G on string 6.');
    expect(step.answer).toEqual({ string: 6, fret: 5 });
    expect(step.explain).toBe(
      'The alphabet runs A to G and round again, so after G comes A. That’s a whole step: two frets up, to fret 5.',
    );
    expect(step.hint).toBe('The alphabet wraps round between G and A.');
    expect(step.trap).toBeUndefined();
  });

  it('wraps back from A to G, onto the open string', () => {
    const step = letterStep({ string: 3, fret: 2 }, -1);
    expect(step.answer).toEqual({ string: 3, fret: 0 });
    expect(step.explain).toMatch(/so before A comes G\. .* two frets down, to the open string\.$/);
  });

  it('steps a whole step between ordinary neighbours', () => {
    const step = letterStep({ string: 5, fret: 0 }, 1);
    expect(noteAt(step.answer).pc).toBe('B');
    expect(step.explain).toBe('After A comes B. That’s a whole step: two frets up, to fret 2.');
    expect(step.hint).toBe('Letters are two frets apart, except B–C and E–F.');
  });

  it('traps two frets on at B–C and E–F, in either direction', () => {
    const up = letterStep({ string: 5, fret: 2 }, 1);
    expect(up.answer).toEqual({ string: 5, fret: 3 });
    expect(up.explain).toBe(
      'After B comes C. That’s only a half step: there’s no sharp between B and C, so C is the very next fret, fret 3.',
    );
    expect(up.hint).toBe('B–C has no sharp between.');
    expect(up.trap).toEqual({
      at: { string: 5, fret: 4 },
      name: 'C#',
      message:
        'That’s C#, two frets up. B–C is a half step, with no sharp between them, so C is the very next fret.',
    });

    const down = letterStep({ string: 4, fret: 3 }, -1);
    expect(down.prompt).toBe('Find the letter before F on string 4.');
    expect(down.answer).toEqual({ string: 4, fret: 2 });
    expect(down.trap).toMatchObject({ at: { string: 4, fret: 1 }, name: 'Eb' });
    expect(down.trap?.message).toMatch(/^That’s Eb, two frets down\. E–F is a half step/);
  });

  it('drops a trap that would fall off the neck, and refuses an impossible step', () => {
    // C at fret 1 on string 2: B is the open string; two frets down is off the neck.
    const step = letterStep({ string: 2, fret: 1 }, -1);
    expect(step.answer).toEqual({ string: 2, fret: 0 });
    expect(step.trap).toBeUndefined();
    expect(() => letterStep({ string: 6, fret: 0 }, -1)).toThrow(/No D below E/);
    expect(() => letterStep({ string: 6, fret: 2 }, 1)).toThrow(/not a natural/);
  });
});

describe('spellFrom and fretWord', () => {
  it('spells a cell as the interval it forms from the given note', () => {
    expect(spellFrom({ string: 6, fret: 0 }, { string: 6, fret: 1 })).toBe('F');
    expect(spellFrom({ string: 5, fret: 3 }, { string: 5, fret: 2 })).toBe('B');
    expect(spellFrom({ string: 6, fret: 3 }, { string: 6, fret: 12 })).toBe('E');
  });

  it('names fret 0 as the open string', () => {
    expect(fretWord(0)).toBe('the open string');
    expect(fretWord(7)).toBe('fret 7');
  });
});

describe('halfWholeStep', () => {
  it('raises a half step with a sharp, one fret up', () => {
    const step = halfWholeStep({ string: 5, fret: 3 }, 1);
    expect(step.prompt).toBe('Find a half step above C on string 5.');
    expect(step.answer).toEqual({ string: 5, fret: 4 });
    expect(step.explain).toBe(
      'A half step is one fret: C at fret 3, up one fret to C# at fret 4. A sharp raises a note a half step.',
    );
    expect(step.hint).toBe('One fret up.');
    expect(step.trap).toBeUndefined();
  });

  it('lowers a half step with a flat', () => {
    const step = halfWholeStep({ string: 1, fret: 7 }, -1);
    expect(step.explain).toBe(
      'A half step is one fret: B at fret 7, down one fret to Bb at fret 6. A flat lowers a note a half step.',
    );
  });

  it('traps the natural a half step away when a whole step crosses E–F or B–C', () => {
    const up = halfWholeStep({ string: 6, fret: 0 }, 2);
    expect(up.explain).toBe(
      'A whole step is two frets: E on the open string, up two frets to F# at fret 2.',
    );
    expect(up.trap).toEqual({
      at: { string: 6, fret: 1 },
      name: 'F',
      message:
        'That’s F, only a half step above E: E–F has no sharp between them. A whole step is two frets, so it’s F#.',
    });

    const down = halfWholeStep({ string: 5, fret: 3 }, -2);
    expect(down.answer).toEqual({ string: 5, fret: 1 });
    expect(down.trap).toMatchObject({ at: { string: 5, fret: 2 }, name: 'B' });
    expect(down.trap?.message).toMatch(/below C: B–C has no sharp between them\. .* it’s Bb\.$/);
  });

  it('has no trap when the note between is an accidental, and refuses the nut', () => {
    expect(halfWholeStep({ string: 4, fret: 7 }, -2).trap).toBeUndefined();
    // From C#, the fret between is D: still no E–F or B–C crossing.
    expect(halfWholeStep({ string: 5, fret: 4 }, 2).trap).toBeUndefined();
    expect(() => halfWholeStep({ string: 6, fret: 1 }, -2)).toThrow(RangeError);
  });
});

describe('markerStep and repeatStep', () => {
  it('asks by the dot, never the fret, then names the fret', () => {
    const step = markerStep(7, 6);
    expect(step.prompt).toBe('Find the third dot from the nut on string 6.');
    // Fret numbers show from guide level 2, so the prompt never names one (rule 4).
    expect(step.prompt).not.toMatch(/\d+(st|nd|rd|th)?-?fret|fret \d/);
    expect(step.given).toEqual([]);
    expect(step.explain).toBe(
      'Count the dots from the nut: 3, 5, 7. The third dot from the nut is the 7th-fret marker.',
    );
    expect(step.hint).toBe('Count the dots from the nut; the double dot is 12.');
    expect(markerStep(3, 1).prompt).toBe('Find the first dot from the nut on string 1.');
    expect(markerStep(12, 1).prompt).toBe('Find the double dot on string 1.');
    expect(() => markerStep(8, 6)).toThrow(/no marker/);
  });

  it('repeats an open string at the double dot, with no trap', () => {
    const step = repeatStep({ string: 4, fret: 0 });
    expect(step.prompt).toBe('Find this D an octave higher, on string 4.');
    expect(step.answer).toEqual({ string: 4, fret: 12 });
    expect(step.hint).toBe('The double dot.');
    expect(step.trap).toBeUndefined();
  });

  it('repeats a fretted note 12 frets on, trapping the double dot', () => {
    const step = repeatStep({ string: 6, fret: 3 });
    expect(semitonesBetween(step.given[0]!, step.answer)).toBe(12);
    expect(step.explain).toBe(
      'The neck repeats from the 12th fret: 3 + 12 = 15, the first dot past the double dot. G again, an octave higher.',
    );
    expect(step.trap).toEqual({
      at: { string: 6, fret: 12 },
      name: 'E',
      message:
        'That’s E, the open string’s octave. Fret 12 repeats the open string; fret 3 repeats 12 frets further on, at fret 15.',
    });
    // A fret without a dot repeats without one.
    expect(repeatStep({ string: 6, fret: 2 }).explain).toMatch(/2 \+ 12 = 14\. F# again/);
  });
});

describe('neck-basics examples', () => {
  it('shows string 5 from the nut, stepping off the third and first markers', () => {
    expect(string5.steps.map((s) => s.answer)).toEqual([
      { string: 5, fret: 8 },
      { string: 5, fret: 5 },
      { string: 5, fret: 2 },
    ]);
    expect(string5.steps[0].prompt).toBe('Find F on string 5, from E at the third marker.');
    expect(string5.steps[0].trap).toMatchObject({ at: { string: 5, fret: 9 }, name: 'F#' });
    expect(string5.steps[1].given).toEqual([]);
    expect(string5.steps[2].prompt).toBe('Find B on string 5, from C at the first marker.');
    expect(string5.steps[2].trap).toMatchObject({ at: { string: 5, fret: 1 }, name: 'Bb' });
    const windows = string5.steps.map((s) => stepRange(s, string5.range));
    expect(new Set(windows.map((w) => `${w.from}-${w.to}`))).toEqual(new Set(['0-9']));
  });

  it('keeps the F3 window from the nut to a fret past the furthest answer', () => {
    const furthest = Math.max(...markers.steps.map((s) => s.answer.fret));
    expect(markers.steps.map((s) => s.answer)).toEqual([
      { string: 6, fret: 15 },
      { string: 2, fret: 9 },
      { string: 4, fret: 19 },
    ]);
    // The two repeats are different notes on different strings (rule 12).
    expect(markers.steps.map((s) => s.given.map((p) => noteAt(p).pc))).toEqual([['G'], [], ['A']]);
    expect(markers.range!.from).toBe(0);
    expect(markers.range!.to - furthest).toBeGreaterThanOrEqual(1);
    // The double dot is the trap on both repeats.
    expect(markers.steps.map((s) => s.trap?.at.fret)).toEqual([12, undefined, 12]);
  });

  it('anchors the F1 windows on the given note, so they never point at the answer', () => {
    for (const e of [alphabet, steps]) {
      expect(e.range).toBeUndefined();
      for (const s of e.steps) expect(s.given).toHaveLength(1);
    }
  });

  it('names the skills it is for', () => {
    expect(exampleFor(getSkill('F1.b-c-e-f')!)?.title).toBe('The musical alphabet');
    expect(exampleFor(getSkill('F3.repeat-12')!)?.title).toBe('Fret markers and the 12th fret');
  });
});

describe('<WorkedExample> with the neck-basics examples', () => {
  const neck = () => screen.getByRole('group', { name: 'Worked example neck' });
  const tap = (string: number, fret: number) =>
    fireEvent.pointerDown(
      within(neck()).getByRole('button', { name: `string ${string}, fret ${fret}` }),
    );
  const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  it('works a whole step past E–F, then calls out B–C unaided', () => {
    render(<WorkedExample example={steps} />);
    expect(screen.getByTestId('example-prompt')).toHaveTextContent(
      'Find a whole step above E on string 6.',
    );
    // Worked: the answer highlighted, the half-step F as a ghost.
    expect(screen.getByTestId('marker-target')).toHaveAttribute('data-fret', '2');
    expect(screen.getByTestId('marker-ghost')).toHaveAttribute('data-fret', '1');
    tap(6, 2);
    expect(playNotes).toHaveBeenCalledWith(['E2', 'F#2'], { muted: false, volume: 0.8 });
    next();

    expect(screen.getByTestId('example-hint')).toHaveTextContent('Hint: One fret up.');
    tap(5, 4);
    expect(screen.getByTestId('example-correct')).toHaveTextContent('A half step is one fret');
    next();

    tap(3, 4);
    expect(screen.getByTestId('example-wrong')).toHaveTextContent('✗ That’s B.');
    expect(screen.getByTestId('example-trap')).toHaveTextContent('B–C has no sharp between them');
    expect(screen.getByTestId('example-done')).toBeInTheDocument();
  });

  it('works a repeat past the double dot, then calls out fret 12 unaided', () => {
    render(<WorkedExample example={markers} />);
    expect(screen.getByTestId('marker-ghost')).toHaveAttribute('data-fret', '12');
    tap(6, 15);
    expect(playNotes).toHaveBeenLastCalledWith(['G2', 'G3'], { muted: false, volume: 0.8 });
    next();
    expect(screen.getByTestId('example-prompt')).toHaveTextContent(
      'Find the fourth dot from the nut on string 2.',
    );
    tap(2, 9);
    next();
    tap(4, 12);
    expect(screen.getByTestId('example-trap')).toHaveTextContent('the open string’s octave');
    expect(screen.getByTestId('example-trap')).toHaveTextContent('at fret 19');
  });

  it('works the alphabet from B–C and string 5 from E–F, each with its ghost', () => {
    const { unmount } = render(<WorkedExample example={alphabet} />);
    expect(screen.getByTestId('example-prompt')).toHaveTextContent(
      'Find the letter after B on string 5.',
    );
    expect(screen.getByTestId('marker-ghost')).toHaveAttribute('data-fret', '4');
    unmount();
    render(<WorkedExample example={string5} />);
    expect(screen.getByTestId('marker-target')).toHaveAttribute('data-fret', '8');
    expect(screen.getByTestId('marker-ghost')).toHaveAttribute('data-fret', '9');
  });
});
