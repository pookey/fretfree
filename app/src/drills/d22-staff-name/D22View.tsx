import { useEffect } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { Staff, type StaffMark, type StaffNote } from '../../components/staff';
import { neckWindow } from '../../shell/size-class';
import { noteAtStaffPosition } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  d22AnsweredPlace,
  d22Explain,
  d22FeedbackPositions,
  d22KeyToAnswer,
  d22Task,
  d22WorkedExample,
  type D22Answer,
  type D22Prompt,
} from './logic';
import styles from './D22View.module.css';

type Props = DrillRenderProps<D22Prompt, D22Answer>;

/**
 * D22 view (design §6 D22, §12 screens): the staff above the neck.
 *
 * - Reading: one note on the staff and the letters C–B below it (A–G on a
 *   hardware keyboard). The neck waits empty, then shows every cell that
 *   plays the note once answered.
 * - Placing: the staff takes a tap (a ghost note follows the finger), or a
 *   line or space picked with the arrow keys and Enter. Once answered it
 *   draws the note, and the neck shows where it is played.
 *
 * A miss draws the answer's note beside the right one, as a wrong mark, and
 * plays both (research/02 rule 10). Nothing before the answer names the note:
 * the staff's VoiceOver labels give the place, as a sighted learner sees it.
 */
export function D22View({
  prompt,
  guideLevel,
  guided,
  handedness,
  sizeClass,
  compactFrets,
  tuning,
  feedback,
  onAnswer,
  aside,
  blindMode = false,
}: Props) {
  const reading = prompt.direction === 'read';

  useEffect(() => {
    if (feedback || !reading) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const answer = d22KeyToAnswer(e.key, prompt.choices);
      if (answer) {
        e.preventDefault();
        onAnswer(answer);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, reading, prompt.choices]);

  const cells = feedback ? d22FeedbackPositions(prompt, feedback, tuning) : null;
  // iPad: the neck stays put under a reading card so the answer lands on it.
  // A placing card's tall staff needs the room until the answer is in.
  const showNeck = Boolean(feedback) || (reading && sizeClass !== 'compact');
  const frets = cells?.expected.map((c) => c.fret) ?? [];
  const range = neckWindow(sizeClass, frets.length > 0 ? Math.min(...frets) : 0, compactFrets);

  const markers: FretMarker[] = cells
    ? [
        ...cells.expected.map((p): FretMarker => ({
          ...p,
          style: 'correct',
          label: prompt.letter,
          forceLabel: true,
        })),
        ...cells.given.map((p): FretMarker => ({
          ...p,
          style: 'wrong',
          label: givenLetter(prompt, feedback!.answer),
          forceLabel: true,
        })),
      ]
    : [];

  return (
    <div
      className={styles.drill}
      data-size-class={sizeClass}
      data-direction={prompt.direction}
      // A staff to read sits beside the prompt on iPad, so the neck fits below;
      // a staff to tap needs the width.
      data-layout={reading || feedback ? 'beside' : 'stacked'}
      data-testid="d22-drill"
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt">
            {guided ? d22WorkedExample(prompt) : d22Task(prompt)}
          </p>
          <StaffArea prompt={prompt} guided={guided} feedback={feedback} onAnswer={onAnswer} />
          {reading && (
            <div className={styles.choices} role="group" aria-labelledby="drill-prompt">
              {prompt.choices.map((c) => {
                const state = !feedback
                  ? undefined
                  : c === feedback.answer
                    ? feedback.result.correct
                      ? 'correct'
                      : 'wrong'
                    : c === prompt.letter && !feedback.result.correct
                      ? 'expected'
                      : undefined;
                return (
                  <button
                    key={c}
                    type="button"
                    className={styles.choice}
                    data-state={state}
                    disabled={Boolean(feedback)}
                    onClick={() => onAnswer(c)}
                    aria-keyshortcuts={c}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
          <p className={styles.explain} data-testid="d22-explain" aria-live="polite">
            {feedback && d22Explain(prompt, feedback)}
          </p>
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      {showNeck && (
        <div className={styles.neckArea} data-testid="d22-neck">
          <Fretboard
            tuning={tuning}
            fretRange={range}
            activeRange={{ from: 0, to: 15 }}
            handedness={handedness}
            markers={markers}
            guideLevel={guided ? 3 : guideLevel}
            blindMode={blindMode}
            label={
              cells
                ? `Fretboard: where ${prompt.letter} on the staff is played`
                : 'Fretboard: shows where the note is played once you answer'
            }
          />
        </div>
      )}
      {/* iPad portrait: below. Compact: the session styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}

function givenLetter(prompt: D22Prompt, answer: D22Answer): string {
  const place = d22AnsweredPlace(prompt, answer);
  return place === null ? String(answer) : noteAtStaffPosition(place).charAt(0);
}

/**
 * The staff: the note to read, or the lines and spaces to tap. Feedback
 * draws the right note, and beside it the one the answer named.
 */
function StaffArea({
  prompt,
  guided,
  feedback,
  onAnswer,
}: Pick<Props, 'prompt' | 'guided' | 'feedback' | 'onAnswer'>) {
  if (feedback) {
    const given = feedback.result.correct ? null : d22AnsweredPlace(prompt, feedback.answer);
    const notes: StaffNote[] = [{ pitches: [prompt.note], value: 'w', style: 'correct' }];
    if (given !== null && given !== prompt.position) {
      notes.push({ pitches: [noteAtStaffPosition(given)], value: 'w', style: 'wrong' });
    }
    return (
      <div className={styles.staffBox} data-testid="d22-staff">
        <Staff
          notes={notes}
          className={styles.readStaff}
          label={
            notes.length > 1
              ? `Staff: ${prompt.letter}, and the note you gave beside it`
              : `Staff: ${prompt.letter}`
          }
        />
      </div>
    );
  }
  if (prompt.direction === 'read') {
    return (
      <div className={styles.staffBox} data-testid="d22-staff">
        <Staff
          notes={[{ pitches: [prompt.note], value: 'w', style: 'target' }]}
          className={styles.readStaff}
          // The name is the answer: VoiceOver hears the place, as a sighted learner sees it.
          revealPitches={guided}
          label="Staff: the note to name"
        />
      </div>
    );
  }
  const marks: StaffMark[] = guided ? [{ position: prompt.position, style: 'selected' }] : [];
  return (
    <div className={styles.staffBox} data-testid="d22-staff" data-placing>
      <Staff
        positionRange={prompt.range}
        marks={marks}
        onTapPosition={(p) => onAnswer(p)}
        label="Staff: tap a line or space"
      />
    </div>
  );
}
