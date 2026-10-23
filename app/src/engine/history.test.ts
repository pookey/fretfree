import { Rating, State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import {
  cardsAsOf,
  dueByDay,
  endOfLocalDay,
  firstActiveDate,
  knownCounts,
  knownHistory,
  practiceCalendar,
  recallIfStopped,
  replayItems,
  speedByDay,
  speedDrills,
  weekStart,
  type PracticeDay,
} from './history';
import type { CardRecord, ReviewLogRecord } from './model';
import { createScheduler } from './scheduler';

const scheduler = createScheduler({ enableFuzz: false });
const isPlacement = (l: Pick<ReviewLogRecord, 'drillType'>) => l.drillType.startsWith('placement:');
const deps = { scheduler, isPlacement };
const SKILL = 'F2.string5-naturals';

/** A local instant on October 2026, so day keys don't depend on the test's time zone. */
const oct = (day: number, hour = 10, minute = 0) => new Date(2026, 9, day, hour, minute);

function log(itemId: string, at: Date, over: Partial<ReviewLogRecord> = {}): ReviewLogRecord {
  return {
    itemId,
    skillId: SKILL,
    drillType: 'name-the-note',
    correct: true,
    responseMs: 1500,
    rating: Rating.Good,
    hintUsed: false,
    answerGiven: '?',
    at,
    ...over,
  };
}

/** The stored card a session would leave after `logs` (no fuzz, so it matches the replay). */
function storedCard(itemId: string, logs: ReviewLogRecord[]): CardRecord {
  const first = logs[0] as ReviewLogRecord;
  let card = scheduler.newCard({ id: itemId, skillId: SKILL }, first.at);
  for (const l of logs) card = scheduler.review(card, l.rating as never, l.at);
  return card;
}

describe('replayItems', () => {
  it('rebuilds a session item from its logs alone', () => {
    const logs = [log('note@s5f0', oct(20)), log('note@s5f0', oct(21)), log('note@s5f0', oct(23))];
    const [tl] = replayItems([], logs, deps);
    expect(tl?.states).toHaveLength(3);
    const stabilities = tl?.states.map((s) => s.card.fsrs.stability) ?? [];
    expect(stabilities[2]).toBeGreaterThan(stabilities[0] as number);
  });

  it('matches the stored card when weights and fuzz match', () => {
    const logs = [log('note@s5f3', oct(20)), log('note@s5f3', oct(22, 9))];
    const card = storedCard('note@s5f3', logs);
    const [tl] = replayItems([card], logs, deps);
    expect(tl?.states.at(-1)?.card.fsrs.stability).toBeCloseTo(card.fsrs.stability);
  });

  it('starts a placement-seeded card at its seed, ignoring probes before it', () => {
    const seed = scheduler.seedKnownCard({ id: 'note@s6f5', skillId: SKILL }, oct(20, 10, 5));
    const logs = [
      log('note@s6f5', oct(20, 10, 1), { drillType: 'placement:name-the-note' }),
      log('note@s6f5', oct(22), {}),
    ];
    const [tl] = replayItems([seed], logs, deps);
    expect(tl?.states[0]?.at).toBe(oct(20, 10, 5).getTime());
    expect(tl?.states[0]?.card.fsrs.stability).toBe(10);
    expect(tl?.states).toHaveLength(2);
  });

  it('applies a later placement probe only when it moves the card forward', () => {
    const logs = [log('note@s5f5', oct(20))];
    const card = storedCard('note@s5f5', logs);
    const probe = (rating: Rating, at: Date) =>
      log('note@s5f5', at, { drillType: 'placement:name-the-note', rating });
    const [missed] = replayItems([card], [...logs, probe(Rating.Again, oct(25))], deps);
    expect(missed?.states).toHaveLength(1);
    const [fluent] = replayItems([card], [...logs, probe(Rating.Easy, oct(25))], deps);
    expect(fluent?.states).toHaveLength(2);
    // A probe a moment later wouldn't extend the schedule, so it is dropped.
    const [early] = replayItems(
      [card],
      [...logs, probe(Rating.Good, oct(20, 10, 0)), probe(Rating.Hard, oct(20, 10, 1))],
      deps,
    );
    expect(early?.states.length).toBeLessThanOrEqual(2);
  });

  it('ignores a placement probe on an item that has no card yet', () => {
    const [tl] = replayItems(
      [],
      [log('note@s5f7', oct(20), { drillType: 'placement:name-the-note' })],
      deps,
    );
    expect(tl?.states).toEqual([]);
    expect(tl?.outcomes).toHaveLength(1);
  });
});

describe('cardsAsOf', () => {
  it('returns each item as it was, leaving out items not met yet', () => {
    const logs = [log('note@s5f0', oct(20)), log('note@s5f2', oct(22))];
    const tls = replayItems([], logs, deps);
    expect(cardsAsOf(tls, oct(19))).toEqual([]);
    expect(cardsAsOf(tls, oct(21)).map((c) => c.itemId)).toEqual(['note@s5f0']);
    expect(cardsAsOf(tls, oct(23))).toHaveLength(2);
  });
});

describe('knownCounts and knownHistory', () => {
  it('counts stable items as learning too', () => {
    const seed = scheduler.seedKnownCard({ id: 'a', skillId: SKILL }, oct(20));
    const fresh = scheduler.newCard({ id: 'b', skillId: SKILL }, oct(20));
    const missed = scheduler.review(fresh, Rating.Again, oct(20));
    expect(knownCounts([seed, missed], new Map([['b', false]]))).toEqual({
      learning: 1,
      stable: 1,
    });
  });

  it('has no days before any activity', () => {
    expect(firstActiveDate([], [])).toBeNull();
    expect(knownHistory({ cards: [], logs: [], timelines: [], today: '2026-10-23' })).toEqual([]);
  });

  it('rebuilds each past day and takes today from the stored cards', () => {
    const a = [log('note@s5f0', oct(20)), log('note@s5f0', oct(22))];
    const b = [log('note@s5f2', oct(21), { correct: false, rating: Rating.Again })];
    const seed = scheduler.seedKnownCard({ id: 'note@s6f0', skillId: SKILL }, oct(21, 9));
    const logs = [...a, ...b];
    const cards = [storedCard('note@s5f0', a), storedCard('note@s5f2', b), seed];
    const days = knownHistory({
      cards,
      logs,
      timelines: replayItems(cards, logs, deps),
      today: '2026-10-23',
    });
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
    ]);
    expect(days[0]).toMatchObject({ learning: 1, stable: 0 });
    // The seeded card is stable (10 days) from the day it was seeded; b was missed.
    expect(days[1]).toMatchObject({ learning: 2, stable: 1 });
    // Two good answers two days apart already make a stable: the replay of
    // the 22nd agrees with the stored cards' count today.
    expect(days[3]).toEqual({ date: '2026-10-23', learning: 2, stable: 2 });
    expect(days[2]).toMatchObject({ learning: 2, stable: 2 });
  });

  it('has none when the first activity is after today', () => {
    const logs = [log('note@s5f0', oct(25))];
    expect(knownHistory({ cards: [], logs, timelines: [], today: '2026-10-23' })).toEqual([]);
  });

  it('ignores a card that was never reviewed when finding the first day', () => {
    const fresh = scheduler.newCard({ id: 'x', skillId: SKILL }, oct(1));
    expect(firstActiveDate([fresh], [log('x', oct(5))])).toBe('2026-10-05');
  });
});

