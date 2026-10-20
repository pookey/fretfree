import { describe, expect, it } from 'vitest';
import type { Item } from '../../engine/model';
import { SKILLS } from '../../engine/skills';
import { STANDARD_TUNING } from '../../theory';
import type { DrillContext } from '../types';
import {
  D40_SCOPE,
  byName,
  d40CanTest,
  d40Check,
  d40Choices,
  d40ConceptOf,
  d40DescribeAnswer,
  d40KeyFor,
  d40KeyToAnswer,
  d40MakePrompt,
  d40RunSize,
  d40Sounds,
  display,
  dominantOf,
  parseSignatureCode,
  signatureCode,
  subdominantOf,
  tonicTriad,
  type D40Kind,
  type D40Prompt,
} from './logic';
import {
  d40Explain,
  d40Fact,
  d40Guides,
  d40Subject,
  d40Task,
  signatureName,
  signatureNotes,
  spokenChoice,
} from './text';

const item = (id: string): Item => ({ id, skillId: 'I3.test' });

const ctx = (scopeLevel = 0, rng: () => number = () => 0.5): DrillContext => ({
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp',
  scopeLevel,
  rng,
});

const prompt = (id: string, scopeLevel = 0, rng?: () => number) =>
  d40MakePrompt(item(id), ctx(scopeLevel, rng));

/** Every I3 card, from the skill registry. */
const I3_ITEMS = SKILLS.filter((s) => s.topic === 'I3').flatMap((s) => s.items());

const LEVELS = [0, 1, 2];

/**
 * Every prompt a card can make at a level, each as likely as the others: one
 * per place its run can start, and for letter runs, either spare spelling of
 * a letter that has three (C♭ C C♯). Those are the drill's only random picks.
 */
function everyPrompt(id: string, level: number): D40Prompt[] {
  const size = d40RunSize(level);
  return Array.from({ length: size }, (_, start) =>
    [0.25, 0.75].map((spare) => {
      let calls = 0;
      const rng = () => (calls++ === 0 ? (start + 0.5) / size : spare);
      return d40MakePrompt(item(id), ctx(level, rng));
    }),
  ).flat();
}

function kindOf(id: string): D40Kind {
  return d40MakePrompt(item(id), ctx()).kind;
}

describe('D40 items', () => {
  it('tests every I3 card, and nothing else', () => {
    expect(I3_ITEMS.length).toBeGreaterThan(50);
    for (const i of I3_ITEMS) expect(d40CanTest(i), i.id).toBe(true);
    expect(d40CanTest(item('spell-key:Eb'))).toBe(false);
    expect(d40CanTest(item('degree:5@Eb'))).toBe(false);
    // Keys with double sharps or flats have no cards.
    expect(d40CanTest(item('key-signature:G#'))).toBe(false);
    expect(d40CanTest(item('relative-minor:Fb'))).toBe(false);
    // C♯'s V is G♯ major, which would need an F double sharp.
    expect(d40CanTest(item('dominant:C#'))).toBe(false);
    expect(() => prompt('dominant:C#')).toThrow();
  });

  it('answers each kind of card', () => {
    expect(prompt('key-signature:Eb')).toMatchObject({ tonic: 'Eb', alteration: -3, answer: '3b' });
    expect(prompt('key-signature:C').answer).toBe('0');
    expect(prompt('key-signature:C#').answer).toBe('7#');
    expect(prompt('signature-key:3b')).toMatchObject({ tonic: 'Eb', answer: 'Eb' });
    expect(prompt('signature-key:0').answer).toBe('C');
    expect(prompt('signature-key:6#').answer).toBe('F#');
    expect(prompt('signature-key:6b').answer).toBe('Gb');
    expect(prompt('relative-minor:Eb').answer).toBe('C');
    expect(prompt('relative-minor:F#').answer).toBe('D#');
    expect(prompt('relative-minor:Cb').answer).toBe('Ab');
    expect(prompt('dominant:Eb').answer).toBe('Bb');
    expect(prompt('dominant:B').answer).toBe('F#');
    expect(prompt('dominant:F#').answer).toBe('C#');
    expect(prompt('dominant:Cb').answer).toBe('Gb');
    expect(prompt('dominant:F').answer).toBe('C');
    expect(dominantOf('Gb')).toBe('Db');
  });

  it('codes signatures', () => {
    for (let a = -7; a <= 7; a++) expect(parseSignatureCode(signatureCode(a))).toBe(a);
    expect(parseSignatureCode('8#')).toBeNull();
    expect(parseSignatureCode('3')).toBeNull();
    expect(signatureNotes(4)).toEqual(['F♯', 'C♯', 'G♯', 'D♯']);
    expect(signatureNotes(-2)).toEqual(['B♭', 'E♭']);
    expect(signatureNotes(0)).toEqual([]);
    expect(signatureName(1)).toBe('1 sharp');
    expect(signatureName(-5)).toBe('5 flats');
    expect(signatureName(0)).toBe('No sharps or flats');
  });
});

