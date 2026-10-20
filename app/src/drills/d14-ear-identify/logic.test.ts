import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../../engine/config';
import { getSkill, SKILLS } from '../../engine/skills';
import { midiAt, STANDARD_TUNING, getTuning, type Tuning } from '../../theory';
import { getDrill } from '../registry';
import {
  D14_VOICINGS,
  chordMidis,
  d14AllChoices,
  d14Chart,
  d14Check,
  d14Choices,
  d14Clip,
  d14ConceptOf,
  d14DescribeAnswer,
  d14GradedResponseMs,
  d14KeyFor,
  d14KeyOf,
  d14KeyToAnswer,
  d14LastOnsetS,
  d14LongName,
  d14MakePrompt,
  d14NeckNotes,
  d14ShortName,
  d14Sounds,
  degreeOf,
  intervalMidis,
  placeOnNeck,
  pretty,
  type D14Kind,
  type D14Prompt,
} from './logic';

const CONFIG = ENGINE_CONFIG.earIdentify;

function prompt(id: string, scopeLevel = 0, r = 0, accidentalPref: 'sharp' | 'flat' = 'sharp') {
  return d14MakePrompt(
    { id, skillId: 'I6.test' },
    { tuning: STANDARD_TUNING, accidentalPref, scopeLevel, rng: () => r },
  );
}

