import { parseKeyFactItemId, parseSignatureKeyItemId, type Item } from '../../engine/model';
import { CIRCLE_OF_FIFTHS, keySignature, majorKey, majorScale } from '../../theory';

/**
 * D40's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D40_ID = 'key-signature';

export type D40Kind = 'key-signature' | 'signature-key' | 'relative-minor' | 'dominant';

/**
 * Scope levels (research/02 rule 5, distractors): a run of 2, 3 or 4
 * signature counts or letters, each in two spellings: 4, 6 or 8 buttons
 * (one fewer when the run holds no sharps or flats).
 */
export const D40_SCOPE = { minLevel: 0, maxLevel: 2 };

/** The keys D40 asks about: C4's fifteen, each with a real signature. */
export const D40_KEYS = CIRCLE_OF_FIFTHS.flatMap((e) => [
  e.major,
  ...(e.enharmonic ? [e.enharmonic.major] : []),
]);

export function alterationOf(tonic: string): number {
  return keySignature(majorKey(tonic)).alteration;
}

/** The major key with each signature, sharps up and flats down. */
export const D40_KEY_OF_ALTERATION = new Map(D40_KEYS.map((k) => [alterationOf(k), k]));

export function keyWith(alteration: number): string {
  const key = D40_KEY_OF_ALTERATION.get(alteration);
  if (key === undefined) throw new RangeError(`No major key has alteration ${alteration}`);
  return key;
}

/** The V of a major key: its 5th degree (B♭ for E♭). */
export function dominantOf(tonic: string): string {
  return majorScale(tonic)[4] as string;
}

/** A key-fact or signature item's kind and major key; null for items D40 doesn't ask. */
export function d40Parse(item: Item): { kind: D40Kind; tonic: string } | null {
  const fact = parseKeyFactItemId(item.id);
  if (fact) return D40_KEYS.includes(fact.tonic) ? fact : null;
  const sig = parseSignatureKeyItemId(item.id);
  if (sig) return { kind: 'signature-key', tonic: keyWith(sig.alteration) };
  return null;
}

export function d40CanTest(item: Item): boolean {
  const ref = d40Parse(item);
  // C♯'s V is G♯ major, a key with a double sharp: no card.
  return ref !== null && !(ref.kind === 'dominant' && !D40_KEYS.includes(dominantOf(ref.tonic)));
}

/**
 * The confusion-matrix concept: the key a card is about, for each kind of
 * fact, so `key-signature:Eb` and `signature-key:3b` share `signature:Eb`.
 * A wrong choice is keyed by the key whose fact it is: picking 3♯ for E♭
 * major confuses it with A major.
 */
const CONCEPT: Record<D40Kind, string> = {
  'key-signature': 'signature',
  'signature-key': 'signature',
  'relative-minor': 'relative-minor',
  dominant: 'dominant',
};

export function d40Concept(kind: D40Kind, tonic: string): string {
  return `${CONCEPT[kind]}:${tonic}`;
}

export function d40ConceptOf(item: Item): string | null {
  const ref = d40Parse(item);
  return ref ? d40Concept(ref.kind, ref.tonic) : null;
}