describe('D40 choices', () => {
  it('offers the answer among distinct choices, more of them at higher levels', () => {
    for (const { id } of I3_ITEMS) {
      for (const level of LEVELS) {
        for (const p of everyPrompt(id, level)) {
          expect(p.choices, id).toContain(p.answer);
          expect(new Set(p.choices).size).toBe(p.choices.length);
          const n = 2 * d40RunSize(level);
          // Two spellings of each count or letter, but only one 0.
          expect([n, n - 1], `${id} ${p.choices.join(' ')}`).toContain(p.choices.length);
        }
      }
    }
    expect(d40RunSize(9)).toBe(d40RunSize(D40_SCOPE.maxLevel));
    expect(d40RunSize(-1)).toBe(2);
  });

  it('keeps one fixed order: signatures by count, keys by name', () => {
    expect(d40Choices('key-signature', 'A', 0, () => 0)).toEqual(['3#', '3b', '4#', '4b']);
    expect(d40Choices('key-signature', 'A', 0, () => 0.99)).toEqual(['2#', '2b', '3#', '3b']);
    // The run of counts wraps from 7 round to 0.
    expect(d40Choices('key-signature', 'C#', 0, () => 0)).toEqual(['0', '7#', '7b']);
    expect(d40Choices('signature-key', 'Eb', 0, () => 0)).toEqual(['Ab', 'A', 'Eb', 'E']);
    // Letters C and D, two spellings each.
    expect(d40Choices('relative-minor', 'Eb', 0, () => 0)).toEqual(['C', 'C#', 'D', 'D#']);
    // The V's letters skip the key's own: B♭'s V is F, in a run D E F.
    expect(d40Choices('dominant', 'Bb', 1, () => 0.99)).toEqual(['Db', 'D', 'Eb', 'E', 'F', 'F#']);
    // From F the run skips B, B♭'s own letter: F G A C.
    expect(d40Choices('dominant', 'Bb', 2, () => 0)).toEqual([
      'Ab',
      'A',
      'Cb',
      'C',
      'F',
      'F#',
      'Gb',
      'G',
    ]);
    expect([...['C#', 'Bb', 'A', 'Ab', 'B', 'C']].sort(byName)).toEqual([
      'Ab',
      'A',
      'Bb',
      'B',
      'C',
      'C#',
    ]);
  });

  it('pairs 3♯ with 3♭, so the sharp and flat keys meet (rule 6)', () => {
    for (const { id } of I3_ITEMS) {
      const kind = kindOf(id);
      if (kind !== 'key-signature') continue;
      for (const p of everyPrompt(id, 0)) {
        const counts = p.choices.map((c) => Math.abs(parseSignatureCode(c) as number));
        for (const c of counts) {
          if (c !== 0) expect(counts.filter((x) => x === c)).toHaveLength(2);
        }
      }
    }
  });

  it('shows every letter twice for the relative minor and the V, so no letter stands out', () => {
    for (const { id } of I3_ITEMS) {
      const kind = kindOf(id);
      if (kind !== 'relative-minor' && kind !== 'dominant') continue;
      for (const level of LEVELS) {
        for (const p of everyPrompt(id, level)) {
          const letters = p.choices.map((c) => c.charAt(0));
          for (const l of letters)
            expect(
              letters.filter((x) => x === l),
              id,
            ).toHaveLength(2);
        }
      }
    }
  });

  it('never offers the key itself for its V, and often offers its IV', () => {
    for (const level of LEVELS) {
      let withIV = 0;
      let total = 0;
      for (const { id } of I3_ITEMS) {
        if (kindOf(id) !== 'dominant') continue;
        for (const p of everyPrompt(id, level)) {
          expect(p.choices).not.toContain(p.tonic);
          total++;
          if (p.choices.includes(subdominantOf(p.tonic))) withIV++;
        }
      }
      // The IV's letter sits next to the V's once the key's is skipped, so
      // even the smallest run holds the IV about half the time (rule 6).
      expect(withIV / total, `L${level}`).toBeGreaterThanOrEqual(0.4);
    }
  });
});

