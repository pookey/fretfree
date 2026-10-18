/**
 * Local calendar dates (design §3.7). Streaks and daily progress are keyed by
 * the learner's calendar day, `YYYY-MM-DD` in the device time zone, never by
 * UTC or by 24-hour spans: a DST day is 23 or 25 hours long but is still one
 * day. Only `toLocalDate` and `startOfLocalDay` touch the time zone. All other
 * arithmetic is on the civil date itself (via UTC), so it is DST-proof.
 */

/** A local calendar date, `YYYY-MM-DD`. */
export type LocalDate = string;

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function fromUtc(ms: number): LocalDate {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Parse a `YYYY-MM-DD` string, rejecting impossible dates like `2026-02-30`. */
export function parseLocalDate(date: string): { year: number; month: number; day: number } | null {
  const m = LOCAL_DATE.exec(date);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (fromUtc(Date.UTC(year, month - 1, day)) !== date) return null;
  return { year, month, day };
}

export function isLocalDate(date: string): date is LocalDate {
  return parseLocalDate(date) !== null;
}

function utcMs(date: LocalDate): number {
  const p = parseLocalDate(date);
  if (!p) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  return Date.UTC(p.year, p.month - 1, p.day);
}

/** The calendar date of an instant in the device time zone. */
export function toLocalDate(at: Date): LocalDate {
  return `${pad(at.getFullYear(), 4)}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** The first instant of a local date in the device time zone. */
export function startOfLocalDay(date: LocalDate): Date {
  const p = parseLocalDate(date);
  if (!p) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  return new Date(p.year, p.month - 1, p.day);
}

/** `date` moved by `days` calendar days (negative goes back). */
export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtc(utcMs(date) + days * DAY_MS);
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday, like `Date#getDay`. */
export function dayOfWeek(date: LocalDate): number {
  return new Date(utcMs(date)).getUTCDay();
}

export function isWeekend(date: LocalDate): boolean {
  const d = dayOfWeek(date);
  return d === 0 || d === 6;
}

/** `-1`, `0` or `1`. `YYYY-MM-DD` strings sort chronologically. */
export function compareLocalDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
