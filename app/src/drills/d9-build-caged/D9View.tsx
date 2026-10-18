import { useState } from 'react';
import { useAppStore } from '../../app-store';
import { COMPACT_WINDOW_FRETS } from '../../shell/size-class';
import { playNotes } from '../../audio/audio';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { noteAt, samePosition, type FretRange, type Position, type ShapeNote } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  d9DegreeStyle,
  d9Display,
  d9Explain,
  d9Found,
  d9IsLive,
  d9RegularWindow,
  d9Missed,
  d9ShowsCount,
  d9StringSpan,
  d9TargetAt,
  d9Window,
  d9WrongTaps,
  type D9Answer,
  type D9Prompt,
} from './logic';
import styles from './D9View.module.css';

interface ViewState {
  prompt: D9Prompt;
  /** Taps so far this round. */
  taps: Position[];
}

const WIDE: FretRange = { from: 0, to: 15 };

/**
 * D9 view (design §6 D9, §7). The root is drawn as a square on the shape's
 * root string, and the learner taps the rest of the template. Each tap is
 * marked at once with its degree, by shape and colour; the round answers at
 * the last note, on the first wrong tap, or on "Done". The iPad shows the
 * whole neck, so the shape is placed in context; iPad portrait shows
 * 12 frets that follow the root, and compact screens a window centred on it.
 */
export function D9View({
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
}: DrillRenderProps<D9Prompt, D9Answer>) {
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
  if (compact) visible = d9Window(prompt, compactFrets);
  else visible = sizeClass === 'regular-wide' ? WIDE : d9RegularWindow(prompt);

  const tapped = (pos: Position) => taps.some((p) => samePosition(p, pos));

  const tap = (pos: Position) => {
    if (feedback || !d9IsLive(prompt, pos)) return;
    if (samePosition(pos, prompt.anchor) || tapped(pos)) return;
    const next = [...view.taps, pos];
    setState({ ...view, taps: next });
    if (!d9TargetAt(prompt, pos) || d9Missed(prompt, next).length === 0) {
      onAnswer(next);
      return;
    }
    void playNotes([noteAt(pos, tuning).name], { muted: !soundOn, volume });
  };

  /** "Done": the learner sees no more, so the round ends with what was found. */
  const done = () => {
    if (!feedback) onAnswer(view.taps);
  };

  const degree = (n: ShapeNote, style: FretMarker['style'] = d9DegreeStyle(n.degree)) => ({
    string: n.string,
    fret: n.fret,
    style,
    label: d9Display(n.degree),
    forceLabel: true,
  });
  const root = d9Display(prompt.root);
  const markers: FretMarker[] = [
    { ...prompt.anchor, style: 'root', label: root, forceLabel: true },
    ...d9Found(prompt, taps).map((n) => degree(n)),
  ];
  const missed = d9Missed(prompt, taps);
  if (feedback) {
    markers.push(...missed.map((n) => degree(n, 'ghost')));
    markers.push(
      ...d9WrongTaps(prompt, taps).map((p): FretMarker => ({
        ...p,
        style: 'wrong',
        label: d9Display(noteAt(p, tuning, prompt.accidentalPref).pc),
        forceLabel: true,
      })),
    );
  } else if (guided) {
    markers.push(...missed.map((n) => degree(n, 'target')));
  }

  const chord = <strong>{d9Display(prompt.chord)}</strong>;
  const strings = d9StringSpan(prompt.strings);
  const core = prompt.part === 'core';
  let question;
  if (guided) {
    question = core ? (
      <>
        This is the {prompt.shape}-shape triad of {chord} on {strings}. Tap each note to continue.
      </>
    ) : (
      <>
        This is the {prompt.shape} shape of {chord}. Tap each note to continue.
      </>
    );
  } else {
    question = core ? (
      <>
        Build the {prompt.shape}-shape triad of {chord} on {strings}
      </>
    ) : (
      <>
        Build the {prompt.shape} shape of {chord} from this root
      </>
    );
  }

  const found = d9Found(prompt, taps).length;
  return (
    <div
      className={styles.drill}
      data-testid="d9-drill"
      data-size-class={sizeClass}
      data-part={prompt.part}
      data-scope={prompt.scope}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d9-prompt">
            {question}
          </p>
          {/* Compact screens keep the height for the neck: no hint line before an answer. */}
          {(feedback || !compact) && (
            <p className={styles.explain} data-testid="d9-explain">
              {feedback
                ? d9Explain(prompt, feedback)
                : `The square is the root, ${root}, on string ${prompt.anchor.string}.`}
            </p>
          )}
          <div className={styles.actions}>
            <p className={styles.count} data-testid="d9-count" aria-live="polite">
              Found {found}
              {d9ShowsCount(guideLevel, guided) && ` of ${prompt.targets.length}`}
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
          label={`Fretboard: build ${core ? 'the triad' : 'the shape'} from the root ${root}`}
        />
      </div>
      {/* Below the neck on iPad portrait; the session shows it as a sheet on compact. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
