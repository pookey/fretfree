import { useEffect } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { neckWindow } from '../../shell/size-class';
import type { DrillRenderProps } from '../types';
import {
  d1FeedbackPositions,
  d1GuideMarkers,
  d1KeyToAnswer,
  type D1Answer,
  type D1Prompt,
} from './logic';
import styles from './D1View.module.css';

/** D1 view: the highlighted cell on the neck, note buttons above it (design §7 session layout). */
export function D1View({
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
}: DrillRenderProps<D1Prompt, D1Answer>) {
  const pref = prompt.choices.some((c) => c.includes('b')) ? 'flat' : 'sharp';

  useEffect(() => {
    if (feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const answer = d1KeyToAnswer(e.key, e.shiftKey, prompt.choices, pref);
      if (answer) {
        e.preventDefault();
        onAnswer(answer);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, pref, prompt.choices]);

  const range = neckWindow(sizeClass, prompt.position.fret, compactFrets);
  // The worked example shows full guides (design §3.3 step 2).
  const level = guided ? 3 : guideLevel;

  let markers: FretMarker[];
  if (feedback) {
    const pos = d1FeedbackPositions(prompt, feedback, tuning);
    markers = [
      ...pos.expected.map((p): FretMarker => ({
        ...p,
        style: 'correct',
        label: prompt.expectedPc,
        forceLabel: true,
      })),
      ...pos.given.map((p): FretMarker => ({
        ...p,
        style: 'wrong',
        label: feedback.answer,
        forceLabel: true,
      })),
    ];
  } else {
    // Worked example: the first rep of a new item shows the answer. An
    // unguided prompt is a recall test, so the answer never reaches the neck.
    markers = [
      ...d1GuideMarkers(prompt, level, range, tuning, pref),
      guided
        ? { ...prompt.position, style: 'target', label: prompt.expectedPc, forceLabel: true }
        : { ...prompt.position, style: 'target' },
    ];
  }

  return (
    <div className={styles.drill} data-size-class={sizeClass}>
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt">
            {guided ? (
              <>
                This is <strong>{prompt.expectedPc}</strong>. Tap {prompt.expectedPc} to continue.
              </>
            ) : (
              'Name the highlighted note'
            )}
          </p>
          <div className={styles.choices} role="group" aria-labelledby="drill-prompt">
            {prompt.choices.map((c, i) => {
              const state = !feedback
                ? undefined
                : c === feedback.answer
                  ? feedback.result.correct
                    ? 'correct'
                    : 'wrong'
                  : c === prompt.expectedPc && !feedback.result.correct
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
                  aria-keyshortcuts={String(i + 1)}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <div className={styles.neckArea}>
        <Fretboard
          tuning={tuning}
          fretRange={range}
          activeRange={{ from: 0, to: 12 }}
          handedness={handedness}
          markers={markers}
          guideLevel={level}
          blindMode={blindMode}
          label={`Fretboard, string ${prompt.position.string} highlighted`}
        />
      </div>
      {/* iPad portrait: the context panel sits below the neck; compact styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
