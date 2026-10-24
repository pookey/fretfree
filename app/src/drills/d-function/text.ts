import type { GuideLevel } from '../../engine/model';
import {
  chordFromNumeral,
  chordTones,
  chromaOf,
  diatonicChords,
  harmonicMinorScale,
  parallelKey,
  parseChordSymbol,
  raisedSeventh,
  romanOf,
  scaleOf,
  secondaryDominants,
  type ChordQuality,
  type HarmonicFunction,
  type MusicalKey,
} from '../../theory';
import { prettyChord, prettyKey, prettyNumeral } from '../d11-numerals/logic';
import type { DfAnswer, DfPrompt } from './logic';
import type { DfSource } from './meta';

/**
 * The function drill's words: the cue, the task, the worked example, why an
 * answer is wrong, and the accessible names. Kept apart from `logic.ts` so
 * the prompt building stays short.
 */

const FUNCTION_LABEL: Record<HarmonicFunction, string> = {
  tonic: 'Tonic',
  subdominant: 'Subdominant',
  dominant: 'Dominant',
};

const SPOKEN_ACCIDENTAL: Record<string, string> = {
  b: ' flat',
  bb: ' double flat',
  '#': ' sharp',
  '##': ' double sharp',
};

const SPOKEN_QUALITY: Record<ChordQuality, string> = {
  major: 'major',
  minor: 'minor',
  diminished: 'diminished',
  augmented: 'augmented',
  dominant7: 'seven',
  major7: 'major seven',
  minor7: 'minor seven',
  'half-diminished7': 'minor seven flat five',
  diminished7: 'diminished seven',
};

/** `Bm7b5` → `Bm7♭5`, `F#` → `F♯`. */
export function prettySymbol(symbol: string): string {
  return prettyChord(symbol).replace(/b5$/, '♭5');
}

function note(n: string): string {
  return prettyChord(n);
}

/** `E7` → `E seven`, `Bm7b5` → `B minor seven flat five`. */
export function spokenChord(symbol: string): string {
  const c = parseChordSymbol(symbol);
  return `${c.root.charAt(0)}${SPOKEN_ACCIDENTAL[c.root.slice(1)] ?? ''} ${SPOKEN_QUALITY[c.quality]}`;
}

function tonicOf(prompt: DfPrompt): string {
  return note((prompt.key as MusicalKey).tonic);
}

function keyOf(prompt: DfPrompt): string {
  return prettyKey(prompt.key as MusicalKey);
}

function sourceLabel(prompt: DfPrompt, source: DfSource): string {
  const tonic = tonicOf(prompt);
  // Exclusive: V, V7 and vii° are in the parallel major too, so a bare
  // "borrowed from A major" would be true of them (M6-06 review).
  if (source === 'borrowed') return `Borrowed from ${tonic} major (in neither minor scale)`;
  return `${tonic} ${source} minor`;
}

function targetChord(prompt: DfPrompt, target: string): string {
  return chordFromNumeral(prompt.key as MusicalKey, target).symbol;
}

/** A choice as shown on its button. */
export function dfDisplay(prompt: DfPrompt, value: DfAnswer): string {
  switch (prompt.kind) {
    case 'minor-source':
      return sourceLabel(prompt, value as DfSource);
    case 'function':
      return FUNCTION_LABEL[value as HarmonicFunction];
    case 'secondary-of':
      return `${prettyNumeral(value)} (${prettySymbol(targetChord(prompt, value))})`;
    case 'two-five':
      return value.split(' ').map(prettySymbol).join(' – ');
    default:
      return prettySymbol(value);
  }
}

/** A choice's accessible name. */
export function dfSpoken(prompt: DfPrompt, value: DfAnswer): string {
  switch (prompt.kind) {
    case 'minor-source':
    case 'function':
      return dfDisplay(prompt, value);
    case 'secondary-of':
      return `${value}, ${spokenChord(targetChord(prompt, value))}`;
    case 'two-five':
      return value.split(' ').map(spokenChord).join(', ');
    default:
      return spokenChord(value);
  }
}

