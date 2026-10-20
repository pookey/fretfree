import { useEffect, useState } from 'react';
import { useAppStore } from '../../app-store';
import { COMPACT_WINDOW_FRETS } from '../../shell/size-class';
import { playNotes } from '../../audio/audio';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { noteAt, samePosition, type Inversion, type Position, type ShapeNote } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  D18_INVERSIONS,
  d18DegreeStyle,
  d18Display,
  d18Explain,
  d18Found,
  d18InversionName,
  d18IsLive,
  d18KeyToInversion,
  d18Missed,
  d18StringSpan,
  d18Subject,
  d18TargetAt,
  d18Window,
  d18WrongTaps,
  type D18Answer,
  type D18Prompt,
} from './logic';
import styles from './D18View.module.css';

interface ViewState {
  prompt: D18Prompt;
  /** Taps so far this round (build cards). */
  taps: Position[];
}

/** Every dot of the triad shares this group, so the neck outlines it (guide levels 2–3). */
const GROUP = 'd18-triad';

/** The keys each inversion button answers to. */
const KEYS: Record<Inversion, string> = { 0: 'R', 1: '1', 2: '2' };

type ButtonState = 'correct' | 'wrong' | 'expected' | undefined;

function degreeMarker(n: ShapeNote, style: FretMarker['style'] = d18DegreeStyle(n.degree)) {
  return {
    string: n.string,
    fret: n.fret,
    style,
    label: d18Display(n.degree),
    forceLabel: true,
    group: GROUP,
  };
}

/**
 * D18 view (design §6 D18, §7). A build card draws the root as a square on
 * its string of the set, and the learner taps the inversion's other two
 * notes; each tap is marked at once with its degree, by shape and colour. A
 * name card draws the triad with no labels, and the learner picks its
 * inversion (or presses R, 1 or 2). The iPad shows the whole neck; iPad
 * portrait a 12-fret neck, and compact screens a window round the root or
 * the triad.
 */
