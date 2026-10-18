import { describe, expect, it } from 'vitest';
import { SKILLS } from '../../engine/skills';
import { STANDARD_TUNING, usesEachLetterOnce } from '../../theory';
import type { DrillContext } from '../types';
import {
  D7_SCOPE,
  alterNote,
  d7Blanks,
  d7CanTest,
  d7Check,
  d7Choices,
  d7ConceptOf,
  d7DescribeAnswer,
  d7Expected,
  d7Explain,
  d7GradedResponseMs,
  d7Guides,
  d7KeyAction,
  d7MakePrompt,
  d7Sounds,
  d7Task,
  d7Verdicts,
  d7WorkedExample,
  enharmonicTwins,
  letterRun,
  pretty,
  spoken,
  withOctaves,
  type D7Answer,
  type D7Prompt,
} from './logic';

const ctx = (over: Partial<DrillContext> = {}): DrillContext => ({
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp',
  scopeLevel: 0,
  rng: () => 0,
  ...over,
});

const item = (id: string) => ({ id, skillId: 'C4.sharp-keys' });
const prompt = (id: string, over: Partial<DrillContext> = {}) => d7MakePrompt(item(id), ctx(over));
const fb = (p: D7Prompt, answer: D7Answer) => ({ answer, result: d7Check(p, answer) });
const notes = (s: string) => ({ notes: s.split(' ') });

const C4_ITEMS = SKILLS.filter((s) => s.topic === 'C4').flatMap((s) => s.items());

describe('D7 items', () => {
  it('tests keys, chords and degrees with a real key signature', () => {
    for (const id of ['spell-key:F#', 'spell-key:Cb', 'spell-chord:m7@B', 'degree:6@Eb']) {
      expect(d7CanTest(item(id)), id).toBe(true);
    }
    expect(d7CanTest(item('degree-of:7@F#'))).toBe(true);
    // No double-sharp keys, no degree 1 (the tonic is given), nothing else.
    for (const id of ['spell-key:G#', 'degree:6@D#', 'degree:1@C', 'note@s6f5', 'nope']) {
      expect(d7CanTest(item(id)), id).toBe(false);
    }
    expect(() => prompt('spell-key:G#')).toThrow(/cannot test/);
  });

  it('serves every C4 item', () => {
    expect(C4_ITEMS.length).toBe(15 + 12 * 12);
    for (const i of C4_ITEMS) expect(d7CanTest(i), i.id).toBe(true);
  });

  it('keys concepts by key, and pairs major/minor triads with the seed concepts', () => {
    expect(d7ConceptOf(item('spell-key:Gb'))).toBe('key:Gb');
    expect(d7ConceptOf(item('spell-chord:major@C'))).toBe('triad:maj');
    expect(d7ConceptOf(item('spell-chord:minor@A'))).toBe('triad:min');
    expect(d7ConceptOf(item('spell-chord:m7@B'))).toBe('chord:m7');
    expect(d7ConceptOf(item('degree:6@Eb'))).toBeNull();
  });
});