/** The cue in large type: a numeral, a chord or a progression's name; null for a borrowed card. */
export function dfCue(prompt: DfPrompt): string | null {
  switch (prompt.kind) {
    case 'minor-chord':
      return prettyNumeral(prompt.numeral as string);
    case 'secondary':
      return `V7/${prompt.numeral as string}`;
    case 'two-five':
      return 'ii–V–i';
    case 'borrowed':
      return null;
    default:
      return prettySymbol(prompt.chord as string);
  }
}

/** The line under a function card's chord: `vi in C major`. */
export function dfCueNote(prompt: DfPrompt): string | null {
  if (prompt.kind !== 'function') return null;
  return `${prettyNumeral(prompt.numeral as string)} in ${keyOf(prompt)}`;
}

/** The task line. */
export function dfTask(prompt: DfPrompt): string {
  const key = prompt.key ? keyOf(prompt) : '';
  const chord = prompt.chord ? prettySymbol(prompt.chord) : '';
  switch (prompt.kind) {
    case 'minor-chord':
      return `Which chord is ${prettyNumeral(prompt.numeral as string)} in ${key}?`;
    case 'minor-source':
      return `${chord} in ${key}: where does it come from?`;
    case 'two-five':
      return `Which chords make the ii–V–i in ${key}?`;
    case 'function':
      return `What function does ${chord} have in ${key}?`;
    case 'secondary':
      return `Which chord is V7/${prompt.numeral as string} in ${key}?`;
    case 'secondary-of':
      return `${chord} in ${key} is the V7 of which chord?`;
    case 'borrowed':
      return `One chord of this ${key} progression is borrowed. Which one?`;
    case 'tritone-sub':
      return `Which chord is the tritone substitute for ${chord}?`;
  }
}

