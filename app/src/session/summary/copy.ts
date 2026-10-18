import type { Celebration, CompetenceLine } from './celebrations';

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
  return 'Misses show what to work on. Those notes come back sooner.';
}

/** Seconds with one decimal, e.g. "1.4s". */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function personalBestText(pb: { medianMs: number; previousMs: number }): string {
  return `Median answer ${formatSeconds(pb.medianMs)}, down from ${formatSeconds(pb.previousMs)}`;
}

/** Design §3.3 step 5 and research/02 rule 11: explain why spacing works. */
export const SPACING_COPY =
  "Come back tomorrow. Spacing practice out feels harder than cramming, and that's exactly why it sticks: each recall after a gap makes the memory last longer.";

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
