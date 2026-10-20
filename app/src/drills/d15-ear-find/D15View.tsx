import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../app-store';
import { playNotes } from '../../audio/audio';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { noteAt, type FretRange, type Position } from '../../theory';
import {
  d2MoveFocus,
  d2SlideWindow,
  d2SpanWindow,
  d2WindowContaining,
  intersectRange,
} from '../d2-find-the-note/logic';
import type { DrillRenderProps } from '../types';
import {
  d15Above,
  d15Explain,
  d15FeedbackPositions,
  d15InitialWindow,
  d15IsLive,
  d15NeckGuideLevel,
  d15PromptNotes,
  type D15Answer,
  type D15Prompt,
} from './logic';
import styles from './D15View.module.css';

interface ViewState {
  prompt: D15Prompt;
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
 * D15 view: the open string sounds, then the note, and the learner taps the
 * note on that string (design §6 D15). A C2 `find:` card names the note; on
 * an I6 `ear-find:` card nothing names it until feedback, and with sound off
 * the view asks for sound rather than giving the name away.
 */
export function D15View({
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
}: DrillRenderProps<D15Prompt, D15Answer>) {
  const soundOn = useAppStore((s) => s.settings.soundOn);
  const volume = useAppStore((s) => s.settings.volume);
  const updateSettings = useAppStore((s) => s.update);
  const compact = sizeClass === 'compact';
  const neckRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const played = useRef<D15Prompt | null>(null);
  const [state, setState] = useState<ViewState>(() => ({
    prompt,
    win: d15InitialWindow(prompt, guided, compactFrets),
    focus: null,
    frets: compactFrets,
  }));
  // A new prompt (or a new window width) resets the window and the focus cell.
  let view = state;
  if (state.prompt !== prompt || state.frets !== compactFrets) {
    view = {
      prompt,
      win: d15InitialWindow(prompt, guided, compactFrets),
      focus: null,
      frets: compactFrets,
    };
    setState(view);
  }

  const named = guided || !prompt.byEar;
  const play = () => void playNotes(d15PromptNotes(prompt), { muted: !soundOn, volume });

  // Each prompt plays once as it appears (once, under StrictMode too). With
  // sound off it waits, and plays as soon as sound is turned on.
  useEffect(() => {
    if (feedback || !soundOn || played.current === prompt) return;
    played.current = prompt;
    void playNotes(d15PromptNotes(prompt), { volume });
  }, [prompt, feedback, soundOn, volume]);

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
    if (feedback || !d15IsLive(prompt, pos)) return;
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
        if (d15IsLive(prompt, view.focus)) onAnswer(view.focus);
        return;
      }
      const from = view.focus ?? { string: prompt.string, fret: navRange.from };
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
  const openPc = pcAt(prompt.reference);
  // Always named: the reference is what the note is heard against.
  const reference: FretMarker = {
    ...prompt.reference,
    style: 'root',
    label: openPc,
    forceLabel: true,
  };
  let markers: FretMarker[] = [reference];
  if (feedback) {
    const pos = d15FeedbackPositions(prompt, feedback);
    markers = [
      reference,
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
    markers = [
      reference,
      { ...prompt.target, style: 'target', label: prompt.pc, forceLabel: true },
    ];
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

  let promptText;
  if (guided) {
    promptText = (
      <>
        This is <strong>{prompt.pc}</strong> on string {prompt.string}, a {d15Above(prompt)}.
        Listen, then tap it.
      </>
    );
  } else if (named) {
    promptText = (
      <>
        Find the <strong>{prompt.pc}</strong> you hear on string {prompt.string}
      </>
    );
  } else {
    promptText = <>Find the note you hear on string {prompt.string}</>;
  }

  let explain: string;
  if (feedback) explain = d15Explain(prompt, feedback);
  else if (!soundOn && named) explain = 'Sound is off, so you won’t hear the note.';
  else if (!soundOn) explain = 'Sound is off. Turn it on to hear the note.';
  else explain = `First the open ${openPc}, then the note.`;

  return (
    <div className={styles.drill} data-size-class={sizeClass} data-scope={prompt.scope}>
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d15-prompt">
            {promptText}
          </p>
          <div className={styles.listen}>
            {!soundOn && prompt.byEar && !feedback ? (
              // An ear card can't be answered unheard, and naming the note would
              // grade it on another fact, so ask for sound instead. The session
              // times the answer from when the prompt appeared, so this first
              // rep's time includes turning sound on: it may grade Hard once.
              <button
                type="button"
                className={styles.primary}
                onClick={() => void updateSettings({ soundOn: true })}
              >
                Turn sound on
              </button>
            ) : (
              <button
                type="button"
                className={styles.again}
                onClick={play}
                disabled={!soundOn}
                data-testid="d15-play"
              >
                <span aria-hidden="true">▶</span> Hear it again
              </button>
            )}
          </div>
          <p className={styles.explain} data-testid="d15-explain">
            {explain}
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
            guideLevel={d15NeckGuideLevel(prompt, guideLevel, {
              guided,
              answered: Boolean(feedback),
            })}
            accidentalPref={prompt.accidentalPref}
            onTapCell={tap}
            label={`Fretboard: find the note you hear on string ${prompt.string}`}
          />
        </div>
        {compact && (handedness === 'left' ? lower : higher)}
      </div>
      {compact && (
        <p className={styles.windowCaption} data-testid="d15-window">
          Frets {visible.from}–{visible.to}
        </p>
      )}
      {/* iPad portrait: the context panel sits below the neck; compact styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