/**
 * M4-02's review: a learner must not be able to pass a card from the shape of
 * its choices without knowing the key. These tests model learners who know
 * no I3 facts and check that none of them beats guessing.
 */
describe('D40 choices give nothing away', () => {
  it("from a signature card's choices alone, every choice is equally likely the answer", () => {
    // Over every card of a kind and every start of its run (all equally
    // likely), group the prompts by their choice set. Each set must come
    // from exactly one card per choice, each card once, so the set alone
    // says nothing about which choice is right.
    for (const kind of ['key-signature', 'signature-key'] as const) {
      for (const level of LEVELS) {
        const bySet = new Map<string, string[]>();
        for (const { id } of I3_ITEMS) {
          if (kindOf(id) !== kind) continue;
          // Signature runs make one random pick: halve the doubled list.
          for (const p of everyPrompt(id, level).filter((_, i) => i % 2 === 0)) {
            const key = p.choices.join(' ');
            bySet.set(key, [...(bySet.get(key) ?? []), p.answer]);
          }
        }
        expect(bySet.size).toBeGreaterThan(0);
        for (const [set, answers] of bySet) {
          expect([...answers].sort(), `${kind} L${level}: ${set}`).toEqual(set.split(' ').sort());
        }
      }
    }
  });

  /**
   * A learner's success rate over every card of a kind and every prompt it
   * can make: the strategy names the choices it would pick from, and guesses
   * among them. Chance is one over the number of choices.
   */
  function rate(
    kind: D40Kind,
    level: number,
    candidates: (p: D40Prompt) => readonly string[],
  ): { hit: number; chance: number } {
    let hit = 0;
    let chance = 0;
    let n = 0;
    for (const { id } of I3_ITEMS) {
      if (kindOf(id) !== kind) continue;
      for (const p of everyPrompt(id, level)) {
        n++;
        chance += 1 / p.choices.length;
        const picks = candidates(p).filter((c) => p.choices.includes(c));
        if (picks.includes(p.answer)) hit += 1 / picks.length;
      }
    }
    return { hit: hit / n, chance: chance / n };
  }

  const KINDS: D40Kind[] = ['key-signature', 'signature-key', 'relative-minor', 'dominant'];
  const LETTER_STEPS = [0, 1, 2, 3, 4, 5, 6];

  const letterIndex = (note: string) => 'ABCDEFG'.indexOf(note.charAt(0));
  /** Choices whose letter is `steps` letters above the asked key's. */
  const lettersUp = (steps: number) => (p: D40Prompt) =>
    p.choices.filter((c) => (letterIndex(c) - letterIndex(p.tonic) + 7) % 7 === steps);
  /** The button just after (or before) the asked key, alphabetically. */
  const besideTonic = (dir: 1 | -1) => (p: D40Prompt) => {
    const all = [...new Set([...p.choices, p.tonic])].sort(byName);
    const next = all[(all.indexOf(p.tonic) + dir + all.length) % all.length] as string;
    return next === p.tonic ? [] : [next];
  };
  /** The choices spelled like the asked key: ♭ with ♭, ♯ with ♯, natural with natural. */
  const sameAccidental = (p: D40Prompt) => p.choices.filter((c) => c.slice(1) === p.tonic.slice(1));
  /** The choices that are, or are not, a natural. */
  const naturals = (want: boolean) => (p: D40Prompt) =>
    p.choices.filter((c) => (c.length === 1) === want);

  it('no button position, spelling or neighbour of the asked key beats guessing', () => {
    for (const kind of KINDS) {
      // Spelling and letter strategies need a key on the card and keys on
      // the buttons. A signature card shows no key (its tonic is the hidden
      // answer), and a key's signature buttons show no letters.
      const spelled = kind === 'relative-minor' || kind === 'dominant';
      const strategies: [string, (p: D40Prompt) => readonly string[]][] = [
        ...Array.from({ length: 8 }, (_, i): [string, (p: D40Prompt) => string[]] => [
          `button ${i + 1}`,
          (p) => (p.choices[i] === undefined ? [] : [p.choices[i]]),
        ]),
        ['last button', (p) => p.choices.slice(-1)],
        [
          'middle button',
          (p) => p.choices.slice(p.choices.length >> 1, (p.choices.length >> 1) + 1),
        ],
        ['naturals', naturals(true)],
        ['accidentals', naturals(false)],
      ];
      if (spelled) {
        strategies.push(['after the key', besideTonic(1)], ['before the key', besideTonic(-1)]);
        // The letter the fact lands on is the rule itself (a 3rd down, a 5th
        // up): tested below. Every other letter step must be no help.
        const rule = kind === 'relative-minor' ? 5 : kind === 'dominant' ? 4 : null;
        for (const steps of LETTER_STEPS) {
          if (steps !== rule) strategies.push([`${steps} letters up`, lettersUp(steps)]);
        }
      }
      for (const level of LEVELS) {
        for (const [name, s] of strategies) {
          const { hit, chance } = rate(kind, level, s);
          expect(hit, `${kind} L${level}: ${name}`).toBeLessThanOrEqual(chance + 0.08);
        }
      }
    }
  });

  it("matching the key's accidental halves the choices, no more", () => {
    // A key's V and relative minor are mostly spelled like it (E♭ → B♭, G →
    // E), so a learner who matches accidentals keeps about half the buttons:
    // each letter shows one natural and one accidental. That is the music,
    // like knowing a sharp key from a flat one, and leaves the letter to know.
    for (const kind of ['relative-minor', 'dominant'] as const) {
      for (const level of LEVELS) {
        const { hit } = rate(kind, level, sameAccidental);
        expect(hit, `${kind} L${level}`).toBeLessThanOrEqual(1 / d40RunSize(level) + 0.05);
      }
    }
  });

  it('knowing only the letter (a 3rd down, a 5th up) leaves a coin toss on the accidental', () => {
    for (const level of LEVELS) {
      // The relative minor is 2 letters down (5 up); the V is 4 letters up.
      expect(rate('relative-minor', level, lettersUp(5)).hit).toBeCloseTo(0.5, 5);
      expect(rate('dominant', level, lettersUp(4)).hit).toBeCloseTo(0.5, 5);
    }
  });

  it('knowing only whether a key has sharps or flats halves the choices, no more', () => {
    // A learner who can tell a sharp key from a flat one, but not how many.
    for (const level of LEVELS) {
      const size = d40RunSize(level);
      const { hit } = rate('key-signature', level, (p) =>
        p.choices.filter(
          (c) => Math.sign(parseSignatureCode(c) as number) === Math.sign(p.alteration),
        ),
      );
      // One in `size`, more where the run holds 0, which has one spelling
      // (C major's own card is then a gift to anyone who knows it has none).
      expect(hit, `L${level}`).toBeLessThanOrEqual(1 / size + 0.12);
    }
  });
});