describe('speed', () => {
  const logs = [
    log('a', oct(20), { responseMs: 3000 }),
    log('b', oct(20), { responseMs: 2000 }),
    log('c', oct(20), { responseMs: 9000, correct: false, rating: Rating.Again }),
    log('a', oct(20), { responseMs: 100, hintUsed: true }),
    log('a', oct(20), { responseMs: 100, drillType: 'placement:name-the-note' }),
    log('a', oct(22), { responseMs: 1200 }),
    log('d', oct(22), { responseMs: 4000, drillType: 'find-the-note' }),
  ];

  it('lists drills by timed answers', () => {
    expect(speedDrills(logs, isPlacement)).toEqual([
      { drillType: 'name-the-note', answers: 3, days: 2 },
      { drillType: 'find-the-note', answers: 1, days: 1 },
    ]);
  });

  it('takes the median of correct, unguided session answers per day', () => {
    expect(speedByDay(logs, 'name-the-note', isPlacement)).toEqual([
      { date: '2026-10-20', medianMs: 2500, answers: 2 },
      { date: '2026-10-22', medianMs: 1200, answers: 1 },
    ]);
  });
});

describe('practiceCalendar', () => {
  const day = (date: string, minutes: number, extra: Partial<PracticeDay> = {}): PracticeDay => ({
    date,
    minutes,
    goalMet: false,
    freezeUsed: false,
    ...extra,
  });
  const cfg = { calendarWeeks: 6, calendarMinWeeks: 2 };

  it('starts weeks on Monday', () => {
    expect(weekStart('2026-10-23')).toBe('2026-10-19'); // a Friday
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // a Sunday
  });

  it('shows at least the minimum weeks, ending this week, with later days marked future', () => {
    const weeks = practiceCalendar([day('2026-10-21', 10, { goalMet: true })], '2026-10-23', cfg);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.[0]?.date).toBe('2026-10-12');
    const thisWeek = weeks[1] ?? [];
    expect(thisWeek[2]).toMatchObject({ date: '2026-10-21', minutes: 10, goalMet: true });
    expect(thisWeek[4]?.future).toBe(false);
    expect(thisWeek[5]?.future).toBe(true);
  });

  it('reaches back to the first practised week, up to the maximum', () => {
    expect(practiceCalendar([day('2026-09-30', 5)], '2026-10-23', cfg)).toHaveLength(4);
    expect(practiceCalendar([day('2026-01-05', 5)], '2026-10-23', cfg)).toHaveLength(6);
    expect(practiceCalendar([], '2026-10-23', cfg)).toHaveLength(2);
    const frozen = practiceCalendar(
      [day('2026-09-21', 0, { freezeUsed: true })],
      '2026-10-23',
      cfg,
    );
    expect(frozen).toHaveLength(5);
  });
});

