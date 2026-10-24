import type { GuideLevel } from '../../engine/model';
import styles from './ContextPanel.module.css';

/**
 * The staff-interval context panel: how to read an interval as a shape,
 * fading with the guide level (research/02 rule 9; the session hides it at
 * level 0).
 *
 * | Level | Shows |
 * |---|---|
 * | 3 | counting, step and skip, and the line-or-space rule |
 * | 2 | step and skip, and the line-or-space rule |
 * | 1 | the line-or-space rule alone |
 */
export function StaffIntervalContextPanel({ guideLevel }: { guideLevel: GuideLevel }) {
  return (
    <div className={styles.panel}>
      <h2>Reading intervals</h2>
      {guideLevel >= 3 && (
        <p>
          Count the lines and spaces from one note to the other, <strong>both notes</strong>{' '}
          included.
        </p>
      )}
      {guideLevel >= 2 && (
        <p>
          A <strong>step</strong> (2nd) moves from a line to the space next to it. A{' '}
          <strong>skip</strong> (3rd) jumps to the next line, or the next space.
        </p>
      )}
      <p>
        <strong>3rds, 5ths, 7ths</strong>: line to line, or space to space.{' '}
        <strong>2nds, 4ths, 6ths, octaves</strong>: line to space.
      </p>
      {guideLevel >= 2 && <p className={styles.note}>See the shape first; name the notes later.</p>}
    </div>
  );
}