describe('D40 grading', () => {
  it('grades the answer and keys confusions by the key whose fact was chosen', () => {
    const p = prompt('key-signature:Eb');
    expect(d40Check(p, '3b')).toEqual({ correct: true, expected: '3♭', concept: 'signature:Eb' });
    // 3♯ is A major's signature.
    expect(d40Check(p, '3#')).toEqual({
      correct: false,
      expected: '3♭',
      concept: 'signature:Eb',
      confusedWith: 'signature:A',
    });
    expect(d40Check(prompt('signature-key:3b'), 'A').confusedWith).toBe('signature:A');
    expect(d40Check(prompt('relative-minor:Eb'), 'G').confusedWith).toBe('relative-minor:Bb');
    expect(d40Check(prompt('dominant:C'), 'F').confusedWith).toBe('dominant:Bb');
    // A choice no card answers logs no confusion.
    expect(d40Check(prompt('dominant:C'), 'Fb')).not.toHaveProperty('confusedWith');
    expect(d40Check(prompt('key-signature:C'), 'x')).not.toHaveProperty('confusedWith');
  });

  it('keys both directions of a signature by the same concept', () => {
    expect(d40ConceptOf(item('key-signature:Eb'))).toBe('signature:Eb');
    expect(d40ConceptOf(item('signature-key:3b'))).toBe('signature:Eb');
    expect(d40ConceptOf(item('dominant:Eb'))).toBe('dominant:Eb');
    expect(d40ConceptOf(item('relative-minor:Eb'))).toBe('relative-minor:Eb');
    expect(d40ConceptOf(item('spell-key:Eb'))).toBeNull();
    expect(d40DescribeAnswer('3b')).toBe('3b');
  });
});

