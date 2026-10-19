import { describe, expect, it } from 'vitest';
import { getSkill } from '../../engine/skills';
import { STANDARD_TUNING } from '../../theory';
import { seededRng } from '../../engine/gamification/quests/draw';
import type { DrillContext } from '../types';
import {
  D11_CHOICES,
  d11CanTest,
  d11Check,
  d11Choices,
  d11ConceptOf,
  d11Convention,
  d11Cue,
  d11DescribeAnswer,
  d11Explain,
  d11Guides,
  d11Hint,
  d11KeyToAnswer,
  d11MakePrompt,
  d11NumeralOf,
  d11Pattern,
  d11Scale,
  d11Sounds,
  d11SpokenCue,
  d11Strip,
  d11Task,
  d11Voicing,
  d11WorkedExample,
  nashvilleParts,
  prettyChord,
  prettyKey,
  prettyNumeral,
  spokenChoice,
  spokenChord,
  spokenRoman,
  type D11Prompt,
} from './logic';
import {
  diatonicChord,
  diatonicChords,
  keyName,
  majorKey,
  minorKey,
  parseChordSymbol,
  parseRoman,
} from '../../theory';

/**
 * A seeded PRNG, so shuffles are deterministic. mulberry32, not an LCG: an
 * LCG's first draw barely moves with small seeds, so every seed would make
 * the same first pick.
 */
const lcg = (seed = 1): (() => number) => seededRng(seed);

const ctx = (scopeLevel = 0, rng: () => number = lcg()): DrillContext => ({
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp',
  scopeLevel,
  rng,
});

const prompt = (id: string, scopeLevel = 0, rng?: () => number): D11Prompt =>
  d11MakePrompt({ id, skillId: 'C8.numerals-major' }, ctx(scopeLevel, rng));

const answered = (p: D11Prompt, answer: string) => ({ answer, result: d11Check(p, answer) });

describe('D11 items', () => {
  it('tests numeral, numeral-of and Nashville items that are diatonic triads', () => {
    for (const id of [
      'numeral:vi@key=D',
      'numeral-of:vii°@key=Bb',
      'nashville:6m@key=D',
      'numeral:bVII@key=Am',
      'numeral-of:ii°@key=Em',
    ]) {
      expect(d11CanTest({ id, skillId: 'x' }), id).toBe(true);
    }
    for (const id of [
      'numeral:VI@key=D', // not the key's quality
      'numeral:bVII@key=C', // borrowed, not diatonic
      'numeral:V7@key=C', // sevenths aren't asked
      'nashville:6@key=D',
      'spell-key:D',
      'numeral:vi@D',
    ]) {
      expect(d11CanTest({ id, skillId: 'x' }), id).toBe(false);
    }
    expect(() => prompt('spell-key:D')).toThrow(/cannot test/);
  });

  it('serves every C8 item', () => {
    for (const skillId of ['C8.numerals-major', 'C8.nashville']) {
      const items = getSkill(skillId)!.items();
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) expect(d11CanTest(item), item.id).toBe(true);
    }
  });
});

