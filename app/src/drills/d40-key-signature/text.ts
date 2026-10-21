import type { GuideLevel } from '../../engine/model';
import { keySignature, majorKey } from '../../theory';
import {
  D40_KEYS,
  alterationOf,
  keyOfChoice,
  keyWith,
  parseSignatureCode,
  pretty,
  subdominantOf,
  type D40Answer,
  type D40Kind,
  type D40Prompt,
} from './logic';

/**
 * D40's words: the question, the fact and why, what a wrong choice is the
 * answer to, accessible names and the context panel's rules. Only the view
 * and panel use them, so they load with the views, not in first-load JS
 * (design §10).
 */

/** Accessible name: `F#` → `F sharp`, `Bb` → `B flat`. */
export function spoken(note: string): string {
  const letter = note.charAt(0);
  const acc = note.slice(1);
  return acc === '#' ? `${letter} sharp` : acc === 'b' ? `${letter} flat` : letter;
}

function plural(n: number, what: string): string {
  return `${n} ${what}${n === 1 ? '' : 's'}`;
}

/** `3 flats`, `1 sharp`, `No sharps or flats`. */
export function signatureName(alteration: number): string {
  if (alteration === 0) return 'No sharps or flats';
  return plural(Math.abs(alteration), alteration > 0 ? 'sharp' : 'flat');
}

/** The altered notes, in signature order: `B♭ E♭ A♭`. */
export function signatureNotes(alteration: number): string[] {
  return keySignature(majorKey(keyWith(alteration))).accidentals.map(pretty);
}

/** `3 flats: B♭ E♭ A♭`. */
function signatureLine(alteration: number): string {
  return alteration === 0
    ? 'no sharps or flats'
    : `${signatureName(alteration)}: ${signatureNotes(alteration).join(' ')}`;
}

/** A choice's accessible name: `3 flats: B flat, E flat, A flat`, `E flat major`, `C minor`. */
export function spokenChoice(kind: D40Kind, choice: string): string {
  switch (kind) {
    case 'key-signature': {
      const a = parseSignatureCode(choice) ?? 0;
      if (a === 0) return 'No sharps or flats';
      const notes = keySignature(majorKey(keyWith(a)))
        .accidentals.map(spoken)
        .join(', ');
      return `${signatureName(a)}: ${notes}`;
    }
    case 'relative-minor':
      return `${spoken(choice)} minor`;
    case 'signature-key':
    case 'dominant':
      return `${spoken(choice)} major`;
  }
}

/** What the card is about, in large type: `E♭ major`, or `3 flats`. */
export function d40Subject(prompt: D40Prompt): string {
  return prompt.kind === 'signature-key'
    ? signatureName(prompt.alteration)
    : `${pretty(prompt.tonic)} major`;
}

/** The question under the subject. */
export function d40Task(prompt: D40Prompt): string {
  switch (prompt.kind) {
    case 'key-signature':
      return 'How many sharps or flats?';
    case 'signature-key':
      return 'Which major key has this key signature?';
    case 'relative-minor':
      return 'Which minor key shares its key signature (its relative minor)?';
    case 'dominant':
      return 'Which key is its V, a 5th up?';
  }
}

/**
 * The fact and why, in one line: the worked example on a new item's first
 * rep (rule 8), and the answer's name in feedback (rule 10).
 */