describe('D40 text', () => {
  it('asks each kind of card without naming its answer', () => {
    for (const { id } of I3_ITEMS) {
      const p = prompt(id);
      const asked = `${d40Subject(p)} ${d40Task(p)}`;
      if (p.kind !== 'signature-key') expect(asked).not.toContain(display(p.kind, p.answer));
      else expect(asked).not.toMatch(/major key\?.*[A-G]/);
    }
    const eb = prompt('key-signature:Eb');
    expect(d40Subject(eb)).toBe('E♭ major');
    expect(d40Task(eb)).toBe('How many sharps or flats?');
    expect(d40Subject(prompt('signature-key:3b'))).toBe('3 flats');
    expect(d40Task(prompt('signature-key:3b'))).toBe('Which major key?');
    expect(d40Task(prompt('relative-minor:Eb'))).toBe('Its relative minor?');
    expect(d40Task(prompt('dominant:Eb'))).toBe('Which key is its V?');
  });

  it('states each fact with its reason', () => {
    expect(d40Fact(prompt('key-signature:Eb'))).toBe(
      'E♭ major has 3 flats: B♭ E♭ A♭. Flats always come in the order B E A D G C F.',
    );
    expect(d40Fact(prompt('key-signature:C'))).toBe('C major has no sharps or flats.');
    expect(d40Fact(prompt('signature-key:3#'))).toBe(
      '3 sharps: F♯ C♯ G♯ is A major: a half step above the last sharp, G♯.',
    );
    expect(d40Fact(prompt('signature-key:3b'))).toBe(
      '3 flats: B♭ E♭ A♭ is E♭ major: the second-last flat names the key.',
    );
    expect(d40Fact(prompt('signature-key:1b'))).toBe('1 flat, B♭, is F major.');
    expect(d40Fact(prompt('signature-key:0'))).toBe('No sharps or flats is C major.');
    expect(d40Fact(prompt('relative-minor:Eb'))).toBe(
      'C minor is the relative minor of E♭ major: it shares its 3 flats, and C is the 6th of E♭ major.',
    );
    expect(d40Fact(prompt('relative-minor:C'))).toContain('no sharps or flats either');
    expect(d40Fact(prompt('dominant:Eb'))).toBe(
      'B♭ is the V of E♭ major: a 5th up, the next key clockwise on the circle.',
    );
  });

  it('says what a wrong choice is the answer to', () => {
    const eb = prompt('key-signature:Eb');
    expect(d40Explain(eb, '3b')).toBeNull();
    expect(d40Explain(eb, '3#')).toBe('3 sharps is A major.');
    expect(d40Explain(eb, '0')).toBe('No sharps or flats is C major.');
    expect(d40Explain(eb, 'x')).toBeNull();
    expect(d40Explain(prompt('signature-key:3b'), 'A')).toBe('A major has 3 sharps: F♯ C♯ G♯.');
    expect(d40Explain(prompt('signature-key:3b'), 'G#')).toBeNull();
    expect(d40Explain(prompt('relative-minor:Eb'), 'G')).toBe(
      'G minor is the relative minor of B♭ major.',
    );
    expect(d40Explain(prompt('relative-minor:Eb'), 'H')).toBeNull();
    expect(d40Explain(prompt('dominant:C'), 'F')).toBe(
      'F is the IV of C major, a 5th down: the V is the other way round the circle.',
    );
    expect(d40Explain(prompt('dominant:C'), 'D')).toBe('D is the V of G major.');
    expect(d40Explain(prompt('dominant:C'), 'Fb')).toBeNull();
  });

  it('names choices for the eye and the ear', () => {
    expect(display('key-signature', '3b')).toBe('3♭');
    expect(display('key-signature', '0')).toBe('0');
    expect(display('relative-minor', 'F#')).toBe('F♯m');
    expect(display('dominant', 'Bb')).toBe('B♭');
    expect(spokenChoice('key-signature', '2#')).toBe('2 sharps: F sharp, C sharp');
    expect(spokenChoice('key-signature', '0')).toBe('No sharps or flats');
    expect(spokenChoice('relative-minor', 'C#')).toBe('C sharp minor');
    expect(spokenChoice('signature-key', 'Eb')).toBe('E flat major');
  });

  it('fades the panel: rules first, then the circle order, never the V in order', () => {
    expect(d40Guides('key-signature', 0)).toEqual({ rule: null, orders: false, circle: false });
    expect(d40Guides('key-signature', 1)).toMatchObject({ orders: true, circle: false });
    expect(d40Guides('signature-key', 2)).toMatchObject({ orders: true, circle: true });
    expect(d40Guides('dominant', 3)).toMatchObject({ circle: false });
    // The order of sharps is the circle by letter: the V's panel never shows it.
    for (const level of [1, 2, 3] as const) expect(d40Guides('dominant', level).orders).toBe(false);
    expect(d40Guides('relative-minor', 2).orders).toBe(true);
    expect(d40Guides('relative-minor', 1).rule).toContain('6th');
  });
});

