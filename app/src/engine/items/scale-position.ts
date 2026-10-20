import { BOX_NUMBERS, type BoxNumber, type ScaleDegree } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

declare module '../model' {
  interface ItemRefs {
    'scale-position':
      | { kind: 'scale-position'; position: BoxNumber }
      | { kind: 'scale-run'; position: BoxNumber; degree: ScaleDegree };
  }
}

type ScalePositionRef = ItemRefs['scale-position'];

const SCALE_DEGREES: readonly ScaleDegree[] = [1, 2, 3, 4, 5, 6, 7];

const POSITION_ITEM = /^scale-position:([1-5])$/;
const RUN_ITEM = /^scale-run:([1-5])@([1-7])$/;

function assertPosition(position: BoxNumber): void {
  if (!BOX_NUMBERS.includes(position)) {
    throw new RangeError(`Invalid scale position: ${String(position)}`);
  }
}

/**
 * `scale-position:1`: fill in major-scale position 1 around the major
 * pentatonic box it holds (I7). Positions use the box numbers, so position 1
 * is the E shape's. The key and neck position vary per prompt, so one card
 * holds the position in every key (research/02 rule 12).
 */
export function scalePositionItemId(position: BoxNumber): string {
  assertPosition(position);
  return `scale-position:${position}`;
}

/**
 * `scale-run:1@5`: play position 1 up from its lowest 5th to its highest
 * (I7: "start from any degree"). Degree 1 is the run from root to root.
 */
export function scaleRunItemId(position: BoxNumber, degree: ScaleDegree): string {
  assertPosition(position);
  if (!SCALE_DEGREES.includes(degree)) throw new RangeError(`Invalid degree: ${String(degree)}`);
  return `scale-run:${position}@${degree}`;
}

export function parseScalePositionItemId(id: string): ScalePositionRef | null {
  const p = POSITION_ITEM.exec(id);
  if (p) return { kind: 'scale-position', position: Number(p[1]) as BoxNumber };
  const r = RUN_ITEM.exec(id);
  if (!r) return null;
  return {
    kind: 'scale-run',
    position: Number(r[1]) as BoxNumber,
    degree: Number(r[2]) as ScaleDegree,
  };
}

export default {
  kinds: ['scale-position', 'scale-run'],
  id: (ref) =>
    ref.kind === 'scale-position'
      ? scalePositionItemId(ref.position)
      : scaleRunItemId(ref.position, ref.degree),
  parse: parseScalePositionItemId,
} satisfies ItemKind<ScalePositionRef>;
