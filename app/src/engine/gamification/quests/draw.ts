import { ENGINE_CONFIG } from '../../config';
import type { LocalDate } from '../local-date';
import type { DailyProgressRecord, GamificationRecord, QuestCompletedEvent } from '../types';
import type { DailyQuest, QuestDayContext, QuestSnapshot, QuestTemplate } from './types';

/** FNV-1a over the date string: a stable 32-bit seed per local date. */
export function dateSeed(date: LocalDate): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded PRNG, so a date always draws the same quests. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The date's quests (design §3.7): shuffle the templates with a PRNG seeded
 * from the date, then take the first `perDay` that apply to the learner's
 * history before it. Pure, so a date always draws the same quests, and they
 * rotate from one day to the next.
 */
export function drawQuests(
  snapshot: QuestSnapshot,
  templates: readonly QuestTemplate[],
  perDay: number = ENGINE_CONFIG.quests.perDay,
): DailyQuest[] {
  const pool = [...templates].sort((a, b) => a.id.localeCompare(b.id));
  const rng = seededRng(dateSeed(snapshot.date));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const drawn: DailyQuest[] = [];
  for (const template of pool) {
    if (drawn.length >= perDay) break;
    const quest = template.draw(snapshot);
    if (quest) drawn.push(quest);
  }
  return drawn;
}

export interface QuestStatus {
  quest: DailyQuest;
  /** 0…target; a completed quest stays at its target. */
  progress: number;
  done: boolean;
}

/** Each quest's progress against `ctx`. Quests in `completed` stay done. */
export function questStatuses(
  quests: readonly DailyQuest[],
  ctx: QuestDayContext,
  completed: readonly string[],
): QuestStatus[] {
  return quests.map((quest) => {
    const done = completed.includes(quest.id) || quest.progress(ctx) >= quest.target;
    return { quest, progress: done ? quest.target : quest.progress(ctx), done };
  });
}

export interface QuestCompletion {
  state: GamificationRecord;
  day: DailyProgressRecord;
  /** One per newly completed quest; empty when nothing changed. */
  events: QuestCompletedEvent[];
}

/**
 * Award every quest that has reached its target and is not yet in
 * `day.questsCompleted`: its bonus XP goes to the total and to the day, and a
 * `quest-completed` event carries it. The bonus is its own event, never routed
 * through `xpForAnswer`. Idempotent: a completed quest never pays twice.
 */
export function completeQuests(
  state: GamificationRecord,
  day: DailyProgressRecord,
  quests: readonly DailyQuest[],
  ctx: QuestDayContext,
): QuestCompletion {
  const events: QuestCompletedEvent[] = quests
    .filter((q) => !day.questsCompleted.includes(q.id) && q.progress(ctx) >= q.target)
    .map((q) => ({ type: 'quest-completed', date: day.date, questId: q.id, xp: q.bonusXp }));
  if (events.length === 0) return { state, day, events };
  const xp = events.reduce((sum, e) => sum + e.xp, 0);
  return {
    state: { ...state, xpTotal: state.xpTotal + xp },
    day: {
      ...day,
      xp: day.xp + xp,
      questsCompleted: [...day.questsCompleted, ...events.map((e) => e.questId)],
    },
    events,
  };
}
