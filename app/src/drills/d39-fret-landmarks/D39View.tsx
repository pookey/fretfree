import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { computeGeometry, minScale } from '../../components/fretboard/geometry';
import { noteAt, stringCount, type FretRange, type Position, type Tuning } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  d39ChoiceLabel,
  d39Column,
  d39Explain,
  d39FeedbackPositions,
  d39FeedbackRange,
  d39FretLook,
  d39MoveFocus,
  d39NeckGuideLevel,
  d39Question,
  d39SpotlightLabel,
  d39TypeKey,
  d39WorkedExample,
  type D39Answer,
  type D39Prompt,
} from './logic';
import styles from './D39View.module.css';

/** The string the keyboard focus moves along in find mode; any string on the fret counts. */
const FOCUS_STRING = 3;

/**
 * The shortest the neck may be drawn (px) with every cell still ≥44pt. On iPad
 * the neck shrinks to the room above the feedback bar, but never below this.
 */
function neckMinHeight(fretRange: FretRange, tuning: Tuning): number {
  const g = computeGeometry({ fretRange, stringCount: stringCount(tuning), handedness: 'right' });
  return Math.ceil(g.height * minScale(g));
}

/**
 * D39 view (design §6 D39): the question and fret buttons, the neck below.
 * A spotlit fret is the one every other fret is dimmed around. Markers are
 * found by tapping the neck, or with the arrow keys and Enter; everything
 * else is answered with a button or by typing the fret number.
 */
