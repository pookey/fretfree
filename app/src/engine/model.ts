import type { Card as FsrsCard, Rating } from 'ts-fsrs';
import type { FittedFsrsParams } from './refit';

/** Design §3.1 / §3.6. */

export type SkillStatus = 'locked' | 'unlocked' | 'practising' | 'mastered';
export type GuideLevel = 0 | 1 | 2 | 3;

export interface Item {
  /** Stable ID, e.g. `note@s6f5`. */
  readonly id: string;
  readonly skillId: string;
}

export interface Skill {
  readonly id: string;
  readonly topic: string;
  /** Default frontier order (lower first); the goal profile reorders later. */
  readonly order: number;
  readonly title: string;
  /** Skills to master first (merely practise, with `softUnlock`). */
  readonly prerequisites: readonly string[];
  /** Low-risk skills unlock once prerequisites are merely practising. */
  readonly softUnlock?: boolean;
  /**
   * Prerequisites that need only be practising, beside `prerequisites`: one
   * gate can say "C3.thirds mastered, C4.sharp-keys practising" without
   * softening the rest (design §3.4, research/02 rule 7).
   */
  readonly softPrerequisites?: readonly string[];
  /**
   * Leave the skill out of the onboarding placement test (design §3.4):
   * practice rather than a gate, or past where its budget stops a realistic
   * expert. The skill's file says why.
   */
  readonly skipPlacement?: boolean;
  /** Drill type IDs that can test this skill, in preference order. */
  readonly drillTypes: readonly string[];
  items(): readonly Item[];
}

export interface CardRecord {
  itemId: string;
  skillId: string;
  fsrs: FsrsCard;
  createdAt: Date;
  lastReviewedAt: Date | null;
}

export interface ReviewLogRecord {
  id?: number;
  itemId: string;
  skillId: string;
  drillType: string;
  correct: boolean;
  responseMs: number;
  rating: Rating;
  hintUsed: boolean;
  answerGiven: string;
  at: Date;
}

export interface SkillStateRecord {
  skillId: string;
  status: SkillStatus;
  guideLevel: GuideLevel;
  rollingAccuracy: number;
}

export interface ConfusionRecord {
  a: string;
  b: string;
  /** Lifetime number of times the pair was confused. */
  count: number;
  /** The decayed weight as of `lastAt` (engine/confusions.ts). Absent on older rows. */
  weight?: number;
  /** When the pair was last confused. Absent on older rows. */
  lastAt?: Date;
}

export interface SessionLogRecord {
  id?: number;
  startedAt: Date;
  endedAt: Date | null;
  itemsSeen: number;
  accuracy: number;
}

export type Handedness = 'right' | 'left';

/** The notations a learner can read or learn to read (design §4). */
export type Notation = 'tab' | 'staff';
export type NotationSet = Record<Notation, boolean>;

/**
 * What the learner already reads and what they want to learn to read
 * (design §4). The neck is taught by name, position and sound either way;
 * reading adds drills and promotes reading tracks, and never locks one away.
 */
export interface Reading {
  reads: NotationSet;
  learn: NotationSet;
}

export type Goal = 'songs' | 'improvise' | 'jazz' | 'general';

/**
 * The learner's tap-to-click calibration per input, in ms (+ late), taken off
 * every onset after the device's output latency (timing/latency.ts, M8-01).
 * `null` until that input is calibrated.
 */
export interface TimingOffsets {
  tap: number | null;
  mic: number | null;
}

export interface Settings {
  handedness: Handedness;
  tuning: string;
  reading: Reading;
  goal: Goal;
  sessionMinutes: 5 | 10 | 15;
  latencyBaselineMs: number | null;
  micEnabled: boolean;
  accidentalPref: 'sharp' | 'flat';
  soundOn: boolean;
  volume: number;
  /** When onboarding was finished or skipped (design §4); `null` before first launch. */
  onboardedAt: Date | null;
  /** Hide the fret inlays too at guide level 0 (design §3.5). */
  blindMode: boolean;
  /** Per-user FSRS weights, refit after ~1,000 reviews (engine/refit.ts); `null` = defaults. */
  fsrsParams: FittedFsrsParams | null;
  timingOffsets: TimingOffsets;
}

