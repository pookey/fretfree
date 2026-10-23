import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useAppStore } from '../../app-store';
import { playNotes } from '../../audio/audio';
import { Fretboard } from '../../components/fretboard/Fretboard';
import { STANDARD_TUNING, noteAt, type Position } from '../../theory';
import { displayPc } from '../../theory/pitch-display';
import {
  START,
  STAGES,
  STAGE_LABEL,
  currentStep,
  exampleMarkers,
  exampleSounds,
  isComplete,
  nextStep,
  outcomeOf,
  stageGuideLevel,
  stageOf,
  stepRange,
  tapCell,
} from './logic';
import type { WorkedExample as Example } from './types';
import styles from './WorkedExample.module.css';

/**
 * A 30-second interactive worked example (design §7 Learn, research/02
 * rule 8). The learner taps the shown answer, then answers with a hint, then
 * alone; the neck's guides fade at each stage. It leads into practice: the
 * skill detail puts "Practise this now" right after it.
 */
export function WorkedExample({ example }: { example: Example }) {
  const settings = useAppStore((s) => s.settings);
  const [state, setState] = useState(START);
  const titleId = useId();
  const stage = stageOf(state);
  const step = currentStep(example, state);
  const complete = isComplete(state);
  const pcAt = (p: Position) => displayPc(noteAt(p, STANDARD_TUNING, settings.accidentalPref).pc);

  const neckRef = useRef<HTMLDivElement>(null);
  const { tapped } = state;

  // A new step starts with the neck scrolled back to its low end.
  useEffect(() => {
    if (neckRef.current) neckRef.current.scrollLeft = 0;
  }, [state.step]);

  const onTap = (pos: Position) => {
    const next = tapCell(example, state, pos);
    setState(next);
    // Sound + visual + name on every answer (research/02 rule 10), once per answer.
    if (next.tapped && !state.tapped) {
      void playNotes(exampleSounds(step), { muted: !settings.soundOn, volume: settings.volume });
    }
  };

  const outcome = tapped ? outcomeOf(step, tapped) : null;
  let feedback: ReactNode = null;
  if (outcome === 'correct') {
    feedback = (
      <p className={styles.correct} data-testid="example-correct">
        ✓ {stage === 'worked' ? 'That’s the shape.' : step.explain}
      </p>
    );
  } else if (outcome && tapped) {
    feedback = (
      <div className={styles.wrong} data-testid="example-wrong">
        <p>
          <strong className={styles.wrongLead}>
            ✗ That’s {outcome === 'trap' && step.trap ? displayPc(step.trap.name) : pcAt(tapped)}.
          </strong>{' '}
          {step.explain}
        </p>
        {outcome === 'trap' && step.trap && (
          <aside className={styles.callout} aria-label="Watch out for" data-testid="example-trap">
            <p>{step.trap.message}</p>
          </aside>
        )}
      </div>
    );
  } else if (stage === 'worked') {
    feedback = (
      <p className={state.nudge ? styles.nudge : styles.muted} data-testid="example-instruction">
        Tap the highlighted {pcAt(step.answer)} to go on.
      </p>
    );
  }

  return (
    <section
      className={styles.example}
      aria-labelledby={titleId}
      data-testid="worked-example"
      data-stage={stage}
    >
      <header className={styles.header}>
        <h5 id={titleId} className={styles.title}>
          {example.title}
        </h5>
        <ol className={styles.stages} aria-label="Stages">
          {STAGES.map((s, i) => (
            <li
              key={s}
              aria-current={i === state.step ? 'step' : undefined}
              data-done={i < state.step || complete ? 'true' : undefined}
            >
              {STAGE_LABEL[s]}
            </li>
          ))}
        </ol>
      </header>
      <p className={styles.idea}>{example.idea}</p>
      <p className={styles.prompt} data-testid="example-prompt">
        {step.prompt}
      </p>
      {stage === 'worked' && <p className={styles.explain}>{step.explain}</p>}
      {stage === 'faded' && !tapped && (
        <p className={styles.hint} data-testid="example-hint">
          Hint: {step.hint}
        </p>
      )}
      <div className={styles.neck} ref={neckRef}>
        <Fretboard
          tuning={STANDARD_TUNING}
          fretRange={stepRange(step, example.range)}
          handedness={settings.handedness}
          guideLevel={stageGuideLevel(stage)}
          accidentalPref={settings.accidentalPref}
          markers={exampleMarkers(example, state, { pref: settings.accidentalPref })}
          onTapCell={onTap}
          label="Worked example neck"
        />
      </div>
      <div className={styles.feedback} aria-live="polite">
        {feedback}
      </div>
      {complete ? (
        <div className={styles.done} data-testid="example-done">
          <p>That’s the idea. Now practise it: spaced practice is what makes it stick.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setState(START)}>
              Start again
            </button>
          </div>
        </div>
      ) : (
        tapped && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.next}
              onClick={() => setState((s) => nextStep(s))}
            >
              Next
            </button>
          </div>
        )
      )}
    </section>
  );
}
