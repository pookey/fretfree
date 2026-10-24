import type { AnyDrillType } from '../drills/types';
import { parseItemId, type FactRef, type Item, type Skill } from '../engine';
import { chromaOf, midiAt, stringCount, type Tuning } from '../theory';

/**
 * Chooses the drill that serves each item (design §6). An item can be served
 * by any drill its skill lists that can test it, in the skill's preference
 * order. When several can, the picker moves on from the drill that served
 * the item last to the next in that order, round the list, so a fact is met
 * in every context its skill offers (research/02 rule 12). A drill that
 * needs the mic is a candidate only while mic mode is on (design §9), so a
 * learner without one never meets it, and a drill whose prompt is a sound
 * only while sound is on, so no guess at a sound the learner couldn't hear
 * is graded (research/02 §3.7). Some items need sound whatever drill serves
 * them (`SOUND_KINDS`): D15 serves C2's named `find:` cards with sound off,
 * but never its `ear-find:` cards, which are found by ear alone. A mental
 * practice drill (D21) is optional (rule 14): a candidate only while the
 * "Mental practice" setting is on. No skill gates on one, so with it off its
 * items are served by the skill's other drills.
 */

export interface DrillPicker {
  /** Drills that can test the item, in its skill's preference order. */
  candidates(item: Item): AnyDrillType[];
  canServe(item: Item): boolean;
  /** The drill for the item's next prompt; `last` is the drill that served it last. */
  pick(item: Item, last?: string): AnyDrillType | undefined;
}

/** Item kinds whose prompt is a sound in any drill: with sound off, no drill serves them. */
const SOUND_KINDS: ReadonlySet<string> = new Set(['ear-find']);

/** The item can't be answered without hearing it. */
export function itemNeedsSound(item: Item): boolean {
  const kind = parseItemId(item.id)?.kind;
  return kind !== undefined && SOUND_KINDS.has(kind);
}

export interface DrillPickerOptions {
  /** `settings.micEnabled`: serve drills that need the mic. Off by default. */
  micEnabled?: boolean;
  /** `settings.soundOn`: serve drills whose prompt is a sound. On by default. */
  soundOn?: boolean;
  /** `settings.mentalPractice`: serve mental-practice drills (D21). On by default. */
  mentalPractice?: boolean;
}

export function createDrillPicker(
  skills: readonly Skill[],
  drills: readonly AnyDrillType[],
  options: DrillPickerOptions = {},
): DrillPicker {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const usable = drills.filter(
    (d) =>
      (options.micEnabled || !d.requiresMic) &&
      (options.soundOn !== false || !d.requiresSound) &&
      (options.mentalPractice !== false || !d.mental),
  );
  const candidates = (item: Item) => {
    const skill = byId.get(item.skillId);
    if (!skill || (options.soundOn === false && itemNeedsSound(item))) return [];
    return skill.drillTypes.flatMap((id) => usable.filter((d) => d.id === id && d.canTest(item)));
  };
  return {
    candidates,
    canServe: (item) => candidates(item).length > 0,
    pick(item, last) {
      // The next candidate after the last one, round the list, so every
      // drill the skill lists takes its turn (not only the first two).
      const options = candidates(item);
      const i = options.findIndex((d) => d.id === last);
      return options[(i + 1) % options.length];
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
