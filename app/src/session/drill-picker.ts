import type { AnyDrillType } from '../drills/types';
import { parseItemId, type FactRef, type Item, type Skill } from '../engine';
import { chromaOf, midiAt, stringCount, type Tuning } from '../theory';

/**
 * Chooses the drill that serves each item (design §6). An item can be served
 * by any drill its skill lists that can test it, in the skill's preference
 * order. When several can, the picker moves away from the drill that served
 * the item last, so a fact is met in more than one context (research/02
 * rule 12). A drill that needs the mic is a candidate only while mic mode
 * is on (design §9), so a learner without one never meets it.
 */

export interface DrillPicker {
  /** Drills that can test the item, in its skill's preference order. */
  candidates(item: Item): AnyDrillType[];
  canServe(item: Item): boolean;
  /** The drill for the item's next prompt; `last` is the drill that served it last. */
  pick(item: Item, last?: string): AnyDrillType | undefined;
}

export interface DrillPickerOptions {
  /** `settings.micEnabled`: serve drills that need the mic. Off by default. */
  micEnabled?: boolean;
}

export function createDrillPicker(
  skills: readonly Skill[],
  drills: readonly AnyDrillType[],
  options: DrillPickerOptions = {},
): DrillPicker {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const usable = options.micEnabled ? drills : drills.filter((d) => !d.requiresMic);
  const candidates = (item: Item) => {
    const skill = byId.get(item.skillId);
    if (!skill) return [];
    return skill.drillTypes.flatMap((id) => usable.filter((d) => d.id === id && d.canTest(item)));
  };
  return {
    candidates,
    canServe: (item) => candidates(item).length > 0,
    pick(item, last) {
      const options = candidates(item);
      return options.find((d) => d.id !== last) ?? options[0];
    },
  };
}

/**
 * The fact an item tests, the same key in both directions (research/02
 * rule 1): `note@s6f5` names "A on string 6" and `find:A@s6` finds it;
 * `marker:f7` names the 7th-fret marker and `find-marker:f7` finds it;
 * `interval-name:M3@s6→s5` names an interval shape and `interval:M3@s6→s5`
 * taps it from a root.
 * Items with no reverse direction return `null`.
 */
export function factOf(item: Item, tuning: Tuning): FactRef | null {
  const ref = parseItemId(item.id);
  switch (ref?.kind) {
    case 'note':
      // A position the tuning lacks (a 6-string item on a 4-string tuning) has no fact.
      if (ref.position.string > stringCount(tuning)) return null;
      return {
        fact: `s${ref.position.string}:${midiAt(ref.position, tuning) % 12}`,
        direction: 'name',
      };
    case 'find':
      return { fact: `s${ref.string}:${chromaOf(ref.pc)}`, direction: 'find' };
    case 'marker':
      return { fact: `marker:${ref.fret}`, direction: 'name' };
    case 'find-marker':
      return { fact: `marker:${ref.fret}`, direction: 'find' };
    case 'interval-name':
    case 'interval':
      // One interval shape: named from two dots (D5) or tapped from a root (D6).
      if (Math.max(ref.from, ref.to) > stringCount(tuning)) return null;
      return {
        fact: `interval:${ref.interval}@s${ref.from}→s${ref.to}`,
        direction: ref.kind === 'interval' ? 'find' : 'name',
      };
    default:
      return null;
  }
}
