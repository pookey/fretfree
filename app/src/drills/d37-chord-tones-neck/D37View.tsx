import { useState } from 'react';
import { useAppStore } from '../../app-store';
import { COMPACT_WINDOW_FRETS, neckRegions } from '../../shell/size-class';
import { playNotes } from '../../audio/audio';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { inRange, noteAt, samePosition, type FretRange, type Position } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  d8DegreeLabel,
  d8DegreeName,
  d8DegreeSpoken,
  d8DegreeStyle,
  d8Display,
} from '../d8-chord-tone/logic';
import {
  d37Asking,
  d37ChordName,
  d37Explain,
  d37FeedbackRound,
  d37Found,
  d37IsLive,
  d37MarkedOutside,
  d37Missed,
  d37NeckGuideLevel,
  d37RegionWindow,
  d37RegularWindow,
  d37Roots,
  d37Rounds,
  d37ShowsCount,
  d37ShowsRoots,
  d37TapName,
  d37TargetAt,
  d37WrongTaps,
  type D37Answer,
  type D37Prompt,
  type D37Round,
  type D37Target,
} from './logic';
import styles from './D37View.module.css';

interface ViewState {
  prompt: D37Prompt;
  /** Taps so far. */
  taps: Position[];
  /** The current round of a compact region-by-region round. */
  region: number;
  /** The round shown once answered, when the learner steps through them. */
  review: number | null;
}

const WIDE: FretRange = { from: 0, to: 15 };

/**
 * How the round ends, under every prompt: the learner can't otherwise know a
 * wrong tap ends it. A worked example draws every target, so it skips Done.
 */
function roundRule(guided: boolean): string {
  return guided
    ? 'Tap the notes in any order. A wrong tap ends the round.'
    : "Tap the notes in any order. A wrong tap ends the round; tap Done if you can't find the rest.";
}

/**
 * The markers of the CAGED shape share this group, so feedback outlines it
 * (guide levels 2–3). Only on chord cards: there every note of the shape is
 * marked, while a degree card's one or two notes wouldn't read as the shape.
 */
const GROUP = 'd37-shape';

/**
 * D37 view (design §6 D37, §7). The prompt names a chord, or one degree of
 * it, and the learner taps every cell that holds it in the live frets: a
 * CAGED shape's span, then frets 0–12. As in D4's every-octave round, each
 * tap is marked at once, here by its degree (shape and colour), and the
 * round answers at the last target, on the first wrong tap, or on "Done".
 * Feedback rings what was missed and marks wrong taps. Compact screens run
 * a wide range region by region; once answered they open on the region that
 * holds the first miss, and the learner can step through the others.
 */