export const DEFAULT_SETTINGS: Settings = {
  handedness: 'right',
  tuning: 'standard',
  reading: { reads: { tab: false, staff: false }, learn: { tab: false, staff: false } },
  goal: 'general',
  sessionMinutes: 10,
  latencyBaselineMs: null,
  micEnabled: false,
  accidentalPref: 'sharp',
  soundOn: true,
  volume: 0.8,
  onboardedAt: null,
  blindMode: false,
  fsrsParams: null,
  timingOffsets: { tap: null, mic: null },
};

// --- Item IDs -------------------------------------------------------------
//
// One ID per atomic fact (research/02 rule 1). Each kind has a canonical form:
// integers without leading zeros, explicit signs on offsets, and sharps for
// accidentals in IDs (drills respell with the accidental preference). Parsers
// accept only the canonical form, so an ID round-trips to itself.
//
// One file per kind family: every `items/<family>.ts` adds its refs to
// `ItemRefs` with a `declare module '../model'` block (keyed by its file
// name) and default-exports an `ItemKind`. Files are picked up
// automatically, so a drill adds an item kind by adding a file rather than
// editing a shared union.

/** Item refs by kind family: each `items/<family>.ts` augments this with its own key. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ItemRefs {}

export type ItemRef = ItemRefs[keyof ItemRefs];

/** A kind family's ID format: the `kind`s it owns, and their ID and parser. */
export interface ItemKind<R extends ItemRef = ItemRef> {
  readonly kinds: readonly R['kind'][];
  /** The canonical ID; throws a `RangeError` for a ref that would not parse. */
  id(ref: R): string;
  /** The ref, or `null` unless `id` is in this family's canonical form. */
  parse(id: string): R | null;
}

/** Item kinds by `kind`, from `items/*.ts` modules keyed by path. */
export function collectItemKinds(
  mods: Record<string, { default?: ItemKind }>,
): ReadonlyMap<string, ItemKind> {
  const out = new Map<string, ItemKind>();
  for (const [path, mod] of Object.entries(mods)) {
    const family = mod.default;
    if (!family) throw new Error(`engine/${path.slice(2)} must default-export an ItemKind`);
    for (const kind of family.kinds) {
      if (out.has(kind)) throw new Error(`Item kind ${kind} is defined twice (${path})`);
      out.set(kind, family);
    }
  }
  return out;
}

const BY_KIND = collectItemKinds(
  import.meta.glob<{ default?: ItemKind }>(
    ['./items/*.ts', '!./items/helpers.ts', '!./items/*.test.ts'],
    { eager: true },
  ),
);
const FAMILIES = [...new Set(BY_KIND.values())];

/** Every registered item kind. */
export const ITEM_KINDS: readonly string[] = [...BY_KIND.keys()];

export function itemId(ref: ItemRef): string {
  const family = BY_KIND.get(ref.kind);
  if (!family) throw new RangeError(`Unknown item kind: ${String(ref.kind)}`);
  return family.id(ref);
}

export function parseItemId(id: string): ItemRef | null {
  for (const family of FAMILIES) {
    const ref = family.parse(id);
    if (ref) return ref;
  }
  return null;
}

// The kinds that predate `items/`, re-exported so their callers keep
// importing from here. New kinds are imported from `engine/items/<family>`.
export * from './items/build-chord';
export * from './items/caged';
export * from './items/capo';
export * from './items/chord-name';
export * from './items/chord-tone';
export * from './items/chord-tones';
export * from './items/degree';
export * from './items/find';
export * from './items/interval';
export * from './items/key-fact';
export * from './items/letter';
export * from './items/marker';
export * from './items/note';
export * from './items/numeral';
export * from './items/octave';
export * from './items/octaves';
export * from './items/penta';
export * from './items/progression';
export * from './items/repeat';
export * from './items/signature-key';
export * from './items/spell-chord';
export * from './items/spell-key';
export * from './items/step';