describe('d11MakePrompt', () => {
  it('asks numeral → chord', () => {
    const p = prompt('numeral:vi@key=D');
    expect(p.ask).toBe('chord');
    expect(p.answer).toBe('Bm');
    expect(p.target).toMatchObject({ root: 'B', quality: 'minor', degree: 6, nashville: '6m' });
    expect(d11Cue(p)).toBe('vi');
    expect(d11Task(p)).toBe('Which chord is vi in D major?');
    expect(d11SpokenCue(p)).toBe('vi: 6 minor');
  });

  it('asks chord → numeral', () => {
    const p = prompt('numeral-of:vi@key=D');
    expect(p.ask).toBe('numeral');
    expect(p.answer).toBe('vi');
    expect(d11Cue(p)).toBe('Bm');
    expect(d11Task(p)).toBe('Bm in D major is which numeral?');
    expect(d11SpokenCue(p)).toBe('B minor');
  });

  it('asks Nashville → chord, spelled for the key', () => {
    const p = prompt('nashville:4@key=Bb');
    expect(p.answer).toBe('Eb');
    expect(d11Cue(p)).toBe('4');
    expect(d11Task(p)).toBe('Which chord is Nashville 4 in B♭ major?');
    expect(d11SpokenCue(p)).toBe('Nashville 4 major');
    expect(prompt('nashville:7°@key=F#').answer).toBe('E#dim');
  });

  it('offers the answer, its quality twin and two neighbouring roots at every level', () => {
    const letters = 'CDEFGAB';
    for (let level = 0; level < D11_CHOICES.length; level++) {
      for (let seed = 1; seed < 20; seed++) {
        const p = prompt('numeral:vi@key=D', level, lcg(seed));
        expect(p.choices).toHaveLength(D11_CHOICES[level] as number);
        expect(p.choices).toContain('Bm');
        expect(p.choices).toContain('B');
        expect(new Set(p.choices).size).toBe(p.choices.length);
        // The off-by-one slip is always on offer, though not always beside the answer.
        const roots = p.choices.map((c) => letters.indexOf(c.charAt(0)));
        expect(roots.some((a) => roots.some((b) => [1, 6].includes(Math.abs(a - b))))).toBe(true);
      }
    }
  });

  it('clamps the scope level', () => {
    expect(prompt('numeral:IV@key=G', -3).choices).toHaveLength(4);
    expect(prompt('numeral:IV@key=G', 9).choices).toHaveLength(8);
  });

  it('pairs each root both ways, in letter order', () => {
    const p = prompt('numeral:IV@key=D', 0);
    // G and its neighbour A or F#, each major and minor.
    expect(p.choices).toEqual(
      p.choices.includes('A') ? ['G', 'Gm', 'A', 'Am'] : ['F#', 'F#m', 'G', 'Gm'],
    );
  });

  it('reads numeral choices from the key’s own numerals, its quality first', () => {
    const fillers = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const p = prompt('numeral-of:vi@key=D', 0, lcg(seed));
      // vi with the other minor numerals, then one more: next to any of them.
      const filler = p.choices.filter((c) => !['ii', 'iii', 'vi'].includes(c));
      expect(p.choices.filter((c) => !filler.includes(c))).toEqual(['ii', 'iii', 'vi']);
      expect(filler).toHaveLength(1);
      fillers.add(filler[0] as string);
    }
    // Not only vi's neighbours V and vii°, or the odd one out would point at vi.
    expect([...fillers].sort()).toEqual(['I', 'IV', 'V', 'vii°']);
    expect(prompt('numeral-of:IV@key=D', 1).choices).toHaveLength(6);
    expect(prompt('numeral-of:IV@key=D', 2).choices).toEqual([
      'I',
      'ii',
      'iii',
      'IV',
      'V',
      'vi',
      'vii°',
    ]);
  });

  it('gives vii° a diminished decoy on its neighbour when the answer is a chord', () => {
    for (let seed = 1; seed < 10; seed++) {
      const c = prompt('numeral:vii°@key=C', 0, lcg(seed)).choices;
      expect(c.filter((x) => x.endsWith('dim'))).toHaveLength(2);
      expect(c).toContain('Bdim');
      expect(c).toContain('Bm');
      expect(c.includes('Adim') ? ['Am', 'Adim'] : ['Cm', 'Cdim']).toEqual(
        c.filter((x) => !x.startsWith('B')),
      );
      // As a numeral, vii° is the key's one diminished numeral: that's the fact.
      const n = prompt('numeral-of:vii°@key=C', 0, lcg(seed)).choices;
      expect(n.filter((x) => x.endsWith('°'))).toEqual(['vii°']);
    }
  });

  it('numbers minor keys from the parallel major, never offering III, VI or VII', () => {
    const p = prompt('numeral-of:bIII@key=Am', 2);
    expect(p.answer).toBe('bIII');
    expect(p.choices).toEqual(['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII']);
    for (let seed = 1; seed < 20; seed++) {
      for (const id of ['numeral-of:bVI@key=Em', 'numeral-of:bVII@key=Dm', 'numeral:bVI@key=Em']) {
        const choices = prompt(id, 2, lcg(seed)).choices;
        expect(choices.filter((c) => /^(III|VI|VII|iii|vi|vii)/.test(c))).toEqual([]);
      }
    }
    expect(d11Convention(minorKey('A'))).toBe(
      'Numbered from A major, so the chords on C, F and G are ♭III, ♭VI and ♭VII.',
    );
    expect(d11Convention(majorKey('A'))).toBeNull();
    expect(prompt('numeral:bVII@key=Am').answer).toBe('G');
  });
});

