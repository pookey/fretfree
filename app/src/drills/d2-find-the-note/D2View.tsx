import { useEffect, useRef, useState } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { noteAt, type FretRange, type Position } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  d2Explain,
  d2FeedbackPositions,
  d2InitialFocus,
  d2InitialWindow,
  d2IsLive,
  d2MoveFocus,
  d2NeckGuideLevel,
  d2NearestTarget,
  d2SlideWindow,
  d2SpanWindow,
  d2WindowContaining,
  intersectRange,
  type D2Answer,
  type D2Prompt,
} from './logic';
import styles from './D2View.module.css';

interface ViewState {
  prompt: D2Prompt;
  /** The compact window (design §7 iPhone: about 5 frets, wider on its side; slid by the learner). */
  win: FretRange;
  /** The keyboard focus cell; null until the first arrow key. */
  focus: Position | null;
  /** The compact window width it was sized for; rotating the phone resizes it. */
  frets: number | undefined;
}

const WIDE: FretRange = { from: 0, to: 15 };
const REGULAR: FretRange = { from: 0, to: 12 };

/**
 * D2 view: "Find G on string 5" above the neck; the learner taps the cell
 * (design §6 D2, §7 session layout). Nothing on the neck marks the answer
 * until feedback, except on a guided first rep (the worked example).
 */
export function D2View({
  prompt,
  guideLevel,
  guided,
  handedness,
  sizeClass,
  compactFrets,
  tuning,
  feedback,
  onAnswer,
  aside,
}: DrillRenderProps<D2Prompt, D2Answer>) {
  const compact = sizeClass === 'compact';
  const neckRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const [state, setState] = useState<ViewState>(() => ({
    prompt,
    win: d2InitialWindow(prompt, guided, compactFrets),
    focus: null,
    frets: compactFrets,
  }));
  // A new prompt (or a new window width) resets the window and the focus cell.
  let view = state;
  if (state.prompt !== prompt || state.frets !== compactFrets) {
    view = {
      prompt,
      win: d2InitialWindow(prompt, guided, compactFrets),
      focus: null,
      frets: compactFrets,
    };
    setState(view);
  }

  let visible: FretRange;
  if (!compact) visible = sizeClass === 'regular-wide' ? WIDE : REGULAR;
  else if (feedback && !feedback.result.correct) {
    // Widen the window so both the tapped and the right cell are on screen.
    const nearest = d2NearestTarget(prompt, feedback.answer.fret);
    const frets = [feedback.answer.fret, ...(nearest ? [nearest.fret] : [])];
    visible = d2SpanWindow(frets, prompt.activeRange, compactFrets);
  } else visible = view.win;
  const navRange = compact ? prompt.activeRange : intersectRange(prompt.activeRange, visible);

  const tap = (pos: Position) => {
    if (feedback || !d2IsLive(prompt, pos)) return;
    onAnswer(pos);
  };

  useEffect(() => {
    if (feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if ((e.key === 'Enter' || e.key === ' ') && view.focus) {
        // A focused cell handles its own Enter; this covers focus left on the page.
        if (e.target instanceof Element && e.target.closest('button, a, input')) return;
        e.preventDefault();
        if (d2IsLive(prompt, view.focus)) onAnswer(view.focus);
        return;
      }
      const from = view.focus ?? d2InitialFocus(prompt, navRange);
      const next = view.focus
        ? d2MoveFocus(from, e.key, { strings: prompt.liveStrings, range: navRange }, handedness)
        : e.key.startsWith('Arrow')
          ? from
          : null;
      if (!next) return;
      e.preventDefault();
      moved.current = true;
      setState((s) => ({
        ...s,
        focus: next,
        win: compact ? d2WindowContaining(s.win, next.fret, prompt.activeRange) : s.win,
      }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, prompt, view.focus, navRange, handedness, compact]);

  // Move DOM focus to the focus cell once it is rendered (the compact window may have slid).
  useEffect(() => {
    if (!moved.current || !state.focus) return;
    moved.current = false;
    const { string, fret } = state.focus;
    neckRef.current
      ?.querySelector<SVGElement>(`[data-cell="s${string}f${fret}"]`)
      ?.focus({ preventScroll: true });
  }, [state.focus, state.win]);

  const pcAt = (p: Position) => noteAt(p, tuning, prompt.accidentalPref).pc;
  let markers: FretMarker[] = [];
  if (feedback) {
    const pos = d2FeedbackPositions(prompt, feedback);
    markers = [
      ...pos.expected.map((p): FretMarker => ({
        ...p,
        style: 'correct',
        label: prompt.pc,
        forceLabel: true,
      })),
      ...pos.given.map((p): FretMarker => ({
        ...p,
        style: 'wrong',
        label: pcAt(p),
        forceLabel: true,
      })),
    ];
  } else if (guided) {
    // Worked example: the first rep of a new item shows where the note is.
    markers = prompt.targets.map((p): FretMarker => ({
      ...p,
      style: 'target',
      label: prompt.pc,
      forceLabel: true,
    }));
  }

  const slide = (steps: number) =>
    setState((s) => ({ ...s, win: d2SlideWindow(s.win, steps, prompt.activeRange) }));
  const lower = (
    <button
      type="button"
      className={styles.slide}
      onClick={() => slide(-1)}
      disabled={Boolean(feedback) || view.win.from <= prompt.activeRange.from}
      aria-label="Lower frets"
    >
      {handedness === 'left' ? '›' : '‹'}
    </button>
  );
  const higher = (
    <button
      type="button"
      className={styles.slide}
      onClick={() => slide(1)}
      disabled={Boolean(feedback) || view.win.to >= prompt.activeRange.to}
      aria-label="Higher frets"
    >
      {handedness === 'left' ? '‹' : '›'}
    </button>
  );

  return (
    <div className={styles.drill} data-size-class={sizeClass} data-scope={prompt.scope}>
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d2-prompt">
            {guided ? (
              <>
                This is <strong>{prompt.pc}</strong> on string {prompt.string}. Tap it to continue.
              </>
            ) : (
              <>
                Find <strong>{prompt.pc}</strong> on string {prompt.string}
              </>
            )}
          </p>
          <p className={styles.explain} data-testid="d2-explain">
            {feedback
              ? d2Explain(prompt, feedback)
              : !compact && 'Tap the fret, or use the arrow keys and Enter.'}
          </p>
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <div className={styles.neckRow}>
        {compact && (handedness === 'left' ? higher : lower)}
        <div
          ref={neckRef}
          className={styles.neckArea}
          data-live-string={prompt.scope === 'string' ? prompt.string : undefined}
        >
          <Fretboard
            tuning={tuning}
            fretRange={visible}
            activeRange={prompt.activeRange}
            handedness={handedness}
            markers={markers}
            guideLevel={d2NeckGuideLevel(prompt, guideLevel, {
              guided,
              answered: Boolean(feedback),
            })}
            accidentalPref={prompt.accidentalPref}
            onTapCell={tap}
            label={`Fretboard: find the note on string ${prompt.string}`}
          />
        </div>
        {compact && (handedness === 'left' ? lower : higher)}
      </div>
      {compact && (
        <p className={styles.windowCaption} data-testid="d2-window">
          Frets {visible.from}–{visible.to}
        </p>
      )}
      {/* iPad portrait: the context panel sits below the neck; compact styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
