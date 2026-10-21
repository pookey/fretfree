import { useState } from 'react';
import { useAppStore } from '../../app-store';
import { COMPACT_WINDOW_FRETS, neckRegions, targetsByRegion } from '../../shell/size-class';
import { playNotes } from '../../audio/audio';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { inRange, noteAt, samePosition, type FretRange, type Position } from '../../theory';
import { displayPc } from '../../theory/pitch-display';
import type { DrillRenderProps } from '../types';
import {
  D4_ROUND_RULE,
  d4Explain,
  d4Found,
  d4IsLive,
  d4IsTarget,
  d4Missed,
  d4NeckGuideLevel,
  d4RegionWindow,
  d4RoundOrder,
  d4ShapeWindow,
  d4ShowsCount,
  d4TargetsIn,
  d4WrongTaps,
  type D4Answer,
  type D4Prompt,
} from './logic';
import styles from './D4View.module.css';

interface ViewState {
  prompt: D4Prompt;
  /** Taps so far in an every-octave round. */
  taps: Position[];
  /** The current region of a compact every-octave round. */
  region: number;
}

const WIDE: FretRange = { from: 0, to: 15 };
const REGULAR: FretRange = { from: 0, to: 12 };

/**
 * D4 view (design §6 D4, §7). A single item shows a dot and asks for its
 * octave on one string. An every-octave item shows one dot and asks for
 * every other cell of that note: each tap is marked at once (per-target
 * feedback), and the round answers when the last one is found, on the first
 * wrong tap, or on "Done". The iPad runs it over the whole neck; compact
 * screens run it region by region (`neckRegions`), starting nearest the dot,
 * and a region is done once its targets are found.
 */
