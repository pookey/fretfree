import type { Grade } from 'ts-fsrs';
import type { ReviewLogRecord, SkillStateRecord } from '../model';
import type { DailyProgressRecord, GamificationRecord } from '../../storage/gamification-model';
import type { LocalDate } from './local-date';

/**
 * Gamification contracts (design §3.7). The engine side is pure: XP, streak
 * and achievement functions take state in and return new state plus events.
 * The caller persists both through `storage/gamification-repo.ts`, which logs
 * every event so streaks can later be checked against retention.
 *
 * Guardrails these types encode (research/02 rules 11 and 15):
 * - XP is weighted toward learning value, never toward grinding stable cards.
 * - The streak qualifies on the daily goal, not on opening the app.
 * - Achievements signal mastery, not activity counts.
 */

export type { DailyProgressRecord, GamificationRecord, LocalDate };

// --- XP ------------------------------------------------------------------

/**
 * Where a card stood when it was answered, which decides its learning value.
 * `new`: first ever review. `due`: a scheduled review that has come due.
 * `stretch`: an interleaved frontier item used to top up a session (§3.7
 * engine wiring). `not-due`: an already-stable card drilled early.
 */
export type CardKind = 'new' | 'due' | 'stretch' | 'not-due';

/** Everything `xpForAnswer` needs about one graded answer. */
export interface AnswerXpInput {
  correct: boolean;
  /** The FSRS rating from `engine/grading.ts`; `Easy` marks a fluent answer. */
  rating: Grade;
  kind: CardKind;
  /** FSRS stability of the card before this answer, in days (0 for new cards). */
  stabilityDays: number;
  /** Earlier answers to this same item on the current local date. */
  answeredToday: number;
}

/** What an XP award was for. */
export type XpSource = 'answer' | 'quest';

// --- Events --------------------------------------------------------------

/** One answered item and the XP it earned. */
export interface AnswerEvent {
  type: 'answer';
  itemId: string;
  skillId: string;
  correct: boolean;
  rating: Grade;
  kind: CardKind;
  xp: number;
}

export interface SessionCompleteEvent {
  type: 'session-complete';
  date: LocalDate;
  /** The `sessionLogs` row, when the session was logged. */
  sessionId?: number;
  xp: number;
  minutes: number;
  itemsSeen: number;
  accuracy: number;
}

/** Today's daily goal was reached. Fires once per local date. */
export interface GoalMetEvent {
  type: 'goal-met';
  date: LocalDate;
  minutes: number;
  xp: number;
}

export interface StreakExtendedEvent {
  type: 'streak-extended';
  date: LocalDate;
  streak: number;
  /** Set when `streak` is a celebrated milestone (7, 30, 100, 365). */
  milestone?: number;
  /** A freeze was earned by this extension (1 per 7-day streak, max 2 held). */
  freezeEarned?: boolean;
}

/** A missed day was covered automatically by a held freeze. */
export interface FreezeUsedEvent {
  type: 'freeze-used';
  /** The missed date the freeze covered. */
  date: LocalDate;
  freezesLeft: number;
}

/**
 * A streak ended: a day was missed with no freeze and no weekend amulet.
 * `streakCurrent` restarts from 0 and `previousStreak` is kept in
 * `streakBeforeBreak` until the repair window closes.
 * Not in the §3.7 table, but the streak engine must report breaks so the log
 * can show streak length against retention, and repair needs a deadline.
 */
export interface StreakBrokenEvent {
  type: 'streak-broken';
  /** The missed date that broke the streak. */
  date: LocalDate;
  previousStreak: number;
  /**
   * `startOfLocalDay(date + 3)`: a double session on either of the next two
   * calendar dates adds `previousStreak` back onto the restarted streak.
   * Shown as "48 hours".
   */
  repairDeadline: Date;
}

/** A broken streak was restored within the repair window by a double session. */
export interface StreakRepairedEvent {
  type: 'streak-repaired';
  date: LocalDate;
  streak: number;
  /** Set when the repair alone carried the streak past a milestone (7, 30, 100, 365). */
  milestone?: number;
  /** A freeze was earned for a multiple of 7 crossed only by the repair. */
  freezeEarned?: boolean;
}

export interface AchievementUnlockedEvent {
  type: 'achievement-unlocked';
  achievementId: string;
}

export interface QuestCompletedEvent {
  type: 'quest-completed';
  date: LocalDate;
  questId: string;
  xp: number;
}

/** Every gamification event. Discriminated on `type`. */
export type GamificationEvent =
  | AnswerEvent
  | SessionCompleteEvent
  | GoalMetEvent
  | StreakExtendedEvent
  | FreezeUsedEvent
  | StreakBrokenEvent
  | StreakRepairedEvent
  | AchievementUnlockedEvent
  | QuestCompletedEvent;

export type GamificationEventType = GamificationEvent['type'];

/** The events that award XP. */
export type XpEvent = AnswerEvent | QuestCompletedEvent;

/** An event as read back from the log. */
export type LoggedGamificationEvent = GamificationEvent & { id: number; at: Date };

// --- Streak --------------------------------------------------------------

/** The result of settling one local date against the streak rules. */
export interface DayResult {
  state: GamificationRecord;
  /** The settled date's progress; `freezeUsed` is set when a freeze covered it. */
  day: DailyProgressRecord;
  events: GamificationEvent[];
}

// --- Achievements --------------------------------------------------------

/** What an achievement predicate may look at. Pure data, no database. */
export interface AchievementContext {
  skillStates: ReadonlyMap<string, SkillStateRecord>;
  gamification: GamificationRecord;
  /** The most recent reviews (newest last), e.g. for a median-speed badge. */
  recentReviews: readonly ReviewLogRecord[];
  /** The learner's calibrated tap time (`Settings.latencyBaselineMs`); absent or null before calibration. */
  latencyBaselineMs?: number | null;
}

export type AchievementCategory = 'mastery' | 'speed' | 'streak';

/**
 * One badge. M1-13 adds one file per definition under `achievements/`.
 * `isUnlocked` must be pure and tied to mastery or a streak milestone, never
 * to a raw activity count (Deci et al. 1999; design §3.7).
 */
export interface AchievementDefinition {
  readonly id: string;
  readonly title: string;
  /** Competence-framed copy, e.g. "You know every natural note on string 6". */
  readonly description: string;
  readonly category: AchievementCategory;
  /** Display order within the Progress panel (lower first). */
  readonly order: number;
  isUnlocked(ctx: AchievementContext): boolean;
}

// --- Quests --------------------------------------------------------------

/** What a quest may look at when measuring progress on one local date. */
export interface QuestContext {
  date: LocalDate;
  /** Reviews answered on `date`. */
  todaysReviews: readonly ReviewLogRecord[];
  /** Due reviews still outstanding. */
  dueRemaining: number;
  skillStates: ReadonlyMap<string, SkillStateRecord>;
}

/**
 * A daily quest (3 rotate per day). Quests nudge toward weak areas and
 * interleaving, e.g. "clear all due reviews" or "10 fluent answers on strings
 * 3–4", never toward grinding stable cards.
 */
export interface QuestDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Progress counts up to this. */
  readonly target: number;
  readonly bonusXp: number;
  /** Current progress, 0…target. Pure. */
  progress(ctx: QuestContext): number;
}
