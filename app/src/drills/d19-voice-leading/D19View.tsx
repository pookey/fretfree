import { useState } from 'react';
import { useAppStore } from '../../app-store';
import { ENGINE_CONFIG } from '../../engine/config';
import { COMPACT_WINDOW_FRETS } from '../../shell/size-class';
import { playNotes } from '../../audio/audio';
import { Fretboard } from '../../components/fretboard/Fretboard';
import { noteAt, samePosition, type Position } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  d19Chord,
  d19Explain,
  d19Found,
  d19IsLive,
  d19Missed,
  d19Rule,
  d19Subject,
  d19TargetAt,
  d19Window,
  type D19Answer,
  type D19Prompt,
} from './logic';
import { d18StringSpan } from '../d18-inversions/logic';
import { d19Markers } from './markers';
import styles from './D19View.module.css';

interface ViewState {
  prompt: D19Prompt;
  /** Taps so far this round. */
  taps: Position[];
}

/**
 * D19 view (design §6 D19, §7). The starting triad is drawn as dashed rings
 * on its string set, and the learner taps the three notes of the next chord
 * nearest it, the held note included. Each tap is marked at once with its
 * note, by degree in shape and colour. The iPad shows the whole neck; iPad
 * portrait a 12-fret neck, and compact screens a window round the triad.
 */
export function D19View({
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
}: DrillRenderProps<D19Prompt, D19Answer>) {
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
  const taps = feedback ? feedback.answer.taps : view.taps;

  const tap = (pos: Position) => {
    if (feedback || !d19IsLive(prompt, pos)) return;
    if (taps.some((p) => samePosition(p, pos))) return;
    const next = [...view.taps, pos];
    setState({ ...view, taps: next });
    if (!d19TargetAt(prompt, pos) || d19Missed(prompt, next).length === 0) {
      onAnswer({ taps: next });
      return;
    }
    void playNotes([noteAt(pos, tuning).name], { muted: !soundOn, volume });
  };

  /** "Done": the learner sees no more, so the round ends with what was found. */
  const done = () => {
    if (!feedback) onAnswer({ taps: view.taps });
  };

  const from = d19Chord(prompt, prompt.from);
  const to = d19Chord(prompt, prompt.to);
  const strings = d18StringSpan(prompt.lowString);
  const cfg = ENGINE_CONFIG.voiceLeading;
  const level = guided ? 3 : guideLevel;
  const named = guided || feedback !== null || level >= cfg.noteNamesGuideLevel;

  const markers = d19Markers(prompt, { taps, guided, answered: feedback !== null, named });

  const fromChord = <strong>{from}</strong>;
  const toChord = <strong>{to}</strong>;
  const question = guided ? (
    <>
      This is {fromChord} to {toChord} on {strings}. Tap the {prompt.targets.length} ringed notes of{' '}
      {to} to continue.
    </>
  ) : (
    <>
      Voice-lead {fromChord} to {toChord} on {strings}
    </>
  );
  const hint =
    level >= cfg.ruleGuideLevel ? d19Rule(prompt) : `Tap the ${to} nearest this ${from}.`;

  const found = d19Found(prompt, taps).length;
  return (
    <div
      className={styles.drill}
      data-testid="d19-drill"
      data-size-class={sizeClass}
      data-scope={prompt.scope}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d19-prompt">
            {question}
          </p>
          {/* Compact screens keep the height for the neck: no hint line before an answer. */}
          {(feedback || !compact) && (
            <p className={styles.explain} data-testid="d19-explain">
              {feedback ? d19Explain(prompt, feedback) : hint}
            </p>
          )}
          <div className={styles.actions}>
            <p className={styles.count} data-testid="d19-count" aria-live="polite">
              Found {found} of {prompt.targets.length}
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
          fretRange={d19Window(prompt, sizeClass, compactFrets)}
          activeRange={prompt.activeRange}
          handedness={handedness}
          markers={markers}
          guideLevel={level}
          blindMode={blindMode}
          accidentalPref={prompt.accidentalPref}
          onTapCell={tap}
          label={
            feedback
              ? `Fretboard: ${d19Subject(prompt)}`
              : `Fretboard: a ${from} triad on ${strings}; tap the nearest ${to}`
          }
        />
      </div>
      {/* Below the neck on iPad portrait; the session shows it as a sheet on compact. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
