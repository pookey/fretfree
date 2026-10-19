import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../../engine/config';
import { SKILLS } from '../../engine/skills';
import { DROP_D_TUNING, STANDARD_TUNING, chromaOf, midiAt, type Tuning } from '../../theory';
import type { DrillContext, DrillFeedback } from '../types';
import {
  D17_SCOPE,
  d17Accepts,
  d17CanTest,
  d17Check,
  d17ConceptOf,
  d17DescribeAnswer,
  d17Expected,
  d17Explain,
  d17FeedbackPositions,
  d17Fingering,
  d17GradedResponseMs,
  d17Hand,
  d17Hint,
  d17Judge,
  d17MakePrompt,
  d17PlaybackMs,
  d17Replay,
  d17ScopeFor,
  d17Sounds,
  d17Task,
  d17Window,
  d17WorkedExample,
  pretty,
  type D17Answer,
  type D17Prompt,
} from './logic';

const CFG = ENGINE_CONFIG.playSequence;

function ctx(rng = 0.5, scopeLevel = 0, tuning: Tuning = STANDARD_TUNING): DrillContext {
  return { tuning, accidentalPref: 'sharp', scopeLevel, rng: () => rng };
}

/** Root frets 1–12 are the options for a shape from string 6; this picks fret 5 (A). */
const AT_A = ctx(4.5 / 12);

const item = (id: string) => ({ id, skillId: 'sk' });
const prompt = (id: string, c: DrillContext = ctx()) => d17MakePrompt(item(id), c);
const offsets = (p: D17Prompt) => p.steps.map((s) => s.midi - p.steps[0]!.midi);
const fb = (p: D17Prompt, answer: D17Answer): DrillFeedback<D17Answer> => ({
  answer,
  result: d17Check(p, answer),
});

/** Every item D17 serves, from the skills that name it. */
const SERVED = SKILLS.filter((s) => s.drillTypes.includes('play-sequence'))
  .flatMap((s) => s.items())
  .filter(d17CanTest);

describe('D17 items', () => {
  it('tests the tap direction of intervals, key spellings and chord spellings', () => {
    expect(d17CanTest(item('interval:M3@s6→s5'))).toBe(true);
    expect(d17CanTest(item('spell-key:F#'))).toBe(true);
    expect(d17CanTest(item('spell-chord:m7@B'))).toBe(true);
    expect(d17CanTest(item('interval-name:M3@s6→s5'))).toBe(false);
    expect(d17CanTest(item('degree:6@Eb'))).toBe(false);
    expect(d17CanTest(item('note@s6f5'))).toBe(false);
  });

  it('is named by the C3, C4 and C5 skills', () => {
    const topics = new Set(
      SKILLS.filter((s) => s.drillTypes.includes('play-sequence')).map((s) => s.topic),
    );
    expect([...topics].sort()).toEqual(['C3', 'C4', 'C5']);
    expect(SERVED.length).toBeGreaterThan(50);
  });

  it('places every item it serves, in standard and drop D tuning, at any rng', () => {
    for (const tuning of [STANDARD_TUNING, DROP_D_TUNING]) {
      for (const rng of [0, 0.37, 0.999]) {
        for (const i of SERVED) {
          const p = d17MakePrompt(i, ctx(rng, 0, tuning));
          for (const s of p.steps) {
            expect(midiAt(s.position, tuning), i.id).toBe(s.midi);
            expect(s.position.fret, i.id).toBeGreaterThanOrEqual(0);
            expect(s.position.fret, i.id).toBeLessThanOrEqual(CFG.maxFret);
          }
          // Rising, and every note is its spelled pitch class.
          for (let k = 1; k < p.steps.length; k++) {
            expect(p.steps[k]!.midi, i.id).toBeGreaterThan(p.steps[k - 1]!.midi);
          }
          for (const s of p.steps) expect(s.midi % 12, i.id).toBe(chromaOf(s.note));
        }
      }
    }
  });

  it('rejects items it cannot test', () => {
    expect(() => prompt('note@s6f5')).toThrow(/cannot test/);
    // A 6-string shape on a 4-string tuning.
    const bass: Tuning = { id: 'bass', name: 'Bass', notes: ['E1', 'A1', 'D2', 'G2'] };
    expect(() => d17MakePrompt(item('interval:M3@s6→s5'), ctx(0.5, 0, bass))).toThrow(
      /cannot test/,
    );
  });
});

