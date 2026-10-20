import { PROGRESSIONS } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

/**
 * `prog:I-V-vi-IV:build`: fill a progression's slots in a key (D12, numerals
 * → chords). `prog:I-V-vi-IV:transpose` moves its chart to another key. The
 * progression is a catalogue ID (`theory/harmony` PROGRESSIONS), and the
 * keys vary per prompt, so one card holds the progression in every key
 * (research/02 rule 12).
 */
export type ProgressionTask = 'build' | 'transpose';

declare module '../model' {
  interface ItemRefs {
    progression: { kind: 'progression'; progression: string; task: ProgressionTask };
  }
}

const PROGRESSION_ITEM = /^prog:([A-Za-z0-9-]+):(build|transpose)$/;

function isProgressionId(id: string): boolean {
  return PROGRESSIONS.some((p) => p.id === id);
}

export function progressionItemId(progression: string, task: ProgressionTask): string {
  if (!isProgressionId(progression)) throw new RangeError(`Unknown progression: ${progression}`);
  if (task !== 'build' && task !== 'transpose') {
    throw new RangeError(`Invalid progression task: ${String(task)}`);
  }
  return `prog:${progression}:${task}`;
}

export function parseProgressionItemId(
  id: string,
): { progression: string; task: ProgressionTask } | null {
  const m = PROGRESSION_ITEM.exec(id);
  if (!m || !isProgressionId(m[1] as string)) return null;
  return { progression: m[1] as string, task: m[2] as ProgressionTask };
}

export default {
  kinds: ['progression'],
  id: (ref) => progressionItemId(ref.progression, ref.task),
  parse(id) {
    const progression = parseProgressionItemId(id);
    return progression && { kind: 'progression', ...progression };
  },
} satisfies ItemKind<ItemRefs['progression']>;