function list(xs: readonly string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs.at(-1) as string}`;
}

/** Chord tones of `symbol` that aren't in `scale`, by pitch. */
function outside(symbol: string, scale: readonly string[]): string[] {
  const chromas = new Set(scale.map(chromaOf));
  return chordTones(symbol).filter((n) => !chromas.has(chromaOf(n)));
}

function naturalMinor(key: MusicalKey): string[] {
  return scaleOf({ tonic: key.tonic, mode: 'minor' });
}

/** The raised and natural 7th of a minor key, pretty. */
function sevenths(key: MusicalKey): { natural: string; raised: string } {
  const { natural, raised } = raisedSeventh(key.tonic);
  return { natural: note(natural), raised: note(raised) };
}

const FUNCTION_CLASSES: Record<'major' | 'minor', string> = {
  major: 'In a major key, I, iii and vi are tonic; ii and IV subdominant; V and vii° dominant.',
  minor:
    'In a minor key, i and ♭III are tonic; ii°, iv and ♭VI subdominant; v, V, ♭VII and vii° dominant.',
};

/** What chords of each function do, as a predicate: "Tonic chords …". */
const FUNCTION_ROLE: Record<HarmonicFunction, string> = {
  tonic: 'sound at rest, like the home chord',
  subdominant: 'move away from home, towards the dominant',
  dominant: 'pull back home',
};

/** The fact the card teaches: the worked example (rule 8) and the feedback's last word. */
export function dfFact(prompt: DfPrompt): string {
  const key = prompt.key as MusicalKey;
  const k = prompt.key ? keyOf(prompt) : '';
  const answer = dfDisplay(prompt, prompt.answer);
  switch (prompt.kind) {
    case 'minor-chord': {
      const { natural, raised } = sevenths(key);
      const n = prettyNumeral(prompt.numeral as string);
      if (prompt.numeral === 'vii°') {
        return `${n} in ${k} is ${answer}, built on the raised 7th, ${raised}: harmonic minor raises ${natural} to ${raised}, the leading tone.`;
      }
      const built = prompt.numeral === 'V7' ? 'a dominant 7th' : 'major';
      return `${n} in ${k} is ${answer}. ${tonicOf(prompt)} harmonic minor raises ${natural} to ${raised}, the leading tone, so the chord on the 5th is ${built}.`;
    }
    case 'minor-source': {
      const chord = prettySymbol(prompt.chord as string);
      const n = prettyNumeral(prompt.numeral as string);
      if (prompt.answer === 'natural') {
        return `${chord} is ${n} in ${k}: every note is in ${tonicOf(prompt)} natural minor.`;
      }
      if (prompt.answer === 'harmonic') {
        const { natural, raised } = sevenths(key);
        return `${chord} is ${n} in ${k}, from ${tonicOf(prompt)} harmonic minor: it has ${raised}, the raised 7th (not ${natural}).`;
      }
      const borrowed = outside(prompt.chord as string, harmonicMinorScale(key.tonic)).map(note);
      return `${chord} is ${n} in ${k}, borrowed from ${tonicOf(prompt)} major: ${list(borrowed)} is in neither natural nor harmonic minor.`;
    }
    case 'two-five': {
      const { raised } = sevenths(key);
      return `The ii–V–i in ${k} is ${answer}: a half-diminished ii from natural minor, and a V7 with the raised 7th, ${raised}, from harmonic minor.`;
    }
    case 'function': {
      const fn = prompt.answer as HarmonicFunction;
      return `${prettySymbol(prompt.chord as string)} is ${prettyNumeral(prompt.numeral as string)} in ${k}: ${fn} function. ${FUNCTION_LABEL[fn]} chords ${FUNCTION_ROLE[fn]}.`;
    }
    case 'secondary': {
      const t = prompt.numeral as string;
      const target = prettySymbol(targetChord(prompt, t));
      return `V7/${t} in ${k} is ${answer}: ${t} is ${target}, and ${answer} is the dominant 7th a 5th above it.`;
    }
    case 'secondary-of': {
      const chord = prettySymbol(prompt.chord as string);
      const t = prompt.answer;
      return `${chord} resolves down a 5th to ${prettySymbol(targetChord(prompt, t))}, ${t} in ${k}, so it is V7/${t}.`;
    }
    case 'borrowed': {
      const n = prettyNumeral(prompt.numeral as string);
      const extra = outside(prompt.answer, scaleOf(key)).map(note);
      return `${answer} is ${n}, borrowed from ${prettyKey(parallelKey(key))}: ${list(extra)} is not in ${k}.`;
    }
    case 'tritone-sub': {
      const chord = prettySymbol(prompt.chord as string);
      const shared = sharedTones(prompt.chord as string, prompt.answer).map(note);
      return `${answer} is a tritone (6 half steps) from ${chord}. They share ${list(shared)}: the 3rd and ♭7 of ${chord} are the ♭7 and 3rd of ${answer}.`;
    }
  }
}

/** Notes of `a` that `b` also holds, spelled as in `a`. */
function sharedTones(a: string, b: string): string[] {
  const inB = new Set(chordTones(b).map(chromaOf));
  return chordTones(a).filter((n) => inB.has(chromaOf(n)));
}

const INTERVAL_NAME: Record<number, string> = {
  1: 'a half step',
  2: 'a whole step',
  3: 'a minor 3rd',
  4: 'a major 3rd',
  5: 'a 4th',
  7: 'a 5th',
  8: 'a minor 6th',
  9: 'a major 6th',
  10: 'a minor 7th',
  11: 'a major 7th',
};

/** Why the chosen answer is wrong, after a wrong answer. */
export function dfExplain(prompt: DfPrompt, answer: DfAnswer): string[] {
  if (answer === prompt.answer || !prompt.choices.includes(answer)) return [];
  const key = prompt.key as MusicalKey;
  const k = prompt.key ? keyOf(prompt) : '';
  const shown = dfDisplay(prompt, answer);
  switch (prompt.kind) {
    case 'minor-chord': {
      const given = parseChordSymbol(answer);
      const { natural } = sevenths(key);
      const roman = prettyNumeral(romanOf(key, answer));
      const seventh = chromaOf(raisedSeventh(key.tonic).natural);
      if (chromaOf(given.root) === seventh) {
        return [
          `${shown} is ${roman}, on the natural 7th, ${natural}: a whole step below ${tonicOf(prompt)}, so it doesn't pull up to it.`,
        ];
      }
      const sameRoot = given.root === parseChordSymbol(prompt.answer).root;
      if (sameRoot && chordTones(answer).map(chromaOf).includes(seventh)) {
        const { raised } = sevenths(key);
        return [
          `${shown} is ${roman}, from natural minor, with ${natural}. Raising ${natural} to ${raised}, the leading tone, makes ${dfDisplay(prompt, prompt.answer)}.`,
        ];
      }
      return [`${shown} is ${roman} in ${k}.`];
    }
    case 'minor-source': {
      const chord = prettySymbol(prompt.chord as string);
      const { natural, raised } = sevenths(key);
      if (prompt.answer === 'natural') {
        if (answer === 'borrowed') {
          return [
            `Every note of ${chord} is in ${tonicOf(prompt)} natural minor: nothing is borrowed.`,
          ];
        }
        const seventh = chromaOf(raisedSeventh(key.tonic).natural);
        const tones = chordTones(prompt.chord as string).map(chromaOf);
        if (tones[0] === seventh) {
          return [
            `${chord} is built on the natural 7th, ${natural}. Harmonic minor raises it to ${raised}.`,
          ];
        }
        return [
          tones.includes(seventh)
            ? `${chord} has ${natural}, the natural 7th. Harmonic minor raises it to ${raised}.`
            : `Harmonic minor changes only the 7th note, ${natural} to ${raised}, and ${chord} uses neither.`,
        ];
      }
      if (prompt.answer === 'harmonic') {
        if (answer === 'borrowed') {
          return [
            `Every note of ${chord} is in ${tonicOf(prompt)} harmonic minor: nothing is borrowed.`,
          ];
        }
        return [`${chord} has ${raised}, which isn't in ${tonicOf(prompt)} natural minor.`];
      }
      const borrowed = outside(prompt.chord as string, harmonicMinorScale(key.tonic)).map(note);
      return [`${chord} has ${list(borrowed)}, which isn't in ${tonicOf(prompt)} minor at all.`];
    }
    case 'two-five': {
      const [ii, v, i] = answer.split(' ') as [string, string, string];
      const lines: string[] = [];
      const iiQ = parseChordSymbol(ii).quality;
      if (parseChordSymbol(i).quality !== 'minor') {
        const tonic = parseChordSymbol(i).root;
        return [`${shown} is the ii–V–I of ${note(tonic)} major.`];
      }
      if (iiQ !== 'half-diminished7') {
        const extra = outside(ii, naturalMinor(key)).map(note);
        lines.push(
          `${prettySymbol(ii)} has ${list(extra)}, which isn't in ${k}: the ii is half-diminished.`,
        );
      }
      if (parseChordSymbol(v).quality !== 'dominant7') {
        const { natural, raised } = sevenths(key);
        lines.push(
          `${prettySymbol(v)} is the natural-minor v7, with ${natural}: the V7 takes the leading tone, ${raised}.`,
        );
      }
      return lines;
    }
    case 'function': {
      const fn = answer as HarmonicFunction;
      return [`${FUNCTION_CLASSES[key.mode]} ${FUNCTION_LABEL[fn]} chords ${FUNCTION_ROLE[fn]}.`];
    }
    case 'secondary': {
      const t = prompt.numeral as string;
      const on = targetChord(prompt, t);
      if (chromaOf(parseChordSymbol(answer).root) === chromaOf(parseChordSymbol(on).root)) {
        return [
          `${shown} is built on ${note(parseChordSymbol(on).root)}, the root of ${t} itself. Its V7 is a 5th higher.`,
        ];
      }
      return [`${shown} is ${prettyNumeral(dfDominantLabel(key, answer))} in ${k}.`];
    }
    case 'secondary-of': {
      const chord = prettySymbol(prompt.chord as string);
      const root = parseChordSymbol(prompt.chord as string).root;
      const given = targetChord(prompt, answer);
      if (chromaOf(parseChordSymbol(given).root) === chromaOf(root)) {
        return [
          `${chord} is built on ${note(root)}, but a dominant resolves down a 5th, not to its own root.`,
        ];
      }
      return [
        `The V7 of ${prettySymbol(given)} is a 5th above ${note(parseChordSymbol(given).root)}, not ${chord}.`,
      ];
    }
    case 'borrowed':
      return [`${shown} is ${prettyNumeral(romanOf(key, answer))}, a chord of ${k}.`];
    case 'tritone-sub': {
      const from = chromaOf(parseChordSymbol(prompt.chord as string).root);
      const to = chromaOf(parseChordSymbol(answer).root);
      const interval = INTERVAL_NAME[(to - from + 12) % 12] as string;
      return [
        `${shown} is ${interval} from ${prettySymbol(prompt.chord as string)}, not a tritone.`,
      ];
    }
  }
}