export function D4View({
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
}: DrillRenderProps<D4Prompt, D4Answer>) {
  const compact = sizeClass === 'compact';
  const soundOn = useAppStore((s) => s.settings.soundOn);
  const volume = useAppStore((s) => s.settings.volume);
  const [state, setState] = useState<ViewState>(() => ({ prompt, taps: [], region: 0 }));
  // A new prompt starts a new round.
  let view = state;
  if (state.prompt !== prompt) {
    view = { prompt, taps: [], region: 0 };
    setState(view);
  }

  const every = prompt.mode === 'every';
  const rounds = every
    ? d4RoundOrder(
        targetsByRegion(prompt.targets, neckRegions(sizeClass, prompt.activeRange, compactFrets)),
        prompt.source.fret,
      )
    : [];
  const regions = rounds.length > 1 ? rounds.map((r) => r.region) : [prompt.activeRange];
  const regionIndex = Math.min(view.region, regions.length - 1);
  const region = regions[regionIndex] as FretRange;
  const lastRegion = regionIndex === regions.length - 1;
  const taps = feedback ? feedback.answer : view.taps;

  let visible: FretRange;
  if (!compact) visible = sizeClass === 'regular-wide' ? WIDE : REGULAR;
  else if (every) visible = d4RegionWindow(region, prompt.activeRange, compactFrets);
  else visible = d4ShapeWindow(prompt, compactFrets);

  const tapped = (pos: Position) => taps.some((p) => samePosition(p, pos));

  const tap = (pos: Position) => {
    if (feedback || !d4IsLive(prompt, pos) || !inRange(pos.fret, region)) return;
    if (prompt.mode === 'single') {
      onAnswer([pos]);
      return;
    }
    if (samePosition(pos, prompt.source) || tapped(pos)) return;
    const next = [...view.taps, pos];
    if (!d4IsTarget(prompt, pos) || d4Missed(prompt, next).length === 0) {
      setState({ ...view, taps: next });
      onAnswer(next);
      return;
    }
    void playNotes([noteAt(pos, tuning).name], { muted: !soundOn, volume });
    // A compact region is done once its targets are found; move on to the next.
    const regionDone = d4TargetsIn(prompt, region).every((t) =>
      next.some((p) => samePosition(p, t)),
    );
    setState({
      ...view,
      taps: next,
      region: regionDone && !lastRegion ? regionIndex + 1 : regionIndex,
    });
  };

  /** "Done": the learner sees no more, so the round ends with what was found. */
  const done = () => {
    if (!feedback) onAnswer(view.taps);
  };

  const name = displayPc(prompt.pc);
  const pcAt = (p: Position) => displayPc(noteAt(p, tuning, prompt.accidentalPref).pc);
  const label = (p: Position, style: FretMarker['style'], text = name): FretMarker => ({
    ...p,
    style,
    label: text,
    forceLabel: true,
  });
  const markers: FretMarker[] = [label(prompt.source, 'root')];
  if (every) {
    markers.push(...d4Found(prompt, taps).map((p) => label(p, 'correct')));
    if (feedback) {
      markers.push(...d4Missed(prompt, taps).map((p) => label(p, 'ghost')));
    } else if (guided) {
      markers.push(...prompt.targets.filter((t) => !tapped(t)).map((p) => label(p, 'target')));
    }
  } else if (feedback) {
    markers.push(...prompt.targets.map((p) => label(p, 'correct')));
  } else if (guided) {
    markers.push(...prompt.targets.map((p) => label(p, 'target')));
  }
  if (feedback) markers.push(...d4WrongTaps(prompt, taps).map((p) => label(p, 'wrong', pcAt(p))));

  const found = d4Found(prompt, taps).length;
  const inFrets = regions.length > 1 ? ` in frets ${region.from}–${region.to}` : '';
  const pc = <strong>{name}</strong>;
  let question;
  if (prompt.mode === 'single') {
    question = guided ? (
      <>
        This is the octave of {pc} on string {prompt.string}. Tap it to continue.
      </>
    ) : (
      <>
        Tap the octave of {pc} on string {prompt.string}
      </>
    );
  } else {
    question = guided ? (
      <>
        Here is every {pc}
        {inFrets}. Tap each one to continue.
      </>
    ) : (
      <>
        Tap every {pc}
        {inFrets}
      </>
    );
  }

  return (
    <div
      className={styles.drill}
      data-size-class={sizeClass}
      data-mode={prompt.mode}
      data-scope={prompt.mode === 'single' ? prompt.scope : undefined}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d4-prompt">
            {question}
          </p>
          {/* Compact screens keep the height for the neck: no hint line before an answer. */}
          {(feedback || !compact) && (
            <p className={styles.explain} data-testid="d4-explain">
              {feedback
                ? d4Explain(prompt, feedback)
                : `Start from the ${name} in the square and use octave shapes.`}
            </p>
          )}
          {every && !feedback && (
            <p className={styles.rule} data-testid="d4-rule">
              {D4_ROUND_RULE}
            </p>
          )}
          {every && (
            <div className={styles.actions}>
              <p className={styles.count} data-testid="d4-count" aria-live="polite">
                Found {found}
                {d4ShowsCount(guideLevel, guided) && ` of ${prompt.targets.length}`}
              </p>
              {regions.length > 1 && (
                <p className={styles.caption} data-testid="d4-region">
                  Region {regionIndex + 1} of {regions.length}
                </p>
              )}
              {!feedback && (
                <button type="button" className={styles.done} onClick={done}>
                  Done
                </button>
              )}
            </div>
          )}
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <div
        className={styles.neckArea}
        data-live-string={
          prompt.mode === 'single' && prompt.scope === 'string' ? prompt.string : undefined
        }
      >
        <Fretboard
          tuning={tuning}
          fretRange={visible}
          activeRange={region}
          handedness={handedness}
          markers={markers}
          guideLevel={d4NeckGuideLevel(prompt, guideLevel, {
            guided,
            answered: Boolean(feedback),
          })}
          blindMode={blindMode}
          accidentalPref={prompt.accidentalPref}
          onTapCell={tap}
          label={
            prompt.mode === 'single'
              ? `Fretboard: find the octave on string ${prompt.string}`
              : `Fretboard: tap every ${name}`
          }
        />
      </div>
      {/* Below the neck on iPad portrait; the session shows it as a sheet on compact. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