describe('d11Choices', () => {
  const MAJORS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db'];
  const MINORS = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D', 'G', 'C', 'F', 'Bb', 'Eb'];
  const keys = [...MAJORS.map((t) => majorKey(t)), ...MINORS.map((t) => minorKey(t))];

  /**
   * Every key × degree × level × seed, with its choices. Each case draws
   * from its own seed: the rows depend on the degrees, not the key, so keys
   * sharing seeds would only repeat each other's draws.
   */
  function* cases(ask: 'chord' | 'numeral', seeds = 10) {
    let n = 0;
    for (const key of keys) {
      for (let degree = 1; degree <= 7; degree++) {
        const target = diatonicChord(key, degree as 1);
        const answer = ask === 'chord' ? target.symbol : target.roman;
        for (let level = 0; level < D11_CHOICES.length; level++) {
          for (let seed = 1; seed <= seeds; seed++) {
            const choices = d11Choices(key, target, ask, level, lcg((n += 1)));
            const label = `${keyName(key)} ${answer} ${ask} level ${level}`;
            yield { key, target, answer, choices, label, level };
          }
        }
      }
    }
  }

  it('never gives a chord answer away by the choices’ shape (rule 1)', () => {
    for (const { answer, choices, label } of cases('chord')) {
      expect(choices, label).toContain(answer);
      expect(new Set(choices).size, label).toBe(choices.length);
      const all = choices.map((c) => parseChordSymbol(c));
      // Every root appears exactly twice, the answer's included.
      const counts = new Map<string, number>();
      for (const c of all) counts.set(c.root, (counts.get(c.root) ?? 0) + 1);
      expect(
        [...counts.values()].every((n) => n === 2),
        label,
      ).toBe(true);
      // The cue names the quality, so it must never single the answer out.
      const quality = parseChordSymbol(answer).quality;
      expect(all.filter((c) => c.quality === quality).length, label).toBeGreaterThan(1);
    }
  });

  it('offers only the key’s numerals, and the pattern alone never finds the answer', () => {
    let guesses = 0;
    let right = 0;
    for (const { key, target, answer, choices, label } of cases('numeral')) {
      const own = diatonicChords(key).map((c) => c.roman);
      expect(choices, label).toContain(answer);
      // Diatonic only, one per degree: no twin to throw out by the pattern.
      expect(
        choices.every((c) => own.includes(c)),
        label,
      ).toBe(true);
      expect(new Set(choices.map((c) => parseRoman(c)!.degree)).size, label).toBe(choices.length);
      if (target.quality === 'diminished') continue;
      // Knowing only "which numerals are minor" leaves at least three choices.
      const same = choices.filter((c) => parseRoman(c)!.quality === target.quality);
      expect(same.length, label).toBeGreaterThanOrEqual(3);
      guesses += 1;
      right += 1 / same.length;
    }
    // A learner using the pattern alone is right a third of the time, far below the band.
    expect(right / guesses).toBeLessThanOrEqual(1 / 3 + 1e-9);
  });

  /**
   * Guessing with no key knowledge. The cue states the answer's quality, so
   * a learner may keep only the choices of that quality and guess among them:
   * that is chance. They may also read the shape of the row: where each
   * choice sits, what it sits next to, what is offered twice. Each feature
   * below is one a review measured, or one like it. Keeping only the
   * choices with any one value of a feature, or of all of them at once, must
   * do no better than chance (rule 1), at every level and in either mode.
   */
  interface Seen {
    value: string;
    quality: string;
    /** Degree for a numeral, root letter for a chord: what "next to" means. */
    place: number;
  }

  const LETTERS = 'CDEFGAB';

  function seen(ask: 'chord' | 'numeral', value: string): Seen {
    if (ask === 'chord') {
      const c = parseChordSymbol(value);
      return { value, quality: c.quality, place: LETTERS.indexOf(c.root.charAt(0)) };
    }
    const n = parseRoman(value)!;
    return { value, quality: n.quality, place: n.degree };
  }

  const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));

  /** The numerals of any major or minor key, which a learner can know without the key. */
  const PATTERN = {
    major: diatonicChords(majorKey('C')).map((c) => c.roman),
    minor: diatonicChords(minorKey('A')).map((c) => c.roman),
  };

  type Mode = keyof typeof PATTERN;
  type Feature = (c: Seen, all: readonly Seen[], mode: Mode) => string;

  const FEATURES: Record<string, Feature> = {
    // Round 1: the answer was the only root (or degree) offered twice.
    'choices on its place': (c, all) => String(all.filter((o) => o.place === c.place).length),
    // Round 2: numerals outside the pattern I ii iii IV V vi vii° could be ruled out.
    'in the pattern': (c, _, mode) => String(PATTERN[mode].includes(c.value)),
    // Round 3: the one choice of another quality sat next to the answer.
    'next to another quality': (c, all) =>
      String(all.some((o) => gap(o.place, c.place) === 1 && o.quality !== c.quality)),
    'places next to it': (c, all) =>
      String(new Set(all.filter((o) => gap(o.place, c.place) === 1).map((o) => o.place)).size),
    'place in the row': (c, all) => String(all.filter((o) => o.quality === c.quality).indexOf(c)),
  };
  const STRATEGIES: Record<string, Feature> = {
    ...FEATURES,
    'all of these': (c, all, mode) =>
      Object.values(FEATURES)
        .map((f) => f(c, all, mode))
        .join(' '),
  };

  /** Chance may be beaten by sampling noise, not by more than this. */
  const MARGIN = 0.03;
  /** Enough draws per card that the noise stays well inside the margin. */
  const SEEDS = 60;

  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it.each(['chord', 'numeral'] as const)(
    'gives no %s answer away to a guess from the row’s shape (rule 1)',
    (ask) => {
      interface Case {
        answer: string;
        quality: string;
        all: Seen[];
      }
      const groups = new Map<string, { mode: Mode; cases: Case[] }>();
      for (const { key, target, answer, choices, level } of cases(ask, SEEDS)) {
        // vii° is the only diminished numeral; that is the fact being taught.
        if (ask === 'numeral' && target.quality === 'diminished') continue;
        const name = `${key.mode} level ${level}`;
        const group = groups.get(name) ?? { mode: key.mode, cases: [] };
        group.cases.push({
          answer,
          quality: target.quality,
          all: choices.map((c) => seen(ask, c)),
        });
        groups.set(name, group);
      }
      expect(groups.size).toBe(2 * D11_CHOICES.length);
      const beaten: string[] = [];
      for (const [name, { mode, cases: all }] of groups) {
        const ofQuality = ({ all: row, quality }: Case) => row.filter((c) => c.quality === quality);
        const chance = mean(all.map((c) => 1 / ofQuality(c).length));
        // The cue's quality alone (chance) stays far below the 80–90% band.
        if (chance > 1 / 2 + 1e-9) {
          beaten.push(`${name}: the cue’s quality alone scores ${pct(chance)}`);
        }
        for (const [strategy, feature] of Object.entries(STRATEGIES)) {
          const values = new Set(
            all.flatMap((c) => ofQuality(c).map((s) => feature(s, c.all, mode))),
          );
          for (const value of values) {
            const score = mean(
              all.map((c) => {
                const same = ofQuality(c);
                const kept = same.filter((s) => feature(s, c.all, mode) === value);
                const from = kept.length > 0 ? kept : same;
                return from.some((s) => s.value === c.answer) ? 1 / from.length : 0;
              }),
            );
            if (score > chance + MARGIN) {
              beaten.push(
                `${name}: “${strategy}” = ${value} scores ${pct(score)} (chance ${pct(chance)})`,
              );
            }
          }
        }
      }
      expect(beaten).toEqual([]);
    },
  );
});

