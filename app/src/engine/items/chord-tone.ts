import { chordFormula, isChordKind, type ChordDegree, type ChordKind } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

declare module '../model' {
  interface ItemRefs {
    'chord-tone': {
      kind: 'chord-tone' | 'chord-tone-name';
      degree: ChordDegree;
      chord: ChordKind;
    };
  }
}

const CHORD_TONE_ITEM = /^(chord-tone|chord-tone-name):(b{0,2}\d|#\d)@([A-Za-z0-9]+)$/;

/**
 * `chord-tone:b3@m7`: tap the ♭3 in a shape of a m7 chord (D8, degree →
 * position). `chord-tone-name:b3@m7` is the reverse: which chord tone is the
 * highlighted note? The root, shape and position vary per prompt, so one card
 * holds the degree in every key and voicing (research/02 rule 12). The
 * degree is a formula degree of the kind (`1` is the root).
 */
export function chordToneItemId(
  kind: 'chord-tone' | 'chord-tone-name',
  degree: ChordDegree,
  chord: ChordKind,
): string {
  if (!isChordKind(chord)) throw new RangeError(`Invalid chord kind: ${String(chord)}`);
  if (!chordFormula(chord).includes(degree)) {
    throw new RangeError(`${chord} has no degree ${String(degree)}`);
  }
  return `${kind}:${degree}@${chord}`;
}

export function parseChordToneItemId(
  id: string,
): { kind: 'chord-tone' | 'chord-tone-name'; degree: ChordDegree; chord: ChordKind } | null {
  const m = CHORD_TONE_ITEM.exec(id);
  const chord = m?.[3] as string;
  if (!m || !isChordKind(chord)) return null;
  const degree = m[2] as ChordDegree;
  if (!chordFormula(chord).includes(degree)) return null;
  return { kind: m[1] as 'chord-tone' | 'chord-tone-name', degree, chord };
}

export default {
  kinds: ['chord-tone', 'chord-tone-name'],
  id: (ref) => chordToneItemId(ref.kind, ref.degree, ref.chord),
  parse: parseChordToneItemId,
} satisfies ItemKind<ItemRefs['chord-tone']>;
