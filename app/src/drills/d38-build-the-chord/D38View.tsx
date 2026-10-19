import { useState } from 'react';
import { useAppStore } from '../../app-store';
import { COMPACT_WINDOW_FRETS } from '../../shell/size-class';
import { playNotes } from '../../audio/audio';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { noteAt, samePosition, stringCount, type FretRange, type Position } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  d38DegreeLabel,
  d38DegreeSpoken,
  d38DegreeStyle,
  d38Display,
  d38Example,
  d38Explain,
  d38IsLive,
  d38Placed,
  d38RegularWindow,
  d38Tap,
  d38Verdict,
  d38Window,
  type D38Answer,
  type D38Prompt,
  type VoicedNote,
} from './logic';
import styles from './D38View.module.css';

interface ViewState {
  prompt: D38Prompt;
  /** The notes placed so far, one per string. */
  taps: Position[];
  /** Why the last tap placed nothing, for the live region. */
  notice: string;
}

const WIDE: FretRange = { from: 0, to: 15 };

/**
 * D38 view (design §6 D38, §7). The chord symbol is asked and its root drawn
 * as a square; the learner taps one note per string above it (tapping a
 * note again mutes its string), then checks. Notes aren't marked right or
 * wrong as they go: the voicing is judged whole. Feedback draws every note
 * by its degree, in shape and colour, rings the notes of a voicing that
 * works, and lists what was missing. The iPad shows the whole neck; iPad
 * portrait 12 frets that follow the root, and compact screens a window
 * centred on it.
 */