export function D37View({
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
}: DrillRenderProps<D37Prompt, D37Answer>) {
  const compact = sizeClass === 'compact';
  const soundOn = useAppStore((s) => s.settings.soundOn);
  const volume = useAppStore((s) => s.settings.volume);
  const [state, setState] = useState<ViewState>(() => ({
    prompt,
    taps: [],
    region: 0,
    review: null,
  }));
  // A new prompt starts a new round.
  let view = state;
  if (state.prompt !== prompt) {
    view = { prompt, taps: [], region: 0, review: null };
    setState(view);
  }

  const taps = feedback ? feedback.answer : view.taps;
  const rounds = d37Rounds(prompt, neckRegions(sizeClass, prompt.activeRange, compactFrets));
  const last = rounds.length - 1;
  const roundIndex = feedback
    ? Math.min(view.review ?? d37FeedbackRound(prompt, rounds, taps), last)
    : Math.min(view.region, last);
  const region = (rounds[roundIndex] as D37Round).region;
  const stepping = rounds.length > 1;

  let visible: FretRange;
  if (!compact) visible = sizeClass === 'regular-wide' ? WIDE : d37RegularWindow(prompt);
  else visible = d37RegionWindow(region, compactFrets);

  const roots = d37ShowsRoots(prompt, guideLevel, guided) ? d37Roots(prompt) : [];
  const isRoot = (pos: Position) => roots.some((r) => samePosition(r, pos));
  const tapped = (pos: Position) => taps.some((p) => samePosition(p, pos));

  const tap = (pos: Position) => {
    if (feedback || !d37IsLive(prompt, pos) || !inRange(pos.fret, region)) return;
    // Taps again, and taps on the root squares (a guide, not an answer), are inert.
    if (tapped(pos) || isRoot(pos)) return;
    const next = [...view.taps, pos];
    if (!d37TargetAt(prompt, pos) || d37Missed(prompt, next).length === 0) {
      setState({ ...view, taps: next });
      onAnswer(next);
      return;
    }
    void playNotes([noteAt(pos, tuning).name], { muted: !soundOn, volume });
    // A compact region is done once its targets are found; move on to the next.
    const round = rounds[roundIndex];
    const regionDone = round?.targets.every((t) => next.some((p) => samePosition(p, t)));
    setState({
      ...view,
      taps: next,
      region: regionDone && roundIndex < last ? roundIndex + 1 : roundIndex,
    });
  };

  /** "Done": the learner sees no more, so the round ends with what was found. */
  const done = () => {
    if (!feedback) onAnswer(view.taps);
  };

  const step = (by: number) =>
    setState({ ...view, review: Math.max(0, Math.min(last, roundIndex + by)) });

  const inShape = (p: Position) =>
    feedback !== null &&
    prompt.degree === null &&
    (prompt.shape?.notes.some((n) => samePosition(n, p)) ?? false);
  const degreeMarker = (t: D37Target, style: FretMarker['style']): FretMarker => ({
    string: t.string,
    fret: t.fret,
    style,
    label: d8DegreeLabel(t.degree),
    forceLabel: true,
    ...(inShape(t) ? { group: GROUP } : {}),
  });

  const found = d37Found(prompt, taps);
  const markers: FretMarker[] = roots
    .filter((r) => !feedback || !d37TargetAt(prompt, r))
    .map((r) => ({ ...r, style: 'root', label: d8Display(prompt.root) }));
  markers.push(...found.map((t) => degreeMarker(t, d8DegreeStyle(t.degree))));
  if (feedback) {
    markers.push(...d37Missed(prompt, taps).map((t) => degreeMarker(t, 'ghost')));
    markers.push(
      ...d37WrongTaps(prompt, taps).map((p): FretMarker => ({
        ...p,
        style: 'wrong',
        label: d37TapName(prompt, p),
        forceLabel: true,
      })),
    );
  } else if (guided) {
    markers.push(...prompt.targets.filter((t) => !tapped(t)).map((t) => degreeMarker(t, 'target')));
  }

  const cellName = (pos: Position) => {
    const base = `string ${pos.string}, fret ${pos.fret}`;
    const t = tapped(pos) ? d37TargetAt(prompt, pos) : undefined;
    if (t) return `${base}, found: ${d8DegreeSpoken(t.degree)}`;
    if (isRoot(pos)) return `${base}, root`;
    return base;
  };

  const asking = d37Asking(prompt);
  const chord = <strong>{d37ChordName(prompt)}</strong>;
  const what =
    prompt.degree === null ? (
      <>every note of {chord}</>
    ) : (
      <>
        every <strong>{d8DegreeName(prompt.degree)}</strong> of {chord}
      </>
    );
  const frets = compact && stepping ? region : prompt.activeRange;
  const inFrets = prompt.scope === 'shape' || stepping ? ` in frets ${frets.from}–${frets.to}` : '';
  const question = guided ? (
    <>
      Here is {what}
      {inFrets}, by degree. Tap each one to continue.
    </>
  ) : (
    <>
      Tap {what}
      {inFrets}
    </>
  );

  const hints: string[] = [];
  if (prompt.shape && guideLevel >= 2) {
    hints.push(`These frets hold the ${prompt.shape.name} shape of ${d37ChordName(prompt)}.`);
  }
  if (roots.length > 0) hints.push('The squares are its roots. Count up from them.');
  hints.push(roundRule(guided));
  const hint = hints.join(' ');

  const outside = feedback ? d37MarkedOutside(prompt, region, taps) : 0;

  return (
    <div
      className={styles.drill}
      data-testid="d37-drill"
      data-size-class={sizeClass}
      data-scope={prompt.scope}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d37-prompt">
            {question}
          </p>
          {/* Compact screens keep the height for the neck: no hint line before an answer. */}
          {(feedback || !compact) && (
            <p className={styles.explain} data-testid="d37-explain">
              {feedback ? d37Explain(prompt, feedback) : hint}
            </p>
          )}
          <div className={styles.actions}>
            <p className={styles.count} data-testid="d37-count" aria-live="polite">
              Found {found.length}
              {d37ShowsCount(guideLevel, guided) && ` of ${prompt.targets.length}`}
            </p>
            {stepping && !feedback && (
              <p className={styles.caption} data-testid="d37-region">
                Region {roundIndex + 1} of {rounds.length}
              </p>
            )}
            {stepping && feedback && (
              <div className={styles.review} role="group" aria-label="Regions">
                <button
                  type="button"
                  className={styles.step}
                  onClick={() => step(-1)}
                  disabled={roundIndex === 0}
                  aria-label="Lower frets"
                >
                  ‹
                </button>
                <p className={styles.caption} data-testid="d37-region">
                  Frets {region.from}–{region.to}
                  {outside > 0 && ` · ${outside} more marked in other frets`}
                </p>
                <button
                  type="button"
                  className={styles.step}
                  onClick={() => step(1)}
                  disabled={roundIndex === last}
                  aria-label="Higher frets"
                >
                  ›
                </button>
              </div>
            )}
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
          activeRange={compact ? region : prompt.activeRange}
          handedness={handedness}
          markers={markers}
          guideLevel={d37NeckGuideLevel(prompt, guideLevel, {
            guided,
            answered: Boolean(feedback),
          })}
          blindMode={blindMode}
          accidentalPref={prompt.accidentalPref}
          onTapCell={tap}
          cellLabel={cellName}
          label={`Fretboard: tap ${asking}`}
        />
      </div>
      {/* Below the neck on iPad portrait; the session shows it as a sheet on compact. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