describe('dueByDay and recallIfStopped', () => {
  const card = (id: string, due: Date, state = State.Review): CardRecord => ({
    ...scheduler.seedKnownCard({ id, skillId: SKILL }, oct(1)),
    fsrs: { ...scheduler.seedKnownCard({ id, skillId: SKILL }, oct(1)).fsrs, due, state },
  });

  it('puts overdue reviews on today and drops ones past the window', () => {
    const cards = [
      card('a', oct(20)),
      card('b', oct(23, 18)),
      card('c', oct(25)),
      card('d', oct(30)),
      card('e', oct(24), State.New),
    ];
    expect(dueByDay(cards, oct(23), 3)).toEqual([
      { date: '2026-10-23', due: 2 },
      { date: '2026-10-24', due: 0 },
      { date: '2026-10-25', due: 1 },
    ]);
  });

  it('averages predicted recall over practised cards', () => {
    expect(recallIfStopped([], oct(23), () => 1)).toBeNull();
    const cards = [card('a', oct(30)), card('b', oct(30)), card('n', oct(30), State.New)];
    const r = (c: CardRecord) => (c.itemId === 'a' ? 0.9 : 0.7);
    expect(recallIfStopped(cards, oct(23), r, 30)).toBeCloseTo(0.8);
  });

  it('gives the last instant of a day', () => {
    const end = endOfLocalDay('2026-10-23');
    expect(end.getDate()).toBe(23);
    expect(new Date(end.getTime() + 1).getDate()).toBe(24);
  });
});
