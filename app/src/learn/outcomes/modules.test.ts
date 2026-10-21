import { describe, expect, it } from 'vitest';
import { SKILLS, gatesOf, getSkill, type Skill } from '../../engine';
import { MODULES, moduleOfTopic } from '../../engine/frontier';

/**
 * The module copy Learn shows beside the skill outcomes (M10-07): summaries
 * as outcomes, "Builds on" from the real gates, and misconceptions spoken
 * to the learner (research/02 rule 15; screens copy audit items 3 and 8).
 */

const moduleOf = (skillId: string) => moduleOfTopic(getSkill(skillId)!.topic)?.id;

/**
 * What a module's first skills wait for: the gates, in other modules, of
 * every skill in it whose gates all lie outside it.
 */
function entryGates(moduleId: string): string[] {
  const gates = (s: Skill) => {
    const g = gatesOf(s);
    return [...g.mastered, ...g.practising];
  };
  const entry = SKILLS.filter(
    (s) =>
      moduleOfTopic(s.topic)?.id === moduleId && gates(s).every((id) => moduleOf(id) !== moduleId),
  );
  return [...new Set(entry.flatMap(gates))].sort();
}

/**
 * Each module's entry gates, and what its "Builds on" line must say about
 * them. A gate change fails here: update `unlocksAfter` in engine/frontier.ts
 * to match, then this table.
 */
const BUILDS_ON: Record<string, { gates: string[]; says: RegExp | null }> = {
  'notes-1': { gates: [], says: null },
  'notes-2': {
    gates: ['F2.string5-naturals', 'F2.string6-naturals'],
    says: /natural notes on strings 6 and 5/,
  },
  intervals: {
    gates: ['C1.octaves', 'F1.half-steps', 'F1.whole-steps'],
    says: /^Half and whole steps, and octave shapes$/,
  },
  keys: { gates: ['F1.half-steps', 'F1.whole-steps'], says: /^Half and whole steps$/ },
  chords: { gates: ['C3.thirds', 'C4.sharp-keys'], says: /3rds.*sharp keys/ },
  harmony: { gates: ['C4.sharp-key-degrees', 'C5.triads'], says: /Triads.*scale degrees/ },
  // Listed after Harmony on the map, but it opens with the sharp keys (M10-03).
  'key-signatures': { gates: ['C4.sharp-keys'], says: /sharp keys.*doesn’t wait for Harmony/ },
  progressions: {
    gates: ['C4.sharp-keys', 'C5.triads', 'C8.numerals-major'],
    says: /Triads and Roman numerals.*capo.*triads and the sharp keys/,
  },
  caged: {
    gates: ['C5.triads', 'F2.string5-naturals', 'F2.string6-naturals'],
    says: /strings 6 and 5, and triads/,
  },
  pentatonic: { gates: ['C6.minor-cores'], says: /minor CAGED cores/ },
  triads: { gates: ['C6.triad-cores'], says: /CAGED triad cores/ },
  // M6-10 QA: it waits on chords too, not only CAGED and pentatonic.
  arpeggios: {
    gates: ['C5.tones-sevenths', 'C6.dominant7-shapes', 'C7.minor-boxes'],
    says: /3rd and 7th in 7th-chord shapes.*dominant 7 CAGED shapes.*minor pentatonic boxes/,
  },
  'minor-function': { gates: ['C9.minor', 'C9.pop'], says: /Pop and minor-key progressions/ },
  // M6-10 QA: its gate is the major boxes, not CAGED alone.
  scales: { gates: ['C7.major-boxes'], says: /major pentatonic boxes/ },
  advanced: { gates: [], says: null },
  rhythm: { gates: [], says: null },
  // From day one: its first sets need only the musical alphabet.
  ear: { gates: ['C9.pop', 'F1.alphabet', 'F2.string6-naturals'], says: null },
  meter: { gates: [], says: /^Rhythm$/ },
  reading: { gates: [], says: /strings 6 and 5, and time signatures/ },
  tab: { gates: ['F3.markers'], says: /fret markers/ },
};

describe('module "Builds on" lines', () => {
  it('cover every module', () => {
    expect(Object.keys(BUILDS_ON).sort()).toEqual(MODULES.map((m) => m.id).sort());
  });

  for (const m of MODULES) {
    it(`match ${m.id}’s real gates`, () => {
      const { gates, says } = BUILDS_ON[m.id]!;
      expect(entryGates(m.id), 'gates changed: update unlocksAfter').toEqual(gates);
      if (says === null) expect(m.unlocksAfter).toBeNull();
      else expect(m.unlocksAfter).toMatch(says);
    });
  }

  it('read as plain words, not engineering notes', () => {
    for (const m of MODULES) {
      if (!m.unlocksAfter) continue;
      expect(m.unlocksAfter, m.id).not.toMatch(/softly|\b[FCIRT]\d+\b|\(and,/);
    }
  });
});

describe('module summaries', () => {
  it('say what the learner will be able to do, not list topics', () => {
    for (const m of MODULES) {
      // An outcome opens on a verb; a table of contents on "The …" or a noun list.
      expect(m.summary, m.id).toMatch(
        /^(Name|Find|Spell|Say|Build|Play|Make|Colour|Keep|Recognise|Read)\b/,
      );
      expect(m.summary, m.id).toMatch(/\.$/);
    }
  });
});

describe('misconception callouts', () => {
  const callouts = MODULES.filter((m) => m.misconception);

  it('speak to the learner, not about them', () => {
    for (const m of callouts) {
      const text = m.misconception!;
      expect(text, m.id).not.toMatch(/\blearners?\b|\bget neglected\b|“Box prison”/i);
      // "you", or a sentence that tells the learner what to do.
      expect(text, m.id).toMatch(
        /\byou(r|’re|’ll)?\b|(^|[.:] )(Give|Use|Don’t|Expect|Read|Keep|Remember|When [^,]+, move)\b/i,
      );
    }
  });

  it('cover Keys and Harmony too', () => {
    for (const id of ['keys', 'harmony', 'key-signatures'])
      expect(MODULES.find((m) => m.id === id)?.misconception, id).toBeTruthy();
  });

  it('write flats and sharps as ♭ and ♯', () => {
    for (const m of MODULES) {
      for (const text of [m.summary, m.misconception ?? '', m.unlocksAfter ?? '']) {
        expect(text, m.id).not.toMatch(/\bb\d|[A-G]#|\b[A-G]b\b/);
      }
    }
  });
});
