/**
 * The daily-goal ring and streak copy (design §3.7, §7 Today). Pure, so the
 * hero and the sidebar badge say exactly the same thing to VoiceOver.
 */

export interface GoalProgress {
  /** Whole minutes practised today. */
  minutes: number;
  goalMinutes: number;
  /** 0…1, clamped: a double session still draws one full ring. */
  fraction: number;
  met: boolean;
}

export function goalProgress(minutesToday: number, goalMinutes: number): GoalProgress {
  const minutes = Math.max(0, Math.floor(minutesToday));
  const fraction = goalMinutes > 0 ? Math.min(1, Math.max(0, minutesToday / goalMinutes)) : 0;
  return { minutes, goalMinutes, fraction, met: goalMinutes > 0 && minutesToday >= goalMinutes };
}

/** The ring's accessible name, e.g. "Daily goal: 6 of 10 minutes". */
export function goalLabel(p: GoalProgress): string {
  return `Daily goal${p.met ? ' met' : ''}: ${p.minutes} of ${p.goalMinutes} minutes`;
}

export function streakLabel(days: number): string {
  return `${days}-day streak`;
}

export function freezesLabel(held: number): string {
  if (held === 0) return 'No streak freezes held';
  return `${held} streak ${held === 1 ? 'freeze' : 'freezes'} held`;
}

/** The ring is a circle of this radius in a 100×100 viewBox. */
export const RING_RADIUS = 42;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** `stroke-dashoffset` that draws `fraction` of the ring. */
export function ringOffset(fraction: number): number {
  return RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, fraction)));
}