describe('d11Check', () => {
  it('marks the answer right, keyed by its numeral', () => {
    const p = prompt('numeral:vi@key=D');
    expect(d11Check(p, 'Bm')).toEqual({ correct: true, expected: 'Bm', concept: 'numeral:vi' });
  });

  it('logs a wrong chord against the numeral it really is', () => {
    const p = prompt('numeral:vi@key=D');
    expect(d11Check(p, 'A')).toEqual({
      correct: false,
      expected: 'Bm',
      concept: 'numeral:vi',
      confusedWith: 'numeral:V',
    });
    // A quality slip on the right degree names no card's concept, so it isn't logged.
    expect(d11Check(p, 'B')).toEqual({ correct: false, expected: 'Bm', concept: 'numeral:vi' });
    expect(d11Check(prompt('numeral-of:vii°@key=C'), 'vii').confusedWith).toBeUndefined();
    expect(d11Check(p, 'nonsense').confusedWith).toBeUndefined();
  });

  it('logs a wrong numeral against itself', () => {
    const p = prompt('numeral-of:ii@key=F');
    expect(d11Check(p, 'IV')).toMatchObject({
      correct: false,
      expected: 'ii',
      confusedWith: 'numeral:IV',
    });
    expect(d11Check(p, '???').confusedWith).toBeUndefined();
  });

  it('shows the expected answer prettily', () => {
    expect(d11Check(prompt('numeral:IV@key=F#'), 'B').expected).toBe('B');
    expect(d11Check(prompt('numeral:iii@key=F#'), 'B').expected).toBe('A♯m');
    expect(d11Check(prompt('numeral-of:bVII@key=Am'), 'i').expected).toBe('♭VII');
  });

  it('keys Nashville items by their Roman numeral', () => {
    expect(d11ConceptOf({ id: 'nashville:6m@key=D', skillId: 'x' })).toBe('numeral:vi');
    expect(d11ConceptOf({ id: 'nashville:7°@key=D', skillId: 'x' })).toBe('numeral:vii°');
    expect(d11ConceptOf({ id: 'numeral-of:IV@key=D', skillId: 'x' })).toBe('numeral:IV');
    expect(d11ConceptOf({ id: 'note@s6f5', skillId: 'x' })).toBeNull();
  });

  it('maps answers to numerals', () => {
    const p = prompt('numeral:vi@key=D');
    expect(d11NumeralOf(p, 'F#m')).toBe('iii');
    expect(d11NumeralOf(p, 'Q')).toBeNull();
    expect(d11NumeralOf(prompt('numeral-of:vi@key=D'), 'V')).toBe('V');
    expect(d11NumeralOf(prompt('numeral-of:vi@key=D'), 'V9')).toBeNull();
  });
});

