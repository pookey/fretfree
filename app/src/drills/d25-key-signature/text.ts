import type { GuideLevel } from '../../engine/model';
import { describeStaffPosition, keySignature, keySignaturePositions, majorKey } from '../../theory';
import { keyWith } from '../d40-key-signature/meta';
import { nearestSignature, pretty, type D25Answer, type D25Prompt } from './logic';

/**
 * D25's words: the question, the fact and why, what a wrong spelling would
 * need, accessible names and the context panel's guides. Only the view and
 * panel use them, so they load with the views, not in first-load JS
 * (design §10).
 */

/** Accessible name: `F#` → `F sharp`, `Bb` → `B flat`. */
export function spoken(spelling: string): string {
  const letter = spelling.charAt(0);
  const acc = spelling.slice(1);
  return acc === '#' ? `${letter} sharp` : acc === 'b' ? `${letter} flat` : letter;
}

/** `2 sharps`, `1 flat`, `No sharps or flats`. */
export function signatureName(alteration: number): string {
  if (alteration === 0) return 'No sharps or flats';
  const n = Math.abs(alteration);
  return `${n} ${alteration > 0 ? 'sharp' : 'flat'}${n === 1 ? '' : 's'}`;
}

/** The signature's notes, in order: `F♯ C♯`. */
export function signatureNotes(alteration: number): string[] {
  return keySignature(majorKey(keyWith(alteration))).accidentals.map(pretty);
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * The staff's accessible name: the signature as a sighted reader sees it,
 * its signs and where they sit, never which letters they are (that is the
 * reading). "Treble clef, key signature of 2 sharps: on the 5th line and
 * the 3rd space. One note, no accidental."
 */
export function d25StaffLabel(prompt: D25Prompt): string {
  const a = prompt.alteration;
  const where =
    a === 0
      ? ''
      : `: on the ${keySignaturePositions(majorKey(prompt.tonic))
          .map(describeStaffPosition)
          .join(', the ')}`;
  return `Treble clef, key signature of ${lower(signatureName(a))}${where}. One note, no accidental.`;
}

/** The question. */
export const D25_TASK = 'What is this note in this key signature?';

/**
 * The fact and why, in one line: the worked example on a new card's first
 * rep (rule 8), and the answer's name in feedback (rule 10).
 */
export function d25Fact(prompt: D25Prompt): string {
  const a = prompt.alteration;
  const letter = prompt.letter;
  const answer = pretty(prompt.answer);
  if (a === 0) return `No sharps or flats: ${letter} stays ${letter}.`;
  const notes = signatureNotes(a);
  const sig = `${signatureName(a)}: ${notes.join(' ')}`;
  if (answer === letter) return `${sig}. ${letter} isn’t one of them, so it stays ${letter}.`;
  return `${sig}. Every ${letter} is ${answer}, in every octave.`;
}

/** Why a wrong spelling is wrong: what it would need. */
export function d25Explain(prompt: D25Prompt, answer: D25Answer): string | null {
  if (answer === prompt.answer || !prompt.choices.includes(answer)) return null;
  const letter = prompt.letter;
  if (answer === letter) {
    const verb = prompt.answer.endsWith('#') ? 'sharpens' : 'flattens';
    return `${letter} would need a natural sign (♮) before it: this signature ${verb} every ${letter}.`;
  }
  const sig = nearestSignature(letter, answer.endsWith('#') ? 1 : -1, prompt.alteration);
  if (sig === null) return null;
  return `${pretty(answer)} would need its own sign, or a signature of ${lower(signatureName(sig))}.`;
}

/** What the context panel shows (rule 9: faded within and across sessions). */
export interface D25Guides {
  /** Level 1+: a signature holds in every octave. */
  rule: boolean;
  /** Level 2+: the orders of sharps and flats. */
  orders: boolean;
  /** Level 3: how to read the signature off the orders. */
  method: boolean;
}

export function d25Guides(guideLevel: GuideLevel): D25Guides {
  return { rule: guideLevel >= 1, orders: guideLevel >= 2, method: guideLevel >= 3 };
}

export const D25_RULE =
  'A key signature’s sharps or flats hold for those letters in every octave, unless an accidental says otherwise.';
export const D25_METHOD =
  'Count the signs, then take that many letters from the start of the order: those letters are sharp (or flat); the rest stay natural.';