export function D38View({
  prompt,
  guided,
  handedness,
  sizeClass,
  compactFrets = COMPACT_WINDOW_FRETS,
  tuning,
  feedback,
  onAnswer,
  aside,
  guideLevel,
  blindMode,
}: DrillRenderProps<D38Prompt, D38Answer>) {
  const compact = sizeClass === 'compact';
  const soundOn = useAppStore((s) => s.settings.soundOn);
  const volume = useAppStore((s) => s.settings.volume);
  const [state, setState] = useState<ViewState>(() => ({ prompt, taps: [], notice: '' }));
  // A new prompt starts a new voicing.
  let view = state;
  if (state.prompt !== prompt) {
    view = { prompt, taps: [], notice: '' };
    setState(view);
  }
  const taps = feedback ? d38Placed(prompt, feedback.answer) : view.taps;

  // A worked example's notes, or feedback's voicing that works, must be on screen.
  let shown: Position[] = [];
  if (feedback) shown = [...taps, ...d38Example(prompt, feedback.answer)];
  else if (guided) shown = prompt.example;
  let visible: FretRange;
  if (compact) visible = d38Window(prompt, compactFrets, shown);
  else visible = sizeClass === 'regular-wide' ? WIDE : d38RegularWindow(prompt, shown);

  const root = d38Display(prompt.root);
  const chord = d38Display(prompt.chord);

  const tap = (pos: Position) => {
    if (feedback) return;
    if (!d38IsLive(prompt, pos)) {
      let notice = `Fret ${pos.fret} is out of reach.`;
      if (pos.string === prompt.anchor.string) {
        notice = `String ${pos.string} plays the root, ${root}.`;
      } else if (pos.string > prompt.anchor.string) {
        notice = `String ${pos.string} stays muted: the root is the lowest note.`;
      }
      setState({ ...view, notice });
      return;
    }
    const next = d38Tap(prompt, view.taps, pos);
    const placed = next.some((p) => samePosition(p, pos));
    setState({
      ...view,
      taps: next,
      notice: placed ? `String ${pos.string}, fret ${pos.fret}.` : `String ${pos.string} muted.`,
    });
    if (placed) void playNotes([noteAt(pos, tuning).name], { muted: !soundOn, volume });
  };

  const check = () => {
    if (!feedback) onAnswer(view.taps);
  };
  const clear = () => setState({ ...view, taps: [], notice: 'Cleared.' });

  const byDegree = (n: VoicedNote, style: FretMarker['style']): FretMarker => ({
    string: n.string,
    fret: n.fret,
    style,
    label: d38DegreeLabel(n.degree),
    forceLabel: true,
  });
  const markers: FretMarker[] = [];
  if (feedback) {
    const verdict = d38Verdict(prompt, feedback.answer);
    markers.push({ ...prompt.anchor, style: 'root', label: root, forceLabel: true });
    for (const n of verdict.notes.slice(1)) {
      const below = verdict.belowRoot.some((b) => samePosition(b, n));
      markers.push(byDegree(n, n.inChord && !below ? d38DegreeStyle(n.degree) : 'wrong'));
    }
    if (!feedback.result.correct) {
      // The notes of a voicing that works that the learner didn't play.
      const example = d38Example(prompt, feedback.answer).filter(
        (p) => !taps.some((t) => samePosition(t, p)),
      );
      const exampleVerdict = d38Verdict(prompt, example);
      markers.push(...exampleVerdict.notes.slice(1).map((n) => byDegree(n, 'ghost')));
    }
  } else {
    markers.push({ ...prompt.anchor, style: 'root', label: root, forceLabel: true });
    if (guided) {
      // A worked example (rule 8): the notes of one voicing, by degree, to copy.
      const shown = d38Verdict(prompt, prompt.example).notes.slice(1);
      markers.push(
        ...shown
          .filter((n) => !taps.some((t) => samePosition(t, n)))
          .map((n) => byDegree(n, 'target')),
      );
    }
    // Placed notes are plain: named at guide level 3, never by degree before the check.
    markers.push(
      ...taps.map((p): FretMarker => ({
        ...p,
        style: 'tone',
        label: d38Display(noteAt(p, tuning, prompt.accidentalPref).pc),
      })),
    );
  }

  const strings = `string${prompt.strings.length > 1 ? 's' : ''} ${prompt.strings[0]}${
    prompt.strings.length > 1 ? `–${prompt.strings.at(-1)}` : ''
  }`;
  const question = guided ? (
    <>
      This is one voicing of <strong>{chord}</strong> from this root. Tap its notes, then Check.
    </>
  ) : (
    <>
      Build <strong>{chord}</strong> from this root
    </>
  );
  const hint = `The square is the root, ${root}, on string ${prompt.anchor.string}. Tap one note on each of ${strings}; tap a note again to mute it.`;
  const explain = feedback ? d38Explain(prompt, feedback) : [hint];

  return (
    <div
      className={styles.drill}
      data-testid="d38-drill"
      data-size-class={sizeClass}
      data-scope={prompt.scope}
      data-kind={prompt.kind}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d38-prompt">
            {question}
          </p>
          {/* Compact screens keep the height for the neck: no hint line before an answer. */}
          {(feedback || !compact) && (
            <div className={styles.explain} data-testid="d38-explain">
              {explain.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}
          <Readout
            prompt={prompt}
            taps={taps}
            feedback={feedback !== null}
            stringTotal={stringCount(tuning)}
          />
          <p className={styles.notice} aria-live="polite" data-testid="d38-notice">
            {feedback ? '' : view.notice}
          </p>
          {!feedback && (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={clear}
                disabled={view.taps.length === 0}
              >
                Clear
              </button>
              <button
                type="button"
                className={styles.check}
                onClick={check}
                disabled={view.taps.length === 0}
              >
                Check
              </button>
            </div>
          )}
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
          label={`Fretboard: build ${chord} from the root ${root} on string ${prompt.anchor.string}`}
        />
      </div>
      {/* Below the neck on iPad portrait; the session shows it as a sheet on compact. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}

/**
 * The voicing so far, as a chord chart writes it, low string first: x for a
 * muted string, else its fret. After the check each note shows its degree.
 */
function Readout({
  prompt,
  taps,
  feedback,
  stringTotal,
}: {
  prompt: D38Prompt;
  taps: readonly Position[];
  feedback: boolean;
  stringTotal: number;
}) {
  const verdict = feedback ? d38Verdict(prompt, taps) : null;
  const all = [prompt.anchor, ...taps];
  const strings = Array.from({ length: stringTotal }, (_, i) => stringTotal - i);
  return (
    <ol
      className={styles.readout}
      aria-label="Your voicing, low string first"
      data-testid="d38-readout"
    >
      {strings.map((s) => {
        const note = all.find((p) => p.string === s);
        const degree = verdict?.notes.find((n) => n.string === s);
        const isRoot = s === prompt.anchor.string;
        const below = verdict?.belowRoot.some((b) => b.string === s) ?? false;
        const status = !degree ? undefined : degree.inChord && !below ? 'in' : 'out';
        const spoken = note
          ? `String ${s}: fret ${note.fret}${isRoot ? ', the root' : ''}${
              degree && !isRoot ? `, ${d38DegreeSpoken(degree.degree)}` : ''
            }${below ? ', below the root' : status === 'out' ? ', not in the chord' : ''}`
          : `String ${s}: muted`;
        return (
          <li
            key={s}
            className={styles.slot}
            data-root={isRoot || undefined}
            data-status={status}
            aria-label={spoken}
          >
            <span className={styles.slotString} aria-hidden="true">
              {s}
            </span>
            <span className={styles.slotFret} aria-hidden="true">
              {note ? note.fret : '×'}
            </span>
            {degree && (
              <span className={styles.slotDegree} aria-hidden="true">
                {d38DegreeLabel(degree.degree)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
