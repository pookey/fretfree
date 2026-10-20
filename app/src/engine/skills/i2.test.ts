import { describe, expect, it } from 'vitest';
import {
  d8CanTest,
  d8Check,
  d8ConceptOf,
  d8MakePrompt,
  d8Targets,
} from '../../drills/d8-chord-tone/logic';
import { templatesFor } from '../../drills/d8-chord-tone/voicings';
import { STANDARD_TUNING } from '../../theory';
import { deriveStatus } from '../mastery';
import { parseChordToneItemId, type SkillStatus } from '../model';
import { I2_KINDS, skills } from './i2';
import { SKILLS, getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

const STAGES = ['I2.sevenths-roots', 'I2.sevenths-fifths'];

/** First `first`, then a seeded LCG: the first draw picks D8's voicing. */
function rngFrom(first: number, seed: number): () => number {
  let s = seed;
  let used = false;
  return () => {
    if (!used) {
      used = true;
      return first;
    }
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

describe('I2 arpeggio stages', () => {
  it('runs root → 5th of the 7th chords, after Pentatonic', () => {
    expect(skills.map((s) => s.id)).toEqual(STAGES);
    const orders = skills.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(orders[0]).toBeGreaterThan(getSkill('C7.relative')!.order);
    for (const s of skills) {
      expect(s.topic).toBe('I2');
      expect(s.drillTypes).toEqual(['chord-tone']);
    }
  });

  it('opens after CAGED, Pentatonic and the 7th-chord 3rds and 7ths (rule 7)', () => {
    expect(getSkill('I2.sevenths-roots')!.prerequisites).toEqual([
      'C5.tones-sevenths',
      'C6.dominant7-shapes',
      'C7.minor-boxes',
    ]);
    expect(getSkill('I2.sevenths-fifths')!.prerequisites).toEqual(['I2.sevenths-roots']);
    for (const s of skills) expect(s.softUnlock).toBeFalsy();
  });

  it('opens the 5th stage only once the root stage is mastered', () => {
    const fifths = getSkill('I2.sevenths-fifths')!;
    const status = (before: SkillStatus) =>
      deriveStatus(fifths, new Map([['I2.sevenths-roots', before]]), undefined);
    expect(status('unlocked')).toBe('locked');
    expect(status('practising')).toBe('locked');
    expect(status('mastered')).toBe('unlocked');
  });

  it('enters tap then name per kind, 7 next to maj7 next to m7', () => {
    expect(ids('I2.sevenths-roots')).toEqual([
      'chord-tone:1@7',
      'chord-tone-name:1@7',
      'chord-tone:1@maj7',
      'chord-tone-name:1@maj7',
      'chord-tone:1@m7',
      'chord-tone-name:1@m7',
    ]);
    expect(ids('I2.sevenths-fifths')).toEqual([
      'chord-tone:5@7',
      'chord-tone-name:5@7',
      'chord-tone:5@maj7',
      'chord-tone-name:5@maj7',
      'chord-tone:5@m7',
      'chord-tone-name:5@m7',
    ]);
  });

  it("completes each 7th chord's tones with C5's 3rd and 7th cards", () => {
    const toneSkills = [getSkill('C5.tones-sevenths')!, ...skills];
    for (const kind of I2_KINDS) {
      const degrees = toneSkills
        .flatMap((s) => s.items())
        .map((i) => parseChordToneItemId(i.id)!)
        .filter((r) => r.chord === kind && r.kind === 'chord-tone')
        .map((r) => r.degree);
      expect(new Set(degrees).size, kind).toBe(4);
    }
  });

  it('holds no card another skill holds', () => {
    const mine = new Set(skills.flatMap((s) => ids(s.id)));
    for (const s of SKILLS) {
      if (s.topic === 'I2') continue;
      for (const item of s.items()) expect(mine.has(item.id), item.id).toBe(false);
    }
  });

  it('keeps every stage out of the placement test', () => {
    for (const id of STAGES) expect(getSkill(id)!.skipPlacement).toBe(true);
  });
});

describe('I2 on D8', () => {
  const items = skills.flatMap((s) => s.items());

  it('asks only cards D8 can test, keyed by interval', () => {
    for (const item of items) {
      expect(d8CanTest(item), item.id).toBe(true);
      const degree = parseChordToneItemId(item.id)!.degree;
      expect(d8ConceptOf(item)).toBe(degree === '1' ? 'P1' : 'P5');
    }
  });

  it('has voicings of each kind with the asked degree in them', () => {
    for (const kind of I2_KINDS) {
      for (const degree of ['1', '5']) {
        const holding = templatesFor(kind).filter((t) => t.notes.some((n) => n.degree === degree));
        expect(holding.length, `${degree}@${kind}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('builds a gradable prompt for every card, in every voicing and scope', () => {
    for (const item of items) {
      const voicings = templatesFor(parseChordToneItemId(item.id)!.chord).length;
      for (let v = 0; v < voicings; v++) {
        for (let seed = 1; seed <= 12; seed++) {
          const prompt = d8MakePrompt(item, {
            tuning: STANDARD_TUNING,
            accidentalPref: seed % 2 ? 'sharp' : 'flat',
            scopeLevel: seed % 3,
            rng: rngFrom((v + 0.5) / voicings, seed),
          });
          const where = `${item.id} voicing ${v} seed ${seed}`;
          const targets = d8Targets(prompt);
          expect(targets.length, where).toBeGreaterThan(0);
          const answer = prompt.mode === 'tap' ? targets[0]! : prompt.degree;
          expect(d8Check(prompt, answer).correct, where).toBe(true);
          if (prompt.mode === 'name') {
            expect(prompt.ringed?.degree, where).toBe(prompt.degree);
            expect(prompt.choices, where).toContain(prompt.degree);
          }
        }
      }
    }
  });

  it('never draws the C-shape 7 for its 5th, which the voicing leaves out', () => {
    const fifth = items.find((i) => i.id === 'chord-tone:5@7')!;
    const voicings = templatesFor('7').length;
    for (let v = 0; v < voicings; v++) {
      const prompt = d8MakePrompt(fifth, {
        tuning: STANDARD_TUNING,
        accidentalPref: 'sharp',
        scopeLevel: 1,
        rng: rngFrom((v + 0.5) / voicings, v + 1),
      });
      expect(prompt.shape).not.toBe('C');
    }
  });
});
