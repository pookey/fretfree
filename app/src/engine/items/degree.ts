import type { ItemKind, ItemRefs } from '../model';
import { PC, pitchClass } from './helpers';

declare module '../model' {
  interface ItemRefs {
    degree: { kind: 'degree' | 'degree-of'; degree: number; tonic: string };
  }
}

const DEGREE_ITEM = new RegExp(`^(degree|degree-of):([1-7])@${PC}$`);

/**
 * `degree:6@Eb`: the 6th of E♭ major (C), degree → note. `degree-of:6@Eb`
 * is the reverse: which degree of E♭ major is C? (note → degree).
 */
export function degreeItemId(kind: 'degree' | 'degree-of', degree: number, tonic: string): string {
  if (!Number.isInteger(degree) || degree < 1 || degree > 7) {
    throw new RangeError(`Invalid degree: ${degree}`);
  }
  return `${kind}:${degree}@${pitchClass(tonic)}`;
}

export function parseDegreeItemId(
  id: string,
): { kind: 'degree' | 'degree-of'; degree: number; tonic: string } | null {
  const m = DEGREE_ITEM.exec(id);
  if (!m) return null;
  return { kind: m[1] as 'degree' | 'degree-of', degree: Number(m[2]), tonic: m[3] as string };
}

export default {
  kinds: ['degree', 'degree-of'],
  id: (ref) => degreeItemId(ref.kind, ref.degree, ref.tonic),
  parse: parseDegreeItemId,
} satisfies ItemKind<ItemRefs['degree']>;
