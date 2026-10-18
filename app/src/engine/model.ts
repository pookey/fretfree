import type { Card as FsrsCard, Rating } from 'ts-fsrs';
import type { Position } from '../theory';

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
  readonly prerequisites: readonly string[];
  /** Low-risk skills unlock once prerequisites are merely practising. */
  readonly softUnlock?: boolean;
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
  count: number;
}

export interface SessionLogRecord {
  id?: number;
  startedAt: Date;
  endedAt: Date | null;
  itemsSeen: number;
  accuracy: number;
}

export type Handedness = 'right' | 'left';
export type Notation = 'none' | 'tab' | 'staff';
export type Goal = 'songs' | 'improvise' | 'jazz' | 'general';

export interface Settings {
  handedness: Handedness;
  tuning: string;
  notation: Notation;
  goal: Goal;
  sessionMinutes: 5 | 10 | 15;
  latencyBaselineMs: number | null;
  micEnabled: boolean;
  accidentalPref: 'sharp' | 'flat';
  soundOn: boolean;
  volume: number;
}

export const DEFAULT_SETTINGS: Settings = {
  handedness: 'right',
  tuning: 'standard',
  notation: 'none',
  goal: 'general',
  sessionMinutes: 10,
  latencyBaselineMs: null,
  micEnabled: false,
  accidentalPref: 'sharp',
  soundOn: true,
  volume: 0.8,
};

// --- Item IDs -------------------------------------------------------------

const NOTE_ITEM = /^note@s(\d+)f(\d+)$/;

/** `note@s6f5`: name the note at string 6, fret 5. */
export function noteItemId(pos: Position): string {
  return `note@s${pos.string}f${pos.fret}`;
}

export function parseNoteItemId(id: string): Position | null {
  const m = NOTE_ITEM.exec(id);
  if (!m) return null;
  return { string: Number(m[1]), fret: Number(m[2]) };
}
