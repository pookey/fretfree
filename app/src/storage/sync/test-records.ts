import { SYNC_TABLES, type SyncData, type SyncRecord, type SyncTableName } from './model';

/**
 * Seeded random sync records for the property tests. The value domains are
 * tiny on purpose, so equal timestamps and equal values collide often and the
 * tie-breaks get exercised.
 */

export type Rng = () => number;

/** mulberry32: a small deterministic PRNG. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function pick<T>(rng: Rng, options: readonly T[]): T {
  return options[Math.floor(rng() * options.length)] as T;
}

// The last is an Invalid Date: corrupt legacy data must merge, not throw.
const DATES = [
  new Date('2026-10-01T09:00:00Z'),
  new Date('2026-10-02T09:00:00Z'),
  new Date(Number.NaN),
];
const QUESTS = ['clear-due', 'fluent-10', 'try-mic'];

function subset<T>(rng: Rng, items: readonly T[]): T[] {
  return items.filter(() => rng() < 0.5).sort(() => rng() - 0.5);
}

/** One record's sync ID per table: the property tests merge versions of it. */
export const RECORD_IDS: Record<SyncTableName, string> = {
  settings: 'singleton',
  cards: 'note@s6f5',
  reviewLogs: 'log-1',
  skillStates: 'F2.string6-naturals',
  confusions: '["E","F"]',
  sessionLogs: 'session-1',
  gamification: 'singleton',
  dailyProgress: '2026-10-18',
  achievements: 'string-6-master',
  gamificationEvents: 'event-1',
  garagePurchases: 'finish.blue',
  garage: 'singleton',
};

export function randomData(table: SyncTableName, rng: Rng): SyncData {
  switch (table) {
    case 'settings':
      return {
        key: 'singleton',
        handedness: pick(rng, ['right', 'left']),
        volume: pick(rng, [0.5, 0.8]),
        reading: pick(rng, [
          { reads: { tab: true, staff: false }, learn: { tab: false, staff: false } },
          { reads: { tab: false, staff: false }, learn: { tab: false, staff: true } },
        ]),
        onboardedAt: pick(rng, [null, ...DATES]),
        ...(rng() < 0.3 && { blindMode: true }),
      };
    case 'cards':
      return {
        itemId: 'note@s6f5',
        skillId: 'F2.string6-naturals',
        fsrs: { due: pick(rng, DATES), stability: pick(rng, [1, 3]), state: pick(rng, [1, 2]) },
        createdAt: DATES[0],
        lastReviewedAt: pick(rng, [null, ...DATES]),
      };
    case 'reviewLogs':
      return {
        itemId: 'note@s6f5',
        skillId: 'F2.string6-naturals',
        drillType: 'name-the-note',
        correct: pick(rng, [true, false]),
        responseMs: pick(rng, [900, 1500]),
        rating: pick(rng, [1, 3]),
        hintUsed: false,
        answerGiven: 'A',
        at: pick(rng, DATES),
      };
    case 'skillStates':
      return {
        skillId: 'F2.string6-naturals',
        status: pick(rng, ['unlocked', 'practising', 'mastered']),
        guideLevel: pick(rng, [0, 2]),
        rollingAccuracy: pick(rng, [0.7, 0.9]),
      };
    case 'confusions':
      return {
        a: 'E',
        b: 'F',
        count: pick(rng, [1, 2, 5]),
        ...(rng() < 0.7 && { weight: pick(rng, [0.5, 1.5]), lastAt: pick(rng, DATES) }),
      };
    case 'sessionLogs':
      return {
        startedAt: DATES[0],
        endedAt: pick(rng, [null, DATES[1]]),
        itemsSeen: pick(rng, [0, 12]),
        accuracy: pick(rng, [0, 0.85]),
      };
    case 'gamification':
      return {
        key: 'singleton',
        dailyGoalMinutes: pick(rng, [5, 10]),
        xpTotal: pick(rng, [100, 120, 130]),
        streakCurrent: pick(rng, [0, 3]),
        streakLongest: pick(rng, [3, 9]),
        lastGoalMetDate: pick(rng, [null, '2026-10-17']),
        freezesHeld: pick(rng, [0, 1]),
        weekendAmulet: pick(rng, [true, false]),
        streakRepairDeadline: pick(rng, [null, DATES[1]]),
        streakBeforeBreak: pick(rng, [0, 4]),
      };
    case 'dailyProgress':
      return {
        date: '2026-10-18',
        xp: pick(rng, [0, 40, 70]),
        minutes: pick(rng, [3, 10]),
        goalMet: pick(rng, [true, false]),
        freezeUsed: pick(rng, [true, false]),
        questsCompleted: subset(rng, QUESTS),
      };
    case 'achievements':
      return { id: 'string-6-master', unlockedAt: pick(rng, DATES) };
    case 'gamificationEvents':
      return { type: 'answer', at: pick(rng, DATES), data: { xp: pick(rng, [5, 10]) } };
    case 'garagePurchases':
      return { itemId: 'finish.blue', price: pick(rng, [100, 120]), at: pick(rng, DATES) };
    case 'garage':
      return {
        key: 'singleton',
        spec: { body: 'body.stratocaster', finish: pick(rng, ['finish.red', 'finish.blue']) },
        name: pick(rng, ['My guitar', 'Blue Moon']),
      };
  }
}

/** A random version of `table`'s test record: live or a tombstone, with or without field stamps. */
export function randomRecord(table: SyncTableName, rng: Rng, id = RECORD_IDS[table]): SyncRecord {
  const updatedAt = pick(rng, [1000, 2000, 3000]);
  if (rng() < 0.25) return { table, id, updatedAt, deleted: true, data: null };
  const data = randomData(table, rng);
  const record: SyncRecord = { table, id, updatedAt, deleted: false, data };
  const spec = SYNC_TABLES[table];
  if (spec.merge === 'fields' && rng() < 0.8) {
    // Stamps for fields this version lacks too, as a removed field leaves.
    const groups = [
      ...Object.keys(data),
      ...Object.keys(randomData(table, rng)),
      ...Object.keys('groups' in spec ? spec.groups : {}),
    ];
    record.fields = Object.fromEntries(
      groups.filter(() => rng() < 0.7).map((g) => [g, pick(rng, [500, 1000, 2000, 3000])]),
    );
  }
  return record;
}
