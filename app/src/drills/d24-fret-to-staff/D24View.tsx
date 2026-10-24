import { useEffect, useRef, type CSSProperties } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { Staff, type StaffMark } from '../../components/staff';
import { INTERACTIVE_SCALE, computeStaffGeometry } from '../../components/staff/geometry';
import { staffNote, type Position } from '../../theory';
import { displayPc } from '../../theory/pitch-display';
import { d22At } from '../d22-staff-name/logic';
import type { DrillRenderProps } from '../types';
import {
  d24CellName,
  d24Explain,
  d24FeedbackPositions,
  d24GivenNote,
  d24NeckGuideLevel,
  d24PositionCaption,
  d24Task,
  d24WorkedExample,
  type D24Answer,
  type D24Prompt,
} from './logic';
import styles from './D24View.module.css';

type Props = DrillRenderProps<D24Prompt, D24Answer>;

/**
 * D24 view (design §6 D24, §12 screens): a fret lit on the neck in a reading
 * position, and the staff beside it to tap, both in view at once.
 *
 * The staff takes taps at M8-02's interactive scale (44pt between lines), so
 * on an iPad in landscape it stands beside the neck rather than above it:
 * stacked, the two need more height than any iPad's landscape screen has.
 * Portrait has the height, so there the staff sits above the neck.
 *
 * Nothing before the answer names the note: the neck shows only the lit cell
 * (its fret numbers and string names are the question, so they stay), and
 * the staff's VoiceOver labels give places. Feedback marks the right place
 * and, on a miss, the tapped one beside it as a wrong mark, and the neck
 * shows where the position plays each (research/02 rule 10). The marks are
 * drawn over an empty bar, so the staff keeps its size from prompt to
 * feedback.
 */
export function D24View({
  prompt,
  guideLevel,
  guided,
  handedness,
  sizeClass,
  tuning,
  feedback,
  onAnswer,
  aside,
  blindMode = false,
}: Props) {
  const staffRef = useRef<HTMLDivElement>(null);

  // A hardware keyboard: the first arrow key moves into the staff's lines and
  // spaces, which then take the arrows and Enter themselves.
  useEffect(() => {
    if (feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const active = document.activeElement;
      if (active && active !== document.body && staffRef.current?.contains(active)) return;
      if (active instanceof HTMLElement && active.closest('input, textarea, select')) return;
      const band = staffRef.current?.querySelector<SVGElement>('[role="button"][tabindex="0"]');
      if (!band) return;
      e.preventDefault();
      band.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback]);

  const given = feedback ? d24GivenNote(prompt, feedback) : null;
  const letter = staffNote(prompt.note).letter;

  const marks: StaffMark[] = [];
  if (feedback) {
    marks.push({ position: prompt.place, style: 'correct' });
    if (given !== null) marks.push({ position: feedback.answer, style: 'wrong' });
  } else if (guided) {
    // Worked example: the place marked (rule 8).
    marks.push({ position: prompt.place, style: 'selected' });
  }

  let markers: FretMarker[];
  if (feedback) {
    const cells = d24FeedbackPositions(prompt, feedback, tuning);
    const label = (p: Position, l: string, style: 'correct' | 'wrong'): FretMarker => ({
      ...p,
      style,
      label: l,
      forceLabel: true,
    });
    markers = [
      ...cells.expected.map((p) => label(p, letter, 'correct')),
      ...cells.given.map((p) => label(p, staffNote(given!).letter, 'wrong')),
    ];
  } else {
    markers = [
      {
        ...prompt.cell,
        style: 'target',
        ...(guided ? { label: letter, forceLabel: true } : {}),
      },
    ];
  }

  // The staff's height at its interactive scale bounds (M8-02): its width
  // follows from the engraving's aspect ratio.
  const g = computeStaffGeometry({ notePositions: [], range: prompt.range });
  const staffVars = {
    '--d24-staff-min': `${Math.ceil(g.height * INTERACTIVE_SCALE.min)}px`,
    '--d24-staff-max': `${Math.floor(g.height * INTERACTIVE_SCALE.max)}px`,
  } as CSSProperties;

  const staffLabel = !feedback
    ? 'Staff: tap the line or space for the lit fret'
    : given === null
      ? `Staff: ${displayPc(prompt.note)}, ${d22At(prompt.place)}`
      : `Staff: ${displayPc(prompt.note)}, ${d22At(prompt.place)}, and your tap, ${displayPc(given)}, ${d22At(feedback.answer)}`;

  return (
    <div
      className={styles.drill}
      data-size-class={sizeClass}
      data-scope={prompt.scope}
      data-position={prompt.position.id}
      data-testid="d24-drill"
    >
      <p className={styles.position} data-testid="d24-position">
        {d24PositionCaption(prompt)}
      </p>
      <p className={styles.prompt} id="drill-prompt" data-testid="d24-prompt">
        {guided ? d24WorkedExample(prompt) : d24Task(prompt)}
      </p>
      <div
        ref={staffRef}
        className={styles.staff}
        style={staffVars}
        data-testid="d24-staff"
        data-range={prompt.range.join(':')}
      >
        <Staff
          marks={marks}
          positionRange={prompt.range}
          onTapPosition={(p) => {
            if (!feedback) onAnswer(p);
          }}
          revealPitches={false}
          label={staffLabel}
          className={styles.staffInner}
        />
      </div>
      <div className={styles.neckArea} data-testid="d24-neck">
        <Fretboard
          tuning={tuning}
          fretRange={prompt.region}
          handedness={handedness}
          markers={markers}
          guideLevel={d24NeckGuideLevel(guideLevel, { guided })}
          blindMode={blindMode}
          label={`Fretboard: ${d24CellName(prompt.cell)} lit`}
        />
      </div>
      <p className={styles.explain} data-testid="d24-explain" aria-live="polite">
        {feedback
          ? d24Explain(prompt, feedback)
          : sizeClass !== 'compact' && 'Tap the staff, or use the arrow keys and Enter.'}
      </p>
      {aside}
    </div>
  );
}