describe('D40 sound and keys', () => {
  const fb = (p: D40Prompt, answer: string) => ({ answer, result: d40Check(p, answer) });

  it('plays the key, and for the V and relative minor the move from it', () => {
    expect(tonicTriad('A', 'minor')).toEqual(['A3', 'C4', 'E4']);
    expect(tonicTriad('Eb', 'major')).toEqual(['D#3', 'G3', 'A#3']);
    const eb = prompt('key-signature:Eb');
    expect(d40Sounds(eb, fb(eb, '3b'))).toEqual({ expected: tonicTriad('Eb', 'major') });
    expect(d40Sounds(eb, fb(eb, '3#'))).toEqual({
      expected: tonicTriad('Eb', 'major'),
      given: tonicTriad('A', 'major'),
    });
    expect(d40Sounds(eb, fb(eb, 'x'))).toEqual({ expected: tonicTriad('Eb', 'major') });
    const rel = prompt('relative-minor:C');
    expect(d40Sounds(rel, fb(rel, 'A'))).toEqual({
      expected: [...tonicTriad('C', 'major'), ...tonicTriad('A', 'minor')],
    });
    const v = prompt('dominant:C');
    expect(d40Sounds(v, fb(v, 'F')).given).toEqual([
      ...tonicTriad('C', 'major'),
      ...tonicTriad('F', 'major'),
    ]);
  });

  it('answers from the number row', () => {
    expect(d40KeyFor(0)).toBe('1');
    expect(d40KeyFor(7)).toBe('8');
    expect(d40KeyFor(8)).toBeUndefined();
    expect(d40KeyToAnswer('2', ['3#', '3b'])).toBe('3b');
    expect(d40KeyToAnswer('3', ['3#', '3b'])).toBeNull();
    expect(d40KeyToAnswer('a', ['3#'])).toBeNull();
  });
});
