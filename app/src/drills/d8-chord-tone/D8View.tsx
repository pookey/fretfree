import { useEffect } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { COMPACT_WINDOW_FRETS } from '../../shell/size-class';
import { noteAt, samePosition, type Position } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  d8DegreeLabel,
  d8DegreeName,
  d8DegreeSpoken,
  d8DegreeStyle,
  d8Display,
  d8Explain,
  d8KeyFor,
  d8KeyToAnswer,
  d8NoteAt,
  d8ShowsRoots,
  d8Targets,
  d8VoicingLine,
  d8Window,
  type D8Answer,
  type D8Prompt,
  type ToneNote,
} from './logic';
import styles from './D8View.module.css';

/** Every marker of the shape shares this group, so the neck outlines it (guide levels 2–3). */
const GROUP = 'd8-shape';

/** The markers before an answer: the shape, with the roots and the ringed note as guides allow. */
function promptMarkers(prompt: D8Prompt, roots: boolean, guided: boolean): FretMarker[] {
  const asked = new Set(guided ? d8Targets(prompt) : []);
  return prompt.notes.map((n): FretMarker => {
    const base = { string: n.string, fret: n.fret, group: GROUP, label: d8Display(n.name) };
    const ringed = prompt.ringed && samePosition(n, prompt.ringed);
    if (ringed || (prompt.mode === 'tap' && asked.has(n))) {
      // A worked example names the degree; a recall prompt never labels a target.
      return guided
        ? { ...base, style: 'target', label: d8DegreeLabel(n.degree), forceLabel: true }
        : { ...base, style: 'target' };
    }
    if (roots && n.degree === '1') return { ...base, style: 'root' };
    return { ...base, style: prompt.mode === 'name' ? 'ghost' : 'tone' };
  });
}

/** After an answer: every note by its degree, the answer marked correct and a wrong tap marked. */
function feedbackMarkers(prompt: D8Prompt, answer: D8Answer, correct: boolean): FretMarker[] {
  const tap = typeof answer === 'string' ? null : answer;
  const isAnswer = (n: ToneNote) =>
    prompt.ringed ? samePosition(n, prompt.ringed) : n.degree === prompt.degree;
  const markers = prompt.notes.map((n): FretMarker => {
    const wrong = !correct && tap && samePosition(n, tap);
    let style: FretMarker['style'] = d8DegreeStyle(n.degree);
    if (wrong) style = 'wrong';
    else if (isAnswer(n)) style = 'correct';
    return {
      string: n.string,
      fret: n.fret,
      group: GROUP,
      style,
      label: d8DegreeLabel(n.degree),
      forceLabel: true,
    };
  });
  if (tap && !correct && !d8NoteAt(prompt, tap)) {
    const name = noteAt(tap, prompt.tuning, prompt.accidentalPref).pc;
    markers.push({ ...tap, style: 'wrong', label: d8Display(name), forceLabel: true });
  }
  return markers;
}

/**
 * D8 view (design §6 D8, §7). A chord shape is drawn on the neck. In tap mode
 * the learner taps the asked degree; in name mode one note is ringed and the
 * learner names it with the degree buttons (or the number row). The shape's
 * outline, its roots and its note names fade with the guide level (§3.5); the
 * feedback names every note's degree, by shape and colour. The iPad shows the
 * whole neck so the shape sits in context; iPad portrait a 12-fret neck, and
 * compact screens a window round the shape.
 */
export function D8View({
  prompt,
  guideLevel,
  guided,
  handedness,
  sizeClass,
  compactFrets = COMPACT_WINDOW_FRETS,
  tuning,
  feedback,
  onAnswer,
  aside,
  blindMode,
}: DrillRenderProps<D8Prompt, D8Answer>) {
  const { choices } = prompt;
  const naming = prompt.mode === 'name';

  useEffect(() => {
    if (feedback || !naming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const answer = d8KeyToAnswer(e.key, choices);
      if (answer) {
        e.preventDefault();
        onAnswer(answer);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, naming, onAnswer, choices]);

  const roots = d8ShowsRoots(prompt, guideLevel, guided);
  const markers = feedback
    ? feedbackMarkers(prompt, feedback.answer, feedback.result.correct)
    : promptMarkers(prompt, roots, guided);

  const tap = (pos: Position) => {
    if (feedback || naming) return;
    onAnswer(pos);
  };

  const cellName = (pos: Position) => {
    const base = `string ${pos.string}, fret ${pos.fret}`;
    const note = d8NoteAt(prompt, pos);
    if (!note) return base;
    if (prompt.ringed && samePosition(note, prompt.ringed)) return `${base}, ringed note`;
    if (roots && note.degree === '1') return `${base}, root`;
    return `${base}, in the shape`;
  };

  const chord = <strong>{d8Display(prompt.chord)}</strong>;
  const degree = d8DegreeName(prompt.degree);
  let question;
  if (naming) {
    question = guided ? (
      <>
        The ringed note is the {degree} of {chord}. Tap{' '}
        <strong>{d8DegreeLabel(prompt.degree)}</strong> to continue.
      </>
    ) : (
      <>Which chord tone of {chord} is the ringed note?</>
    );
  } else {
    const many = d8Targets(prompt).length > 1;
    question = guided ? (
      <>
        The {many ? `${degree}s` : degree} of {chord} {many ? 'are' : 'is'} marked. Tap{' '}
        {many ? 'one' : 'it'} to continue.
      </>
    ) : (
      <>
        Tap the <strong>{degree}</strong> of {chord}
      </>
    );
  }

  const hint = roots
    ? `${d8VoicingLine(prompt)}. The squares are its roots.`
    : d8VoicingLine(prompt);
  const compact = sizeClass === 'compact';
  const ringed = prompt.ringed
    ? `; the ringed note is on string ${prompt.ringed.string}, fret ${prompt.ringed.fret}`
    : '';
  const neckLabel = `Fretboard: ${d8Display(prompt.chord)}, ${d8VoicingLine(prompt)}${ringed}`;

  return (
    <div
      className={styles.drill}
      data-testid="d8-drill"
      data-size-class={sizeClass}
      data-mode={prompt.mode}
      data-scope={prompt.scope}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d8-prompt">
            {question}
          </p>
          {(feedback || !compact) && (
            <p className={styles.explain} data-testid="d8-explain">
              {feedback ? d8Explain(prompt, feedback) : hint}
            </p>
          )}
          {naming && (
            <div className={styles.choices} role="group" aria-labelledby="drill-prompt">
              {choices.map((c, i) => {
                const state = !feedback
                  ? undefined
                  : c === feedback.answer
                    ? feedback.result.correct
                      ? 'correct'
                      : 'wrong'
                    : c === prompt.degree && !feedback.result.correct
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
                    aria-label={d8DegreeSpoken(c)}
                    aria-keyshortcuts={d8KeyFor(i)}
                  >
                    {d8DegreeLabel(c)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <div className={styles.neckArea}>
        <Fretboard
          tuning={tuning}
          fretRange={d8Window(prompt, sizeClass, compactFrets)}
          handedness={handedness}
          markers={markers}
          guideLevel={guided ? 3 : guideLevel}
          blindMode={blindMode}
          accidentalPref={prompt.accidentalPref}
          onTapCell={naming ? undefined : tap}
          cellLabel={cellName}
          label={neckLabel}
        />
      </div>
      {/* Below the neck on iPad portrait; the session shows it as a sheet on compact. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