/** An rng that returns these values in turn. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] as number;
}

const KINDS: readonly D14Kind[] = ['interval', 'chord', 'progression'];

describe('D14 prompts', () => {
  it('serves every I6 item, and only those', () => {
    const drill = getDrill('ear-identify')!;
    const items = SKILLS.filter((s) => s.topic === 'I6').flatMap((s) => s.items());
    expect(items.length).toBeGreaterThan(40);
    for (const item of items) expect(drill.canTest(item), item.id).toBe(true);
    expect(drill.canTest({ id: 'prog:I-V-vi-IV:build', skillId: 'C9.pop' })).toBe(false);
    expect(drill.skills).toEqual(SKILLS.filter((s) => s.topic === 'I6').map((s) => s.id));
    expect(() => prompt('note@s6f5')).toThrow(/cannot test/);
  });

  it('plays a rising interval from a random first note between C3 and C4', () => {
    const low = prompt('ear-interval:M3:up', 0, 0);
    expect(low).toMatchObject({ kind: 'interval', direction: 'up', answer: 'M3', anchor: 48 });
    expect(prompt('ear-interval:M3:up', 0, 0.999).anchor).toBe(60);
    // A falling interval starts on its top note, so it falls into the same range.
    expect(prompt('ear-interval:M3:down', 0, 0).anchor).toBe(52);
  });

  it('strums a chord from a random bass, and plays a progression in a random key', () => {
    expect(prompt('ear-chord:minor', 0, 0)).toMatchObject({ kind: 'chord', anchor: 40 });
    expect(prompt('ear-chord:minor', 0, 0.999).anchor).toBe(52);
    const p = prompt('prog:I-V-vi-IV:ear', 0, 0.5);
    expect(p).toMatchObject({ kind: 'progression', direction: null, anchor: 6 });
  });

  it('keeps the accidental preference for the notes it names', () => {
    expect(prompt('ear-chord:major', 0, 0.1, 'flat').pref).toBe('flat');
  });
});

describe('D14 choices', () => {
  it('offers the answer’s own set at level 0', () => {
    expect(prompt('ear-interval:M3:up').choices).toEqual(['m3', 'M3']);
    expect(prompt('ear-interval:P5:down').choices).toEqual(['P4', 'P5', 'P8']);
    expect(prompt('ear-chord:major').choices).toEqual(['major', 'minor']);
    expect(prompt('prog:vi-IV-I-V:ear').choices).toEqual([
      'I-IV-V',
      'I-V-vi-IV',
      'vi-IV-I-V',
      'I-vi-IV-V',
    ]);
  });

  it('widens to two neighbouring sets, then every sound (rule 5)', () => {
    expect(d14Choices('interval', 'M3', 1, () => 0)).toEqual(['m2', 'M2', 'm3', 'M3', 'm6', 'M6']);
    expect(d14Choices('interval', 'M3', 1, () => 0.9)).toEqual(['m3', 'M3', 'P4', 'P5', 'P8']);
    expect(d14Choices('interval', 'M3', 2, () => 0)).toHaveLength(12);
    expect(d14Choices('chord', '7', 2, () => 0)).toEqual(d14AllChoices('chord'));
    // Out-of-range levels clamp.
    expect(d14Choices('chord', 'major', -3, () => 0)).toEqual(['major', 'minor']);
    expect(d14Choices('chord', 'major', 9, () => 0)).toHaveLength(8);
    expect(() => d14Choices('chord', 'power', 0, () => 0)).toThrow(RangeError);
  });

  it('lists intervals by size', () => {
    expect(d14AllChoices('interval')).toEqual([
      'm2',
      'M2',
      'm3',
      'M3',
      'P4',
      'TT',
      'P5',
      'm6',
      'M6',
      'm7',
      'M7',
      'P8',
    ]);
  });

  it('gives nothing away: any button could be the answer to that set of buttons', () => {
    // The rng picks the window's start: these reach every start.
    const draws = [0, 0.5, 0.99];
    for (const kind of KINDS) {
      for (let level = 0; level <= 2; level++) {
        const sets = new Map<string, Set<string>>();
        for (const answer of d14AllChoices(kind)) {
          for (const r of draws) {
            const choices = d14Choices(kind, answer, level, () => r);
            expect(choices, `${kind} ${answer}`).toContain(answer);
            const key = choices.join(',');
            if (!sets.has(key)) sets.set(key, new Set());
            sets.get(key)!.add(answer);
          }
        }
        for (const [key, answers] of sets) {
          expect([...answers].sort(), `${kind} L${level}: ${key}`).toEqual(key.split(',').sort());
        }
      }
    }
  });
});

describe('D14 grading', () => {
  it('marks the answer right, and keys a slip by the shared concepts (rule 6)', () => {
    const p = prompt('ear-interval:M3:up');
    expect(d14Check(p, 'M3')).toEqual({ correct: true, expected: 'major 3rd', concept: 'M3' });
    expect(d14Check(p, 'm3')).toEqual({
      correct: false,
      expected: 'major 3rd',
      concept: 'M3',
      confusedWith: 'm3',
    });
    // A choice that wasn't offered isn't a confusion.
    expect(d14Check(p, 'P5')).not.toHaveProperty('confusedWith');

    const chord = prompt('ear-chord:major');
    expect(d14Check(chord, 'minor')).toMatchObject({
      expected: 'major chord',
      concept: 'triad:maj',
      confusedWith: 'triad:min',
    });
    expect(d14Check(prompt('ear-chord:7', 2), 'maj7')).toMatchObject({
      concept: 'chord:7',
      confusedWith: 'chord:maj7',
    });
    expect(d14Check(prompt('prog:I-V-vi-IV:ear'), 'vi-IV-I-V')).toMatchObject({
      expected: 'I–V–vi–IV',
      concept: 'prog:I-V-vi-IV',
      confusedWith: 'prog:vi-IV-I-V',
    });
  });

  it('keys each item by its concept for the session’s pairing', () => {
    expect(d14ConceptOf({ id: 'ear-interval:TT:down', skillId: 'x' })).toBe('TT');
    expect(d14ConceptOf({ id: 'ear-chord:minor', skillId: 'x' })).toBe('triad:min');
    expect(d14ConceptOf({ id: 'ear-chord:diminished', skillId: 'x' })).toBe('chord:diminished');
    expect(d14ConceptOf({ id: 'prog:ii-V-I:ear', skillId: 'x' })).toBe('prog:ii-V-I');
    expect(d14ConceptOf({ id: 'note@s6f5', skillId: 'x' })).toBeNull();
  });

  it('logs the choice as given, and leaves the sound to the view', () => {
    const p = prompt('ear-chord:major');
    expect(d14DescribeAnswer('minor')).toBe('minor');
    expect(d14Sounds(p, { answer: 'minor', result: d14Check(p, 'minor') })).toEqual({
      expected: [],
    });
  });

  it('grades the time after the clip has been heard', () => {
    const listen = CONFIG.listenMs;
    const rising = prompt('ear-interval:M3:up');
    const gapMs = CONFIG.intervalGapS * 1000;
    expect(d14GradedResponseMs(rising, 'M3', gapMs + listen + 1500)).toBeCloseTo(1500);
    expect(d14GradedResponseMs(rising, 'M3', 100)).toBe(0);
    const together = prompt('ear-interval:M3:together');
    expect(d14GradedResponseMs(together, 'M3', listen + 900)).toBeCloseTo(900);
    const chord = prompt('ear-chord:minor');
    expect(d14GradedResponseMs(chord, 'minor', listen + 700)).toBeCloseTo(700);
    // Four chords: the last starts three chords in.
    const prog = prompt('prog:I-V-vi-IV:ear');
    const chordMs = (CONFIG.progression.beatsPerChord * 60_000) / CONFIG.progression.bpm;
    expect(d14GradedResponseMs(prog, 'I-V-vi-IV', 3 * chordMs + listen + 2000)).toBeCloseTo(2000);
  });
});

describe('D14 clips', () => {
  it('plays an interval rising, falling or together from the same first note', () => {
    expect(intervalMidis(48, 'M3', 'up')).toEqual([48, 52]);
    expect(intervalMidis(52, 'M3', 'down')).toEqual([52, 48]);
    expect(intervalMidis(48, 'P8', 'together')).toEqual([48, 60]);

    const up = prompt('ear-interval:M3:up');
    expect(d14Clip(up, 'M3')).toEqual({ type: 'notes', notes: ['C3', 'E3'], gap: 0.8 });
    // A wrong answer is heard on the same first note.
    expect(d14Clip(up, 'm3')).toEqual({ type: 'notes', notes: ['C3', 'D#3'], gap: 0.8 });
    const down = prompt('ear-interval:M3:down');
    expect(d14Clip(down, 'm3')).toEqual({ type: 'notes', notes: ['E3', 'C#3'], gap: 0.8 });
    expect(d14Clip(prompt('ear-interval:P5:together'), 'P5')).toMatchObject({
      notes: ['C3', 'G3'],
      gap: 0,
    });
  });

  it('strums every quality in the same grip on the same bass', () => {
    const p = prompt('ear-chord:major'); // Bass E2.
    expect(d14Clip(p, 'major')).toEqual({ type: 'strum', notes: ['E2', 'B2', 'E3', 'G#3'] });
    expect(d14Clip(p, 'minor')).toEqual({ type: 'strum', notes: ['E2', 'B2', 'E3', 'G3'] });
    expect(chordMidis(45, '7')).toEqual([45, 52, 55, 61]); // A7 x0202x.
    expect(() => chordMidis(45, 'sus4')).toThrow(RangeError);
    const flat = prompt('ear-chord:minor', 0, 0.2, 'flat'); // Bass F#2/Gb2.
    expect((d14Clip(flat, 'minor') as { notes: string[] }).notes[0]).toBe('Gb2');
  });

  it('plays a progression one strum per chord in its key, and another in the relative key', () => {
    const p = prompt('prog:I-V-vi-IV:ear', 0, 0); // C major.
    expect(d14KeyOf(p, 'I-V-vi-IV')).toEqual({ tonic: 'C', mode: 'major' });
    expect(d14Chart(p, 'I-V-vi-IV').map((c) => c.symbol)).toEqual(['C', 'G', 'Am', 'F']);
    const clip = d14Clip(p, 'I-V-vi-IV');
    expect(clip).toMatchObject({
      type: 'progression',
      bpm: CONFIG.progression.bpm,
      beatsPerChord: CONFIG.progression.beatsPerChord,
    });
    const chords = (clip as { chords: string[][] }).chords;
    expect(chords).toHaveLength(4);
    // C from its lowest bass, E2 to D♯3: C3.
    expect(chords[0]).toEqual(['C3', 'G3', 'C4', 'E4']);
    expect(chords[2]).toEqual(['A2', 'E3', 'A3', 'C4']);
    // The minor vamp beside a major prompt plays in the relative minor.
    expect(d14KeyOf(p, 'i-bVII-bVI-bVII')).toEqual({ tonic: 'A', mode: 'minor' });
    const minor = prompt('prog:i-bVII-bVI-bVII:ear', 0, 9 / 12); // A minor.
    expect(d14KeyOf(minor, 'i-bVII-bVI-bVII')).toEqual({ tonic: 'A', mode: 'minor' });
    expect(d14KeyOf(minor, 'I-IV-V')).toEqual({ tonic: 'C', mode: 'major' });
    // The blues are dominant 7th chords.
    const blues = d14Clip(prompt('prog:12-bar-blues:ear', 0, 0), '12-bar-blues');
    expect((blues as { chords: string[][] }).chords[0]).toEqual(['C3', 'G3', 'A#3', 'E4']);
  });

  it('knows when each clip’s last sound starts', () => {
    expect(d14LastOnsetS({ type: 'notes', notes: ['C3', 'E3'], gap: 0.8 })).toBeCloseTo(0.8);
    expect(d14LastOnsetS({ type: 'notes', notes: [], gap: 0.8 })).toBe(0);
    expect(d14LastOnsetS({ type: 'strum', notes: ['C3', 'E3'] })).toBe(0);
    expect(
      d14LastOnsetS({ type: 'progression', chords: [[], [], []], bpm: 120, beatsPerChord: 2 }),
    ).toBe(2);
  });
});

describe('D14 on the neck', () => {
  const sound = (pos: { string: number; fret: number }[], tuning: Tuning) =>
    pos.map((p) => midiAt(p, tuning));

  it('places every interval it plays within a hand’s stretch, one string a note', () => {
    // In standard tuning; another tuning may leave a sound with no neck.
    for (const tuning of [STANDARD_TUNING]) {
      for (const interval of d14AllChoices('interval')) {
        for (let low = CONFIG.intervalLow.from; low <= CONFIG.intervalLow.to; low++) {
          // Falling, the same two notes sound top first.
          for (const midis of [
            intervalMidis(low, interval, 'up'),
            intervalMidis(low, interval, 'up').reverse(),
          ]) {
            const pos = placeOnNeck(midis, tuning);
            expect(pos, `${interval} from ${low}`).not.toBeNull();
            expect(sound(pos!, tuning)).toEqual(midis);
            expect(new Set(pos!.map((p) => p.string)).size).toBe(2);
          }
        }
      }
    }
  });

  it('places every chord grip on neighbouring strings', () => {
    for (const kind of Object.keys(D14_VOICINGS)) {
      for (let bass = CONFIG.chordRoot.from; bass <= CONFIG.chordRoot.to; bass++) {
        const midis = chordMidis(bass, kind);
        const pos = placeOnNeck(midis, STANDARD_TUNING);
        expect(pos, `${kind} ${bass}`).not.toBeNull();
        expect(sound(pos!, STANDARD_TUNING)).toEqual(midis);
        const strings = pos!.map((p) => p.string);
        expect(strings[0]! - strings[3]!, `${kind} ${bass}`).toBe(3);
      }
    }
    // A5 open-shape grip: x0222x.
    expect(placeOnNeck(chordMidis(45, 'major'), STANDARD_TUNING)).toEqual([
      { string: 5, fret: 0 },
      { string: 4, fret: 2 },
      { string: 3, fret: 2 },
      { string: 2, fret: 2 },
    ]);
  });

  it('returns null for notes no hand can hold, and keeps the given order', () => {
    // Drop D: C3 is high on string 6, so C3–C♯3 is out of reach across two strings.
    expect(placeOnNeck([48, 49], getTuning('drop-d'))).toBeNull();
    expect(d14NeckNotes(prompt('ear-interval:m2:up'), getTuning('drop-d'))).toBeNull();
    expect(placeOnNeck([40, 41, 42, 43, 44, 45, 46], STANDARD_TUNING)).toBeNull();
    expect(placeOnNeck([30], STANDARD_TUNING)).toBeNull();
    expect(placeOnNeck([52, 48], STANDARD_TUNING)!.map((p) => midiAt(p))).toEqual([52, 48]);
  });

  it('names an interval’s first note and marks a chord’s notes by degree', () => {
    const interval = d14NeckNotes(prompt('ear-interval:M3:down'), STANDARD_TUNING)!;
    expect(interval.map((n) => [n.pc, n.role])).toEqual([
      ['E', 'root'],
      ['C', 'other'],
    ]);
    const chord = d14NeckNotes(prompt('ear-chord:minor'), STANDARD_TUNING)!;
    expect(chord.map((n) => [n.pc, n.role])).toEqual([
      ['E', 'root'],
      ['B', 'fifth'],
      ['E', 'root'],
      ['G', 'third'],
    ]);
    expect(d14NeckNotes(prompt('prog:I-IV-V:ear'), STANDARD_TUNING)).toBeNull();
    expect([0, 12, 3, 4, 6, 7, 8, 10, 11].map(degreeOf)).toEqual([
      'root',
      'root',
      'third',
      'third',
      'fifth',
      'fifth',
      'fifth',
      'seventh',
      'seventh',
    ]);
  });
});

describe('D14 names and keys', () => {
  it('names each choice short on the button and in full', () => {
    expect(d14ShortName('interval', 'M3')).toBe('M3');
    expect(d14LongName('interval', 'TT')).toBe('tritone');
    expect(d14ShortName('chord', 'diminished')).toBe('Dim');
    expect(d14ShortName('chord', 'm7b5')).toBe('m7♭5');
    expect(d14LongName('chord', 'm7b5')).toBe('half-diminished seventh');
    expect(d14ShortName('progression', 'i-bVII-bVI-bVII')).toBe('i–♭VII–♭VI–♭VII');
    expect(d14LongName('progression', '12-bar-blues')).toBe('12-bar blues');
    expect(pretty('F#m')).toBe('F♯m');
    expect(pretty('Bb7')).toBe('B♭7');
  });

  it('answers from the number row, twelve keys deep', () => {
    const choices = d14AllChoices('interval');
    expect(d14KeyFor(0)).toBe('1');
    expect(d14KeyFor(11)).toBe('=');
    expect(d14KeyFor(12)).toBeUndefined();
    expect(d14KeyToAnswer('=', choices)).toBe('P8');
    expect(d14KeyToAnswer('3', ['m3', 'M3'])).toBeNull();
    expect(d14KeyToAnswer('a', choices)).toBeNull();
  });

  it('draws one prompt per item across a whole skill', () => {
    const rng = seq(0.1, 0.7, 0.3);
    for (const item of getSkill('I6.intervals-falling')!.items()) {
      const p: D14Prompt = d14MakePrompt(item, {
        tuning: STANDARD_TUNING,
        accidentalPref: 'sharp',
        scopeLevel: 1,
        rng,
      });
      expect(p.choices).toContain(p.answer);
      expect(p.direction).toBe('down');
    }
  });
});