describe('d17MakePrompt', () => {
  it('plays an interval shape from a fresh root on its own strings (rule 12)', () => {
    const a = prompt('interval:M3@s6→s5', ctx(0));
    const b = prompt('interval:M3@s6→s5', ctx(0.99));
    for (const p of [a, b]) {
      expect(p.kind).toBe('interval');
      expect(p.interval).toBe('M3');
      expect(p.subject).toBe('major 3rd');
      expect(offsets(p)).toEqual([0, 4]);
      expect(p.steps.map((s) => s.label)).toEqual(['1', '3']);
      expect(p.steps[0]!.position.string).toBe(6);
      expect(p.steps[1]!.position.string).toBe(5);
    }
    expect(a.steps[0]!.position.fret).not.toBe(b.steps[0]!.position.fret);
  });

  it('crosses the G–B pair by pitch', () => {
    const p = prompt('interval:M3@s3→s2', ctx(0));
    expect(p.steps[1]!.position.fret - p.steps[0]!.position.fret).toBe(0);
  });

  it('plays a key as its scale, one octave up, spelled strictly', () => {
    const p = prompt('spell-key:F#');
    expect(p.kind).toBe('scale');
    expect(p.subject).toBe('F♯ major scale');
    expect(p.steps.map((s) => s.note)).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#', 'F#']);
    expect(offsets(p)).toEqual([0, 2, 4, 5, 7, 9, 11, 12]);
    expect(p.steps.map((s) => s.label)).toEqual(['1', '2', '3', '4', '5', '6', '7', '1']);
  });

  it('plays a chord as its arpeggio, root up', () => {
    const p = prompt('spell-chord:m7@B');
    expect(p.kind).toBe('arpeggio');
    expect(p.subject).toBe('Bm7');
    expect(p.steps.map((s) => s.note)).toEqual(['B', 'D', 'F#', 'A']);
    expect(offsets(p)).toEqual([0, 3, 7, 10]);
    expect(p.steps.map((s) => s.label)).toEqual(['1', 'b3', '5', 'b7']);
    expect(offsets(prompt('spell-chord:add9@C'))).toEqual([0, 4, 7, 14]);
  });

  it('keeps the fingering under one hand, with a window for compact screens', () => {
    const p = prompt('spell-key:G', ctx(0));
    const hand = d17Hand(p.steps[0]!.position.fret);
    for (const s of p.steps) {
      expect(s.position.fret).toBeGreaterThanOrEqual(hand.from);
      expect(s.position.fret).toBeLessThanOrEqual(hand.to);
    }
    expect(p.span.from).toBeGreaterThanOrEqual(p.window.from);
    expect(p.span.to).toBeLessThanOrEqual(p.window.to);
    expect(p.window.to - p.window.from + 1).toBeGreaterThanOrEqual(5);
  });

  it('maps scope levels to placed, then anywhere', () => {
    expect(D17_SCOPE).toEqual({ minLevel: 0, maxLevel: 1 });
    expect(prompt('spell-key:C', ctx(0.5, 0)).scope).toBe('placed');
    expect(prompt('spell-key:C', ctx(0.5, 1)).scope).toBe('anywhere');
    expect(d17ScopeFor(-1)).toBe('placed');
    expect(d17ScopeFor(9)).toBe('anywhere');
  });
});

describe('d17Fingering', () => {
  it('stays on a string while the next note fits under the hand', () => {
    // G major from string 6, fret 3: the familiar one-position pattern.
    expect(
      d17Fingering({ string: 6, fret: 3 }, [0, 2, 4, 5, 7, 9, 11, 12], STANDARD_TUNING),
    ).toEqual([
      { string: 6, fret: 3 },
      { string: 6, fret: 5 },
      { string: 5, fret: 2 },
      { string: 5, fret: 3 },
      { string: 5, fret: 5 },
      { string: 4, fret: 2 },
      { string: 4, fret: 4 },
      { string: 4, fret: 5 },
    ]);
  });

  it('gives up when a note is out of reach', () => {
    expect(d17Fingering({ string: 1, fret: 5 }, [0, 7], STANDARD_TUNING)).toBeNull();
  });

  it('keeps windows on the neck', () => {
    expect(d17Window({ from: 0, to: 2 })).toEqual({ from: 0, to: 4 });
    expect(d17Window({ from: 14, to: 15 })).toEqual({ from: 11, to: 15 });
    expect(d17Window({ from: 3, to: 9 })).toEqual({ from: 3, to: 9 });
  });
});

