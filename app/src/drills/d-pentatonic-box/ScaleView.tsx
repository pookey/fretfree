import { useState } from 'react';
import { useAppStore } from '../../app-store';
import { COMPACT_WINDOW_FRETS } from '../../shell/size-class';
import { playNotes } from '../../audio/audio';
import { Fretboard } from '../../components/fretboard/Fretboard';
import { noteAt, samePosition, type FretRange, type Position } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  dpbDisplay,
  dpbIsLive,
  dpbRegularWindow,
  dpbShowsCount,
  dpbShowsHint,
  dpbWindow,
} from './logic';
import {
  dpsAccepts,
  dpsAddedLine,
  dpsDegreeName,
  dpsExplain,
  dpsFound,
  dpsIgnores,
  dpsMissed,
  type DpsAnswer,
  type DpsPrompt,
} from './scale';
import { dpsMarkers, ringedNotes } from './markers';
import styles from './BoxView.module.css';

interface ViewState {
  prompt: DpsPrompt;
  /** Taps so far this round. */
  taps: Position[];
}

const WIDE: FretRange = { from: 0, to: 15 };

/**
 * The scale-position view (I7, design §7). A position prompt draws the
 * major box and the learner taps the rest of the position around it; a run
 * prompt draws only the roots and the learner plays the position up from a
 * degree, in order. Each tap is marked at once; the round answers at the
 * last note, on the first wrong tap, or on "Done". The neck windows are the
 * box view's.
 */
export function ScaleView({
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
}: DrillRenderProps<DpsPrompt, DpsAnswer>) {
  const compact = sizeClass === 'compact';
  const soundOn = useAppStore((s) => s.settings.soundOn);
  const volume = useAppStore((s) => s.settings.volume);
  const [state, setState] = useState<ViewState>(() => ({ prompt, taps: [] }));
  // A new prompt starts a new round.
  let view = state;
  if (state.prompt !== prompt) {
    view = { prompt, taps: [] };
    setState(view);
  }
  const taps = feedback ? feedback.answer : view.taps;

  let visible: FretRange;
  if (compact) visible = dpbWindow(prompt, compactFrets);
  else visible = sizeClass === 'regular-wide' ? WIDE : dpbRegularWindow(prompt);

  const tapped = (pos: Position) => taps.some((p) => samePosition(p, pos));

  const tap = (pos: Position) => {
    if (feedback || !dpbIsLive(prompt, pos)) return;
    if (dpsIgnores(prompt, pos) || tapped(pos)) return;
    const right = dpsAccepts(prompt, view.taps, pos);
    const next = [...view.taps, pos];
    setState({ ...view, taps: next });
    if (!right || dpsMissed(prompt, next).length === 0) {
      onAnswer(next);
      return;
    }
    void playNotes([noteAt(pos, tuning).name], { muted: !soundOn, volume });
  };

  /** "Done": the learner sees no more, so the round ends with what was played. */
  const done = () => {
    if (!feedback) onAnswer(view.taps);
  };

  const run = prompt.mode === 'run';
  // The rings still to tap: the count falls with each tap (all of them once answered).
  const left = feedback ? prompt.targets.length : dpsMissed(prompt, taps).length;
  const tonic = dpbDisplay(prompt.tonic);
  const found = dpsFound(prompt, taps);
  const markers = dpsMarkers(prompt, { taps, guided, answered: feedback !== null, tuning });

  const key = <strong>{tonic} major</strong>;
  const from = dpsDegreeName(prompt.degree);
  const hint = dpbShowsHint(guideLevel, guided);
  let question;
  if (!run) {
    question = guided ? (
      <>
        This is {key} position {prompt.position}, around box {prompt.position} (the {prompt.shape}{' '}
        shape). Tap the {ringedNotes(left)} to continue.
      </>
    ) : (
      <>
        Fill in {key} position {prompt.position} around this box
        {hint && ' (add the 4ths and 7ths)'}
      </>
    );
  } else {
    question = guided ? (
      <>
        This is {key} position {prompt.position} from the {from}. Tap the {ringedNotes(left)} in
        order to continue.
      </>
    ) : (
      <>
        Play {key} position {prompt.position} up from the {from}
        {hint && ` (the ${prompt.shape} shape)`}
      </>
    );
  }
  let before = `The squares are the roots, ${tonic}; the dots are major box ${prompt.position}.`;
  if (run) {
    before = `The squares are the roots, ${tonic}. Start on the lowest ${from} and go up to the highest.`;
  } else if (guided) {
    // A worked example names what to tap, not the box it's given (rule 8).
    before = `The squares are the roots, ${tonic}. ${dpsAddedLine(prompt)}`;
  }

  return (
    <div
      className={styles.drill}
      data-testid="dpb-drill"
      data-size-class={sizeClass}
      data-mode={prompt.mode}
      data-scope={prompt.scope}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="dpb-prompt">
            {question}
          </p>
          {/* Compact screens keep the height for the neck: no hint line before an answer. */}
          {(feedback || !compact) && (
            <p className={styles.explain} data-testid="dpb-explain">
              {feedback ? dpsExplain(prompt, feedback) : before}
            </p>
          )}
          <div className={styles.actions}>
            <p className={styles.count} data-testid="dpb-count" aria-live="polite">
              {run ? 'Played' : 'Found'} {found.length}
              {dpbShowsCount(guideLevel, guided) && ` of ${prompt.targets.length}`}
            </p>
            {!feedback && (
              <button type="button" className={styles.done} onClick={done}>
                Done
              </button>
            )}
          </div>
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <div className={styles.neckArea}>
        <Fretboard
          tuning={tuning}
          fretRange={visible}
          activeRange={prompt.activeRange}
          handedness={handedness}
          markers={markers}
          guideLevel={guided ? 3 : guideLevel}
          blindMode={blindMode}
          accidentalPref={prompt.accidentalPref}
          onTapCell={tap}
          label={
            run
              ? `Fretboard: play ${tonic} major position ${prompt.position} up from the ${from}`
              : `Fretboard: fill in ${tonic} major position ${prompt.position}`
          }
        />
      </div>
      {/* Below the neck on iPad portrait; the session shows it as a sheet on compact. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
