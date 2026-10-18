import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GuideLevel } from '../../engine/model';
import { degreeOrdinal, type SpellingVerdict } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  alterNote,
  d7Blanks,
  d7Explain,
  d7Guides,
  d7KeyAction,
  d7Task,
  d7Verdicts,
  d7WorkedExample,
  pretty,
  spoken,
  type D7Answer,
  type D7Prompt,
} from './logic';
import styles from './D7View.module.css';

/** Grid rows, top to bottom: sharper above, flatter below. */
const ROWS = ['##', '#', '', 'b', 'bb'];
const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const VERDICT_MARK: Record<SpellingVerdict, string> = {
  correct: '✓',
  enharmonic: '≈',
  wrong: '✗',
};

const VERDICT_TEXT: Record<SpellingVerdict, string> = {
  correct: 'correct',
  enharmonic: 'right pitch, wrong letter',
  wrong: 'wrong',
};

/**
 * D7 view (design §6 D7): the subject, a row of slots (tonic or root given),
 * and a letter × accidental grid that fills the slots in order. Checking is
 * explicit, so a slip can be undone first. In feedback each slot is marked
 * by shape as well as colour (✓ ≈ ✗), with the explanation below.
 */
export function D7View({
  prompt,
  guideLevel,
  guided,
  sizeClass,
  feedback,
  onAnswer,
  aside,
}: DrillRenderProps<D7Prompt, D7Answer>) {
  const blanks = d7Blanks(prompt);
  const [entry, setEntry] = useState<{ prompt: D7Prompt; notes: string[] }>({ prompt, notes: [] });
  // A new prompt starts empty.
  const notes = useMemo(() => (entry.prompt === prompt ? entry.notes : []), [entry, prompt]);
  const setNotes = useCallback(
    (fn: (n: string[]) => string[]) =>
      setEntry((e) => ({ prompt, notes: fn(e.prompt === prompt ? e.notes : []) })),
    [prompt],
  );

  const full = notes.length === blanks.length;
  const add = useCallback(
    (note: string) => setNotes((n) => (n.length < blanks.length ? [...n, note] : n)),
    [setNotes, blanks.length],
  );
  const remove = useCallback(() => setNotes((n) => n.slice(0, -1)), [setNotes]);
  const check = useCallback(() => {
    if (full) onAnswer({ notes });
  }, [full, notes, onAnswer]);

  useEffect(() => {
    if (feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const action = d7KeyAction(e.key, prompt.kind);
      if (!action) return;
      // Enter on a focused button is that button's click, not "check".
      if (action.type === 'check' && e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      if (action.type === 'degree') onAnswer({ degree: action.degree });
      else if (action.type === 'add') add(action.note);
      else if (action.type === 'remove') remove();
      else if (action.type === 'check') check();
      else
        setNotes((n) =>
          n.length ? [...n.slice(0, -1), alterNote(n.at(-1) as string, action.by)] : n,
        );
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, prompt.kind, onAnswer, add, remove, check, setNotes]);

  // The worked example shows full guides (design §3.3 step 2).
  const level: GuideLevel = guided ? 3 : guideLevel;
  const guides = d7Guides(level);
  const answer = feedback?.answer;
  const shown = answer && 'notes' in answer ? answer.notes : notes;
  const verdicts = feedback && answer ? d7Verdicts(prompt, answer) : [];
  const explanation =
    feedback && !feedback.result.correct && answer ? d7Explain(prompt, answer) : [];
  const isDegreeOf = prompt.kind === 'degree-of';

  let blank = 0;
  const slots = prompt.slots.map((slot, i) => {
    const label = isDegreeOf && !slot.given ? '?' : slot.label;
    const step = guides.steps && i > 0 ? prompt.steps[i - 1] : undefined;
    let content: string;
    let state: string;
    let verdict: SpellingVerdict | undefined;
    let ghost: string | undefined;
    let heard: string | undefined;
    if (slot.given || isDegreeOf) {
      heard = slot.note;
      content = pretty(slot.note);
      state = 'given';
    } else {
      const b = blank++;
      const note = shown[b];
      heard = note;
      verdict = verdicts[b];
      content = note === undefined ? '' : pretty(note);
      state = note !== undefined ? 'filled' : b === notes.length && !feedback ? 'current' : 'empty';
      // Worked example: the answer sits faintly in the slot to copy.
      if (note === undefined && !feedback) {
        if (guided) ghost = pretty(slot.note);
        else if (guides.letters) ghost = slot.note.charAt(0);
      }
    }
    const what = isDegreeOf && !slot.given ? 'note' : guides.labels ? label : `note ${i + 1}`;
    const said = heard === undefined ? 'empty' : spoken(heard);
    return (
      <li key={i} className={styles.slotItem}>
        {step && (
          <span className={styles.step} aria-hidden="true" data-testid="d7-step">
            {step}
          </span>
        )}
        <span
          className={styles.slot}
          data-state={state}
          data-verdict={verdict}
          data-testid="d7-slot"
          aria-label={`${what}: ${said}${verdict ? `, ${VERDICT_TEXT[verdict]}` : ''}`}
        >
          {content || (ghost && <span className={styles.ghost}>{ghost}</span>)}
          {verdict && (
            <span className={styles.mark} aria-hidden="true">
              {VERDICT_MARK[verdict]}
            </span>
          )}
        </span>
        {verdict && verdict !== 'correct' && (
          <span className={styles.expected} data-testid="d7-expected">
            {pretty(slot.note)}
          </span>
        )}
        {guides.labels && (
          <span className={styles.label} aria-hidden="true">
            {label}
          </span>
        )}
      </li>
    );
  });

  const hint =
    prompt.kind === 'chord'
      ? 'Root, 3rd, 5th, 7th: skip a letter each time.'
      : 'Each letter A–G once, in order.';

  const context = aside ? (
    <aside className={styles.context} aria-label="Context" data-testid="context-panel">
      <h2>{prompt.kind === 'chord' ? 'Chord formula' : 'Major scale'}</h2>
      {prompt.kind === 'chord' ? (
        <p>
          <strong>{prompt.subject}</strong> = {prompt.slots.map((s) => s.label).join(' ')}
        </p>
      ) : (
        <p>
          Steps from the tonic: <strong>W W H W W W H</strong>
        </p>
      )}
      <p>{hint}</p>
      {level >= 2 && (
        <p>
          No sharp between <strong>B–C</strong> and <strong>E–F</strong>: they are a half step
          apart.
        </p>
      )}
    </aside>
  ) : null;

  const rows = ROWS.filter((r) => prompt.choices.some((c) => c.slice(1) === r));

  return (
    <div className={styles.drill} data-size-class={sizeClass} data-testid="d7-drill">
      <div className={styles.upper}>
        <div className={styles.top}>
          <div className={styles.question}>
            <p className={styles.subject} data-testid="d7-subject">
              {prompt.subject}
            </p>
            <p className={styles.prompt} id="drill-prompt">
              {guided ? (
                <>
                  {d7WorkedExample(prompt)}{' '}
                  {isDegreeOf ? (
                    <>
                      Tap <strong>{degreeOrdinal(prompt.degree as number)}</strong> to continue.
                    </>
                  ) : (
                    'Enter it to continue.'
                  )}
                </>
              ) : (
                d7Task(prompt)
              )}
            </p>
            <p className={styles.hint} data-testid="d7-hint">
              {!feedback && guides.steps && !isDegreeOf && hint}
            </p>
            <ol className={styles.slots} aria-label="Spelling">
              {slots}
            </ol>
            {explanation.length > 0 && (
              <ul className={styles.explanation} data-testid="d7-explanation">
                {explanation.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
          {/* In spelling feedback the grid is gone, so the question takes the width. */}
          {(isDegreeOf || !feedback) && (
            <div className={styles.answer}>
              {isDegreeOf ? (
                <div className={styles.degrees} role="group" aria-labelledby="drill-prompt">
                  {prompt.degreeChoices.map((d) => {
                    const picked = answer && 'degree' in answer ? answer.degree : null;
                    const state = !feedback
                      ? undefined
                      : d === picked
                        ? feedback.result.correct
                          ? 'correct'
                          : 'wrong'
                        : d === prompt.degree && !feedback.result.correct
                          ? 'expected'
                          : undefined;
                    return (
                      <button
                        key={d}
                        type="button"
                        className={styles.choice}
                        data-state={state}
                        disabled={Boolean(feedback)}
                        onClick={() => onAnswer({ degree: d })}
                        aria-keyshortcuts={String(d)}
                      >
                        {degreeOrdinal(d)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div
                    className={styles.grid}
                    role="group"
                    aria-labelledby="drill-prompt"
                    style={{ gridTemplateRows: `repeat(${rows.length}, auto)` }}
                  >
                    {prompt.choices.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={styles.choice}
                        style={{
                          gridColumn: COLUMNS.indexOf(c.charAt(0)) + 1,
                          gridRow: rows.indexOf(c.slice(1)) + 1,
                        }}
                        disabled={full}
                        onClick={() => add(c)}
                        aria-label={spoken(c)}
                      >
                        {pretty(c)}
                      </button>
                    ))}
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={remove}
                      disabled={notes.length === 0}
                      aria-keyshortcuts="Backspace"
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={check}
                      disabled={!full}
                      aria-keyshortcuts="Enter"
                    >
                      Check
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {sizeClass === 'regular-wide' && context}
      </div>
      {/* iPad portrait: below. Compact: the session styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && context}
    </div>
  );
}
