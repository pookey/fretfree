import type { Goal, Notation, Settings } from '../engine/model';
import type { DailyGoalMinutes } from '../storage';

/** The choices the onboarding steps offer (design §3.7, §4). */

export interface Option<T> {
  value: T;
  label: string;
  detail?: string;
}

export const HANDEDNESS_OPTIONS: readonly Option<Settings['handedness']>[] = [
  { value: 'right', label: 'Right-handed', detail: 'Fretting hand on the left' },
  { value: 'left', label: 'Left-handed', detail: 'The neck is drawn mirrored' },
];

export const GOAL_OPTIONS: readonly Option<Goal>[] = [
  { value: 'songs', label: 'Play songs with friends', detail: 'Pop and singer-songwriter' },
  { value: 'improvise', label: 'Solo and improvise', detail: 'Rock and blues' },
  { value: 'jazz', label: 'Jazz', detail: 'Extended chords and changes' },
  { value: 'general', label: 'Understand everything', detail: 'A bit of it all' },
];

export const DAILY_GOAL_OPTIONS: readonly Option<DailyGoalMinutes>[] = [
  { value: 5, label: 'Casual', detail: '5 minutes a day' },
  { value: 10, label: 'Regular', detail: '10 minutes a day' },
  { value: 15, label: 'Serious', detail: '15 minutes a day' },
  { value: 20, label: 'Intense', detail: '20 minutes a day' },
];

export const NOTATION_OPTIONS: readonly Option<Notation>[] = [
  { value: 'none', label: 'No notation', detail: 'Just the neck and note names' },
  { value: 'tab', label: 'Tab', detail: 'String and fret numbers' },
  { value: 'staff', label: 'Standard notation', detail: 'Notes on the staff' },
];

export const SESSION_LENGTH_OPTIONS: readonly Option<Settings['sessionMinutes']>[] = [
  { value: 5, label: '5 minutes', detail: 'A quick warm-up' },
  { value: 10, label: '10 minutes', detail: 'The sweet spot' },
  { value: 15, label: '15 minutes', detail: 'A full workout' },
];
