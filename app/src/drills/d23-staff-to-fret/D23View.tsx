import { useEffect, useRef, useState } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { Staff } from '../../components/staff';
import { allStrings, noteAt, type FretRange, type Position } from '../../theory';
import { displayPc } from '../../theory/pitch-display';
import {
  d2MoveFocus,
  d2SlideWindow,
  d2SpanWindow,
  d2WindowContaining,
  intersectRange,
} from '../d2-find-the-note/logic';
import type { DrillRenderProps } from '../types';
import {
  D23_NECK,
  D23_STAFF_RANGE,
  d23CompactFrets,
  d23Explain,
  d23FeedbackPositions,
  d23InitialWindow,
  d23IsLive,
  d23NeckGuideLevel,
  d23NoteStyle,
  d23PositionCaption,
  d23PositionName,
  d23RegularFrets,
  d23StaffMarks,
  type D23Answer,
  type D23Prompt,
} from './logic';
import styles from './D23View.module.css';

interface ViewState {
  prompt: D23Prompt;
  /** The compact window (design §7 iPhone: about 5 frets, wider on its side; slid by the learner). */
  win: FretRange;
  /** The keyboard focus cell; null until the first arrow key. */
  focus: Position | null;
  /** The compact window width it was sized for; rotating the phone resizes it. */
  frets: number | undefined;
}

/** The root font size, which the staff column's rem width resolves against. */
function rootFontPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/**
 * D23 view: one note on the staff above the whole neck, and a reading
 * position (design §12 Screens: the staff and the neck both in view on iPad
 * landscape). The position's frets are drawn and the rest of the neck
 * dimmed; the learner taps where the position plays the note. Nothing on
 * the neck marks the answer until feedback, except on a guided first rep
 * (the worked example).
 */
export function D23View({
  prompt,
  guideLevel,
  guided,
  handedness,
  sizeClass,
  compactFrets: sessionFrets,
  tuning,
  feedback,
  onAnswer,
  aside,
}: DrillRenderProps<D23Prompt, D23Answer>) {
  const compact = sizeClass === 'compact';
  const compactFrets = compact
    ? d23CompactFrets(sessionFrets, window.innerWidth, window.innerHeight, rootFontPx())
    : sessionFrets;
  const neckRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const [state, setState] = useState<ViewState>(() => ({
    prompt,
    win: d23InitialWindow(prompt, compactFrets),
    focus: null,
    frets: compactFrets,
  }));
  // A new prompt (or a new window width) resets the window and the focus cell.
  let view = state;
  if (state.prompt !== prompt || state.frets !== compactFrets) {
    view = {
      prompt,
      win: d23InitialWindow(prompt, compactFrets),
      focus: null,
      frets: compactFrets,
    };
    setState(view);
  }

  let visible: FretRange;
  if (sizeClass === 'regular-wide') visible = D23_NECK;
  else if (!compact) visible = d23RegularFrets(prompt);
  else if (feedback && !feedback.result.correct) {
    // Widen the window so both the tapped and the right cell are on screen.
    visible = d2SpanWindow([feedback.answer.fret, prompt.target.fret], D23_NECK, compactFrets);
  } else visible = view.win;
  const navRange = intersectRange(prompt.activeRange, compact ? D23_NECK : visible);

  const tap = (pos: Position) => {
    if (feedback || !d23IsLive(prompt, pos)) return;
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
        if (d23IsLive(prompt, view.focus)) onAnswer(view.focus);
        return;
      }
      // The focus starts on the top string at the position's lowest fret: it gives nothing away.
      const from = view.focus ?? { string: 1, fret: prompt.region.from };
      const next = view.focus
        ? d2MoveFocus(from, e.key, { strings: allStrings(tuning), range: navRange }, handedness)
        : e.key.startsWith('Arrow')
          ? from
          : null;
      if (!next) return;
      e.preventDefault();
      moved.current = true;
      setState((s) => ({
        ...s,
        focus: next,
        win: compact ? d2WindowContaining(s.win, next.fret, D23_NECK) : s.win,
      }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, prompt, view.focus, navRange, handedness, compact, tuning]);

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
    const pos = d23FeedbackPositions(prompt, feedback);
    markers = [
      ...pos.expected.map((p): FretMarker => ({
        ...p,
        style: 'correct',
        label: pcAt(p),
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
    markers = [{ ...prompt.target, style: 'target', label: pcAt(prompt.target), forceLabel: true }];
  }

  const { target } = prompt;
  const where = d23PositionName(prompt.position);

  const slide = (steps: number) =>
    setState((s) => ({ ...s, win: d2SlideWindow(s.win, steps, D23_NECK) }));
  const lower = (
    <button
      type="button"
      className={styles.slide}
      onClick={() => slide(-1)}
      disabled={Boolean(feedback) || view.win.from <= D23_NECK.from}
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
      disabled={Boolean(feedback) || view.win.to >= D23_NECK.to}
      aria-label="Higher frets"
    >
      {handedness === 'left' ? '‹' : '›'}
    </button>
  );

  return (
    <div
      className={styles.drill}
      data-size-class={sizeClass}
      data-scope={prompt.scope}
      data-position={prompt.position.id}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <div className={styles.staff} data-testid="d23-staff">
            <Staff
              notes={[{ pitches: [prompt.note], value: 'w', style: d23NoteStyle(feedback) }]}
              marks={d23StaffMarks(prompt, feedback)}
              positionRange={D23_STAFF_RANGE}
              // The note's name is the answer's first half: say where it sits
              // until it has been answered or shown.
              revealPitches={guided || Boolean(feedback)}
              label="Staff: one note"
            />
          </div>
          <p className={styles.position} data-testid="d23-position">
            {d23PositionCaption(prompt)}
          </p>
          <p className={styles.prompt} id="drill-prompt" data-testid="d23-prompt">
            {guided ? (
              <>
                <strong>{displayPc(prompt.note)}</strong> in {where} is string{' '}
                <strong>{target.string}</strong>, fret <strong>{target.fret}</strong>. Tap it to
                continue.
              </>
            ) : (
              <>Tap this note in {where}</>
            )}
          </p>
          <p className={styles.explain} data-testid="d23-explain">
            {feedback
              ? d23Explain(prompt, feedback)
              : !compact && 'Tap the fret, or use the arrow keys and Enter.'}
          </p>
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <div className={styles.neckRow}>
        {compact && (handedness === 'left' ? higher : lower)}
        <div ref={neckRef} className={styles.neckArea}>
          <Fretboard
            tuning={tuning}
            fretRange={visible}
            activeRange={prompt.region}
            handedness={handedness}
            markers={markers}
            guideLevel={d23NeckGuideLevel(guideLevel, { guided })}
            accidentalPref={prompt.accidentalPref}
            onTapCell={tap}
            label={`Fretboard: tap the note in ${where}`}
          />
        </div>
        {compact && (handedness === 'left' ? lower : higher)}
      </div>
      {compact && (
        <p className={styles.windowCaption} data-testid="d23-window">
          Frets {visible.from}–{visible.to}
        </p>
      )}
      {/* iPad portrait: the context panel sits below the neck; compact styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