describe('hearing the sequence', () => {
  // A at string 6 fret 5 (MIDI 45), then the M3: C#3 (49).
  const third = prompt('interval:M3@s6→s5', AT_A);
  const root = third.steps[0]!.midi;

  it('starts on the root in any octave, then measures from the note played', () => {
    expect(d17Judge(third, [], root)).toBe('next');
    expect(d17Judge(third, [], root + 24)).toBe('next');
    expect(d17Judge(third, [], root + 1)).toBe('wrong');
    expect(d17Judge(third, [root + 12], root + 16)).toBe('next');
  });

  it('forgives an octave error on later notes, but not a wrong pitch', () => {
    expect(d17Judge(third, [root], root + 4 + 12)).toBe('next');
    expect(d17Judge(third, [root], root + 4 - 12)).toBe('next');
    expect(d17Judge(third, [root], root + 3)).toBe('wrong');
  });

  it('ignores a credited note heard again (re-picked, or ringing on)', () => {
    expect(d17Judge(third, [root], root)).toBe('repeat');
    const scale = prompt('spell-key:C');
    const c = scale.steps[0]!.midi;
    expect(d17Judge(scale, [c, c + 2, c + 4], c + 2)).toBe('repeat');
    // Once done, nothing more counts.
    expect(d17Judge(third, [root, root + 4], root + 7)).toBe('repeat');
  });

  it("credits the scale's top tonic, though it repeats the root's pitch class", () => {
    const scale = prompt('spell-key:C');
    const c = scale.steps[0]!.midi;
    const run = [0, 2, 4, 5, 7, 9, 11, 12].map((o) => c + o);
    expect(d17Replay(scale, run)).toEqual({ credited: run, wrong: null, status: 'done' });
  });

  it('replays a heard run to where it stands', () => {
    expect(d17Replay(third, [])).toEqual({ credited: [], wrong: null, status: 'listening' });
    expect(d17Replay(third, [root, root])).toEqual({
      credited: [root],
      wrong: null,
      status: 'listening',
    });
    expect(d17Replay(third, [root, root + 3, root + 4])).toEqual({
      credited: [root],
      wrong: root + 3,
      status: 'wrong',
    });
  });

  it('accepts only notes that start after the prompt and after any playback', () => {
    expect(d17Accepts(1000, 900, 0)).toBe(true);
    expect(d17Accepts(1000, 1000, 0)).toBe(true);
    expect(d17Accepts(899, 900, 0)).toBe(false);
    expect(d17Accepts(1000, 900, 1200)).toBe(false);
  });

  it('times the playback of a miss as the session plays it', () => {
    expect(d17PlaybackMs(0)).toBe(0);
    expect(d17PlaybackMs(1)).toBe(CFG.playbackTailMs);
    expect(d17PlaybackMs(8)).toBe(7 * CFG.playbackGapMs + CFG.playbackTailMs);
  });
});

describe('d17Check', () => {
  const third = prompt('interval:M3@s6→s5', AT_A);
  const root = third.steps[0]!.midi;

  it('is correct once the whole sequence is heard', () => {
    expect(d17Check(third, { played: [root, root + 4] })).toEqual({
      correct: true,
      expected: 'A C♯',
      concept: 'M3',
    });
    expect(d17Check(third, { played: [root] }).correct).toBe(false);
  });

  it('logs a wrong interval as confused with the one played (rule 6)', () => {
    expect(d17Check(third, { played: [root, root + 3] })).toEqual({
      correct: false,
      expected: 'A C♯',
      concept: 'M3',
      confusedWith: 'm3',
    });
    // A wrong start has nothing to measure from.
    expect(d17Check(third, { played: [root + 1] }).confusedWith).toBeUndefined();
  });

  it('logs a major triad played with a minor 3rd as the triad pair', () => {
    const c = prompt('spell-chord:major@C');
    const r = c.steps[0]!.midi;
    expect(d17Check(c, { played: [r, r + 3] })).toMatchObject({
      correct: false,
      concept: 'triad:maj',
      confusedWith: 'triad:min',
    });
    const am = prompt('spell-chord:minor@A');
    const a = am.steps[0]!.midi;
    expect(d17Check(am, { played: [a, a + 4] }).confusedWith).toBe('triad:maj');
    expect(d17Check(am, { played: [a, a + 5] }).confusedWith).toBeUndefined();
  });

  it('counts "Show me" as a miss, whatever was heard', () => {
    expect(d17Check(third, { played: [root, root + 4], gaveUp: true }).correct).toBe(false);
  });
});

