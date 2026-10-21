import { useEffect, useRef, useState } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { TabStaff } from '../../components/tab';
import { allStrings, noteAt, type FretRange, type Position } from '../../theory';
import {
  d2MoveFocus,
  d2SlideWindow,
  d2SpanWindow,
  d2WindowContaining,
  intersectRange,
} from '../d2-find-the-note/logic';
import type { DrillRenderProps } from '../types';
import {
  D33_STAFF_COLUMNS,
  d33CompactFrets,
  d33Explain,
  d33FeedbackPositions,
  d33InitialWindow,
  d33IsLive,
  d33LineMarks,
  d33NeckGuideLevel,
  d33NoteStyle,
  d33StaffGuideLevel,
  d33StaffLabel,
  type D33Answer,
  type D33Prompt,
} from './logic';
import styles from './D33View.module.css';

interface ViewState {
  prompt: D33Prompt;
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
 * D33 view: one note on the tab staff above the neck, and the learner taps
 * that cell (docs/design/tab-track.md §6). Nothing on the neck marks the
 * answer until feedback, except on a guided first rep (the worked example),
 * which also highlights the note's line and names every line.
 */
export function D33View({
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
}: DrillRenderProps<D33Prompt, D33Answer>) {
  const compact = sizeClass === 'compact';
  const compactFrets = compact
    ? d33CompactFrets(sessionFrets, window.innerWidth, window.innerHeight)
    : sessionFrets;
  const neckRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const [state, setState] = useState<ViewState>(() => ({
    prompt,
    win: d33InitialWindow(prompt, guided, compactFrets),
    focus: null,
    frets: compactFrets,
  }));
  // A new prompt (or a new window width) resets the window and the focus cell.
  let view = state;
  if (state.prompt !== prompt || state.frets !== compactFrets) {
    view = {
      prompt,
      win: d33InitialWindow(prompt, guided, compactFrets),
      focus: null,
      frets: compactFrets,
    };
    setState(view);
  }

  let visible: FretRange;
  if (!compact) visible = sizeClass === 'regular-wide' ? WIDE : REGULAR;
  else if (feedback && !feedback.result.correct) {
    // Widen the window so both the tapped and the right cell are on screen.
    visible = d2SpanWindow(
      [feedback.answer.fret, prompt.target.fret],
      prompt.activeRange,
      compactFrets,
    );
  } else visible = view.win;
  const navRange = compact ? prompt.activeRange : intersectRange(prompt.activeRange, visible);

  const tap = (pos: Position) => {
    if (feedback || !d33IsLive(prompt, pos)) return;
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
        if (d33IsLive(prompt, view.focus)) onAnswer(view.focus);
        return;
      }
      // The focus starts on the top string's lowest fret, whatever the note: it gives nothing away.
      const from = view.focus ?? { string: 1, fret: navRange.from };
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
        win: compact ? d2WindowContaining(s.win, next.fret, prompt.activeRange) : s.win,
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
    const pos = d33FeedbackPositions(prompt, feedback);
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

  const staffLevel = d33StaffGuideLevel(guideLevel, { guided, answered: Boolean(feedback) });
  const { target } = prompt;

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
          <p className={styles.prompt} id="drill-prompt" data-testid="d33-prompt">
            {guided ? (
              <>
                This note is on <strong>string {target.string}</strong>, fret{' '}
                <strong>{target.fret}</strong>. Tap it to continue.
              </>
            ) : (
              <>Tap this note on the neck</>
            )}
          </p>
          {/* The staff's own labels would name the string at every guide level,
              so screen readers get the drill's label instead (`d33StaffLabel`). */}
          <div
            className={styles.staff}
            role="img"
            aria-label={d33StaffLabel(prompt, staffLevel)}
            data-testid="d33-staff"
          >
            <div aria-hidden="true">
              <TabStaff
                tuning={tuning}
                notes={[{ ...target, style: d33NoteStyle(feedback) }]}
                minColumns={D33_STAFF_COLUMNS}
                lineMarks={d33LineMarks(prompt, { guided, feedback })}
                guideLevel={staffLevel}
              />
            </div>
          </div>
          <p className={styles.explain} data-testid="d33-explain">
            {feedback
              ? d33Explain(prompt, feedback)
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
            activeRange={prompt.activeRange}
            handedness={handedness}
            markers={markers}
            guideLevel={d33NeckGuideLevel(guideLevel, { guided })}
            accidentalPref={prompt.accidentalPref}
            onTapCell={tap}
            label="Fretboard: tap the note the tab shows"
          />
        </div>
        {compact && (handedness === 'left' ? lower : higher)}
      </div>
      {compact && (
        <p className={styles.windowCaption} data-testid="d33-window">
          Frets {visible.from}–{visible.to}
        </p>
      )}
      {/* iPad portrait: the context panel sits below the neck; compact styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
