import { parseLocalDate, type LocalDate } from '../../engine/gamification/local-date';

/** Pure helpers for the Progress charts' axes. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STEPS = [1, 2, 2.5, 5, 10];

/**
 * A y-axis from 0 that covers `max` in about `count` round steps, e.g. 0, 5,
 * 10, 15. `integer` keeps steps whole, for counts.
 */
export function niceTicks(max: number, count = 4, integer = false): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const nice = (STEPS.find((s) => s * magnitude >= rough) ?? 10) * magnitude;
  const step = integer ? Math.max(1, Math.ceil(nice)) : nice;
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/** "23 Oct": the same in every locale, so labels never grow unexpectedly. */
export function shortDate(date: LocalDate): string {
  const p = parseLocalDate(date);
  return p ? `${p.day} ${MONTHS[p.month - 1]}` : date;
}

/**
 * Which of `n` x positions get a date label: the first and the last, and
 * evenly spaced ones between, at most `max` in all.
 */
export function labelIndices(n: number, max: number): number[] {
  if (n <= 0) return [];
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  if (max <= 1) return [n - 1];
  const step = (n - 1) / (max - 1);
  return [...new Set(Array.from({ length: max }, (_, i) => Math.round(i * step)))];
}

/** Seconds with one decimal, for response times: 1234 → "1.2 s". */
export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}
