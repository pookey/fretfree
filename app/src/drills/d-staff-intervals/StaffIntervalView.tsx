import { useEffect } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { Staff, type StaffMark, type StaffNote } from '../../components/staff';
import { neckWindow } from '../../shell/size-class';
import { noteAtStaffPosition, staffNote } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  siAnsweredPlace,
  siExplain,
  siFeedbackPositions,
  siKeyToAnswer,
  siNickname,
  siSizeOf,
  siTask,
  siWorkedExample,
  type SIAnswer,
  type SIPrompt,
} from './logic';
import styles from './StaffIntervalView.module.css';

type Props = DrillRenderProps<SIPrompt, SIAnswer>;

/**
 * The staff-interval view (design §12 screens): the staff above the neck.
 *
 * - Reading: the pair on the staff (inside a short phrase from scope level
 *   1, the pair marked) and the answers 2nd to octave below it, keys 2–8 on
 *   a hardware keyboard. On iPad the neck waits empty, then shows the pair
 *   in one position once answered.
 * - Placing: the start note on a staff that takes a tap (a ghost note
 *   follows the finger, stacked on the start note so the shape shows), or a
 *   line or space picked with the arrow keys and Enter.
 *
 * Feedback draws the pair side by side, and a miss marks where the answer
 * reached beside the right note, and plays both (research/02 rule 10).
 * VoiceOver hears where each note sits, never its name, as a sighted
 * learner sees it.
 */
export function StaffIntervalView({
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
      const answer = siKeyToAnswer(e.key, prompt.choices);
      if (answer) {
        e.preventDefault();
        onAnswer(answer);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, reading, prompt.choices]);

  const cells = feedback ? siFeedbackPositions(prompt, feedback, tuning) : null;
  // iPad: the neck stays under a reading card so the answer lands on it. A
  // placing card's tall staff needs the room until the answer is in.
  const showNeck = Boolean(feedback) || (reading && sizeClass !== 'compact');
  const frets = cells?.expected.map((c) => c.fret) ?? [];
  const range = neckWindow(sizeClass, frets.length > 0 ? Math.min(...frets) : 0, compactFrets);
  const letter = (note: string) => staffNote(note).letter;

  const markers: FretMarker[] = cells
    ? [
        ...cells.expected.map((p, i): FretMarker => ({
          ...p,
          // The start note as a root mark, so the two read apart without colour.
          style: i === 0 ? 'root' : 'correct',
          label: letter(i === 0 ? prompt.fromNote : prompt.toNote),
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
      data-testid="si-drill"
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt">
            {guided ? siWorkedExample(prompt) : siTask(prompt)}
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
                    : c === feedback.result.expected && !feedback.result.correct
                      ? 'expected'
                      : undefined;
                const size = siSizeOf(c) as number;
                const nick = siNickname(size);
                return (
                  <button
                    key={c}
                    type="button"
                    className={styles.choice}
                    data-state={state}
                    disabled={Boolean(feedback)}
                    onClick={() => onAnswer(c)}
                    aria-keyshortcuts={String(size)}
                  >
                    {c}
                    {/* The space keeps the name "3rd skip" for VoiceOver; flex drops it on screen. */}
                    {nick && ' '}
                    {nick && <span className={styles.nick}>{nick.replace(/^a /, '')}</span>}
                  </button>
                );
              })}
            </div>
          )}
          <p className={styles.explain} data-testid="si-explain" aria-live="polite">
            {feedback && siExplain(prompt, feedback)}
          </p>
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      {showNeck && (
        <div className={styles.neckArea} data-testid="si-neck">
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
                ? `Fretboard: ${letter(prompt.fromNote)} to ${letter(prompt.toNote)}, as played`
                : 'Fretboard: shows where the notes are played once you answer'
            }
          />
        </div>
      )}
      {/* iPad portrait: below. Compact: the session styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}

function givenLetter(prompt: SIPrompt, answer: SIAnswer): string {
  const place = siAnsweredPlace(prompt, answer);
  return place === null ? String(answer) : noteAtStaffPosition(place).charAt(0);
}

/**
 * The staff: the phrase to read, or the start note and the lines and spaces
 * to tap. Feedback draws the pair side by side, and marks where a miss
 * reached in the second note's column.
 */
function StaffArea({
  prompt,
  guided,
  feedback,
  onAnswer,
}: Pick<Props, 'prompt' | 'guided' | 'feedback' | 'onAnswer'>) {
  const reading = prompt.direction === 'read';
  const value = prompt.phrase.length > 2 ? 'q' : 'w';
  const inPair = (i: number) => i === prompt.pairAt || i === prompt.pairAt + 1;

  if (feedback) {
    // A placing card's answer completes the pair; a reading card keeps its phrase.
    const phrase = reading ? prompt.phrase : [prompt.from, prompt.to];
    const notes: StaffNote[] = phrase.map((p, i) => ({
      pitches: [noteAtStaffPosition(p)],
      value: reading ? value : 'w',
      style: inPair(i) ? 'correct' : 'plain',
    }));
    const given = feedback.result.correct ? null : siAnsweredPlace(prompt, feedback.answer);
    const marks: StaffMark[] =
      given !== null && given !== prompt.to && given !== prompt.from && given >= -7 && given <= 15
        ? [{ position: given, style: 'wrong', at: prompt.pairAt + 1 }]
        : [];
    return (
      <div className={styles.staffBox} data-testid="si-staff">
        <Staff
          notes={notes}
          marks={marks}
          className={styles.readStaff}
          label={
            marks.length > 0
              ? 'Staff: the interval, and where your answer reached beside it'
              : 'Staff: the interval'
          }
        />
      </div>
    );
  }
  if (reading) {
    const notes: StaffNote[] = prompt.phrase.map((p, i) => ({
      pitches: [noteAtStaffPosition(p)],
      value,
      // The pair is marked only inside a phrase; on its own it is all there is.
      style: prompt.phrase.length > 2 && inPair(i) ? 'target' : 'plain',
    }));
    return (
      <div className={styles.staffBox} data-testid="si-staff">
        <Staff
          notes={notes}
          className={styles.readStaff}
          revealPitches={false}
          label={
            prompt.phrase.length > 2
              ? 'Staff: a phrase, the two notes to name marked'
              : 'Staff: the two notes to name'
          }
        />
      </div>
    );
  }
  const marks: StaffMark[] = guided ? [{ position: prompt.to, style: 'selected', at: 0 }] : [];
  return (
    <div className={styles.staffBox} data-testid="si-staff" data-placing>
      <Staff
        notes={[{ pitches: [prompt.fromNote], value: 'w', style: 'plain' }]}
        positionRange={prompt.range}
        marks={marks}
        revealPitches={false}
        onTapPosition={(p) => onAnswer(p)}
        label="Staff: tap a line or space"
      />
    </div>
  );
}
