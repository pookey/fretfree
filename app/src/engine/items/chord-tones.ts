import {
  chordFormula,
  isChordKind,
  nameChord,
  parseChord,
  type ChordDegree,
  type ChordKind,
} from '../../theory';
import type { ItemKind, ItemRefs } from '../model';
import { pitchClass } from './helpers';

declare module '../model' {
  interface ItemRefs {
    'chord-tones': {
      kind: 'chord-tones';
      root: string;
      chord: ChordKind;
      degree: ChordDegree | null;
    };
  }
}

const CHORD_TONES_ITEM = /^chord-tones:(?:(b{0,2}\d|#\d)@)?([A-G][#b]?[A-Za-z0-9]*)$/;

/**
 * `chord-tones:C`: tap every note of C major across the neck (D37, chord →
 * positions). `chord-tones:3@C` taps every 3rd of C major, and
 * `chord-tones:b7@Cm7` every ♭7 of Cm7. One card per chord: the chord's
 * symbol is part of the ID, so "Quiz me on this" in Explore can find it.
 */
export function chordTonesItemId(
  root: string,
  chord: ChordKind,
  degree: ChordDegree | null = null,
): string {
  if (!isChordKind(chord)) throw new RangeError(`Invalid chord kind: ${String(chord)}`);
  if (degree !== null && !chordFormula(chord).includes(degree)) {
    throw new RangeError(`${chord} has no degree ${String(degree)}`);
  }
  const symbol = nameChord(pitchClass(root), chord);
  return degree === null ? `chord-tones:${symbol}` : `chord-tones:${degree}@${symbol}`;
}

export function parseChordTonesItemId(
  id: string,
): { root: string; chord: ChordKind; degree: ChordDegree | null } | null {
  const m = CHORD_TONES_ITEM.exec(id);
  if (!m) return null;
  let parsed;
  try {
    parsed = parseChord(m[2] as string);
  } catch {
    return null;
  }
  // Canonical symbols only (`Cm7`, not `Cmin7`), so an ID round-trips.
  if (nameChord(parsed.root, parsed.kind) !== m[2]) return null;
  const degree = (m[1] ?? null) as ChordDegree | null;
  if (degree !== null && !chordFormula(parsed.kind).includes(degree)) return null;
  return { root: parsed.root, chord: parsed.kind, degree };
}

export default {
  kinds: ['chord-tones'],
  id: (ref) => chordTonesItemId(ref.root, ref.chord, ref.degree),
  parse(id) {
    const chordTones = parseChordTonesItemId(id);
    return chordTones && { kind: 'chord-tones', ...chordTones };
  },
} satisfies ItemKind<ItemRefs['chord-tones']>;
