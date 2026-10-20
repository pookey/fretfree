import type { GuideLevel, Item, NumeralItemKind } from '../../engine/model';
import {
  chordSymbol,
  chordTones,
  diatonicChords,
  keyName,
  nashvilleNumber,
  parseChordSymbol,
  parseRoman,
  romanNumeral,
  romanOf,
  scaleOf,
  type ChordQuality,
  type DiatonicChord,
  type MusicalKey,
  type Numeral,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D11_CHOICES, D11_SCOPE, d11Concept as concept, d11Parse as parse } from './meta';

export { D11_CHOICES, D11_ID, D11_SCOPE, d11CanTest, d11ConceptOf } from './meta';

/**
 * D11 "Roman numeral ↔ chord in a key" (design §6), the pure half of the
 * drill. It tests C8's numeral cards by choice:
 *
 * - `numeral:vi@key=D`: "vi in D major?", answered with a chord (Bm);
 * - `numeral-of:vi@key=D`: "Bm in D major?", answered with a numeral (vi);
 * - `nashville:6m@key=D`: "6m in D major?", answered with a chord (Bm).
 *
 * Neither the choices' shape nor the quality pattern may point at the
 * answer: only knowing the key does (rule 1).
 *
 * - A chord answer's choices come in quality pairs, one root each: the
 *   answer with its twin (Bm beside B), and other roots of the key. Major vs
 *   minor is the confusion research/02 rule 6 names, and every root shows up
 *   twice. A diminished answer's roots all come as diminished and minor, so
 *   ° alone doesn't give it away.
 * - A numeral answer's choices are the key's own numerals, one per degree.
 *   The chord on screen already shows its quality, so a twin (VI beside vi)
 *   would be thrown out by anyone who knows the pattern I ii iii IV V vi
 *   vii°. Instead all the numerals of the answer's quality are offered, and
 *   the pattern narrows a card to one in three at best. vii° is the only
 *   diminished numeral: naming it is the fact taught.
 *
 * Both rows hold two neighbouring degrees, since counting off by one is the
 * common slip. The neighbour is never chosen beside the answer: then it
 * would point at it. Which roots or numerals join the answer's is drawn the
 * same way whichever of them the answer is, so nothing in the row's shape
 * (what is offered twice, what sits next to what, where in the row) tells
 * them apart. `logic.test.ts` plays those guesses over every card.
 *
 * A wrong degree is logged against the numeral it really is
 * (`numeral:<roman>`), so the session interleaves the pair.
 *
 * Minor keys (for I4) are read too. Their numerals count from the major
 * scale on the same tonic (i ii° ♭III iv v ♭VI ♭VII, `theory/harmony`), and
 * the prompt says so. The choices never offer III, VI or VII in a minor key,
 * so a learner who numbers from the relative major can't pick a
 * correct-but-differently-numbered answer and be marked wrong.
 */

/** What the learner answers with. */
export type D11Ask = 'chord' | 'numeral';

/** Numeral answers offer at most the key's seven numerals. */
const MAX_NUMERAL_CHOICES = 7;

export interface D11Prompt {
  itemId: string;
  kind: NumeralItemKind;
  ask: D11Ask;
  key: MusicalKey;
  /** The chord the item is about, with its numeral and Nashville number. */
  target: DiatonicChord;
  /** The right choice: a chord symbol (`Bm`) or a Roman numeral (`vi`). */
  answer: string;
  /** Chord symbols or Roman numerals, in reading order. */
  choices: string[];
  level: number;
}

/** A chord symbol or a Roman numeral, as written in `choices`. */
export type D11Answer = string;

export function d11Ask(kind: NumeralItemKind): D11Ask {
  return kind === 'numeral-of' ? 'numeral' : 'chord';
}

function numeralOfChord(c: DiatonicChord): Numeral {
  return parseRoman(c.roman) as Numeral;
}

function valueOf(c: DiatonicChord, ask: D11Ask, quality: ChordQuality = c.quality): string {
  return ask === 'chord'
    ? chordSymbol({ root: c.root, quality })
    : romanNumeral({ ...numeralOfChord(c), quality });
}

/** Degrees apart round the scale: vii° and I are neighbours. */
function degreeGap(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 7 - d);
}

function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ACCIDENTAL_RANK: Record<string, number> = { bb: 0, b: 1, '': 2, '#': 3, '##': 4 };
const QUALITY_RANK: Partial<Record<ChordQuality, number>> = { major: 0, minor: 1, diminished: 2 };