/** A dominant 7th's label in a major key: `V7/ii` for A7 in C, `V7` for G7. */
export function dfDominantLabel(key: MusicalKey, chord: string): string {
  const root = chromaOf(parseChordSymbol(chord).root);
  const secondary = secondaryDominants(key, { sevenths: true }).find(
    (r) => chromaOf(r.chord.root) === root,
  );
  return secondary?.label ?? romanOf(key, chord);
}

/** The hint (guide level 1+). It names the method, never the answer (rule 4). */
export function dfHint(prompt: DfPrompt): string {
  switch (prompt.kind) {
    case 'minor-chord':
      return 'Harmonic minor raises the 7th note a half step, to a leading tone.';
    case 'minor-source':
      return 'Check the chord’s notes against the key. Is the 7th raised? Is a note from the major key?';
    case 'two-five':
      return 'The ii comes from natural minor; the V takes the raised 7th.';
    case 'function':
      return 'Tonic chords rest, subdominant chords move away, and dominant chords pull home.';
    case 'secondary':
      return 'Find the target chord, then build a dominant 7th a 5th above its root.';
    case 'secondary-of':
      return 'A dominant resolves down a 5th: find the chord a 5th below its root.';
    case 'borrowed':
      return 'Look for the chord with a note outside the key, from the parallel minor.';
    case 'tritone-sub':
      return 'A tritone is 6 half steps: a ♭5 above the root.';
  }
}

