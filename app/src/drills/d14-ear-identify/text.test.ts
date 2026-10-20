import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING } from '../../theory';
import { d14MakePrompt } from './logic';
import {
  REFERENCE_TUNES,
  d14Explain,
  d14Fact,
  d14Guide,
  d14KeyName,
  d14Spoken,
  d14SubLabel,
  d14Task,
} from './text';

const prompt = (id: string, scopeLevel = 0, r = 0) =>
  d14MakePrompt(
    { id, skillId: 'I6.test' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => r },
  );

describe('D14 words', () => {
  it('asks how the notes sound', () => {
    expect(d14Task(prompt('ear-interval:M3:up'))).toBe('Which interval? Two notes, rising.');
    expect(d14Task(prompt('ear-interval:M3:down'))).toBe('Which interval? Two notes, falling.');
    expect(d14Task(prompt('ear-interval:M3:together'))).toBe(
      'Which interval? Two notes, played together.',
    );
    expect(d14Task(prompt('ear-chord:major'))).toBe('Which kind of chord?');
    expect(d14Task(prompt('prog:I-IV-V:ear'))).toBe('Which progression?');
  });

  it('names the sound and what it is (rules 8 and 10)', () => {
    expect(d14Fact(prompt('ear-interval:M3:up'))).toBe('Major 3rd, rising: 4 half steps apart.');
    expect(d14Fact(prompt('ear-interval:m2:down'))).toBe('Minor 2nd, falling: 1 half step apart.');
    expect(d14Fact(prompt('ear-chord:minor'))).toBe('Minor chord (1 ♭3 5): darker and sadder.');
    expect(d14Fact(prompt('prog:I-V-vi-IV:ear', 0, 0))).toBe(
      'I–V–vi–IV in C major. The pop progression behind countless chart songs.',
    );
    expect(d14KeyName(prompt('prog:i-bVII-bVI-bVII:ear', 0, 10 / 12))).toBe('B♭ minor');
  });

  it('says how a wrong choice differs', () => {
    const p = prompt('ear-interval:M3:up', 2);
    expect(d14Explain(p, 'm3')).toBe('A minor 3rd is 1 half step narrower.');
    expect(d14Explain(p, 'P5')).toBe('A perfect 5th is 3 half steps wider.');
    expect(d14Explain(p, 'M3')).toBeNull();
    expect(d14Explain(prompt('ear-interval:M3:up'), 'P5')).toBeNull();
    expect(d14Explain(prompt('ear-chord:major'), 'minor')).toBe(
      'A minor chord sounds darker and sadder.',
    );
    const pop = prompt('prog:I-V-vi-IV:ear');
    expect(d14Explain(pop, 'vi-IV-I-V')).toBe(
      'vi–IV–I–V uses the same chords in another order: listen for the chord it starts on.',
    );
    expect(d14Explain(pop, 'I-IV-V')).toBe('I–IV–V has different chords: I–IV–V.');
  });

  it('labels buttons for the ear and for VoiceOver', () => {
    expect(d14Spoken('interval', 'TT')).toBe('tritone');
    expect(d14Spoken('chord', 'maj7')).toBe('major seventh chord');
    expect(d14Spoken('progression', 'vi-IV-I-V')).toBe('vi–IV–I–V');
    expect(d14SubLabel('interval', 'P4')).toBe('perfect 4th');
    expect(d14SubLabel('chord', 'm7b5')).toBe('1 ♭3 ♭5 ♭7');
    expect(d14SubLabel('progression', 'ii-V-I')).toBeNull();
  });

  it('fades the panel: nothing at 0, sizes at 1, what to listen for at 2 (rule 9)', () => {
    const p = prompt('ear-interval:M3:up');
    expect(d14Guide(p, 0)).toEqual([]);
    expect(d14Guide(p, 1)).toEqual([
      { choice: 'm3', name: 'Minor 3rd', detail: '3 half steps', cue: null },
      { choice: 'M3', name: 'Major 3rd', detail: '4 half steps', cue: null },
    ]);
    expect(d14Guide(p, 2).map((r) => r.cue)).toEqual([
      'Greensleeves',
      'When the Saints Go Marching In',
    ]);
    // Reference tunes are for rising intervals only.
    expect(d14Guide(prompt('ear-interval:M3:down'), 3).every((r) => r.cue === null)).toBe(true);
    expect(Object.keys(REFERENCE_TUNES)).toHaveLength(12);

    expect(d14Guide(prompt('ear-chord:major'), 2)).toEqual([
      { choice: 'major', name: 'Major', detail: '1 3 5', cue: 'bright and settled' },
      { choice: 'minor', name: 'Minor', detail: '1 ♭3 5', cue: 'darker and sadder' },
    ]);
    const prog = d14Guide(prompt('prog:ii-V-I:ear'), 2);
    expect(prog[0]).toEqual({
      choice: 'ii-V-I',
      name: 'ii–V–I',
      detail: 'ii V I',
      cue: 'The cadence at the heart of jazz harmony.',
    });
    expect(prog[1]!.detail).toBe('i ♭VII ♭VI ♭VII');
    expect(d14Guide(prompt('prog:ii-V-I:ear'), 1)[0]!.cue).toBeNull();
  });
});