function chordRank(symbol: string): number {
  const c = parseChordSymbol(symbol);
  const letter = LETTERS.indexOf(c.root.charAt(0));
  const acc = ACCIDENTAL_RANK[c.root.slice(1)] ?? 2;
  return letter * 100 + acc * 10 + (QUALITY_RANK[c.quality] ?? 3);
}

function numeralRank(roman: string): number {
  const n = parseRoman(roman) as Numeral;
  return n.degree * 100 + (n.alteration + 2) * 10 + (QUALITY_RANK[n.quality] ?? 3);
}

/** The two qualities offered on one root: major and minor, or diminished and minor. */
function pairOf(diminished: boolean): ChordQuality[] {
  return diminished ? ['diminished', 'minor'] : ['major', 'minor'];
}

/**
 * The choices (see above), up to the level's count. Chords read in letter
 * order (C to B), not scale order, so a choice's place never gives its
 * degree away; numerals read I to vii.
 */
export function d11Choices(
  key: MusicalKey,
  target: DiatonicChord,
  ask: D11Ask,
  level: number,
  rng: () => number,
): string[] {
  const i = Math.max(D11_SCOPE.minLevel, Math.min(D11_SCOPE.maxLevel, Math.round(level)));
  const count = D11_CHOICES[i] as number;
  const others = diatonicChords(key).filter((c) => c.degree !== target.degree);
  const picked =
    ask === 'chord'
      ? chordPairs(target, others, count, rng)
      : numeralChoices(target, others, Math.min(count, MAX_NUMERAL_CHOICES), rng);
  const rank = ask === 'chord' ? chordRank : numeralRank;
  return picked.sort((a, b) => rank(a) - rank(b));
}

/** Every way to choose `size` of `xs`. */
function subsets<T>(xs: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  return xs.flatMap((x, i) => subsets(xs.slice(i + 1), size - 1).map((rest) => [x, ...rest]));
}

function pick<T>(xs: readonly T[], rng: () => number): T {
  return xs[Math.floor(rng() * xs.length)] as T;
}

function hasNeighbours(chords: readonly DiatonicChord[]): boolean {
  return chords.some((a) => chords.some((b) => degreeGap(a.degree, b.degree) === 1));
}

/**
 * Chord answers: `count / 2` roots, each offered both ways. Any set of
 * roots that holds the answer's and two neighbours is as likely as any
 * other, so the answer is as likely to be any one of them.
 */
function chordPairs(
  target: DiatonicChord,
  others: DiatonicChord[],
  count: number,
  rng: () => number,
): string[] {
  const sets = subsets(others, count / 2 - 1).filter((s) => hasNeighbours([target, ...s]));
  const qualities = pairOf(target.quality === 'diminished');
  return [target, ...pick(sets, rng)].flatMap((c) => qualities.map((q) => valueOf(c, 'chord', q)));
}

/**
 * Numeral answers: all the key's numerals of the answer's quality (ii, iii
 * and vi for a minor chord), then a neighbour of a random one of them, then
 * the rest at random. None of it depends on which of them is the answer.
 */
function numeralChoices(
  target: DiatonicChord,
  others: DiatonicChord[],
  count: number,
  rng: () => number,
): string[] {
  const same = [target, ...others.filter((c) => c.quality === target.quality)];
  const rest = others.filter((c) => !same.includes(c));
  const anchor = pick(same, rng);
  const near = rest.filter((c) => degreeGap(c.degree, anchor.degree) === 1);
  const neighbour = near.length > 0 ? pick(near, rng) : undefined;
  const after = shuffle(
    rest.filter((c) => c !== neighbour),
    rng,
  );
  return [...same, ...(neighbour ? [neighbour] : []), ...after]
    .slice(0, count)
    .map((c) => valueOf(c, 'numeral'));
}

export function d11MakePrompt(item: Item, ctx: DrillContext): D11Prompt {
  const p = parse(item);
  if (!p) throw new Error(`D11 cannot test item ${item.id}`);
  const ask = d11Ask(p.kind);
  return {
    itemId: item.id,
    kind: p.kind,
    ask,
    key: p.key,
    target: p.target,
    answer: valueOf(p.target, ask),
    choices: d11Choices(p.key, p.target, ask, ctx.scopeLevel, ctx.rng),
    level: ctx.scopeLevel,
  };
}

// ---------------------------------------------------------------------------
// Display

const PRETTY_ACCIDENTAL: Record<string, string> = { b: '♭', bb: '𝄫', '#': '♯', '##': '𝄪' };

