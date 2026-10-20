import { describe, expect, it } from 'vitest';
import type { Item } from '../../engine/model';
import { SKILLS } from '../../engine/skills';
import {
  STANDARD_TUNING,
  analyseChord,
  chordFromNumeral,
  chordReadings,
  chromaOf,
  findBorrowed,
  functionOf,
  parseChordSymbol,
  parseKey,
  sameChord,
  tritoneSubstitute,
  type MusicalKey,
} from '../../theory';
import type { DrillContext } from '../types';
import {
  DF_CHOICES,
  DF_FUNCTION_KEYS,
  DF_SCOPE,
  dfCanTest,
  dfCheck,
  dfConcept,
  dfConceptOf,
  dfDescribeAnswer,
  dfKeyToAnswer,
  dfMakePrompt,
  dfMinorChordChoices,
  dfSounds,
  dfTwoFiveChoices,
  type DfPrompt,
} from './logic';
import {
  dfCue,
  dfCueNote,
  dfDisplay,
  dfExplain,
  dfFact,
  dfHint,
  dfReference,
  dfSpoken,
  dfTask,
  prettySymbol,
  spokenChord,
} from './text';

const item = (id: string): Item => ({ id, skillId: 'I5.test' });

/** A seeded generator, so a sweep meets many draws but runs the same every time. */
function seeded(seed: number): () => number {
  let s = (seed * 2654435761) % 4294967296;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const ctx = (scopeLevel = 0, rng: () => number = () => 0.5): DrillContext => ({
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp',
  scopeLevel,
  rng,
});

const prompt = (id: string, scopeLevel = 0, rng?: () => number) =>
  dfMakePrompt(item(id), ctx(scopeLevel, rng));

const ITEMS = SKILLS.filter((s) => s.drillTypes.includes('function')).flatMap((s) => s.items());

/** Every card at every level, with a few draws each. */
function* everyPrompt(): Generator<DfPrompt> {
  for (const it of ITEMS) {
    for (let level = DF_SCOPE.minLevel; level <= DF_SCOPE.maxLevel; level++) {
      for (const seed of [1, 2, 3]) yield dfMakePrompt(it, ctx(level, seeded(seed)));
    }
  }
}

const key = (p: DfPrompt) => p.key as MusicalKey;

describe('function drill: cards', () => {
  it('tests every I4 harmonic and I5 card, and no D11 card', () => {
    expect(ITEMS.length).toBeGreaterThan(200);
    for (const it of ITEMS) expect(dfCanTest(it), it.id).toBe(true);
    expect(dfCanTest(item('numeral:iv@key=Am'))).toBe(false);
    expect(dfConceptOf(item('numeral:iv@key=Am'))).toBeNull();
    expect(() => prompt('numeral:iv@key=Am')).toThrow(/cannot test/);
  });

  it('keys concepts so the confusable pairs meet (rule 6)', () => {
    expect(dfConceptOf(item('minor-chord:V7@key=Am'))).toBe('numeral:V7');
    expect(dfConceptOf(item('minor-source:V7@key=Am'))).toBe('source:harmonic');
    expect(dfConceptOf(item('minor-source:I@key=Am'))).toBe('source:borrowed');
    expect(dfConceptOf(item('minor-source:bVII@key=Am'))).toBe('source:natural');
    expect(dfConceptOf(item('function:vi@major'))).toBe('function:tonic');
    expect(dfConceptOf(item('function:bVII@minor'))).toBe('function:dominant');
    expect(dfConceptOf(item('secondary-of:V7/ii@key=C'))).toBe('numeral:V7/ii');
    expect(dfConceptOf(item('tritone-sub:G7'))).toBe('tritone-sub:G7');
  });

  it('holds the answer once among unique choices, at the level’s count', () => {
    for (const p of everyPrompt()) {
      expect(
        p.choices.filter((c) => c === p.answer),
        p.itemId,
      ).toHaveLength(1);
      expect(new Set(p.choices).size, p.itemId).toBe(p.choices.length);
      const count = DF_CHOICES[p.level] as number;
      switch (p.kind) {
        case 'minor-source':
        case 'function':
          expect(p.choices).toHaveLength(3);
          break;
        case 'secondary-of':
          expect(p.choices).toHaveLength(p.level === 0 ? 4 : 5);
          break;
        default:
          expect(p.choices, p.itemId).toHaveLength(count);
      }
    }
  });

  it('grades the answer right and every other choice wrong, with its concept', () => {
    for (const p of everyPrompt()) {
      const right = dfCheck(p, p.answer);
      expect(right.correct).toBe(true);
      expect(right.concept, p.itemId).toBe(dfConceptOf(item(p.itemId)));
      expect(right.expected).toBe(dfDisplay(p, p.answer));
      for (const c of p.choices.filter((x) => x !== p.answer)) {
        const wrong = dfCheck(p, c);
        expect(wrong.correct).toBe(false);
        expect(wrong.confusedWith).not.toBe(right.concept);
      }
    }
  });
});

describe('function drill: answers agree with theory/function', () => {
  it('minor-key chords are the harmonic-minor V, V7 and vii°', () => {
    for (const p of everyPrompt()) {
      if (p.kind !== 'minor-chord') continue;
      const reading = analyseChord(key(p), p.answer);
      expect(reading?.role, p.itemId).toBe('harmonic-minor');
      expect(reading?.label).toBe(p.numeral);
    }
    expect(prompt('minor-chord:V7@key=Am').answer).toBe('E7');
    expect(prompt('minor-chord:vii°@key=Dm').answer).toBe('C#dim');
  });

  it('sources match the chord’s reading', () => {
    const role = { natural: 'diatonic', harmonic: 'harmonic-minor', borrowed: 'borrowed' };
    for (const p of everyPrompt()) {
      if (p.kind !== 'minor-source') continue;
      const roles = chordReadings(key(p), p.chord as string).map((r) => r.role);
      expect(roles, p.itemId).toContain(role[p.answer as keyof typeof role]);
      // Only a borrowed chord can have a second reading (D in A minor is also V/♭VII).
      if (p.answer !== 'borrowed') expect(roles).toHaveLength(1);
    }
    expect(prompt('minor-source:V7@key=Am').chord).toBe('E7');
    expect(prompt('minor-source:V7@key=Am').answer).toBe('harmonic');
    expect(prompt('minor-source:IV@key=Am').answer).toBe('borrowed');
  });

  it('the minor ii–V–i is iiø7 V7 i', () => {
    expect(prompt('two-five:Am').answer).toBe('Bm7b5 E7 Am');
    expect(prompt('two-five:F#m').answer).toBe('G#m7b5 C#7 F#m');
    expect(dfTwoFiveChoices(parseKey('Am'), 0).sort()).toEqual(
      ['Bm7 E7 Am', 'Bm7 Em7 Am', 'Bm7b5 E7 Am', 'Bm7b5 Em7 Am'].sort(),
    );
    expect(dfTwoFiveChoices(parseKey('Am'), 1)).toEqual(
      expect.arrayContaining(['Dm7 G7 Cmaj7', 'Bm7 E7 Amaj7']),
    );
  });

  it('functions are functionOf, in a key that varies with scope', () => {
    const label = (p: DfPrompt) => `${p.key!.tonic}${p.key!.mode === 'minor' ? 'm' : ''}`;
    for (const p of everyPrompt()) {
      if (p.kind !== 'function') continue;
      expect(functionOf(key(p), p.chord as string), p.itemId).toBe(p.answer);
      expect(DF_FUNCTION_KEYS[p.key!.mode][p.level]).toContain(label(p));
    }
    // Rule 12: the same card meets every key of its level.
    for (const level of [0, 1]) {
      const seen = new Set<string>();
      for (let seed = 1; seed < 80; seed++)
        seen.add(label(prompt('function:V@major', level, seeded(seed))));
      expect(seen.size).toBe(DF_FUNCTION_KEYS.major[level]!.length);
    }
  });

  it('secondary dominants read as V7 of their target, both ways', () => {
    for (const p of everyPrompt()) {
      if (p.kind !== 'secondary' && p.kind !== 'secondary-of') continue;
      const chord = p.kind === 'secondary' ? p.answer : (p.chord as string);
      const labels = chordReadings(key(p), chord).map((r) => r.label);
      expect(labels, p.itemId).toContain(`V7/${p.numeral as string}`);
    }
    expect(prompt('secondary:V7/ii@key=C').answer).toBe('A7');
    expect(prompt('secondary-of:V7/V@key=G').chord).toBe('A7');
    expect(prompt('secondary-of:V7/V@key=G').answer).toBe('V');
  });

  it('spots exactly one borrowed chord, never the tonic', () => {
    for (const p of everyPrompt()) {
      if (p.kind !== 'borrowed') continue;
      const progression = p.progression as string[];
      expect(findBorrowed(key(p), progression), p.itemId).toEqual([progression.indexOf(p.answer)]);
      expect(progression[0]).toBe(dfMakePrompt(item(p.itemId), ctx(0)).progression![0]);
      expect(progression.indexOf(p.answer)).toBeGreaterThan(0);
      expect(p.choices).toEqual(progression);
    }
    expect(prompt('borrowed:bVII@key=C').answer).toBe('Bb');
  });

  it('tritone substitutes are a tritone away and share the 3rd and ♭7', () => {
    for (const p of everyPrompt()) {
      if (p.kind !== 'tritone-sub') continue;
      expect(sameChord(p.answer, tritoneSubstitute(p.chord as string))).toBe(true);
      const from = chromaOf(parseChordSymbol(p.chord as string).root);
      for (const c of p.choices) {
        const gap = (chromaOf(parseChordSymbol(c).root) - from + 12) % 12;
        expect(gap === 6, `${p.itemId} ${c}`).toBe(c === p.answer);
        expect(parseChordSymbol(c).quality).toBe('dominant7');
      }
    }
    expect(prompt('tritone-sub:G7').answer).toBe('Db7');
    expect(prompt('tritone-sub:Eb7').answer).toBe('A7');
  });
});

describe('function drill: no row points at the answer', () => {
  it('offers both qualities on every root of a minor-key chord row', () => {
    const am = parseKey('Am');
    expect(dfMinorChordChoices(am, 'V7', 0)).toEqual(['E7', 'Em7', 'G7', 'Gm7']);
    expect(dfMinorChordChoices(am, 'vii°', 1)).toEqual(['G#dim', 'G#', 'Gdim', 'G', 'Bdim', 'B']);
    for (const p of everyPrompt()) {
      if (p.kind !== 'minor-chord') continue;
      const roots = p.choices.map((c) => parseChordSymbol(c).root);
      for (const r of roots) expect(roots.filter((x) => x === r)).toHaveLength(2);
    }
  });

  it('puts the answer in every place of a shuffled chord row', () => {
    const places = new Set<number>();
    for (let seed = 1; seed < 40; seed++) {
      const p = prompt('minor-chord:V7@key=Am', 0, seeded(seed));
      places.add(p.choices.indexOf(p.answer));
    }
    expect(places.size).toBe(4);
  });

  it('always offers the chord on the target itself, and the target on the chord’s root', () => {
    for (const p of everyPrompt()) {
      if (p.kind === 'secondary') {
        expect(p.choices, p.itemId).toContain(`${chordFromNumeral(key(p), p.numeral!).root}7`);
      }
    }
    // A7 resolves to ii, not vi (its own root).
    for (const level of [0, 1]) {
      expect(prompt('secondary-of:V7/ii@key=C', level).choices).toContain('vi');
    }
  });

  it('keeps the function and source rows in reading order', () => {
    expect(prompt('function:vi@major').choices).toEqual(['tonic', 'subdominant', 'dominant']);
    expect(prompt('minor-source:v@key=Em').choices).toEqual(['natural', 'harmonic', 'borrowed']);
    expect(prompt('secondary-of:V7/vi@key=C', 1).choices).toEqual(['ii', 'iii', 'IV', 'V', 'vi']);
  });
});

describe('function drill: words', () => {
  it('asks each kind in plain words', () => {
    expect(dfTask(prompt('minor-chord:V7@key=Am'))).toBe('Which chord is V7 in A minor?');
    expect(dfTask(prompt('minor-source:V7@key=Am'))).toBe(
      'E7 in A minor: where does it come from?',
    );
    expect(dfTask(prompt('two-five:Bbm'))).toBe('Which chords make the ii–V–i in B♭ minor?');
    expect(dfTask(prompt('secondary:V7/ii@key=Bb'))).toBe('Which chord is V7/ii in B♭ major?');
    expect(dfTask(prompt('secondary-of:V7/ii@key=C'))).toBe(
      'A7 in C major is the V7 of which chord?',
    );
    expect(dfTask(prompt('borrowed:iv@key=G'))).toBe(
      'One chord of this G major progression is borrowed. Which one?',
    );
    expect(dfTask(prompt('tritone-sub:G7'))).toBe('Which chord is the tritone substitute for G7?');
    const fn = prompt('function:vi@major');
    expect(dfTask(fn)).toMatch(/^What function does [A-G][♯♭]?m have in [A-G][♯♭]? major\?$/);
    expect(dfCueNote(fn)).toMatch(/^vi in /);
  });

  it('shows each kind’s cue, and none for a borrowed card', () => {
    expect(dfCue(prompt('minor-chord:V7@key=Am'))).toBe('V7');
    expect(dfCue(prompt('minor-chord:vii°@key=Am'))).toBe('vii°');
    expect(dfCue(prompt('minor-source:bVII@key=Am'))).toBe('G');
    expect(dfCue(prompt('two-five:Am'))).toBe('ii–V–i');
    expect(dfCue(prompt('secondary:V7/iii@key=D'))).toBe('V7/iii');
    expect(dfCue(prompt('secondary-of:V7/iii@key=D'))).toBe('C♯7');
    expect(dfCue(prompt('tritone-sub:Bb7'))).toBe('B♭7');
    expect(dfCue(prompt('borrowed:bVI@key=C'))).toBeNull();
    expect(dfCueNote(prompt('borrowed:bVI@key=C'))).toBeNull();
  });

  it('labels and names every choice', () => {
    const src = prompt('minor-source:V7@key=F#m');
    expect(src.choices.map((c) => dfDisplay(src, c))).toEqual([
      'F♯ natural minor',
      'F♯ harmonic minor',
      'Borrowed from F♯ major',
    ]);
    expect(dfSpoken(src, 'harmonic')).toBe('F♯ harmonic minor');
    const fn = prompt('function:V@major');
    expect(fn.choices.map((c) => dfDisplay(fn, c))).toEqual(['Tonic', 'Subdominant', 'Dominant']);
    const of = prompt('secondary-of:V7/ii@key=C');
    expect(dfDisplay(of, 'ii')).toBe('ii (Dm)');
    expect(dfSpoken(of, 'ii')).toBe('ii, D minor');
    const two = prompt('two-five:Am');
    expect(dfDisplay(two, 'Bm7b5 E7 Am')).toBe('Bm7♭5 – E7 – Am');
    expect(dfSpoken(two, 'Bm7b5 E7 Am')).toBe('B minor seven flat five, E seven, A minor');
    const chord = prompt('minor-chord:vii°@key=Am');
    expect(dfDisplay(chord, 'G#dim')).toBe('G♯dim');
    expect(dfSpoken(chord, 'G#dim')).toBe('G sharp diminished');
    expect(spokenChord('Bbmaj7')).toBe('B flat major seven');
    expect(prettySymbol('F#m7b5')).toBe('F♯m7♭5');
  });

  it('states the fact for the worked example and feedback', () => {
    expect(dfFact(prompt('minor-chord:V7@key=Am'))).toBe(
      'V7 in A minor is E7. A harmonic minor raises G to G♯, the leading tone, so the chord on the 5th is a dominant 7th.',
    );
    expect(dfFact(prompt('minor-chord:vii°@key=Am'))).toMatch(/^vii° in A minor is G♯dim/);
    expect(dfFact(prompt('minor-source:V7@key=Am'))).toBe(
      'E7 is V7 in A minor, from A harmonic minor: it has G♯, the raised 7th (not G).',
    );
    expect(dfFact(prompt('minor-source:bVII@key=Am'))).toBe(
      'G is ♭VII in A minor: every note is in A natural minor.',
    );
    expect(dfFact(prompt('minor-source:IV@key=Am'))).toBe(
      'D is IV in A minor, borrowed from A major: F♯ is in neither natural nor harmonic minor.',
    );
    expect(dfFact(prompt('two-five:Am'))).toMatch(/^The ii–V–i in A minor is Bm7♭5 – E7 – Am/);
    expect(dfFact(prompt('secondary:V7/ii@key=C'))).toBe(
      'V7/ii in C major is A7: ii is Dm, and A7 is the dominant 7th a 5th above it.',
    );
    expect(dfFact(prompt('secondary-of:V7/ii@key=C'))).toBe(
      'A7 resolves down a 5th to Dm, ii in C major, so it is V7/ii.',
    );
    expect(dfFact(prompt('borrowed:bVII@key=C'))).toBe(
      'B♭ is ♭VII, borrowed from C minor: B♭ is not in C major.',
    );
    expect(dfFact(prompt('tritone-sub:G7'))).toBe(
      'D♭7 is a tritone (6 half steps) from G7. They share B and F: the 3rd and ♭7 of G7 are the ♭7 and 3rd of D♭7.',
    );
    expect(dfFact(prompt('function:V@major'))).toMatch(
      /is V in [A-G][♯♭]? major: dominant function\. Dominant chords pull back home\.$/,
    );
  });

  it('explains every wrong choice', () => {
    for (const p of everyPrompt()) {
      expect(dfExplain(p, p.answer)).toEqual([]);
      for (const c of p.choices.filter((x) => x !== p.answer)) {
        const lines = dfExplain(p, c);
        expect(lines.length, `${p.itemId} ${c}`).toBeGreaterThan(0);
        for (const l of lines) expect(l).not.toMatch(/undefined|null|NaN/);
      }
      for (const text of [dfTask(p), dfFact(p), dfHint(p)]) {
        expect(text).not.toMatch(/undefined|null|NaN/);
      }
    }
    expect(dfExplain(prompt('minor-chord:V7@key=Am'), 'nope')).toEqual([]);
  });

  it('names the misconceptions', () => {
    const v7 = prompt('minor-chord:V7@key=Am');
    expect(dfExplain(v7, 'Em7')).toEqual([
      'Em7 is v7, from natural minor, with G. Raising it to the leading tone makes E7.',
    ]);
    expect(dfExplain(v7, 'G7')[0]).toMatch(/natural 7th, G: a whole step below A/);
    const src = prompt('minor-source:v@key=Am');
    expect(dfExplain(src, 'harmonic')).toEqual([
      'Em has G, the natural 7th. Harmonic minor raises it to G♯.',
    ]);
    expect(dfExplain(src, 'borrowed')[0]).toMatch(/nothing is borrowed/);
    expect(dfExplain(prompt('minor-source:bVII@key=Am'), 'harmonic')[0]).toBe(
      'G is built on the natural 7th, G. Harmonic minor raises it to G♯.',
    );
    expect(dfExplain(prompt('minor-source:iv@key=Am'), 'harmonic')[0]).toMatch(/uses neither/);
    expect(dfExplain(prompt('minor-source:V7@key=Am'), 'natural')[0]).toBe(
      "E7 has G♯, which isn't in A natural minor.",
    );
    expect(dfExplain(prompt('minor-source:V7@key=Am'), 'borrowed')[0]).toMatch(
      /in A harmonic minor: nothing is borrowed/,
    );
    expect(dfExplain(prompt('minor-source:I@key=Am'), 'natural')[0]).toMatch(/C♯/);
    const two = prompt('two-five:Am', 1);
    expect(dfExplain(two, 'Bm7 Em7 Am')).toHaveLength(2);
    expect(dfExplain(two, 'Dm7 G7 Cmaj7')).toEqual(['Dm7 – G7 – Cmaj7 is the ii–V–I of C major.']);
    expect(dfExplain(prompt('secondary:V7/ii@key=C'), 'D7')[0]).toMatch(/root of ii itself/);
    expect(dfExplain(prompt('secondary:V7/ii@key=C', 1), 'G7')).toEqual(['G7 is V7 in C major.']);
    expect(dfExplain(prompt('secondary-of:V7/ii@key=C'), 'vi')[0]).toMatch(/not to its own root/);
    expect(dfExplain(prompt('secondary-of:V7/ii@key=C'), 'iii')[0]).toBe(
      'The V7 of Em is a 5th above E, not A7.',
    );
    const tt = prompt('tritone-sub:G7');
    expect(dfExplain({ ...tt, choices: [...tt.choices, 'C7'] }, 'C7')).toEqual([
      'C7 is a 4th from G7, not a tritone.',
    ]);
    const fn = prompt('function:vi@major');
    expect(dfExplain(fn, 'dominant')[0]).toMatch(/^In a major key, I, iii and vi are tonic/);
    expect(dfExplain(prompt('function:iv@minor'), 'tonic')[0]).toMatch(/^In a minor key/);
    const b = prompt('borrowed:iv@key=C');
    expect(dfExplain(b, 'C')).toEqual(['C is I, a chord of C major.']);
  });

  it('logs a wrong minor-key chord against its numeral, so v meets V', () => {
    const v = prompt('minor-chord:V@key=Am');
    expect(dfCheck(v, 'Em')).toEqual({
      correct: false,
      expected: 'E',
      concept: 'numeral:V',
      confusedWith: 'numeral:v',
    });
    expect(dfCheck(prompt('secondary:V7/ii@key=C'), 'D7').confusedWith).toBe('numeral:V7/V');
    expect(dfCheck(prompt('function:vi@major'), 'dominant').confusedWith).toBe('function:dominant');
    expect(dfCheck(prompt('tritone-sub:G7'), 'C7').confusedWith).toBeUndefined();
    expect(dfCheck(prompt('tritone-sub:G7'), 'X').confusedWith).toBeUndefined();
    expect(dfConcept(prompt('borrowed:iv@key=C'), 'C')).toBeNull();
  });
});

describe('function drill: guides, sound and keys', () => {
  it('hints the method and never the answer', () => {
    for (const p of everyPrompt()) {
      const hint = dfHint(p);
      expect(hint.length).toBeGreaterThan(10);
      if (['minor-chord', 'secondary', 'tritone-sub', 'two-five'].includes(p.kind)) {
        expect(hint).not.toContain(dfDisplay(p, p.answer));
      }
    }
  });

  it('adds what to check the cue against from level 2, never the answer chord', () => {
    expect(dfReference(prompt('minor-chord:V7@key=Am'), 1)).toEqual([]);
    expect(dfReference(prompt('minor-chord:V7@key=Am'), 2)).toEqual([
      { label: 'A natural minor', value: 'A B C D E F G' },
    ]);
    expect(dfReference(prompt('minor-source:V7@key=Am'), 3).map((r) => r.label)).toEqual([
      'A natural minor',
      'A harmonic minor',
      'A major',
    ]);
    expect(dfReference(prompt('tritone-sub:G7'), 2)[0]!.label).toBe('Half steps');
    expect(dfReference(prompt('function:V@major'), 3).map((r) => r.label)[1]).toBe('Function');
    expect(dfReference(prompt('borrowed:bVII@key=C'), 3).map((r) => r.label)).toEqual([
      'Chords in C major',
      'C major scale',
    ]);
    for (const p of everyPrompt()) {
      // A chord list never holds the chord asked for (a scale holds every root).
      if (p.kind !== 'secondary' && p.kind !== 'borrowed') continue;
      const text = dfReference(p, 3)
        .map((r) => r.value)
        .join(' | ');
      const answer = dfDisplay(p, p.answer);
      expect(new RegExp(`(^| )${answer.replace(/[–]/g, '.')}( |$)`).test(text), p.itemId).toBe(
        false,
      );
    }
  });

  it('plays the answer, then the chosen chord when wrong (rule 10)', () => {
    const v7 = prompt('minor-chord:V7@key=Am');
    const right = dfSounds(v7, { answer: 'E7', result: dfCheck(v7, 'E7') });
    expect(right).toEqual({ expected: ['E3', 'G#3', 'B3', 'D4'] });
    const wrong = dfSounds(v7, { answer: 'G7', result: dfCheck(v7, 'G7') });
    expect(wrong.given).toEqual(['G3', 'B3', 'D4', 'F4']);
    // A label answer plays the chord in question; the reverse secondary card resolves it.
    const of = prompt('secondary-of:V7/ii@key=C');
    expect(dfSounds(of, { answer: 'vi', result: dfCheck(of, 'vi') })).toEqual({
      expected: ['A3', 'C#4', 'E4', 'G4', 'D3', 'F3', 'A3'],
    });
    const src = prompt('minor-source:V7@key=Am');
    expect(dfSounds(src, { answer: 'natural', result: dfCheck(src, 'natural') }).given).toBe(
      undefined,
    );
    const two = prompt('two-five:Am');
    expect(
      dfSounds(two, { answer: two.answer, result: dfCheck(two, two.answer) }).expected,
    ).toHaveLength(11);
  });

  it('answers from the number keys', () => {
    expect(dfKeyToAnswer('2', ['a', 'b', 'c'])).toBe('b');
    expect(dfKeyToAnswer('4', ['a', 'b', 'c'])).toBeNull();
    expect(dfKeyToAnswer('x', ['a'])).toBeNull();
    expect(dfDescribeAnswer('Bm7b5 E7 Am')).toBe('Bm7b5 E7 Am');
  });
});
