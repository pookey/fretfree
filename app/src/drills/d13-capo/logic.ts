import { ENGINE_CONFIG } from '../../engine/config';
import { parseCapoItemId, type GuideLevel, type Item } from '../../engine/model';
import {
  OPEN_SHAPE_KEYS,
  chromaOf,
  chromaToPc,
  keyLabel,
  keySignature,
  parseKey,
  sameKey,
  semitonesUp,
  shapeKey,
  soundingKey,
  standardKeyTonic,
  type MusicalKey,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';

/**
 * D13 "Capo calculator" (design §6 D13, C10). A song card names two of the
 * three facts (the shapes, the capo fret, the key that sounds) and the
 * learner picks the third from buttons:
 *
 * - `sound`: G shapes, capo on fret 3, which key sounds? (B♭)
 * - `shape`: a song in B♭, capo on fret 3, which shapes? (G)
 * - `fret`: a song in B♭, played with G shapes, which fret? (3)
 *
 * The card fixes the shapes; the capo varies per prompt (research/02 rule
 * 12), up to fret 7 (`capoOptions`' range) at the higher scope levels. The
 * buttons always include the two misconceptions research/03 names for C10:
 * transposing the wrong way (E for G shapes at capo 3, or capo 9) and taking
 * the shape's name for the sounding key (G). A wrong-direction answer is
 * logged as the `capo:up` / `capo:down` confusion, so the session pairs the
 * two directions (rule 6).
 */

export const D13_ID = 'capo';

export type D13Ask = 'sound' | 'shape' | 'fret';

export interface D13Prompt {
  itemId: string;
  ask: D13Ask;
  /** The open-shape key the learner fingers. */
  shape: MusicalKey;
  /** The capo fret, 1–7. */
  capo: number;
  /** The key that sounds: the shapes raised by the capo. */
  sounding: MusicalKey;
  /** Answer buttons, in display order: key labels (`Bb`, `Cm`) or frets (`3`). */
  choices: string[];
  /** The scope level the prompt was built at. */
  level: number;
}

/** A key label (`Bb`, `Cm`) or a capo fret (`3`), as on the buttons. */
export type D13Answer = string;

/**
 * Scope levels (research/02 rule 5): 0 keeps the capo to frets 1–4 and
 * offers four buttons, 1 reaches fret 7 with six, and 2 offers every key (or
 * frets 1–11). Values live in `engine/config/capo.ts`.
 */
export const D13_SCOPE = { minLevel: 0, maxLevel: 2 };

const ASK_OF = {
  'capo-sound': 'sound',
  'capo-shape': 'shape',
  'capo-fret': 'fret',
} as const satisfies Record<string, D13Ask>;

/** The highest fret a fret answer offers: frets 1–11 reach every key. */
const MAX_FRET_CHOICE = 11;

function clampLevel(level: number): number {
  return Math.max(D13_SCOPE.minLevel, Math.min(D13_SCOPE.maxLevel, Math.floor(level)));
}

function parse(item: Item): { ask: D13Ask; shape: MusicalKey } | null {
  const ref = parseCapoItemId(item.id);
  if (!ref) return null;
  const shape = parseKey(ref.shape);
  // Only the open shapes beginners play under a capo (C A G E D, Am Em Dm).
  if (!OPEN_SHAPE_KEYS.some((k) => sameKey(k, shape) && k.tonic === shape.tonic)) return null;
  return { ask: ASK_OF[ref.kind], shape };
}

export function d13CanTest(item: Item): boolean {
  return parse(item) !== null;
}

/** A key of the shape's mode, `semitones` from its tonic, spelled as the circle names it. */
function keyAt(from: MusicalKey, semitones: number): MusicalKey {
  return { tonic: standardKeyTonic(chromaOf(from.tonic) + semitones, from.mode), mode: from.mode };
}

/** The expected answer, as on its button. */
export function d13Answer(prompt: Pick<D13Prompt, 'ask' | 'shape' | 'capo' | 'sounding'>): string {
  if (prompt.ask === 'fret') return String(prompt.capo);
  return keyLabel(prompt.ask === 'sound' ? prompt.sounding : prompt.shape);
}

/** The answer a learner gives by transposing the wrong way: E for G shapes at capo 3. */
export function d13WrongDirection(
  prompt: Pick<D13Prompt, 'ask' | 'shape' | 'capo' | 'sounding'>,
): string {
  if (prompt.ask === 'fret') return String(12 - prompt.capo);
  if (prompt.ask === 'sound') return keyLabel(shapeKey(prompt.shape, prompt.capo));
  return keyLabel(soundingKey(prompt.sounding, prompt.capo));
}

/**
 * The answer a learner gives by ignoring the capo: the shape's name for the
 * sounding key, or the song's key for the shapes. A fret question has none.
 */
export function d13CapoIgnored(
  prompt: Pick<D13Prompt, 'ask' | 'shape' | 'sounding'>,
): string | null {
  if (prompt.ask === 'fret') return null;
  return keyLabel(prompt.ask === 'sound' ? prompt.shape : prompt.sounding);
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Every answer of the prompt's kind, in display order: keys from C, frets from 1. */
function allAnswers(prompt: Pick<D13Prompt, 'ask' | 'shape'>): string[] {
  if (prompt.ask === 'fret') {
    return Array.from({ length: MAX_FRET_CHOICE }, (_, i) => String(i + 1));
  }
  const c = { tonic: 'C', mode: prompt.shape.mode } as const;
  return Array.from({ length: 12 }, (_, i) => keyLabel(keyAt(c, i)));
}

/**
 * The answer buttons: the answer, the wrong-direction and capo-ignored
 * answers, then near misses a half or whole step either side, in a random
 * order so their place says nothing. Shown in key or fret order.
 */
export function d13Choices(
  prompt: Pick<D13Prompt, 'ask' | 'shape' | 'capo' | 'sounding'>,
  scopeLevel: number,
  rng: () => number,
): string[] {
  const all = allAnswers(prompt);
  const count = ENGINE_CONFIG.capo.choicesByLevel[clampLevel(scopeLevel)] ?? null;
  if (count === null) return all;
  const answer = d13Answer(prompt);
  const near = shuffle([1, -1, 2, -2, 3, -3], rng).map((d) =>
    prompt.ask === 'fret'
      ? String(prompt.capo + d)
      : keyLabel(keyAt(prompt.ask === 'sound' ? prompt.sounding : prompt.shape, d)),
  );
  const ignored = d13CapoIgnored(prompt);
  const picked = [answer, d13WrongDirection(prompt), ...(ignored ? [ignored] : []), ...near]
    .filter((c) => all.includes(c))
    .filter((c, i, list) => list.indexOf(c) === i)
    .slice(0, count);
  return all.filter((c) => picked.includes(c));
}

export function d13MakePrompt(item: Item, ctx: DrillContext): D13Prompt {
  const p = parse(item);
  if (!p) throw new Error(`D13 cannot test item ${item.id}`);
  const level = clampLevel(ctx.scopeLevel);
  const maxCapo = ENGINE_CONFIG.capo.maxCapoByLevel[level] as number;
  const capo = 1 + Math.floor(ctx.rng() * maxCapo);
  const base = { ask: p.ask, shape: p.shape, capo, sounding: soundingKey(p.shape, capo) };
  return { ...base, itemId: item.id, choices: d13Choices(base, level, ctx.rng), level };
}

/** `capo:up` counts up from the shapes (to the sound or the fret); `capo:down` from the song. */
export function d13ConceptOf(item: Item): string | null {
  const p = parse(item);
  if (!p) return null;
  return p.ask === 'shape' ? 'capo:down' : 'capo:up';
}

export function d13Check(prompt: D13Prompt, answer: D13Answer): DrillCheck {
  const expected = d13Answer(prompt);
  const concept = prompt.ask === 'shape' ? 'capo:down' : 'capo:up';
  if (answer === expected) return { correct: true, expected: d13Pretty(expected), concept };
  const wrongWay = answer === d13WrongDirection(prompt);
  return {
    correct: false,
    expected: d13Pretty(expected),
    concept,
    ...(wrongWay ? { confusedWith: concept === 'capo:up' ? 'capo:down' : 'capo:up' } : {}),
  };
}

export function d13DescribeAnswer(answer: D13Answer): string {
  return answer;
}

// --- Display ---------------------------------------------------------------

/** `Bb` → `B♭`, `F#m` → `F♯m`; a fret stays as it is. */
export function d13Pretty(label: string): string {
  return label.replace('#', '♯').replace(/(?<=^[A-G])b/, '♭');
}

/** `B♭ major`, `C minor`. */
export function d13KeyName(key: MusicalKey): string {
  return `${d13Pretty(key.tonic)} ${key.mode}`;
}

/** `G shapes`, `Am shapes`. */
export function d13ShapeName(key: MusicalKey): string {
  return `${d13Pretty(keyLabel(key))} shapes`;
}

/** A button's accessible name: `B flat major`, `capo on fret 3`. */
export function d13Spoken(prompt: Pick<D13Prompt, 'ask' | 'shape'>, label: string): string {
  if (prompt.ask === 'fret') return `fret ${label}`;
  const key = parseKey(label);
  const tonic = key.tonic.replace('#', ' sharp').replace(/(?<=^[A-G])b/, ' flat');
  return prompt.ask === 'shape' ? `${tonic} ${key.mode} shapes` : `${tonic} ${key.mode}`;
}

/** The question, before an answer. */
export function d13Question(prompt: D13Prompt): string {
  const shapes = d13ShapeName(prompt.shape);
  const song = d13KeyName(prompt.sounding);
  switch (prompt.ask) {
    case 'sound':
      return `You play ${shapes} with a capo on fret ${prompt.capo}. Which key sounds?`;
    case 'shape':
      return `The song is in ${song}. With a capo on fret ${prompt.capo}, which shapes do you play?`;
    case 'fret':
      return `The song is in ${song}. You play it with ${shapes}. Which fret for the capo?`;
  }
}

/** Accidentals for the steps between the keys: flats toward a flat key, else sharps. */
function ladderPref(prompt: Pick<D13Prompt, 'shape' | 'sounding'>): 'flat' | 'sharp' {
  return keySignature(prompt.sounding).flats > 0 || keySignature(prompt.shape).flats > 0
    ? 'flat'
    : 'sharp';
}

export interface D13Rung {
  fret: number;
  /** The shapes' tonic raised by this fret; the ends are spelled as their keys. */
  note: string;
}

/**
 * The half-step ladder from the shapes' tonic (fret 0) up to the sounding
 * key's (the capo fret): what the capo does, one fret per half step.
 */
export function d13Ladder(prompt: Pick<D13Prompt, 'shape' | 'capo' | 'sounding'>): D13Rung[] {
  const pref = ladderPref(prompt);
  const start = chromaOf(prompt.shape.tonic);
  return Array.from({ length: prompt.capo + 1 }, (_, fret) => ({
    fret,
    note:
      fret === 0
        ? prompt.shape.tonic
        : fret === prompt.capo
          ? prompt.sounding.tonic
          : chromaToPc(start + fret, pref),
  }));
}

/** `G → A♭ → A → B♭`, or down from the song's key: `B♭ → A → A♭ → G`. */
export function d13LadderText(
  prompt: Pick<D13Prompt, 'shape' | 'capo' | 'sounding'>,
  direction: 'up' | 'down' = 'up',
): string {
  const notes = d13Ladder(prompt).map((r) => d13Pretty(r.note));
  return (direction === 'up' ? notes : notes.reverse()).join(' → ');
}

function halfSteps(n: number): string {
  return `${n} half step${n === 1 ? '' : 's'}`;
}

/**
 * The worked example (rule 8) and the feedback summary: the whole sum,
 * counted the way the question goes.
 */
export function d13WorkedExample(prompt: D13Prompt): string {
  const shapes = d13ShapeName(prompt.shape);
  const song = d13KeyName(prompt.sounding);
  const steps = halfSteps(prompt.capo);
  switch (prompt.ask) {
    case 'sound':
      return `A capo on fret ${prompt.capo} raises ${shapes} ${steps}: ${d13LadderText(prompt)}. They sound in ${song}.`;
    case 'shape':
      return `For a song in ${song} with a capo on fret ${prompt.capo}, count down ${steps}: ${d13LadderText(prompt, 'down')}. Play ${shapes}.`;
    case 'fret':
      return `From ${shapes} up to ${song} is ${steps}: ${d13LadderText(prompt)}. Put the capo on fret ${prompt.capo}.`;
  }
}

/** Why a wrong answer is wrong, naming the misconception when it is one. */
export function d13Explain(prompt: D13Prompt, answer: D13Answer): string {
  const expected = d13Answer(prompt);
  if (answer === expected) return '';
  const shapeTonic = d13Pretty(prompt.shape.tonic);
  const songTonic = d13Pretty(prompt.sounding.tonic);
  const given = d13Pretty(answer);
  if (answer === d13WrongDirection(prompt)) {
    switch (prompt.ask) {
      case 'sound':
        return `${given} is ${halfSteps(prompt.capo)} below ${shapeTonic}. A capo shortens the strings, so it raises the pitch: count up.`;
      case 'shape':
        return `${given} is ${halfSteps(prompt.capo)} above ${songTonic}. The capo raises the shapes to the song's key, so the shapes sit below it: count down.`;
      case 'fret':
        return `Capo ${answer} counts down from ${songTonic} to ${shapeTonic}. Count up from the shapes to the song: ${shapeTonic} to ${songTonic} is ${halfSteps(prompt.capo)}.`;
    }
  }
  if (answer === d13CapoIgnored(prompt)) {
    return prompt.ask === 'sound'
      ? `${shapeTonic} is the shape you finger. With the capo on fret ${prompt.capo} it sounds ${halfSteps(prompt.capo)} higher.`
      : `${songTonic} is the key that sounds. Under a capo on fret ${prompt.capo} you finger shapes ${halfSteps(prompt.capo)} lower.`;
  }
  switch (prompt.ask) {
    case 'sound': {
      const n = semitonesUp(prompt.shape, parseKey(answer));
      return `${given} is ${halfSteps(n)} above ${shapeTonic}, not ${prompt.capo}.`;
    }
    case 'shape': {
      const key = parseKey(answer);
      return `${d13ShapeName(key)} with a capo on fret ${prompt.capo} sound in ${d13KeyName(soundingKey(key, prompt.capo))}.`;
    }
    case 'fret':
      return `A capo on fret ${answer} makes ${d13ShapeName(prompt.shape)} sound in ${d13KeyName(soundingKey(prompt.shape, Number(answer)))}.`;
  }
}

/** The hint under the question (guide level 1+). It names the method, never the answer. */
export function d13Hint(prompt: Pick<D13Prompt, 'ask'>): string {
  switch (prompt.ask) {
    case 'sound':
      return 'A capo raises the pitch: count up one half step per fret from the shapes.';
    case 'shape':
      return 'The shapes sit below the song: count down one half step per fret.';
    case 'fret':
      return 'Count half steps up from the shapes to the song’s key.';
  }
}

/** What each guide level shows (rule 9: faded within and across sessions). */
export interface D13Guides {
  /** The method under the question. */
  hint: boolean;
  /** Fret numbers on the neck, for counting the half steps. */
  fretNumbers: boolean;
}

export function d13Guides(level: GuideLevel): D13Guides {
  return { hint: level >= 1, fretNumbers: level >= 2 };
}

// --- Sound -----------------------------------------------------------------

/** The shapes' tonic sits in octave 3, so a raise of up to 11 frets stays in guitar range. */
const BASE_MIDI = 48;

function tonicNote(key: MusicalKey, midi: number): string {
  return `${key.tonic}${Math.floor(midi / 12) - 1}`;
}

/**
 * The shapes' tonic, then the sounding key's a capo higher, so the raise is
 * heard (design §7: sound, sight and name together). A wrong answer adds the
 * key it names where that answer puts it.
 */
export function d13Sounds(prompt: D13Prompt, fb: DrillFeedback<D13Answer>): DrillSounds {
  const shapeMidi = BASE_MIDI + chromaOf(prompt.shape.tonic);
  const soundMidi = shapeMidi + prompt.capo;
  const expected = [tonicNote(prompt.shape, shapeMidi), tonicNote(prompt.sounding, soundMidi)];
  if (fb.result.correct) return { expected };
  const answer = fb.answer;
  if (prompt.ask === 'fret') {
    const fret = Number(answer);
    if (!Number.isInteger(fret)) return { expected };
    return { expected, given: [tonicNote(soundingKey(prompt.shape, fret), shapeMidi + fret)] };
  }
  let key: MusicalKey;
  try {
    key = parseKey(answer);
  } catch {
    return { expected };
  }
  // A sounding key above the shapes; a shape key below the song.
  const midi =
    prompt.ask === 'sound'
      ? answer === d13WrongDirection(prompt)
        ? shapeMidi - prompt.capo
        : shapeMidi + semitonesUp(prompt.shape, key)
      : soundMidi - semitonesUp(key, prompt.sounding);
  return { expected, given: [tonicNote(key, midi)] };
}

// --- Keyboard --------------------------------------------------------------

/**
 * Hardware keyboard (design §7). Keys: A–G name a natural, then `#` or `+`
 * sharpens and `-` flattens it; it answers as soon as one button fits (by
 * pitch, so A♯ picks B♭). Frets: digits, answering once no other fret starts
 * with them (`1` waits for `10` or `11`). Enter answers what is typed;
 * Escape and Backspace clear.
 */
export function d13TypeKey(
  typed: string,
  key: string,
  ask: D13Ask,
  choices: readonly string[],
): { typed: string; answer: string | null } {
  if (key === 'Escape' || key === 'Backspace') return { typed: '', answer: null };
  return ask === 'fret' ? typeFret(typed, key, choices) : typeKeyName(typed, key, choices);
}

function typeFret(typed: string, key: string, choices: readonly string[]) {
  if (key === 'Enter') {
    return choices.includes(typed) ? { typed: '', answer: typed } : { typed, answer: null };
  }
  if (!/^[0-9]$/.test(key)) return { typed, answer: null };
  const extend = (t: string) => choices.filter((c) => c.startsWith(t));
  const next = extend(typed + key).length > 0 ? typed + key : extend(key).length > 0 ? key : '';
  const open = extend(next);
  if (next !== '' && open.length === 1 && open[0] === next) return { typed: '', answer: next };
  return { typed: next, answer: null };
}

/** The tonic of a key button: `Bbm` → `Bb`. */
function tonicOf(label: string): string {
  return label.replace(/m$/, '');
}

function typeKeyName(typed: string, key: string, choices: readonly string[]) {
  const byChroma = (note: string) =>
    choices.find((c) => chromaOf(tonicOf(c)) === chromaOf(note)) ?? null;
  if (key === 'Enter') {
    const answer = typed === '' ? null : byChroma(typed);
    return answer ? { typed: '', answer } : { typed, answer: null };
  }
  if (/^[a-gA-G]$/.test(key)) {
    const letter = key.toUpperCase();
    // Answer at once when no button is this letter's sharp or flat.
    const altered = [`${letter}#`, `${letter}b`].some((n) => byChroma(n) !== null);
    const natural = byChroma(letter);
    if (natural && !altered) return { typed: '', answer: natural };
    return { typed: letter, answer: null };
  }
  if ((key === '#' || key === '+' || key === '-') && typed.length === 1) {
    const answer = byChroma(`${typed}${key === '-' ? 'b' : '#'}`);
    return answer ? { typed: '', answer } : { typed, answer: null };
  }
  return { typed, answer: null };
}
