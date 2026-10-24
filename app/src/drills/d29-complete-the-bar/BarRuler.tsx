import type { CSSProperties } from 'react';
import {
  barLength,
  beats,
  eventLength,
  eventStarts,
  fracAdd,
  fracCmp,
  fracDiv,
  fracToNumber,
  rhythmLength,
  type Frac,
  type RhythmEvent,
} from '../../theory';
import { signatureOf } from './logic';
import styles from './D29View.module.css';

export type SegmentMark = 'wrong' | 'correct';

export interface BarRulerProps {
  meter: string;
  bar: readonly RhythmEvent[];
  /** How many of the bar's events were given. */
  givenCount: number;
  /** Feedback marks, by event index. */
  marks?: ReadonlyMap<number, SegmentMark>;
  /** Mark the felt beats (guide level 2+, and feedback). */
  beatLines: boolean;
}

const pct = (f: Frac, total: Frac) => `${fracToNumber(fracDiv(f, total)) * 100}%`;

/**
 * The bar drawn to scale (a guide, faded at level 0): each note a segment as
 * long as it lasts, given notes plain and placed ones raised, the room left
 * dashed, and the felt beats as ticks numbered above. A bar that runs over
 * shows its barline, with the overflow hatched. Wrong notes are hatched and
 * crossed, so they read without colour (design §8).
 */
export function BarRuler({ meter, bar, givenCount, marks, beatLines }: BarRulerProps) {
  const ts = signatureOf(meter);
  const full = barLength(ts);
  const length = rhythmLength(bar);
  const total = fracCmp(length, full) > 0 ? length : full;
  const starts = eventStarts(bar);
  return (
    <div className={styles.ruler} aria-hidden="true" data-testid="d29-ruler">
      {beatLines &&
        beats(ts).map((b, i) => (
          <span
            key={`b${i}`}
            className={styles.beatLine}
            style={{ left: pct(b.start, total) } as CSSProperties}
            data-testid="d29-beat-line"
          >
            <span className={styles.beatNumber}>{i + 1}</span>
          </span>
        ))}
      {bar.map((e, i) => {
        const start = starts[i]!;
        // Past the barline: the note that runs over, and any after it.
        const over = fracCmp(fracAdd(start, eventLength(e)), full) > 0;
        return (
          <span
            key={i}
            className={styles.segment}
            style={{ left: pct(start, total), width: pct(eventLength(e), total) } as CSSProperties}
            data-given={i < givenCount || undefined}
            data-rest={e.rest || undefined}
            data-mark={marks?.get(i) ?? (over ? 'wrong' : undefined)}
          />
        );
      })}
      {fracCmp(length, full) < 0 && (
        <span
          className={styles.roomLeft}
          style={{ left: pct(length, total), right: 0 } as CSSProperties}
          data-room
        />
      )}
      {total !== full && (
        <span className={styles.barline} style={{ left: pct(full, total) } as CSSProperties} />
      )}
    </div>
  );
}
