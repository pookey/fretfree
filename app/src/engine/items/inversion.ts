import type { Inversion, TriadQuality } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

declare module '../model' {
  interface ItemRefs {
    inversion: {
      kind: 'inversion' | 'inversion-name';
      inversion: Inversion;
      /** The string set's lowest-pitched string: 3 for strings 3–1, 6 for 6–4. */
      lowString: StringSetLow;
      quality: TriadQuality;
    };
  }
}

/** The four three-string sets by their lowest-pitched string: 3–1, 4–2, 5–3 and 6–4. */
export type StringSetLow = 3 | 4 | 5 | 6;

export const STRING_SETS: readonly StringSetLow[] = [3, 4, 5, 6];
export const INVERSIONS: readonly Inversion[] = [0, 1, 2];

const INVERSION_ITEM = /^(inversion|inversion-name):([012])@s([3-6])\/(major|minor)$/;

/**
 * `inversion:1@s3/major`: build the 1st inversion of a major triad on
 * strings 3–1 from its root (I1). `inversion-name:1@s3/major` is the other
 * direction: name the inversion of a triad drawn there (research/02 rule 1,
 * bidirectional cards). Inversion 0 is root position. The root and neck
 * position vary per prompt, so one card holds the shape in every key
 * (rule 12).
 */
export function inversionItemId(
  kind: 'inversion' | 'inversion-name',
  inversion: Inversion,
  lowString: StringSetLow,
  quality: TriadQuality,
): string {
  if (!INVERSIONS.includes(inversion)) {
    throw new RangeError(`Invalid inversion: ${String(inversion)}`);
  }
  if (!STRING_SETS.includes(lowString)) {
    throw new RangeError(`No string set starts at string ${String(lowString)}`);
  }
  if (quality !== 'major' && quality !== 'minor') {
    throw new RangeError(`Invalid triad quality: ${String(quality)}`);
  }
  return `${kind}:${inversion}@s${lowString}/${quality}`;
}

export function parseInversionItemId(id: string): ItemRefs['inversion'] | null {
  const m = INVERSION_ITEM.exec(id);
  if (!m) return null;
  return {
    kind: m[1] as 'inversion' | 'inversion-name',
    inversion: Number(m[2]) as Inversion,
    lowString: Number(m[3]) as StringSetLow,
    quality: m[4] as TriadQuality,
  };
}

export default {
  kinds: ['inversion', 'inversion-name'],
  id: (ref) => inversionItemId(ref.kind, ref.inversion, ref.lowString, ref.quality),
  parse: parseInversionItemId,
} satisfies ItemKind<ItemRefs['inversion']>;