/** `F#m` → `F♯m`, `Bbdim` → `B♭dim`. */
export function prettyChord(symbol: string): string {
  return symbol.replace(
    /^([A-G])(#{1,2}|b{1,2})?/,
    (_, letter: string, acc?: string) => letter + (acc ? PRETTY_ACCIDENTAL[acc] : ''),
  );
}

/** `bVII` → `♭VII`; also Nashville `b7` → `♭7`. */
export function prettyNumeral(numeral: string): string {
  return numeral.replace(/^(#{1,2}|b{1,2})/, (acc: string) => PRETTY_ACCIDENTAL[acc] as string);
}

/** `F♯ major`, `A minor`. */
export function prettyKey(key: MusicalKey): string {
  return prettyChord(keyName(key));
}

const SPOKEN_ACCIDENTAL: Record<string, string> = {
  b: ' flat',
  bb: ' double flat',
  '#': ' sharp',
  '##': ' double sharp',
};

const SPOKEN_QUALITY: Partial<Record<ChordQuality, string>> = {
  major: 'major',
  minor: 'minor',
  diminished: 'diminished',
};

function spokenNote(note: string): string {
  return note.charAt(0) + (SPOKEN_ACCIDENTAL[note.slice(1)] ?? '');
}

/** Accessible name: `F#m` → `F sharp minor`, `D` → `D major`. */
export function spokenChord(symbol: string): string {
  const c = parseChordSymbol(symbol);
  return `${spokenNote(c.root)} ${SPOKEN_QUALITY[c.quality] ?? c.quality}`;
}

/** Accessible name: `vi` → `6 minor`, `bVII` → `flat 7 major`, `vii°` → `7 diminished`. */
export function spokenNumeral(n: Numeral): string {
  const acc = n.alteration < 0 ? 'flat ' : n.alteration > 0 ? 'sharp ' : '';
  return `${acc}${n.degree} ${SPOKEN_QUALITY[n.quality] ?? n.quality}`;
}

export function spokenRoman(roman: string): string {
  const n = parseRoman(roman);
  return n ? spokenNumeral(n) : roman;
}

/** A choice's accessible name. */
export function spokenChoice(prompt: Pick<D11Prompt, 'ask'>, value: string): string {
  return prompt.ask === 'chord' ? spokenChord(value) : spokenRoman(value);
}

/** A choice as shown on its button. */
export function prettyChoice(prompt: Pick<D11Prompt, 'ask'>, value: string): string {
  return prompt.ask === 'chord' ? prettyChord(value) : prettyNumeral(value);
}

/** The cue the learner reads: the numeral, the Nashville number or the chord. */
export function d11Cue(prompt: D11Prompt): string {
  if (prompt.kind === 'numeral') return prettyNumeral(prompt.target.roman);
  if (prompt.kind === 'nashville') return prettyNumeral(prompt.target.nashville);
  return prettyChord(prompt.target.symbol);
}

/**
 * A Nashville number split for display: the degree, then its quality suffix
 * apart from it (`6`, `m`), so a suffix never reads as part of the number.
 */
export function nashvilleParts(nashville: string): { degree: string; suffix: string } {
  const m = /^((?:#{1,2}|b{1,2})?[1-7])(.*)$/.exec(nashville);
  return m
    ? { degree: prettyNumeral(m[1] as string), suffix: m[2] as string }
    : { degree: nashville, suffix: '' };
}

/** The cue's accessible name: `vi`, `Nashville 6 minor`, `B minor`. */
export function d11SpokenCue(prompt: D11Prompt): string {
  const n = numeralOfChord(prompt.target);
  if (prompt.kind === 'numeral') return `${prompt.target.roman}: ${spokenNumeral(n)}`;
  if (prompt.kind === 'nashville') return `Nashville ${spokenNumeral(n)}`;
  return spokenChord(prompt.target.symbol);
}

/** The task line. */
export function d11Task(prompt: D11Prompt): string {
  const key = prettyKey(prompt.key);
  if (prompt.ask === 'numeral') return `${d11Cue(prompt)} in ${key} is which numeral?`;
  const cue = prompt.kind === 'nashville' ? `Nashville ${d11Cue(prompt)}` : d11Cue(prompt);
  return `Which chord is ${cue} in ${key}?`;
}

/**
 * How a minor key is numbered, stated with the question so the convention is
 * never a trap: `null` in a major key.
 */
export function d11Convention(key: MusicalKey): string | null {
  if (key.mode !== 'minor') return null;
  const flats = diatonicChords(key).filter((c) => numeralOfChord(c).alteration !== 0);
  const roots = flats.map((c) => prettyChord(c.root));
  const numerals = flats.map((c) => prettyNumeral(c.roman));
  return `Numbered from ${prettyChord(key.tonic)} major, so the chords on ${list(roots)} are ${list(numerals)}.`;
}

function list(xs: readonly string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs.at(-1) as string}`;
}

function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}

/** How a quality shows in the cue: case for numerals, a suffix for Nashville. */
function qualityMark(prompt: D11Prompt, quality: ChordQuality): string {
  const word = SPOKEN_QUALITY[quality] ?? quality;
  if (prompt.kind === 'nashville') {
    if (quality === 'minor') return `${word} (m)`;
    if (quality === 'diminished') return `${word} (°)`;
    return `${word} (a plain number)`;
  }
  if (quality === 'diminished') return `${word} (lower case with °)`;
  return `${word} (${quality === 'minor' ? 'lower' : 'upper'} case)`;
}

/** Where the chord's root sits in the key: `the 6th note of D major`. */
function rootPlace(prompt: D11Prompt): string {
  const key = prettyKey(prompt.key);
  const n = numeralOfChord(prompt.target);
  if (n.alteration === 0) return `the ${ordinal(n.degree)} note of ${key}`;
  const major = prettyChord(prompt.key.tonic);
  return `a ${n.alteration < 0 ? 'flat' : 'sharp'} ${ordinal(n.degree)} counted from ${major} major`;
}

/** The worked-example line for the first, guided rep of a new item (rule 8). */
export function d11WorkedExample(prompt: D11Prompt): string {
  const t = prompt.target;
  const root = prettyChord(t.root);
  const chord = prettyChord(t.symbol);
  const quality = qualityMark(prompt, t.quality);
  if (prompt.ask === 'numeral') {
    return `${chord} is built on ${root}, ${rootPlace(prompt)}, and it's ${quality}, so it's ${prettyNumeral(t.roman)}.`;
  }
  return `${d11Cue(prompt)} is the chord on ${rootPlace(prompt)}, ${root}, and it's ${quality}: ${chord}.`;
}

/** The hint under the task (guide level 1+). It names the method, never the answer. */
export function d11Hint(prompt: D11Prompt): string {
  return `Count up the scale from ${prettyChord(prompt.key.tonic)} as 1.`;
}

/** The key's chord pattern as the cue writes it: `I ii iii IV V vi vii°` or `1 2m … 7°`. */
export function d11Pattern(prompt: Pick<D11Prompt, 'kind' | 'key'>): string[] {
  return diatonicChords(prompt.key).map((c) =>
    prettyNumeral(prompt.kind === 'nashville' ? c.nashville : c.roman),
  );
}

/** The key's scale, for guide level 3. */
export function d11Scale(prompt: Pick<D11Prompt, 'key'>): string[] {
  return scaleOf(prompt.key).map(prettyChord);
}

/** What each guide level shows (rule 9: faded within and across sessions). */
export interface D11Guides {
  /** "Count up the scale from the tonic." */
  hint: boolean;
  /** The key's quality pattern: I ii iii IV V vi vii°. */
  pattern: boolean;
  /** The key's scale notes. */
  scale: boolean;
}

export function d11Guides(level: GuideLevel): D11Guides {
  return { hint: level >= 1, pattern: level >= 2, scale: level >= 3 };
}

// ---------------------------------------------------------------------------
// Grading

/** The Roman numeral an answer stands for in the prompt's key, or null if it isn't one. */
export function d11NumeralOf(prompt: D11Prompt, answer: D11Answer): string | null {
  if (prompt.ask === 'numeral') return parseRoman(answer) ? answer : null;
  try {
    return romanOf(prompt.key, answer);
  } catch {
    return null;
  }
}

/** The chord an answer stands for in the prompt's key, or null if it isn't one. */
function chordOf(prompt: D11Prompt, answer: D11Answer): string | null {
  if (prompt.ask === 'chord') {
    try {
      return chordSymbol(parseChordSymbol(answer));
    } catch {
      return null;
    }
  }
  const n = parseRoman(answer);
  if (!n) return null;
  const chord = diatonicChords(prompt.key).find(
    (c) => numeralOfChord(c).degree === n.degree && numeralOfChord(c).alteration === n.alteration,
  );
  return chord ? chordSymbol({ root: chord.root, quality: n.quality }) : null;
}

export function d11Expected(prompt: D11Prompt): string {
  return prettyChoice(prompt, prompt.answer);
}

export function d11Check(prompt: D11Prompt, answer: D11Answer): DrillCheck {
  const expected = d11Expected(prompt);
  const own = concept(prompt.target.roman);
  if (answer === prompt.answer) return { correct: true, expected, concept: own };
  const given = d11NumeralOf(prompt, answer);
  // A quality slip on the right degree (VI for vi) names no chord of the key,
  // so no card shares its concept: only a wrong degree is a confusion to pair.
  const slip = given !== null && sameDegree(parseRoman(given) as Numeral, prompt.target);
  return {
    correct: false,
    expected,
    concept: own,
    ...(given && !slip ? { confusedWith: concept(given) } : {}),
  };
}

function sameDegree(n: Numeral, c: DiatonicChord): boolean {
  const t = numeralOfChord(c);
  return n.degree === t.degree && n.alteration === t.alteration;
}

/** Why the answer is what it is, after a wrong one. */
export function d11Explain(prompt: D11Prompt, answer: D11Answer): string[] {
  if (answer === prompt.answer) return [];
  const t = prompt.target;
  const shown = prettyChoice(prompt, answer);
  const right = prettyChoice(prompt, prompt.answer);
  const given = chordOf(prompt, answer);
  const sameRoot = given !== null && parseChordSymbol(given).root === t.root;
  const quality = qualityMark(prompt, t.quality);
  if (sameRoot) {
    return [
      `Right root, wrong quality: the chord on ${prettyChord(t.root)} in ${prettyKey(prompt.key)} is ${quality}, so ${right}, not ${shown}.`,
    ];
  }
  const lines = [
    `${prettyChord(t.root)} is ${rootPlace(prompt)}, and that chord is ${quality}: ${right}.`,
  ];
  const givenNumeral = d11NumeralOf(prompt, answer);
  if (given !== null && givenNumeral !== null) {
    lines.push(
      prompt.ask === 'chord'
        ? `${shown} is ${prettyNumeral(asCue(prompt, givenNumeral))} in ${prettyKey(prompt.key)}.`
        : `${shown} is ${prettyChord(given)} in ${prettyKey(prompt.key)}.`,
    );
  }
  return lines;
}

/** A Roman numeral in the cue's notation: Nashville for a Nashville card. */
function asCue(prompt: D11Prompt, roman: string): string {
  return prompt.kind === 'nashville' ? nashvilleNumber(parseRoman(roman) as Numeral) : roman;
}

/** The chord tones from octave 3 up, for playback: Bm → B3 D4 F#4. */
export function d11Voicing(symbol: string): string[] {
  let octave = 3;
  let prev = -1;
  return chordTones(symbol).map((note) => {
    const letter = LETTERS.indexOf(note.charAt(0));
    if (letter <= prev) octave += 1;
    prev = letter;
    return `${note}${octave}`;
  });
}

/** Sound with the name (rule 10): the right chord, then the chosen one when wrong. */
export function d11Sounds(prompt: D11Prompt, fb: DrillFeedback<D11Answer>): DrillSounds {
  const expected = d11Voicing(prompt.target.symbol);
  if (fb.result.correct) return { expected };
  const given = chordOf(prompt, fb.answer);
  return given ? { expected, given: d11Voicing(given) } : { expected };
}

/** Stored as `answerGiven`. */
export function d11DescribeAnswer(answer: D11Answer): string {
  return answer;
}

/** Hardware keyboard (design §7): 1–9 pick the choice in that place. */
export function d11KeyToAnswer(key: string, choices: readonly string[]): D11Answer | null {
  if (!/^[1-9]$/.test(key)) return null;
  return choices[Number(key) - 1] ?? null;
}

/** One chord of the key's strip, shown in feedback: where the answer sits among its chords. */
export interface D11StripChord {
  degree: number;
  /** The numeral or Nashville number, as the cue writes it. */
  label: string;
  symbol: string;
  state: 'answer' | 'given' | null;
}

/**
 * The key's chords in scale order, the answer marked, and the chosen chord
 * marked when it is another chord of the key (design §7 "the key and its
 * diatonic chords"): sight and name together (rule 10).
 */
export function d11Strip(prompt: D11Prompt, answer: D11Answer | null): D11StripChord[] {
  const given = answer !== null && answer !== prompt.answer ? chordOf(prompt, answer) : null;
  return diatonicChords(prompt.key).map((c) => ({
    degree: c.degree,
    label: prettyNumeral(prompt.kind === 'nashville' ? c.nashville : c.roman),
    symbol: prettyChord(c.symbol),
    state: c.degree === prompt.target.degree ? 'answer' : given === c.symbol ? 'given' : null,
  }));
}