/** One labelled line of the context panel's reference. */
export interface DfReference {
  label: string;
  value: string;
}

/**
 * What the context panel shows at guide level 2 and up (rule 9): what to
 * check the cue against, never the answer. Minor-key cards get the natural
 * minor scale, and at level 3 harmonic minor (and the major key, for a
 * source card); a secondary dominant or borrowed
 * card gets the key's chords; a function card the key's chords by numeral
 * (its hint names the roles, so it gets no more at level 3);
 * a tritone card counts its half steps.
 */
export function dfReference(prompt: DfPrompt, level: GuideLevel): DfReference[] {
  if (level < 2) return [];
  const key = prompt.key as MusicalKey;
  const strip = (k: MusicalKey) =>
    diatonicChords(k)
      .map((c) => `${prettyNumeral(c.roman)} ${prettySymbol(c.symbol)}`)
      .join(' · ');
  switch (prompt.kind) {
    case 'minor-chord':
    case 'minor-source':
    case 'two-five': {
      const lines = [
        { label: `${tonicOf(prompt)} natural minor`, value: naturalMinor(key).map(note).join(' ') },
      ];
      if (level >= 3) {
        lines.push({
          label: `${tonicOf(prompt)} harmonic minor`,
          value: harmonicMinorScale(key.tonic).map(note).join(' '),
        });
      }
      if (level >= 3 && prompt.kind === 'minor-source') {
        const major = scaleOf({ tonic: key.tonic, mode: 'major' });
        lines.push({ label: `${tonicOf(prompt)} major`, value: major.map(note).join(' ') });
      }
      return lines;
    }
    // The hint already says what each function does, so level 3 adds nothing.
    case 'function':
      return [{ label: `Chords in ${keyOf(prompt)}`, value: strip(key) }];
    case 'secondary':
    case 'secondary-of':
    case 'borrowed': {
      const lines = [{ label: `Chords in ${keyOf(prompt)}`, value: strip(key) }];
      if (level >= 3) {
        lines.push({ label: `${keyOf(prompt)} scale`, value: scaleOf(key).map(note).join(' ') });
      }
      return lines;
    }
    case 'tritone-sub':
      return [{ label: 'Half steps', value: 'C C♯ D D♯ E F F♯ G G♯ A A♯ B' }];
  }
}