describe('D7 prompts', () => {
  it('spells a key with the tonic given and the step pattern', () => {
    const p = prompt('spell-key:F#');
    expect(p.kind).toBe('key');
    expect(p.subject).toBe('F♯ major');
    expect(p.slots.map((s) => s.note)).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
    expect(p.slots.map((s) => s.given)).toEqual([true, false, false, false, false, false, false]);
    expect(p.slots.map((s) => s.label)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(p.steps).toEqual(['W', 'W', 'H', 'W', 'W', 'W']);
    expect(d7Blanks(p)).toEqual(['G#', 'A#', 'B', 'C#', 'D#', 'E#']);
    expect(p.degree).toBeNull();
    expect(p.degreeChoices).toEqual([]);
    expect(d7Task(p)).toBe('Spell F♯ major');
  });

  it('spells a chord root first, labelled by formula', () => {
    const p = prompt('spell-chord:m7b5@F#');
    expect(p.kind).toBe('chord');
    expect(p.subject).toBe('F♯m7b5');
    expect(p.slots.map((s) => s.note)).toEqual(['F#', 'A', 'C', 'E']);
    expect(p.slots.map((s) => s.label)).toEqual(['1', 'b3', 'b5', 'b7']);
    expect(p.steps).toEqual([]);
    expect(d7Task(p)).toBe('Spell F♯m7b5');
  });

  it('asks for one degree, or which degree a note is', () => {
    const p = prompt('degree:6@Eb');
    expect(p.kind).toBe('degree');
    expect(p.slots).toEqual([
      { label: '1', note: 'Eb', given: true },
      { label: '6', note: 'C', given: false },
    ]);
    expect(p.degree).toBe(6);
    expect(d7Task(p)).toBe('The 6th of E♭ major?');

    const q = prompt('degree-of:7@F#');
    expect(q.kind).toBe('degree-of');
    expect(q.choices).toEqual([]);
    expect(q.degreeChoices).toEqual([2, 3, 4, 5, 6, 7]);
    expect(d7Task(q)).toBe('E♯ is which degree of F♯ major?');
  });

  it('offers the answers and their enharmonic twins at scope 0', () => {
    const p = prompt('spell-key:F#');
    // Grid order: A–G, flat → sharp.
    expect(p.choices).toEqual([
      'Ab',
      'A#',
      'Bb',
      'B',
      'Cb',
      'C#',
      'Db',
      'D#',
      'Eb',
      'E#',
      'F',
      'G#',
    ]);
    // Every answer and every twin: F for E#, Cb for B.
    for (const n of d7Blanks(p)) expect(p.choices).toContain(n);
    expect(p.choices).toContain('F');
  });

  it('offers every letter flat, natural and sharp at scope 1, plus any double accidental needed', () => {
    const p = prompt('spell-key:C', { scopeLevel: 1 });
    expect(p.choices).toHaveLength(21);
    expect(p.choices.slice(0, 3)).toEqual(['Ab', 'A', 'A#']);
    expect(d7Choices(['Eb', 'Gb', 'Bbb'], 5)).toContain('Bbb');
    expect(d7Choices(['Eb', 'Gb', 'Bbb'], 5)).toHaveLength(22);
    expect(d7Choices(['D'], -1)).toEqual(['D']);
    expect(D7_SCOPE).toEqual({ minLevel: 0, maxLevel: 1 });
  });

  it('builds a prompt for every C4 item whose spelling uses each letter once', () => {
    for (const i of C4_ITEMS) {
      for (const scopeLevel of [0, 1]) {
        const p = d7MakePrompt(i, ctx({ scopeLevel }));
        if (p.kind === 'key') expect(usesEachLetterOnce(p.slots.map((s) => s.note))).toBe(true);
        if (p.kind === 'degree-of') continue;
        for (const n of d7Blanks(p)) expect(p.choices, i.id).toContain(n);
      }
    }
  });
});

describe('D7 grading', () => {
  const fSharp = () => prompt('spell-key:F#');

  it('accepts the strict spelling', () => {
    const p = fSharp();
    const r = d7Check(p, notes('G# A# B C# D# E#'));
    expect(r).toEqual({ correct: true, expected: 'F♯ G♯ A♯ B C♯ D♯ E♯' });
    expect(d7Verdicts(p, notes('G# A# B C# D# E#')).every((v) => v === 'correct')).toBe(true);
    expect(d7Explain(p, notes('G# A# B C# D# E#'))).toEqual([]);
  });

  it('grades an enharmonic spelling wrong and explains the letter', () => {
    const p = fSharp();
    const a = notes('G# A# B C# D# F');
    expect(d7Check(p, a).correct).toBe(false);
    expect(d7Check(p, a).confusedWith).toBeUndefined();
    expect(d7Verdicts(p, a)).toEqual([
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
      'enharmonic',
    ]);
    expect(d7Explain(p, a)).toEqual([
      'Right pitch, wrong letter: F sounds like E♯, but the 7th of F♯ major sits on E (count letters up from F♯: F G A B C D E).',
      'A major key uses each letter A–G exactly once, in order, whatever accidental that needs.',
    ]);
  });

  it('explains a wrong pitch by its half steps above the tonic', () => {
    const p = fSharp();
    const a = notes('G# A B C# D# E#');
    expect(d7Verdicts(p, a)[1]).toBe('wrong');
    expect(d7Explain(p, a)).toEqual([
      "A isn't the 3rd of F♯ major: it's A♯, 4 half steps above F♯.",
    ]);
  });

  it('marks missing notes wrong', () => {
    const p = fSharp();
    const a = notes('G# A#');
    expect(d7Check(p, a).correct).toBe(false);
    expect(d7Verdicts(p, a).slice(2)).toEqual(['wrong', 'wrong', 'wrong', 'wrong']);
    expect(d7Explain(p, a)[0]).toBe("the 4th of F♯ major is missing: it's B.");
    expect(d7Check(p, { notes: [...a.notes, 'B', 'C#', 'D#', 'E#', 'F#'] }).correct).toBe(false);
  });

  it('explains chord spelling by letters from the root', () => {
    const p = prompt('spell-chord:m7@B');
    expect(d7Check(p, notes('D F# A')).correct).toBe(true);
    const a = notes('D Gb A');
    expect(d7Check(p, a).correct).toBe(false);
    expect(d7Explain(p, a)).toEqual([
      'Right pitch, wrong letter: G♭ sounds like F♯, but the 5th of Bm7 sits on F (count letters up from B: B C D E F).',
      'Chord tones are spelled by letter: root, 3rd, 5th and 7th skip a letter each time, whatever accidental that needs.',
    ]);
    expect(d7Explain(p, notes('D F# A#'))).toEqual([
      "A♯ isn't the 7th of Bm7: it's A, 10 half steps above B.",
    ]);
    const add9 = prompt('spell-chord:add9@C');
    expect(d7Explain(add9, notes('E G Eb'))[0]).toMatch(/^E♭ isn't the 9th of Cadd9: it's D/);
  });

  it('grades a one-note degree answer', () => {
    const p = prompt('degree:6@Eb');
    expect(d7Check(p, notes('C'))).toEqual({ correct: true, expected: 'C' });
    expect(d7Check(p, notes('B#')).correct).toBe(false);
    expect(d7Explain(p, notes('B#'))[0]).toBe(
      'Right pitch, wrong letter: B♯ sounds like C, but the 6th of E♭ major sits on C (count letters up from E♭: E F G A B C).',
    );
    // A degree pick can't answer a note prompt.
    expect(d7Check(p, { degree: 6 }).correct).toBe(false);
    expect(d7Explain(p, { degree: 6 })).toEqual([]);
  });

  it('grades a degree pick', () => {
    const p = prompt('degree-of:6@Eb');
    expect(d7Check(p, { degree: 6 })).toEqual({ correct: true, expected: '6th' });
    expect(d7Check(p, { degree: 5 }).correct).toBe(false);
    expect(d7Explain(p, { degree: 6 })).toEqual([]);
    expect(d7Explain(p, { degree: 5 })).toEqual([
      'C is the 6th of E♭ major, not the 5th: count letters up from E♭: E F G A B C.',
    ]);
    expect(d7Check(p, notes('C')).correct).toBe(false);
  });

  it('shows the expected answer per kind', () => {
    expect(d7Expected(prompt('spell-chord:major@E'))).toBe('E G♯ B');
    expect(d7Expected(prompt('degree:3@Ab'))).toBe('C');
    expect(d7Expected(prompt('degree-of:3@Ab'))).toBe('3rd');
  });

  it('grades time per note entered', () => {
    expect(d7GradedResponseMs(fSharp(), notes('x'), 6000)).toBe(1000);
    expect(d7GradedResponseMs(prompt('degree-of:2@C'), { degree: 2 }, 1500)).toBe(1500);
  });

  it('logs the answer as given', () => {
    expect(d7DescribeAnswer(notes('G# A# B'))).toBe('G# A# B');
    expect(d7DescribeAnswer({ degree: 4 })).toBe('4');
  });
});

describe('D7 sounds', () => {
  it('plays the key or chord rising from the tonic', () => {
    const p = prompt('spell-key:F#');
    const right = notes('G# A# B C# D# E#');
    expect(d7Sounds(p, fb(p, right))).toEqual({
      expected: ['F#3', 'G#3', 'A#3', 'B3', 'C#4', 'D#4', 'E#4'],
    });
  });

  it('replays a wrong pitch, but not an enharmonic slip (same sound)', () => {
    const p = prompt('spell-key:F#');
    expect(d7Sounds(p, fb(p, notes('G# A# B C# D# F'))).given).toBeUndefined();
    expect(d7Sounds(p, fb(p, notes('G# A B C# D# E#'))).given).toEqual([
      'F#3',
      'G#3',
      'A3',
      'B3',
      'C#4',
      'D#4',
      'E#4',
    ]);
    expect(d7Sounds(p, fb(p, { notes: ['?'] })).given).toBeUndefined();
    const q = prompt('degree-of:6@Eb');
    expect(d7Sounds(q, fb(q, { degree: 5 }))).toEqual({ expected: ['Eb3', 'C4'] });
  });

  it('assigns octaves by letter, so Cb and a 9th rise correctly', () => {
    expect(withOctaves(['Cb', 'Db', 'Eb', 'Fb', 'Gb', 'Ab', 'Bb'])).toEqual([
      'Cb3',
      'Db3',
      'Eb3',
      'Fb3',
      'Gb3',
      'Ab3',
      'Bb3',
    ]);
    expect(withOctaves(['C', 'E', 'G', 'D'], 4)).toEqual(['C4', 'E4', 'G4', 'D5']);
  });
});

describe('D7 wording and guides', () => {
  it('writes accidentals as glyphs and names them for screen readers', () => {
    expect(pretty('F#')).toBe('F♯');
    expect(pretty('Bb')).toBe('B♭');
    expect(pretty('Bbb')).toBe('B𝄫');
    expect(pretty('C##')).toBe('C𝄪');
    expect(pretty('?')).toBe('?');
    expect(spoken('F#')).toBe('F sharp');
    expect(spoken('Ebb')).toBe('E double flat');
    expect(spoken('G')).toBe('G');
    expect(spoken('?')).toBe('?');
  });

  it('counts letters and finds enharmonic twins', () => {
    expect(letterRun('Eb', 'C')).toEqual(['E', 'F', 'G', 'A', 'B', 'C']);
    expect(letterRun('B', 'B')).toEqual(['B']);
    expect(enharmonicTwins('E#')).toEqual(['F']);
    expect(enharmonicTwins('C')).toEqual(['B#']);
    expect(enharmonicTwins('F#')).toEqual(['Gb']);
    expect(enharmonicTwins('D')).toEqual([]);
  });

  it('explains the worked example for each kind', () => {
    expect(d7WorkedExample(prompt('spell-key:F'))).toBe(
      'F major uses each letter once, in steps W W H W W W H: F G A B♭ C D E.',
    );
    expect(d7WorkedExample(prompt('spell-chord:7@D'))).toBe('D7 is 1 3 5 b7 from D: D F♯ A C.');
    expect(d7WorkedExample(prompt('degree:6@Eb'))).toBe(
      'C is the 6th of E♭ major: count letters up from E♭: E F G A B C.',
    );
  });

  it('fades labels, then step marks, then letters', () => {
    expect(d7Guides(0)).toEqual({ labels: false, steps: false, letters: false });
    expect(d7Guides(1)).toEqual({ labels: true, steps: false, letters: false });
    expect(d7Guides(2)).toEqual({ labels: true, steps: true, letters: false });
    expect(d7Guides(3)).toEqual({ labels: true, steps: true, letters: true });
  });

  it('maps hardware keys to entries', () => {
    expect(d7KeyAction('f', 'key')).toEqual({ type: 'add', note: 'F' });
    expect(d7KeyAction('#', 'key')).toEqual({ type: 'alter', by: 1 });
    expect(d7KeyAction('+', 'chord')).toEqual({ type: 'alter', by: 1 });
    expect(d7KeyAction('-', 'degree')).toEqual({ type: 'alter', by: -1 });
    expect(d7KeyAction('Backspace', 'key')).toEqual({ type: 'remove' });
    expect(d7KeyAction('Enter', 'key')).toEqual({ type: 'check' });
    expect(d7KeyAction('h', 'key')).toBeNull();
    expect(d7KeyAction('6', 'degree-of')).toEqual({ type: 'degree', degree: 6 });
    expect(d7KeyAction('1', 'degree-of')).toBeNull();
    expect(d7KeyAction('c', 'degree-of')).toBeNull();
  });

  it('raises and lowers a note by one accidental, within double flat and double sharp', () => {
    expect(alterNote('E', 1)).toBe('E#');
    expect(alterNote('E#', 1)).toBe('E##');
    expect(alterNote('E##', 1)).toBe('E##');
    expect(alterNote('B', -1)).toBe('Bb');
    expect(alterNote('Bbb', -1)).toBe('Bbb');
    expect(alterNote('Bb', 1)).toBe('B');
  });
});
