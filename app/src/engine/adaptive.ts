import { ENGINE_CONFIG } from './config';

/**
 * Adaptive-scope controller (design §3.3 step 4, research/02 rule 5): keeps
 * accuracy in the 80–90% band by widening or narrowing a drill's scope level.
 * What a level means (frets, strings, distractors, time limit) is up to the drill.
 */

export interface ScopeState {
  level: number;
  /** Most recent answers, oldest first, capped at the window size. */
  recent: boolean[];
}

export type ScopeChange = 'widen' | 'narrow' | null;

export interface ScopeBounds {
  minLevel: number;
  maxLevel: number;
}

export function initialScope(level = 0): ScopeState {
  return { level, recent: [] };
}

export function rollingAccuracy(recent: readonly boolean[]): number {
  if (recent.length === 0) return 0;
  return recent.filter(Boolean).length / recent.length;
}

export function updateScope(
  state: ScopeState,
  correct: boolean,
  bounds: ScopeBounds,
  cfg: {
    window: number;
    minAnswers: number;
    widenAbove: number;
    narrowBelow: number;
  } = ENGINE_CONFIG.adaptive,
): { state: ScopeState; change: ScopeChange } {
  const recent = [...state.recent, correct].slice(-cfg.window);
  if (recent.length < cfg.minAnswers)
    return { state: { level: state.level, recent }, change: null };
  const acc = rollingAccuracy(recent);
  if (acc > cfg.widenAbove && state.level < bounds.maxLevel) {
    return { state: { level: state.level + 1, recent: [] }, change: 'widen' };
  }
  if (acc < cfg.narrowBelow && state.level > bounds.minLevel) {
    return { state: { level: state.level - 1, recent: [] }, change: 'narrow' };
  }
  return { state: { level: state.level, recent }, change: null };
}
