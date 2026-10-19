import { useState } from 'react';
import { useAppStore } from '../../app-store';
import { COMPACT_WINDOW_FRETS } from '../../shell/size-class';
import { playNotes } from '../../audio/audio';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { noteAt, samePosition, type FretRange, type Position } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  dpbDisplay,
  dpbExplain,
  dpbIgnores,
  dpbIsLive,
  dpbMissed,
  dpbRegularWindow,
  dpbShowsCount,
  dpbShowsHint,
  dpbTargetAt,
  dpbWindow,
  dpbWrongTaps,
  type BoxNote,
  type DpbAnswer,
  type DpbPrompt,
} from './logic';
import styles from './BoxView.module.css';

interface ViewState {
  prompt: DpbPrompt;
  /** Taps so far this round. */
  taps: Position[];
}

const WIDE: FretRange = { from: 0, to: 15 };

/** The chord's degrees by shape and colour: the root a square, the 3rd a circle, the 5th a triangle. */
function chordStyle(degree: BoxNote['degree']): FretMarker['style'] {
  if (degree === '1') return 'root';
  return degree === '5' ? 'fifth' : 'third';
}

/**
 * The pentatonic-box view (C7, design §7). An overlay prompt draws the
 * chord a box wraps and the learner taps the rest of the box around it; a
 * relative prompt draws the whole box and the learner taps the relative
 * root in it. Each tap is marked at once; the round answers at the last
 * note, on the first wrong tap, or on "Done". The iPad shows the whole neck,
 * iPad portrait 12 frets holding the box, and compact screens a window
 * around it.
 */
export function BoxView({
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
}: DrillRenderProps<DpbPrompt, DpbAnswer>) {
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
    if (dpbIgnores(prompt, pos) || tapped(pos)) return;
    const next = [...view.taps, pos];
    setState({ ...view, taps: next });
    if (!dpbTargetAt(prompt, pos) || dpbMissed(prompt, next).length === 0) {
      onAnswer(next);
      return;
    }
    void playNotes([noteAt(pos, tuning).name], { muted: !soundOn, volume });
  };

  /** "Done": the learner sees no more, so the round ends with what was found. */
  const done = () => {
    if (!feedback) onAnswer(view.taps);
  };

  const overlay = prompt.mode === 'overlay';
  const root = dpbDisplay(prompt.root);
  const relRoot = dpbDisplay(prompt.relative.root);
  /** A target's label once found: its degree (overlay) or its name (relative). */
  const answerLabel = (n: BoxNote) => (overlay ? dpbDisplay(n.degree) : relRoot);
  const wrong = dpbWrongTaps(prompt, taps);

  const markerFor = (n: BoxNote): FretMarker | null => {
    const at = { string: n.string, fret: n.fret };
    if (dpbTargetAt(prompt, n)) {
      if (tapped(n)) return { ...at, style: 'correct', label: answerLabel(n), forceLabel: true };
      if (feedback) return { ...at, style: 'ghost', label: answerLabel(n), forceLabel: true };
      if (guided) return { ...at, style: 'target' };
      if (overlay) return null;
    }
    if (wrong.some((p) => samePosition(p, n))) return null;
    if (n.degree === '1') return { ...at, style: 'root', label: root, forceLabel: true };
    if (overlay) return { ...at, style: chordStyle(n.degree), label: dpbDisplay(n.degree) };
    // A relative prompt's box: plain dots, named by degree only once answered (rule 4).
    return feedback
      ? { ...at, style: 'tone', label: dpbDisplay(n.degree), forceLabel: true }
      : { ...at, style: 'tone' };
  };
  const markers: FretMarker[] = prompt.boxNotes.flatMap((n) => markerFor(n) ?? []);
  if (feedback) {
    markers.push(
      ...wrong.map((p): FretMarker => ({
        ...p,
        style: 'wrong',
        label: dpbDisplay(noteAt(p, tuning, prompt.accidentalPref).pc),
        forceLabel: true,
      })),
    );
  }

  const chord = <strong>{dpbDisplay(prompt.chord)}</strong>;
  const hint = dpbShowsHint(guideLevel, guided);
  let question;
  if (overlay) {
    question = guided ? (
      <>
        This is {chord} pentatonic box {prompt.box}, around the {prompt.shape} shape. Tap each note
        to continue.
      </>
    ) : (
      <>
        Build {chord} pentatonic box {prompt.box} around this chord
        {hint && ` (the ${prompt.shape} shape)`}
      </>
    );
  } else {
    question = guided ? (
      <>
        In this {chord} box, the relative {prompt.relative.quality}’s root is {relRoot}. Tap each{' '}
        {relRoot} to continue.
      </>
    ) : (
      <>
        Tap every root of {chord}’s relative {prompt.relative.quality} in this box
      </>
    );
  }
  const before =
    `The squares are the roots, ${root}.` +
    (!overlay && hint && !guided ? ` The relative ${prompt.relative.quality} is ${relRoot}.` : '');

  const found = taps.filter((p) => dpbTargetAt(prompt, p)).length;
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
              {feedback ? dpbExplain(prompt, feedback) : before}
            </p>
          )}
          <div className={styles.actions}>
            <p className={styles.count} data-testid="dpb-count" aria-live="polite">
              Found {found}
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
            overlay
              ? `Fretboard: build the box around the ${dpbDisplay(prompt.chord)} chord`
              : `Fretboard: find the relative ${prompt.relative.quality}’s root in the box`
          }
        />
      </div>
      {/* Below the neck on iPad portrait; the session shows it as a sheet on compact. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