describe('d11Explain', () => {
  it('says nothing for a right answer', () => {
    expect(d11Explain(prompt('numeral:vi@key=D'), 'Bm')).toEqual([]);
  });

  it('explains a quality slip', () => {
    expect(d11Explain(prompt('numeral:vi@key=D'), 'B')).toEqual([
      'Right root, wrong quality: the chord on B in D major is minor (lower case), so Bm, not B.',
    ]);
    expect(d11Explain(prompt('numeral-of:vii°@key=Eb'), 'vii')).toEqual([
      'Right root, wrong quality: the chord on D in E♭ major is diminished (lower case with °), so vii°, not vii.',
    ]);
    expect(d11Explain(prompt('nashville:2m@key=G'), 'A')).toEqual([
      'Right root, wrong quality: the chord on A in G major is minor (m), so Am, not A.',
    ]);
  });

  it('explains a wrong degree, naming what the answer really is', () => {
    expect(d11Explain(prompt('numeral:vi@key=D'), 'A')).toEqual([
      'B is the 6th note of D major, and that chord is minor (lower case): Bm.',
      'A is V in D major.',
    ]);
    expect(d11Explain(prompt('numeral-of:IV@key=Bb'), 'V')).toEqual([
      'E♭ is the 4th note of B♭ major, and that chord is major (upper case): IV.',
      'V is F in B♭ major.',
    ]);
    expect(d11Explain(prompt('nashville:5@key=E'), 'A')).toEqual([
      'B is the 5th note of E major, and that chord is major (a plain number): B.',
      // In the cue's notation: Nashville, not Roman.
      'A is 4 in E major.',
    ]);
  });

  it('explains a minor key by its flat degrees', () => {
    expect(d11Explain(prompt('numeral:bVI@key=Am'), 'G')[0]).toBe(
      'F is a flat 6th counted from A major, and that chord is major (upper case): F.',
    );
  });

  it('copes with an answer that is no chord', () => {
    expect(d11Explain(prompt('numeral-of:IV@key=C'), 'x')).toEqual([
      'F is the 4th note of C major, and that chord is major (upper case): IV.',
    ]);
  });
});