export function D18View({
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
}: DrillRenderProps<D18Prompt, D18Answer>) {
  const compact = sizeClass === 'compact';
  const build = prompt.mode === 'build';
  const soundOn = useAppStore((s) => s.settings.soundOn);
  const volume = useAppStore((s) => s.settings.volume);
  const [state, setState] = useState<ViewState>(() => ({ prompt, taps: [] }));
  // A new prompt starts a new round.
  let view = state;
  if (state.prompt !== prompt) {
    view = { prompt, taps: [] };
    setState(view);
  }
  const taps = feedback?.answer.kind === 'taps' ? feedback.answer.taps : view.taps;

  useEffect(() => {
    if (feedback || build) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const inversion = d18KeyToInversion(e.key);
      if (inversion === null) return;
      e.preventDefault();
      onAnswer({ kind: 'inversion', inversion });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, build, onAnswer]);

  const tap = (pos: Position) => {
    if (feedback || !build || !d18IsLive(prompt, pos)) return;
    if (samePosition(pos, prompt.anchor) || taps.some((p) => samePosition(p, pos))) return;
    const next = [...view.taps, pos];
    setState({ ...view, taps: next });
    if (!d18TargetAt(prompt, pos) || d18Missed(prompt, next).length === 0) {
      onAnswer({ kind: 'taps', taps: next });
      return;
    }
    void playNotes([noteAt(pos, tuning).name], { muted: !soundOn, volume });
  };

  /** "Done": the learner sees no more, so the round ends with what was found. */
  const done = () => {
    if (!feedback) onAnswer({ kind: 'taps', taps: view.taps });
  };

  const root = d18Display(prompt.root);
  const chord = <strong>{d18Display(prompt.chord)}</strong>;
  const strings = d18StringSpan(prompt.lowString);
  const inversion = d18InversionName(prompt.inversion);
  const shown = inversion === 'Root position' ? 'root position' : inversion;
  const reveal = guided || feedback !== null;

  const markers: FretMarker[] = [];
  let question;
  let hint: string;
  if (build) {
    markers.push({ ...prompt.anchor, style: 'root', label: root, forceLabel: true, group: GROUP });
    markers.push(...d18Found(prompt, taps).map((n) => degreeMarker(n)));
    const missed = d18Missed(prompt, taps);
    if (feedback) {
      markers.push(...missed.map((n) => degreeMarker(n, 'ghost')));
      markers.push(
        ...d18WrongTaps(prompt, taps).map((p): FretMarker => ({
          ...p,
          style: 'wrong',
          label: d18Display(noteAt(p, tuning, prompt.accidentalPref).pc),
          forceLabel: true,
        })),
      );
    } else if (guided) {
      markers.push(...missed.map((n) => degreeMarker(n, 'target')));
    }
    question = guided ? (
      <>
        This is {chord} in {shown} on {strings}. Tap each note to continue.
      </>
    ) : (
      <>
        Build {chord} in {shown} on {strings}
      </>
    );
    hint = `The square is the root, ${root}, on string ${prompt.anchor.string}.`;
  } else {
    markers.push(
      ...prompt.notes.map((n): FretMarker =>
        reveal ? degreeMarker(n) : { string: n.string, fret: n.fret, style: 'tone', group: GROUP },
      ),
    );
    question = guided ? (
      <>
        This is {chord} in {shown}. Tap <strong>{inversion}</strong>.
      </>
    ) : (
      <>Which inversion of {chord} is this?</>
    );
    hint = guided
      ? `The lowest note is the ${['root', '3rd', '5th'][prompt.inversion]}.`
      : `Find the root, ${root}: which chord tone is lowest?`;
  }

  const given = feedback?.answer.kind === 'inversion' ? feedback.answer.inversion : null;
  const correct = feedback?.result.correct ?? false;
  const buttonState = (inv: Inversion): ButtonState => {
    if (!feedback) return undefined;
    if (inv === given) return correct ? 'correct' : 'wrong';
    return inv === prompt.inversion && !correct ? 'expected' : undefined;
  };

  const found = d18Found(prompt, taps).length;
  return (
    <div
      className={styles.drill}
      data-testid="d18-drill"
      data-size-class={sizeClass}
      data-mode={prompt.mode}
      data-scope={prompt.scope}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d18-prompt">
            {question}
          </p>
          {/* Compact screens keep the height for the neck: no hint line before an answer. */}
          {(feedback || !compact) && (
            <p className={styles.explain} data-testid="d18-explain">
              {feedback ? d18Explain(prompt, feedback) : hint}
            </p>
          )}
          {build ? (
            <div className={styles.actions}>
              <p className={styles.count} data-testid="d18-count" aria-live="polite">
                Found {found} of {prompt.targets.length}
              </p>
              {!feedback && (
                <button type="button" className={styles.done} onClick={done}>
                  Done
                </button>
              )}
            </div>
          ) : (
            <div className={styles.choices} role="group" aria-label="Inversion">
              {D18_INVERSIONS.map((inv) => (
                <button
                  key={inv}
                  type="button"
                  className={styles.choice}
                  data-state={buttonState(inv)}
                  disabled={Boolean(feedback)}
                  aria-keyshortcuts={KEYS[inv]}
                  onClick={() => onAnswer({ kind: 'inversion', inversion: inv })}
                >
                  {d18InversionName(inv)}
                </button>
              ))}
            </div>
          )}
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <div className={styles.neckArea}>
        <Fretboard
          tuning={tuning}
          fretRange={d18Window(prompt, sizeClass, compactFrets)}
          activeRange={prompt.activeRange}
          handedness={handedness}
          markers={markers}
          guideLevel={guided ? 3 : guideLevel}
          blindMode={blindMode}
          accidentalPref={prompt.accidentalPref}
          onTapCell={build ? tap : undefined}
          label={
            build
              ? `Fretboard: build the triad from the root ${root}`
              : `Fretboard: ${reveal ? d18Subject(prompt) : `a ${d18Display(prompt.chord)} triad on ${strings}`}`
          }
        />
      </div>
      {/* Below the neck on iPad portrait; the session shows it as a sheet on compact. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
