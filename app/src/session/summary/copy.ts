import { dayOfWeek, parseLocalDate, type GamificationEvent } from '../../engine/gamification';
import type { Celebration, CompetenceLine, SessionProgress } from './celebrations';

/**
 * Summary-screen copy. It names what the learner can now do, and frames
 * misses as part of learning (design §3.7: celebrate competence; no
 * punishment for mistakes).
 */

/**
 * "You now know string 6 to fret 12" for recall across a gap; "You learned
 * string 6 to fret 5 today" for a same-day gain, which isn't knowing yet.
 */
export function competenceText(line: CompetenceLine): string {
  if (line.kind === 'mastered') return `You've mastered ${lowerFirst(line.skillTitle)}`;
  const span =
    line.toFret === 0
      ? `open string ${line.string}`
      : `string ${line.string} to fret ${line.toFret}`;
  return line.kind === 'learned' ? `You learned ${span} today` : `You now know ${span}`;
}

/** Shown with same-day gains: knowing it means recalling it after a gap. */
export const LEARNED_HINT = 'Come back tomorrow to lock it in.';

export function headline(c: Celebration): string {
  const first = c.competence[0];
  if (first) return competenceText(first);
  if (c.perfect) return 'Perfect session';
  return 'Session complete';
}

/** A note under the accuracy figure. Null when there's nothing to add. */
export function accuracyNote(c: Celebration): string | null {
  if (c.answered === 0 || c.accuracy >= 1) return null;
  if (c.accuracy >= 0.75) return 'Right in the learning zone: hard enough to stick.';
  return 'Misses show what to work on. Those cards come back sooner.';
}

/** Seconds with one decimal, e.g. "1.4s". */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function personalBestText(pb: { medianMs: number; previousMs: number }): string {
  return `Median answer ${formatSeconds(pb.medianMs)}, down from ${formatSeconds(pb.previousMs)}`;
}

/** A session that ended at its new-item cap says why (M10-03). */
export const ENOUGH_NEW_COPY =
  "That's enough new material for today: it sticks better after a sleep.";

/** Design §3.3 step 5 and research/02 rule 11: explain why spacing works. */
export const SPACING_COPY =
  "Come back tomorrow. Spacing practice out feels harder than cramming, and that's exactly why it sticks: each recall after a gap makes the memory last longer.";

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "tomorrow", a weekday within the week ahead, else a date like "3 November". */
export function reviewDayText(next: NonNullable<SessionProgress['nextReview']>): string {
  if (next.inDays <= 1) return 'tomorrow';
  if (next.inDays < 7) return WEEKDAYS[dayOfWeek(next.date)] as string;
  const p = parseLocalDate(next.date);
  return p ? `${p.day} ${MONTHS[p.month - 1] as string}` : next.date;
}

function cards(n: number): string {
  return `${n} card${n === 1 ? '' : 's'}`;
}

/**
 * Today's cards on the Learn map's scale, with the retention forecast
 * (research/02 rules 11 and 15): "14 cards learning. They become stable as
 * you recall them over the next few days; today's cards come back Tuesday."
 * "Card" is the learner's word for an item everywhere (M10-09). Never framed
 * as a loss. Null when nothing was answered.
 */
export function progressText(p: SessionProgress): string | null {
  if (!p.nextReview) return null;
  // Scoped to these cards: the daily return ("Come back tomorrow") stays the
  // message, and other skills may be due sooner.
  const day = reviewDayText(p.nextReview);
  const when = `today's cards come back ${p.nextReview.inDays >= 7 ? `on ${day}` : day}.`;
  const { learning: n, stable: s, becameStable: b } = p;
  if (n === 0) return `One correct recall starts a card learning, and ${when}`;
  const rest = n - s;
  if (rest === 0) {
    const lead =
      b === n
        ? `${cards(n)} became stable today.`
        : `${cards(n)} ${n === 1 ? 'is' : 'are'} stable${b > 0 ? `, ${b} of them new today` : ''}.`;
    return `${lead} Each recall stretches the gap, and ${when}`;
  }
  const stableNote =
    s === 0
      ? ''
      : b === s
        ? `, ${s} of them newly stable`
        : `, ${s} of them stable${b > 0 ? ` (${b} new today)` : ''}`;
  const subject =
    s === 0
      ? rest === 1
        ? 'It becomes'
        : 'They become'
      : rest === 1
        ? 'The other one becomes'
        : 'The rest become';
  return `${cards(n)} learning${stableNote}. ${subject} stable as you recall ${rest === 1 ? 'it' : 'them'} over the next few days; ${when}`;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Milestone copy for the streak milestones (7, 30, 100, 365 days) reached at finish. */
export function streakMilestones(events: readonly GamificationEvent[]): string[] {
  return events.flatMap((e) =>
    e.type === 'streak-extended' && e.milestone !== undefined
      ? [`${e.milestone}-day streak: a real daily habit`]
      : [],
  );
}