describe('plugin hooks', () => {
  const scale = prompt('spell-key:D');
  const d = scale.steps[0]!.midi;
  const run = [0, 2, 4, 5, 7, 9, 11, 12].map((o) => d + o);

  it('grades listening time per note, less the detector delay', () => {
    const answer = { played: run, responseMs: 4150 };
    expect(d17GradedResponseMs(scale, answer, 9000)).toBe((4150 - CFG.micLatencyMs) / 8);
    expect(d17GradedResponseMs(scale, { played: run }, 1750)).toBe((1750 - CFG.micLatencyMs) / 8);
    expect(d17GradedResponseMs(scale, { played: run }, 50)).toBe(0);
  });

  it('plays nothing after a hit and the sequence after a miss', () => {
    expect(d17Sounds(scale, fb(scale, { played: run }))).toEqual({ expected: [] });
    expect(d17Sounds(scale, fb(scale, { played: [d, d + 1] })).expected).toHaveLength(8);
    expect(d17Sounds(scale, fb(scale, { played: [], gaveUp: true })).expected[0]).toMatch(/^D\d$/);
  });

  it('shows the fingering in feedback, and no played cell', () => {
    const pos = d17FeedbackPositions(scale, fb(scale, { played: [d] }));
    expect(pos.expected).toEqual(scale.steps.map((s) => s.position));
    expect(pos.given).toEqual([]);
  });

  it('keys concepts like the drills it shares items with', () => {
    expect(d17ConceptOf(item('interval:M3@s6→s5'))).toBe('M3');
    expect(d17ConceptOf(item('spell-key:Bb'))).toBe('key:Bb');
    expect(d17ConceptOf(item('spell-chord:major@C'))).toBe('triad:maj');
    expect(d17ConceptOf(item('spell-chord:minor@A'))).toBe('triad:min');
    expect(d17ConceptOf(item('spell-chord:m7@B'))).toBe('chord:m7');
    expect(d17ConceptOf(item('note@s6f5'))).toBeNull();
  });

  it('describes the answer by the pitches heard', () => {
    expect(d17DescribeAnswer({ played: [45, 49] })).toBe('A2 C#3');
    expect(d17DescribeAnswer({ played: [45], gaveUp: true })).toBe('A2 (show me)');
    expect(d17DescribeAnswer({ played: [], gaveUp: true })).toBe('(show me)');
  });
});

describe('words', () => {
  it('prettifies accidentals', () => {
    expect(pretty('F#')).toBe('F♯');
    expect(pretty('Bb')).toBe('B♭');
    expect(pretty('Ebb')).toBe('E𝄫');
    expect(pretty('C##')).toBe('C𝄪');
    expect(pretty('B')).toBe('B');
  });

  it('asks for each kind of sequence', () => {
    expect(d17Task(prompt('interval:M3@s6→s5', AT_A))).toBe('Play A, then the major 3rd above it.');
    expect(d17Task(prompt('spell-key:F#'))).toBe('Play the F♯ major scale, one octave up from F♯.');
    expect(d17Task(prompt('spell-chord:m7@B'))).toBe('Play Bm7 one note at a time, from B up.');
  });

  it('hints at the construction, never the notes', () => {
    expect(d17Hint(prompt('interval:M3@s6→s5'))).toBe('4 half steps up from the root.');
    expect(d17Hint(prompt('interval:m2@s6→s5'))).toBe('1 half step up from the root.');
    expect(d17Hint(prompt('spell-key:F#'))).toBe('Whole and half steps: W W H W W W H.');
    expect(d17Hint(prompt('spell-chord:m7@B'))).toBe('Chord tones: 1 ♭3 5 ♭7.');
  });

  it('walks through a worked example', () => {
    expect(d17WorkedExample(prompt('interval:M3@s6→s5', AT_A))).toMatch(/numbered dots.*A C♯\.$/);
  });

  it('explains hits, misses and "Show me"', () => {
    const p = prompt('spell-chord:m7@B');
    const b = p.steps[0]!.midi;
    expect(d17Expected(p)).toBe('B D F♯ A');
    expect(d17Explain(p, fb(p, { played: [b, b + 3, b + 7, b + 10] }))).toBe(
      'You played B D F♯ A.',
    );
    expect(d17Explain(p, fb(p, { played: [b, b + 4] }))).toBe(
      'You played D♯. After B comes D. It goes B D F♯ A.',
    );
    expect(d17Explain(p, fb(p, { played: [b + 2] }))).toBe(
      'You played C♯. Start on the root, B. It goes B D F♯ A.',
    );
    expect(d17Explain(p, fb(p, { played: [b], gaveUp: true }))).toBe(
      "It goes B D F♯ A. Play it along once you've heard it.",
    );
    // A miss with no wrong note: the attempt ended unfinished.
    expect(
      d17Explain(p, { answer: { played: [b] }, result: { correct: false, expected: '' } }),
    ).toBe('It goes B D F♯ A.');
  });
});
