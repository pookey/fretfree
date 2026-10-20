import type { GuideLevel } from '../../engine/model';
import {
  chordFormula,
  getProgression,
  intervalSemitones,
  relatedRotations,
  type ChordKind,
  type IntervalName,
} from '../../theory';
import { d14KeyOf, d14LongName, pretty, type D14Kind, type D14Prompt } from './logic';

/**
 * D14's words: the question, the worked example, what each sound is and
 * what to listen for, and how a wrong choice differs. Only the view and
 * panel use them, so they load with the views, not in first-load JS
 * (design §10).
 */

function plural(n: number, what: string): string {
  return `${n} ${what}${n === 1 ? '' : 's'}`;
}

/** `rising`, `falling`, `played together`. */
function how(prompt: D14Prompt): string {
  if (prompt.direction === 'down') return 'falling';
  if (prompt.direction === 'together') return 'played together';
  return 'rising';
}

/** Capitalised: `Major 3rd`. */
function title(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The question under the play button. */
export function d14Task(prompt: D14Prompt): string {
  switch (prompt.kind) {
    case 'interval':
      return `Which interval? Two notes, ${how(prompt)}.`;
    case 'chord':
      return 'Which kind of chord?';
    case 'progression':
      return 'Which progression?';
  }
}

/** A choice's accessible name: `major 3rd`, `minor chord`, `I–V–vi–IV`. */
export function d14Spoken(kind: D14Kind, choice: string): string {
  const long = d14LongName(kind, choice);
  return kind === 'chord' ? `${long} chord` : long;
}

/** A button's second line: `major 3rd`, `1 3 5`, nothing for a progression. */
export function d14SubLabel(kind: D14Kind, choice: string): string | null {
  switch (kind) {
    case 'interval':
      return d14LongName(kind, choice);
    case 'chord':
      return chordFormula(choice as ChordKind)
        .map((d) => pretty(d))
        .join(' ');
    case 'progression':
      return null;
  }
}

/**
 * What each chord sounds like, in a few words: the cue an ear listens for.
 * Descriptions, not facts to grade: they help the worked example and fade.
 */
const CHORD_CHARACTER: Partial<Record<ChordKind, string>> = {
  major: 'bright and settled',
  minor: 'darker and sadder',
  diminished: 'tense and crunchy: two minor 3rds stacked',
  augmented: 'unresolved and dreamy: two major 3rds stacked',
  '7': 'bluesy, and wants to move on',
  maj7: 'soft and jazzy',
  m7: 'mellow and smooth',
  m7b5: 'dark and restless',
};

/**
 * Songs that open with each rising interval: the ear-training standard.
 * Shown from guide level 2, for rising intervals only.
 */
export const REFERENCE_TUNES: Readonly<Record<string, string>> = {
  m2: 'Jaws',
  M2: 'Happy Birthday (“…py birth…”)',
  m3: 'Greensleeves',
  M3: 'When the Saints Go Marching In',
  P4: 'Here Comes the Bride',
  TT: 'The Simpsons theme',
  P5: 'Twinkle, Twinkle, Little Star',
  m6: 'The Entertainer (the leap)',
  M6: 'My Bonnie Lies over the Ocean',
  m7: 'Somewhere (West Side Story)',
  M7: 'Take On Me (the chorus leap)',
  P8: 'Somewhere over the Rainbow',
};

/** The sound, named and explained: the worked example (rule 8) and the feedback (rule 10). */
export function d14Fact(prompt: D14Prompt): string {
  switch (prompt.kind) {
    case 'interval': {
      const n = intervalSemitones(prompt.answer as IntervalName);
      return `${title(d14LongName('interval', prompt.answer))}, ${how(prompt)}: ${plural(n, 'half step')} apart.`;
    }
    case 'chord': {
      const formula = d14SubLabel('chord', prompt.answer) as string;
      const character = CHORD_CHARACTER[prompt.answer as ChordKind];
      return `${title(d14LongName('chord', prompt.answer))} chord (${formula})${character ? `: ${character}` : ''}.`;
    }
    case 'progression': {
      const p = getProgression(prompt.answer);
      return `${pretty(p.name)} in ${d14KeyName(prompt)}. ${p.description}`;
    }
  }
}

/** The key a progression prompt played in: `E♭ major`, `C minor`. */
export function d14KeyName(prompt: D14Prompt): string {
  const key = d14KeyOf(prompt, prompt.answer);
  return `${pretty(key.tonic)} ${key.mode}`;
}

/** How a wrong choice differs from the answer: what to listen for next time. */
export function d14Explain(prompt: D14Prompt, answer: string): string | null {
  if (answer === prompt.answer || !prompt.choices.includes(answer)) return null;
  const yours = d14LongName(prompt.kind, answer);
  switch (prompt.kind) {
    case 'interval': {
      const diff =
        intervalSemitones(answer as IntervalName) -
        intervalSemitones(prompt.answer as IntervalName);
      const size = plural(Math.abs(diff), 'half step');
      return `A ${yours} is ${size} ${diff > 0 ? 'wider' : 'narrower'}.`;
    }
    case 'chord': {
      const character = CHORD_CHARACTER[answer as ChordKind];
      return `A ${yours} chord sounds ${character ?? 'different'}.`;
    }
    case 'progression': {
      if (relatedRotations(prompt.answer).some((p) => p.id === answer)) {
        return `${pretty(yours)} uses the same chords in another order: listen for the chord it starts on.`;
      }
      return `${pretty(yours)} has different chords: ${pretty(getProgression(answer).numerals.join('–'))}.`;
    }
  }
}

export interface D14GuideRow {
  choice: string;
  name: string;
  /** Half steps or the formula. */
  detail: string;
  /** Level 2+: a reference tune (rising intervals) or what the chord sounds like. */
  cue: string | null;
}

/**
 * The context panel's rows (rule 9: faded within and across sessions): every
 * button's sound with its size or formula from level 1, and from level 2 a
 * reference tune or what it sounds like. It lists every button, so it never
 * singles out the answer (rule 4).
 */
export function d14Guide(prompt: D14Prompt, guideLevel: GuideLevel): D14GuideRow[] {
  if (guideLevel <= 0) return [];
  const cues = guideLevel >= 2;
  return prompt.choices.map((choice) => {
    const name = title(d14LongName(prompt.kind, choice));
    switch (prompt.kind) {
      case 'interval':
        return {
          choice,
          name,
          detail: plural(intervalSemitones(choice as IntervalName), 'half step'),
          cue: cues && prompt.direction === 'up' ? (REFERENCE_TUNES[choice] ?? null) : null,
        };
      case 'chord':
        return {
          choice,
          name,
          detail: d14SubLabel('chord', choice) as string,
          cue: cues ? (CHORD_CHARACTER[choice as ChordKind] ?? null) : null,
        };
      case 'progression':
        return {
          choice,
          name: pretty(getProgression(choice).name),
          detail: pretty(getProgression(choice).numerals.join(' ')),
          cue: cues ? getProgression(choice).description : null,
        };
    }
  });
}
