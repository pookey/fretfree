import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import type { GuideLevel } from '../../engine/model';
import type { FretRange, Position } from '../../theory';
import { spokenDegree } from '../../theory/pitch-display';
import type { DrillRenderProps } from '../types';
import {
  d6DegreeAt,
  d6Explain,
  d6FeedbackPositions,
  d6Hint,
  d6IntervalName,
  d6IsLive,
  d6Question,
  d6WorkedExample,
  type D6Answer,
  type D6Prompt,
} from './logic';
import styles from './D6View.module.css';

const WIDE: FretRange = { from: 0, to: 15 };
const REGULAR: FretRange = { from: 0, to: 12 };

/**
 * D6 view: a root on the neck and "Tap the major 3rd above the root" above it
 * (design §6 D6, §7 session layout). Nothing marks the answer until feedback,
 * except on a guided first rep (the worked example). Cells are focusable, so
 * Tab and Enter answer from a keyboard.
 */
export function D6View({
  prompt,
  guideLevel,
  guided,
  handedness,
  sizeClass,
  tuning,
  feedback,
  onAnswer,
  aside,
}: DrillRenderProps<D6Prompt, D6Answer>) {
  // Compact shows the hand position, which holds the root and the shape (design §7 iPhone).
  const visible =
    sizeClass === 'regular-wide' ? WIDE : sizeClass === 'regular' ? REGULAR : prompt.box;
  const name = d6IntervalName(prompt.interval);

  const tap = (pos: Position) => {
    if (feedback || !d6IsLive(prompt, pos)) return;
    onAnswer(pos);
  };

  const root: FretMarker = {
    ...prompt.root,
    style: 'root',
    label: 'R',
    spokenLabel: 'root',
    forceLabel: true,
  };
  const degree = (p: Position) => {
    const label = d6DegreeAt(prompt, p);
    return { label, spokenLabel: label === 'R' ? 'root' : spokenDegree(label) };
  };
  let markers: FretMarker[] = [root];
  if (feedback) {
    const pos = d6FeedbackPositions(prompt, feedback);
    markers = [
      root,
      ...pos.expected.map((p): FretMarker => ({
        ...p,
        style: 'correct',
        ...degree(p),
        forceLabel: true,
      })),
      ...pos.given.map((p): FretMarker => ({
        ...p,
        style: 'wrong',
        ...degree(p),
        forceLabel: true,
      })),
    ];
  } else if (guided) {
    // Worked example: the first rep of a new item shows where the shape lands.
    markers.push({
      ...prompt.shapeTarget,
      style: 'target',
      ...degree(prompt.shapeTarget),
      forceLabel: true,
    });
  }
  const level: GuideLevel = guided ? 3 : guideLevel;
  const question = d6Question(prompt);

  return (
    <div
      className={styles.drill}
      data-size-class={sizeClass}
      data-scope={prompt.scope}
      data-active-from={prompt.activeRange.from}
      data-active-to={prompt.activeRange.to}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d6-prompt">
            {guided ? (
              <>{d6WorkedExample(prompt)} Tap it to continue.</>
            ) : (
              <>
                {question.before}
                <strong>{name}</strong>
                {question.after}
              </>
            )}
          </p>
          <p className={styles.explain} data-testid="d6-explain">
            {feedback ? d6Explain(prompt, feedback) : !guided && d6Hint(prompt)}
          </p>
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <div
        className={styles.neckArea}
        data-live-string={prompt.scope === 'shape' ? prompt.shapeTarget.string : undefined}
      >
        {prompt.scope === 'shape' && (
          // The root sits on a dimmed string, but it is the reference: keep its cell clear.
          <style>{`.${styles.neckArea} rect[data-cell="s${prompt.root.string}f${prompt.root.fret}"] { fill: transparent !important; }`}</style>
        )}
        <Fretboard
          tuning={tuning}
          fretRange={visible}
          activeRange={prompt.activeRange}
          handedness={handedness}
          markers={markers}
          guideLevel={level}
          accidentalPref={prompt.accidentalPref}
          onTapCell={tap}
          label={`Fretboard: root on string ${prompt.root.string}, fret ${prompt.root.fret}. Tap the ${name}.`}
        />
      </div>
      {/* iPad portrait: the context panel sits below the neck. */}
      {sizeClass === 'regular' && aside}
    </div>
  );
}
