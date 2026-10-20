import type { ItemKind, ItemRefs } from '../model';
import { offset, OFFSET, PC, pitchClass } from './helpers';

declare module '../model' {
  interface ItemRefs {
    step: { kind: 'step'; semitones: number; from: string };
  }
}

const STEP_ITEM = new RegExp(`^step:${OFFSET}@${PC}$`);

/** `step:+2@E`: the note 2 semitones (a whole step) above E. */
export function stepItemId(semitones: number, from: string): string {
  return `step:${offset(semitones)}@${pitchClass(from)}`;
}

export function parseStepItemId(id: string): { semitones: number; from: string } | null {
  const m = STEP_ITEM.exec(id);
  if (!m) return null;
  return { semitones: Number(m[1]), from: m[2] as string };
}

export default {
  kinds: ['step'],
  id: (ref) => stepItemId(ref.semitones, ref.from),
  parse(id) {
    const step = parseStepItemId(id);
    return step && { kind: 'step', ...step };
  },
} satisfies ItemKind<ItemRefs['step']>;