export function d40Fact(prompt: D40Prompt): string {
  const key = `${pretty(prompt.tonic)} major`;
  const a = prompt.alteration;
  switch (prompt.kind) {
    case 'key-signature':
      return a === 0
        ? `${key} has no sharps or flats.`
        : `${key} has ${signatureLine(a)}. ${a > 0 ? 'Sharps' : 'Flats'} always come in the order ${order(a)}.`;
    case 'signature-key': {
      if (a === 0) return `No sharps or flats is ${key}.`;
      const notes = signatureNotes(a);
      if (a > 0) {
        return `${signatureLine(a)} is ${key}: a half step above the last sharp, ${notes[notes.length - 1] as string}.`;
      }
      if (a === -1) return `1 flat, B♭, is ${key}.`;
      return `${signatureLine(a)} is ${key}: the second-last flat names the key.`;
    }
    case 'relative-minor': {
      const minor = `${pretty(prompt.answer)} minor`;
      const shared =
        a === 0 ? 'no sharps or flats either' : `its ${signatureName(a).toLowerCase()}`;
      return `${minor} is the relative minor of ${key}: it shares ${shared}, and ${pretty(prompt.answer)} is the 6th of ${key}.`;
    }
    case 'dominant':
      return `${pretty(prompt.answer)} is the V of ${key}: a 5th up, the next key clockwise on the circle.`;
  }
}

/** Why a wrong choice is wrong: what it is the answer to. */
export function d40Explain(prompt: D40Prompt, answer: D40Answer): string | null {
  if (answer === prompt.answer) return null;
  switch (prompt.kind) {
    case 'key-signature': {
      const a = parseSignatureCode(answer);
      if (a === null) return null;
      return a === 0
        ? 'No sharps or flats is C major.'
        : `${signatureName(a)} is ${pretty(keyWith(a))} major.`;
    }
    case 'signature-key':
      return D40_KEYS.includes(answer)
        ? `${pretty(answer)} major has ${signatureLine(alterationOf(answer))}.`
        : null;
    case 'relative-minor': {
      const major = keyOfChoice(prompt.kind, answer);
      return major
        ? `${pretty(answer)} minor is the relative minor of ${pretty(major)} major.`
        : null;
    }
    case 'dominant': {
      if (answer === subdominantOf(prompt.tonic)) {
        return `${pretty(answer)} is the IV of ${pretty(prompt.tonic)} major, a 5th down: the V is the other way round the circle.`;
      }
      const below = keyOfChoice(prompt.kind, answer);
      return below ? `${pretty(answer)} is the V of ${pretty(below)} major.` : null;
    }
  }
}

function order(alteration: number): string {
  return alteration > 0 ? 'F C G D A E B' : 'B E A D G C F';
}

/** What the context panel shows (rule 9: faded within and across sessions). */
export interface D40Guides {
  /** The rule for the kind of card. */
  rule: string | null;
  /**
   * The orders of sharps and flats. Never for the V: the order of sharps is
   * the circle by letter, so it would hand over the V's letter.
   */
  orders: boolean;
  /** Level 2+: the keys in circle order, for counting round (signature cards only). */
  circle: boolean;
}

export function d40Guides(kind: D40Kind, guideLevel: GuideLevel): D40Guides {
  if (guideLevel <= 0) return { rule: null, orders: false, circle: false };
  const signatures = kind === 'key-signature' || kind === 'signature-key';
  return {
    rule: RULES[kind],
    orders: signatures || (kind === 'relative-minor' && guideLevel >= 2),
    circle: signatures && guideLevel >= 2,
  };
}

const RULES: Record<D40Kind, string> = {
  'key-signature':
    'Each step clockwise round the circle adds a sharp; each step anticlockwise adds a flat.',
  'signature-key':
    'Sharps: the key is a half step above the last sharp. Flats: the second-last flat names the key (1 flat is F).',
  'relative-minor':
    "A relative minor shares its major key's signature. Its tonic is the major's 6th, a minor 3rd down.",
  dominant: 'The V is a 5th up: the next key clockwise, with one more sharp or one fewer flat.',
};

/** The sharp keys and the flat keys, in circle order, for the panel. */
export const SHARP_KEY_ORDER = D40_KEYS.filter((k) => alterationOf(k) >= 0)
  .sort((a, b) => alterationOf(a) - alterationOf(b))
  .map(pretty);
export const FLAT_KEY_ORDER = D40_KEYS.filter((k) => alterationOf(k) <= 0)
  .sort((a, b) => alterationOf(b) - alterationOf(a))
  .map(pretty);