export function D39View({
  prompt,
  guideLevel,
  guided,
  handedness,
  sizeClass,
  tuning,
  feedback,
  onAnswer,
  aside,
  blindMode = false,
}: DrillRenderProps<D39Prompt, D39Answer>) {
  // What has been typed so far, kept with its prompt so a new prompt starts empty.
  const [entry, setEntry] = useState({ itemId: prompt.itemId, typed: '' });
  const typed = entry.itemId === prompt.itemId ? entry.typed : '';
  const { choices, mode } = prompt;
  // Find mode's keyboard focus fret, kept with its prompt; null until the first arrow key.
  const [nav, setNav] = useState<{ itemId: string; fret: number } | null>(null);
  const focusFret = nav?.itemId === prompt.itemId ? nav.fret : null;
  const neckRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (feedback || choices.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Enter on a focused button presses it; only typed numbers are ours.
      if (e.key === 'Enter' && typed === '') return;
      const next = d39TypeKey(typed, e.key, choices);
      if (next.typed === typed && next.answer === null) return;
      e.preventDefault();
      setEntry({ itemId: prompt.itemId, typed: next.typed });
      if (next.answer !== null) onAnswer(next.answer);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, choices, typed, prompt.itemId]);

  useEffect(() => {
    if (feedback || mode !== 'find-marker') return;
    const onKey = (e: KeyboardEvent) => {
      // A focused cell answers its own Enter (and prevents the default).
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if ((e.key === 'Enter' || e.key === ' ') && focusFret !== null) {
        // Focus moved on to a button or link (End session, Show help): it handles its own key.
        if (e.target instanceof Element && e.target.closest('button, a, input')) return;
        e.preventDefault();
        onAnswer(focusFret);
        return;
      }
      // The first arrow key lands on the nut, which gives nothing away.
      const next =
        focusFret === null
          ? e.key.startsWith('Arrow')
            ? prompt.range.from
            : null
          : d39MoveFocus(focusFret, e.key, prompt.range, handedness);
      if (next === null) return;
      e.preventDefault();
      moved.current = true;
      setNav({ itemId: prompt.itemId, fret: next });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, mode, focusFret, onAnswer, prompt.itemId, prompt.range, handedness]);

  // Move DOM focus to the focus cell, so a screen reader reads how that fret looks.
  useEffect(() => {
    if (!moved.current || focusFret === null) return;
    moved.current = false;
    neckRef.current
      ?.querySelector<SVGElement>(`[data-cell="s${FOCUS_STRING}f${focusFret}"]`)
      ?.focus({ preventScroll: true });
  }, [focusFret]);

  const tap = (pos: Position) => {
    if (feedback || mode !== 'find-marker') return;
    onAnswer(pos.fret);
  };

  const neckLevel = d39NeckGuideLevel(prompt, guideLevel, {
    guided,
    answered: Boolean(feedback),
  });
  const range = feedback ? d39FeedbackRange(prompt, feedback.answer) : prompt.range;
  // A repeat's feedback range is a new object each render: key on its frets.
  const { from: rangeFrom, to: rangeTo } = range;
  const minNeckHeight = useMemo(
    () => neckMinHeight({ from: rangeFrom, to: rangeTo }, tuning),
    [rangeFrom, rangeTo, tuning],
  );
  const pc = (p: Position) => noteAt(p, tuning, prompt.accidentalPref).pc;
  // The fret whose column stays lit while the rest of the neck is dimmed.
  const spotlight = feedback
    ? mode === 'repeat'
      ? undefined
      : prompt.expected
    : mode === 'name-marker' || (mode === 'find-marker' && guided)
      ? prompt.from
      : undefined;

  const markers: FretMarker[] = [];
  const topString = 1;
  if (mode === 'repeat') {
    // The starting fret's notes; the open strings are already named at the nut.
    if (prompt.from > 0) {
      markers.push(
        ...d39Column(tuning, prompt.from).map((p): FretMarker => ({
          ...p,
          style: 'root',
          label: pc(p),
          forceLabel: Boolean(feedback) || guided,
        })),
      );
    }
  }
  if (feedback) {
    const pos = d39FeedbackPositions(prompt, feedback, tuning);
    if (mode === 'repeat') {
      markers.push(
        ...pos.expected.map((p): FretMarker => ({
          ...p,
          style: 'correct',
          label: pc(p),
          forceLabel: true,
        })),
      );
    } else {
      markers.push({
        string: topString,
        fret: prompt.expected,
        style: 'correct',
        label: String(prompt.expected),
        forceLabel: true,
      });
    }
    if (!feedback.result.correct) {
      markers.push({
        string: topString,
        fret: feedback.answer,
        style: 'wrong',
        label: String(feedback.answer),
        forceLabel: true,
      });
    }
  } else if (guided && mode !== 'repeat') {
    markers.push({
      string: topString,
      fret: prompt.expected,
      style: 'target',
      label: String(prompt.expected),
      forceLabel: true,
    });
  }

  const question = d39Question(prompt);
  const neckLabel =
    mode === 'find-marker'
      ? 'Fretboard. Tap a fret, or move along the frets with the arrow keys.'
      : mode === 'name-marker'
        ? d39SpotlightLabel(prompt.from)
        : prompt.from === 0
          ? 'Fretboard, the open strings marked'
          : `Fretboard, fret ${prompt.from} marked`;

  return (
    <div
      className={styles.drill}
      data-size-class={sizeClass}
      data-answered={Boolean(feedback) || undefined}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt">
            {guided ? (
              <>
                {d39WorkedExample(prompt)}{' '}
                {mode === 'find-marker' ? (
                  'Tap it to continue.'
                ) : (
                  <>
                    Tap <strong>{d39ChoiceLabel(prompt.expected)}</strong> to continue.
                  </>
                )}
              </>
            ) : (
              question
            )}
          </p>
          {feedback ? (
            // Feedback teaches the method: count the dots, or add 12 (rule 9).
            <p className={styles.explain} data-testid="d39-explain">
              {d39Explain(prompt, feedback)}
            </p>
          ) : (
            <p className={styles.hint} data-testid="d39-hint" aria-live="polite">
              {mode === 'find-marker'
                ? 'Tap anywhere on that fret, or use the arrow keys and Enter.'
                : typed
                  ? `Typed ${typed}. Press Enter to answer.`
                  : ''}
            </p>
          )}
          {choices.length > 0 && (
            <div className={styles.choices} role="group" aria-labelledby="drill-prompt">
              {choices.map((c) => {
                const state = !feedback
                  ? undefined
                  : c === feedback.answer
                    ? feedback.result.correct
                      ? 'correct'
                      : 'wrong'
                    : c === prompt.expected && !feedback.result.correct
                      ? 'expected'
                      : undefined;
                return (
                  <button
                    key={c}
                    type="button"
                    className={styles.choice}
                    data-state={state}
                    disabled={Boolean(feedback)}
                    onClick={() => onAnswer(c)}
                    aria-label={c === 0 ? 'Open string' : `Fret ${c}`}
                  >
                    {d39ChoiceLabel(c)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <div
        ref={neckRef}
        className={styles.neckArea}
        data-testid="d39-neck"
        data-mode={mode}
        data-spotlight={spotlight}
        style={{ '--neck-min-h': `${minNeckHeight}px` } as CSSProperties}
      >
        <Fretboard
          tuning={tuning}
          fretRange={range}
          activeRange={spotlight === undefined ? undefined : { from: spotlight, to: spotlight }}
          handedness={handedness}
          markers={markers}
          guideLevel={neckLevel}
          blindMode={blindMode}
          accidentalPref={prompt.accidentalPref}
          onTapCell={mode === 'find-marker' && !feedback ? tap : undefined}
          cellLabel={(p) => `string ${p.string}, ${d39FretLook(p.fret)}`}
          label={neckLabel}
        />
      </div>
      {/* iPad portrait: the context panel sits below the neck; compact styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
