import { useEffect, useState } from 'react';
import { ChordDiagram } from '../../components/chord-diagram/ChordDiagram';
import { describeVoicing, type ChordVoicing } from '../../components/chord-diagram/model';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { COMPACT_WINDOW_FRETS } from '../../shell/size-class';
import { chromaOf, type ChordKind } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  D36_QUALITIES,
  d36Deciding,
  d36DegreeLabel,
  d36DegreeStyle,
  d36Display,
  d36Explain,
  d36KeyToQuality,
  d36KeyToRoot,
  d36QualityKeyFor,
  d36QualityLabel,
  d36QualityName,
  d36RootLine,
  d36Sharpen,
  d36Window,
  type D36Answer,
  type D36Prompt,
} from './logic';
import styles from './D36View.module.css';

/** Every dot of the voicing shares this group, so the neck outlines it (guide levels 2–3). */
const GROUP = 'd36-voicing';

/**
 * The voicing as markers. Before an answer every dot is a plain tone with no
 * label: a root square or a degree would give the answer away (M1-25). Once
 * revealed, each dot shows its degree by marker shape, colour and label.
 */
function markersOf(prompt: D36Prompt, reveal: boolean): FretMarker[] {
  return prompt.notes.map((n) => {
    const base = { string: n.string, fret: n.fret, group: GROUP };
    if (!reveal) return { ...base, style: 'tone' };
    return {
      ...base,
      style: d36DegreeStyle(n.degree),
      label: d36DegreeLabel(n.degree),
      forceLabel: true,
    };
  });
}

/** The voicing as a chord diagram, styled by degree once revealed; a barre chord shows its barre. */
function voicingOf(prompt: D36Prompt, reveal: boolean): ChordVoicing {
  const notes = prompt.notes.map((n) => ({
    string: n.string,
    fret: n.fret,
    style: reveal ? d36DegreeStyle(n.degree) : ('tone' as const),
    label: d36DegreeLabel(n.degree),
  }));
  return prompt.barre ? { notes, barres: [{ ...prompt.barre, finger: 1 }] } : { notes };
}

type ButtonState = 'correct' | 'wrong' | 'expected' | undefined;

/** After an answer: the given choice right or wrong, and the right one when it was missed. */
function stateOf(given: boolean, right: boolean, isAnswer: boolean, correct: boolean): ButtonState {
  if (given) return correct || right ? 'correct' : 'wrong';
  return isAnswer && !correct ? 'expected' : undefined;
}

/**
 * D36 view (design §6 D36, §7). A chord voicing is drawn on the neck or as a
 * chord diagram, with no root, label or name to give it away. The learner
 * names it: a root button (or A–G, with # to sharpen), then a quality button
 * (or the number row). The feedback labels every dot with its degree, by
 * shape and colour, and says which notes decided the quality. The iPad shows
 * the whole neck so the voicing sits in context; iPad portrait a 12-fret
 * neck, and compact screens a window round the voicing.
 */
export function D36View({
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
}: DrillRenderProps<D36Prompt, D36Answer>) {
  // The chosen root, kept with its prompt so a new prompt starts with none.
  const [pick, setPick] = useState<{ prompt: D36Prompt; root: string } | null>(null);
  const root = pick?.prompt === prompt ? pick.root : null;

  useEffect(() => {
    if (feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const letter = d36KeyToRoot(e.key);
      const quality = d36KeyToQuality(e.key);
      if (letter) setPick({ prompt, root: letter });
      else if (e.key === '#' && root)
        setPick({ prompt, root: d36Sharpen(root, prompt.accidentalPref) });
      else if (quality && root) onAnswer({ root, kind: quality });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, prompt, root, onAnswer]);

  const reveal = guided || feedback !== null;
  const chord = <strong>{d36Display(prompt.chord)}</strong>;
  const quality = d36QualityLabel(prompt.kind);
  const question = guided ? (
    <>
      This is {chord}. Tap <strong>{d36Display(prompt.root)}</strong>, then{' '}
      <strong>{quality}</strong>.
    </>
  ) : (
    <>What chord is this?</>
  );
  let explain: string;
  if (feedback) explain = d36Explain(prompt, feedback);
  else if (guided) explain = `${d36RootLine(prompt)} ${d36Deciding(prompt)}`;
  else if (root) explain = `Root ${d36Display(root)}. Now tap the chord type.`;
  else explain = 'Tap its root (the lowest note), then its type.';

  const given = feedback?.answer;
  const correct = feedback?.result.correct ?? false;
  const rootState = (r: string): ButtonState =>
    given &&
    stateOf(
      chromaOf(r) === chromaOf(given.root),
      chromaOf(given.root) === chromaOf(prompt.root),
      chromaOf(r) === chromaOf(prompt.root),
      correct,
    );
  const qualityState = (k: ChordKind): ButtonState =>
    given && stateOf(k === given.kind, given.kind === prompt.kind, k === prompt.kind, correct);

  const voicing = voicingOf(prompt, reveal);
  const name = reveal ? d36Display(prompt.chord) : undefined;
  const description = describeVoicing(voicing, { tuning, fingers: false, roots: false });
  const compact = sizeClass === 'compact';

  return (
    <div
      className={styles.drill}
      data-testid="d36-drill"
      data-size-class={sizeClass}
      data-display={prompt.display}
      data-scope={prompt.scope}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d36-prompt">
            {question}
          </p>
          {(feedback || guided || !compact) && (
            <p className={styles.explain} data-testid="d36-explain">
              {explain}
            </p>
          )}
          <div className={styles.answers}>
            <div className={styles.choices} role="group" aria-label="Root">
              {prompt.roots.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={styles.choice}
                  data-state={rootState(r)}
                  aria-pressed={!feedback && root !== null && chromaOf(r) === chromaOf(root)}
                  disabled={Boolean(feedback)}
                  onClick={() => setPick({ prompt, root: r })}
                >
                  {d36Display(r)}
                </button>
              ))}
            </div>
            <div className={styles.choices} role="group" aria-label="Chord type">
              {D36_QUALITIES.map((k, i) => (
                <button
                  key={k}
                  type="button"
                  className={`${styles.choice} ${styles.quality}`}
                  data-state={qualityState(k)}
                  disabled={Boolean(feedback) || root === null}
                  onClick={() => root && onAnswer({ root, kind: k })}
                  aria-label={d36QualityName(k)}
                  aria-keyshortcuts={d36QualityKeyFor(i)}
                >
                  {d36QualityLabel(k)}
                </button>
              ))}
            </div>
          </div>
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <div className={styles.neckArea}>
        {prompt.display === 'diagram' ? (
          <ChordDiagram
            className={styles.diagram}
            voicing={voicing}
            tuning={tuning}
            handedness={handedness}
            name={name}
            dotText={reveal ? 'label' : 'none'}
            highlightRoots={reveal}
            guideLevel={reveal ? 3 : guideLevel}
          />
        ) : (
          <Fretboard
            tuning={tuning}
            fretRange={d36Window(prompt, sizeClass, compactFrets)}
            handedness={handedness}
            markers={markersOf(prompt, reveal)}
            guideLevel={guided ? 3 : guideLevel}
            blindMode={blindMode}
            accidentalPref={prompt.accidentalPref}
            label={`Fretboard: ${name ?? 'a chord shape'}, low string first: ${description}`}
          />
        )}
      </div>
      {/* Below the neck on iPad portrait; the session shows it as a sheet on compact. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