describe('worked examples and guides', () => {
  it('walks through the first rep of each direction', () => {
    expect(d11WorkedExample(prompt('numeral:vi@key=D'))).toBe(
      "vi is the chord on the 6th note of D major, B, and it's minor (lower case): Bm.",
    );
    expect(d11WorkedExample(prompt('numeral-of:vii°@key=C'))).toBe(
      "Bdim is built on B, the 7th note of C major, and it's diminished (lower case with °), so it's vii°.",
    );
    expect(d11WorkedExample(prompt('nashville:4@key=A'))).toBe(
      "4 is the chord on the 4th note of A major, D, and it's major (a plain number): D.",
    );
    expect(d11WorkedExample(prompt('nashville:7°@key=A'))).toContain('diminished (°)');
  });

  it('fades the guides', () => {
    expect(d11Guides(0)).toEqual({ hint: false, pattern: false, scale: false });
    expect(d11Guides(1)).toEqual({ hint: true, pattern: false, scale: false });
    expect(d11Guides(2)).toEqual({ hint: true, pattern: true, scale: false });
    expect(d11Guides(3)).toEqual({ hint: true, pattern: true, scale: true });
  });

  it('describes the key without naming the answer', () => {
    const p = prompt('numeral:vi@key=Eb');
    expect(d11Hint(p)).toBe('Count up the scale from E♭ as 1.');
    expect(d11Pattern(p)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect(d11Pattern(prompt('nashville:6m@key=D'))).toEqual([
      '1',
      '2m',
      '3m',
      '4',
      '5',
      '6m',
      '7°',
    ]);
    expect(d11Pattern(prompt('numeral:bVII@key=Am'))).toContain('♭VII');
    expect(d11Scale(p)).toEqual(['E♭', 'F', 'G', 'A♭', 'B♭', 'C', 'D']);
  });
});

describe('the feedback strip', () => {
  it('marks the answer and a chosen chord of the key', () => {
    const p = prompt('numeral:vi@key=D');
    const strip = d11Strip(p, 'A');
    expect(strip.map((c) => c.label)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect(strip.map((c) => c.symbol)).toEqual(['D', 'Em', 'F♯m', 'G', 'A', 'Bm', 'C♯dim']);
    expect(strip.map((c) => c.state)).toEqual([null, null, null, null, 'given', 'answer', null]);
    // The quality twin isn't in the key, so only the answer is marked.
    expect(
      d11Strip(p, 'B')
        .filter((c) => c.state)
        .map((c) => c.state),
    ).toEqual(['answer']);
    expect(d11Strip(p, 'Bm').filter((c) => c.state)).toHaveLength(1);
    expect(d11Strip(p, null).filter((c) => c.state)).toHaveLength(1);
  });

  it('marks a chosen numeral, labelled as the cue writes it', () => {
    const p = prompt('numeral-of:vi@key=D');
    expect(d11Strip(p, 'ii').map((c) => c.state)).toEqual([
      null,
      'given',
      null,
      null,
      null,
      'answer',
      null,
    ]);
    expect(d11Strip(prompt('nashville:6m@key=D'), null)[5]).toMatchObject({ label: '6m' });
  });
});

describe('sound', () => {
  it('voices chords upward from octave 3', () => {
    expect(d11Voicing('Bm')).toEqual(['B3', 'D4', 'F#4']);
    expect(d11Voicing('C')).toEqual(['C3', 'E3', 'G3']);
    expect(d11Voicing('E#dim')).toEqual(['E#3', 'G#3', 'B3']);
  });

  it('plays the right chord, then the chosen one when wrong', () => {
    const p = prompt('numeral:vi@key=D');
    expect(d11Sounds(p, answered(p, 'Bm'))).toEqual({ expected: ['B3', 'D4', 'F#4'] });
    expect(d11Sounds(p, answered(p, 'A'))).toEqual({
      expected: ['B3', 'D4', 'F#4'],
      given: ['A3', 'C#4', 'E4'],
    });
    const q = prompt('numeral-of:vi@key=D');
    expect(d11Sounds(q, answered(q, 'VI')).given).toEqual(['B3', 'D#4', 'F#4']);
    expect(d11Sounds(q, answered(q, 'nope'))).toEqual({ expected: ['B3', 'D4', 'F#4'] });
  });
});

describe('display and input', () => {
  it('writes accidentals as symbols', () => {
    expect(prettyChord('F#m')).toBe('F♯m');
    expect(prettyChord('Bbdim')).toBe('B♭dim');
    expect(prettyChord('C')).toBe('C');
    expect(prettyNumeral('bVII')).toBe('♭VII');
    expect(prettyNumeral('b7')).toBe('♭7');
    expect(prettyNumeral('vi')).toBe('vi');
    expect(prettyKey(majorKey('F#'))).toBe('F♯ major');
    expect(prettyKey(minorKey('Bb'))).toBe('B♭ minor');
  });

  it('names choices for screen readers', () => {
    expect(spokenChord('F#m')).toBe('F sharp minor');
    expect(spokenChord('D')).toBe('D major');
    expect(spokenChord('Bbdim')).toBe('B flat diminished');
    expect(spokenRoman('vi')).toBe('6 minor');
    expect(spokenRoman('bVII')).toBe('flat 7 major');
    expect(spokenRoman('vii°')).toBe('7 diminished');
    expect(spokenRoman('nope')).toBe('nope');
    expect(spokenChoice({ ask: 'chord' }, 'Em')).toBe('E minor');
    expect(spokenChoice({ ask: 'numeral' }, 'IV')).toBe('4 major');
  });

  it('sets a Nashville suffix apart from its number', () => {
    expect(nashvilleParts('6m')).toEqual({ degree: '6', suffix: 'm' });
    expect(nashvilleParts('7°')).toEqual({ degree: '7', suffix: '°' });
    expect(nashvilleParts('b7')).toEqual({ degree: '♭7', suffix: '' });
    expect(nashvilleParts('57')).toEqual({ degree: '5', suffix: '7' });
    expect(nashvilleParts('x')).toEqual({ degree: 'x', suffix: '' });
  });

  it('takes 1–9 from the keyboard', () => {
    expect(d11KeyToAnswer('1', ['A', 'B'])).toBe('A');
    expect(d11KeyToAnswer('2', ['A', 'B'])).toBe('B');
    expect(d11KeyToAnswer('3', ['A', 'B'])).toBeNull();
    expect(d11KeyToAnswer('a', ['A', 'B'])).toBeNull();
    expect(d11DescribeAnswer('Bm')).toBe('Bm');
  });

  it('spells every major-key choice as a chord or numeral the theory reads', () => {
    for (const id of getSkill('C8.numerals-major')!
      .items()
      .map((i) => i.id)) {
      const p = prompt(id, 2);
      for (const c of p.choices) {
        if (p.ask === 'chord') expect(() => parseChordSymbol(c)).not.toThrow();
        else expect(parseRoman(c), c).not.toBeNull();
      }
    }
  });
});
