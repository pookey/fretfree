import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  compareLocalDates,
  dayOfWeek,
  daysBetween,
  isLocalDate,
  isWeekend,
  parseLocalDate,
  startOfLocalDay,
  toLocalDate,
} from './local-date';

const HOUR = 3_600_000;
/** Run in a device time zone. Node re-reads `TZ` whenever `process.env.TZ` is assigned. */
function inZone(tz: string): void {
  vi.stubEnv('TZ', tz);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseLocalDate / isLocalDate', () => {
  it('parses valid dates', () => {
    expect(parseLocalDate('2026-10-18')).toEqual({ year: 2026, month: 10, day: 18 });
    expect(isLocalDate('2028-02-29')).toBe(true);
  });

  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '2026-2-3', '20261018', ''])(
    'rejects %j',
    (s) => {
      expect(parseLocalDate(s)).toBeNull();
      expect(isLocalDate(s)).toBe(false);
    },
  );

  it('throws on arithmetic with an invalid date', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => startOfLocalDay('nope')).toThrow(RangeError);
  });
});

describe('calendar arithmetic', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-10-18', 0)).toBe('2026-10-18');
    expect(addDays('2026-10-18', 100)).toBe('2027-01-26');
  });

  it('counts whole days between dates', () => {
    expect(daysBetween('2026-10-18', '2026-10-19')).toBe(1);
    expect(daysBetween('2026-10-19', '2026-10-18')).toBe(-1);
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
    expect(daysBetween('2026-10-18', '2026-10-18')).toBe(0);
  });

  it('is unaffected by DST in the device zone', () => {
    inZone('America/New_York');
    // 2026-03-08 is 23 hours long and 2026-11-01 is 25 hours long in New York.
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('knows weekdays and weekends', () => {
    expect(dayOfWeek('2026-10-17')).toBe(6);
    expect(dayOfWeek('2026-10-18')).toBe(0);
    expect(isWeekend('2026-10-17')).toBe(true);
    expect(isWeekend('2026-10-18')).toBe(true);
    expect(isWeekend('2026-10-19')).toBe(false);
    expect(isWeekend('2027-01-01')).toBe(false);
  });

  it('compares dates chronologically', () => {
    expect(compareLocalDates('2026-10-18', '2026-10-19')).toBe(-1);
    expect(compareLocalDates('2026-12-31', '2026-02-01')).toBe(1);
    expect(compareLocalDates('2026-10-18', '2026-10-18')).toBe(0);
  });
});

describe('toLocalDate (device time zone)', () => {
  it('uses the device zone, not UTC', () => {
    const at = new Date('2026-10-18T23:30:00Z');
    inZone('Europe/London');
    expect(toLocalDate(at)).toBe('2026-10-19');
    inZone('America/Los_Angeles');
    expect(toLocalDate(at)).toBe('2026-10-18');
    inZone('Pacific/Auckland');
    expect(toLocalDate(at)).toBe('2026-10-19');
  });

  it('handles the New York spring-forward day (23 hours)', () => {
    inZone('America/New_York');
    expect(toLocalDate(new Date('2026-03-08T04:30:00Z'))).toBe('2026-03-07'); // 23:30 EST
    expect(toLocalDate(new Date('2026-03-08T05:00:00Z'))).toBe('2026-03-08'); // 00:00 EST
    expect(toLocalDate(new Date('2026-03-09T03:30:00Z'))).toBe('2026-03-08'); // 23:30 EDT
    expect(toLocalDate(new Date('2026-03-09T04:00:00Z'))).toBe('2026-03-09'); // 00:00 EDT
    const length =
      startOfLocalDay('2026-03-09').getTime() - startOfLocalDay('2026-03-08').getTime();
    expect(length).toBe(23 * HOUR);
  });

  it('handles the New York fall-back day (25 hours, 01:xx twice)', () => {
    inZone('America/New_York');
    expect(toLocalDate(new Date('2026-11-01T05:30:00Z'))).toBe('2026-11-01'); // 01:30 EDT
    expect(toLocalDate(new Date('2026-11-01T06:30:00Z'))).toBe('2026-11-01'); // 01:30 EST
    expect(toLocalDate(new Date('2026-11-02T04:59:00Z'))).toBe('2026-11-01'); // 23:59 EST
    expect(toLocalDate(new Date('2026-11-02T05:00:00Z'))).toBe('2026-11-02');
    const length =
      startOfLocalDay('2026-11-02').getTime() - startOfLocalDay('2026-11-01').getTime();
    expect(length).toBe(25 * HOUR);
  });

  it('handles a zone whose DST starts at midnight (no 00:00 that day)', () => {
    inZone('America/Santiago');
    // Chile springs forward at 24:00 on 2026-09-05, so 2026-09-06 starts at 01:00.
    const start = startOfLocalDay('2026-09-06');
    expect(toLocalDate(start)).toBe('2026-09-06');
    expect(toLocalDate(new Date(start.getTime() - 1))).toBe('2026-09-05');
  });

  it.each([
    'Europe/London',
    'America/New_York',
    'America/Santiago',
    'Australia/Sydney',
    'Pacific/Auckland',
    'Asia/Kathmandu',
    'Australia/Lord_Howe',
  ])('steps through every hour of 2026 one calendar day at a time in %s', (tz) => {
    inZone(tz);
    let date = toLocalDate(new Date('2026-01-01T00:00:00Z'));
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += HOUR / 2) {
      const next = toLocalDate(new Date(t));
      const step = daysBetween(date, next);
      expect(step === 0 || step === 1).toBe(true);
      date = next;
    }
    for (let d = '2026-01-01'; d < '2027-01-01'; d = addDays(d, 1)) {
      const start = startOfLocalDay(d);
      expect(toLocalDate(start)).toBe(d);
      expect(toLocalDate(new Date(start.getTime() - 1))).toBe(addDays(d, -1));
    }
  });
});
