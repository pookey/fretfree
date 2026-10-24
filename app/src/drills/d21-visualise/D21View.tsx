import { useState } from 'react';
import { useAppStore } from '../../app-store';
import { COMPACT_WINDOW_FRETS } from '../../shell/size-class';
import { playNotes } from '../../audio/audio';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { noteAt, samePosition, type FretRange, type Position, type ShapeNote } from '../../theory';
import { d9Display } from '../d9-build-caged/logic';
import type { DrillRenderProps } from '../types';
import {
  d21DegreeStyle,
  d21Explain,
  d21Found,
  d21IsLive,
  d21Missed,
  d21NoteName,
  d21Noun,
  d21PositionHint,
  d21Question,
  d21RegularWindow,
  d21ShapeAt,
  d21ShowsCount,
  d21Subject,
  d21TargetAt,
  d21Window,
  d21WrongTaps,
  type D21Answer,
  type D21Prompt,
} from './logic';
import styles from './D21View.module.css';

interface ViewState {
  prompt: D21Prompt;
  /** Taps so far this round. */
  taps: Position[];
}

const WIDE: FretRange = { from: 0, to: 15 };

/**
 * D21 view (design §6 D21, §7). The prompt names a shape and a position and
 * the neck stays blank: the learner pictures the shape there and taps every
 * root (or 3rd, or ♭7). Each found note turns green at once; the round
 * answers at the last target, on the first wrong tap, or on "Done".
 * Feedback draws the whole shape by degree, the missed notes ringed. The
 * worked example draws the shape first, so the learner copies it once.
 */
export function D21View({
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
}: DrillRenderProps<D21Prompt, D21Answer>) {
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
  if (compact) visible = d21Window(prompt, compactFrets);
  else visible = sizeClass === 'regular-wide' ? WIDE : d21RegularWindow(prompt);

  const tapped = (pos: Position) => taps.some((p) => samePosition(p, pos));

  const tap = (pos: Position) => {
    if (feedback || !d21IsLive(prompt, pos) || tapped(pos)) return;
    const next = [...view.taps, pos];
    setState({ ...view, taps: next });
    if (!d21TargetAt(prompt, pos) || d21Missed(prompt, next).length === 0) {
      onAnswer(next);
      return;
    }
    void playNotes([noteAt(pos, tuning).name], { muted: !soundOn, volume });
  };

  /** "Done": the learner sees no more, so the round ends with what was found. */
  const done = () => {
    if (!feedback) onAnswer(view.taps);
  };

  const degree = (n: ShapeNote, style: FretMarker['style'] = d21DegreeStyle(n.degree)) => ({
    string: n.string,
    fret: n.fret,
    style,
    label: d9Display(n.degree),
    forceLabel: true,
    // The outline (from guide level 2) only once the shape is shown: before
    // that it would box the found notes and hint at the rest.
    group: feedback || guided ? 'shape' : undefined,
  });
  const isTarget = (n: ShapeNote) => Boolean(d21TargetAt(prompt, n));
  const missed = d21Missed(prompt, taps);
  // Found notes turn green, as in the pentatonic-box drill: a circle, so they
  // differ from a missed root's square in shape as well as colour.
  const markers: FretMarker[] = d21Found(prompt, taps).map((n) => degree(n, 'correct'));
  if (feedback || guided) {
    // The rest of the shape, by degree: the picture the learner was asked for.
    markers.push(...prompt.shapeNotes.filter((n) => !isTarget(n)).map((n) => degree(n)));
  }
  if (feedback) {
    // The missed notes at full strength in their own shape (a root square),
    // ringed: the answer the learner most needs to see.
    markers.push(...missed.map((n) => ({ ...degree(n), emphasis: true })));
    markers.push(
      ...d21WrongTaps(prompt, taps).map((p): FretMarker => ({
        ...p,
        style: 'wrong',
        label: d21NoteName(prompt, p),
        forceLabel: true,
      })),
    );
  } else if (guided) {
    markers.push(...missed.map((n) => degree(n, 'target')));
  }

  const noun = d21Noun(prompt);
  const question = guided ? (
    <>
      This is {d21Subject(prompt)}. Tap every {noun} to continue.
    </>
  ) : (
    d21Question(prompt)
  );

  const found = d21Found(prompt, taps).length;
  return (
    <div
      className={styles.drill}
      data-testid="d21-drill"
      data-size-class={sizeClass}
      data-ask={prompt.ask}
      data-position={prompt.position}
      data-level={prompt.level}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d21-prompt">
            {question}
          </p>
          {/* Compact screens keep the height for the neck: no hint line before an answer. */}
          {(feedback || !compact) && (
            <p className={styles.explain} data-testid="d21-explain">
              {feedback ? d21Explain(prompt, feedback) : d21PositionHint(prompt)}
            </p>
          )}
          <div className={styles.actions}>
            <p className={styles.count} data-testid="d21-count" aria-live="polite">
              Found {found}
              {d21ShowsCount(guideLevel, guided) && ` of ${prompt.targets.length}`}
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
          label={`Fretboard: picture ${d21ShapeAt(prompt)} and tap every ${noun}`}
        />
      </div>
      {/* Below the neck on iPad portrait; the session shows it as a sheet on compact. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
