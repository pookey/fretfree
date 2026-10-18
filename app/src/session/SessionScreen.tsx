import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useAppStore } from '../app-store';
import { playNotes } from '../audio/audio';
import { DRILLS } from '../drills/registry';
import type { DrillFeedback } from '../drills/types';
import { SKILLS, createScheduler, type GuideLevel } from '../engine';
import type { StatusOverlay } from '../engine/overlay';
import { useStatusOverlay } from '../screens/settings/DeveloperTools';
import { useCompactWindowFrets, useSizeClass } from '../shell/size-class';
import { getDb } from '../storage';
import { getTuning } from '../theory';
import { parseFocus } from './focus';
import { parseSessionOptions } from './options';
import { refitIfDue } from './refit-bridge';
import { SessionRunner, type CurrentPrompt } from './runner';
import type { Celebration } from './summary/celebrations';
import { ComboCounter } from './summary/ComboCounter';
import { SessionSummary } from './summary/SessionSummary';
import { CelebrationTracker } from './summary/tracker';
import { TimeLeft } from './TimeLeft';
import styles from './SessionScreen.module.css';

const AUTO_ADVANCE_MS = 700;
// The developer switch (M1-36) exists in development builds only; production drops it.
const useOverlay: () => StatusOverlay | null = import.meta.env.DEV ? useStatusOverlay : () => null;

type Phase =
  | { kind: 'loading' }
  // Nothing to serve: say so rather than finish a session with no answers.
  | { kind: 'empty' }
  | { kind: 'prompt'; current: CurrentPrompt }
  | { kind: 'feedback'; current: CurrentPrompt; feedback: DrillFeedback<unknown> }
  | { kind: 'summary'; celebration: Celebration };

/** Full-screen, distraction-free session (design §7 Session). */
export function SessionScreen() {
  const settings = useAppStore((s) => s.settings);
  // The learner's refit FSRS weights once there are enough reviews (engine/refit.ts).
  const fsrsWeights = settings.fsrsParams?.w;
  const scheduler = useMemo(() => createScheduler({ weights: fsrsWeights }), [fsrsWeights]);
  const loaded = useAppStore((s) => s.loaded);
  // Read once, so the switch flipped mid-session (in another tab) can't restart it.
  const [overlay] = useState(useOverlay());
  const sizeClass = useSizeClass();
  const compactFrets = useCompactWindowFrets();
  const compact = sizeClass === 'compact';
  const navigate = useNavigate();
  const query = useSearchParams()[0].toString();
  const routeState: unknown = useLocation().state;
  const runnerRef = useRef<SessionRunner | null>(null);
  const trackerRef = useRef<CelebrationTracker | null>(null);
  const shownAt = useRef(0);
  const busy = useRef(false);
  const continueRef = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [progress, setProgress] = useState({ position: 0, length: 1 });
  const [contextOpen, setContextOpen] = useState(true);
  // Compact shows the context panel as a sheet over the neck, so it starts closed.
  const [sheetOpen, setSheetOpen] = useState(false);
  const helpOpen = compact ? sheetOpen : contextOpen;
  const setHelpOpen = compact ? setSheetOpen : setContextOpen;
  const [combo, setCombo] = useState(0);
  const [endsAt, setEndsAt] = useState<Date | null>(null);

  const finish = useCallback(async () => {
    const runner = runnerRef.current;
    const tracker = trackerRef.current;
    if (!runner || !tracker) return;
    const summary = await runner.finish();
    setPhase({ kind: 'summary', celebration: await tracker.finish(summary) });
    void refitIfDue(getDb(), new Date())
      .then((next) => next && useAppStore.setState({ settings: next }))
      .catch((e: unknown) => console.error('Refitting FSRS parameters failed', e));
  }, []);

  const showCurrent = useCallback(async () => {
    const runner = runnerRef.current;
    if (!runner || runner.isFinished) return;
    setProgress({ position: runner.position, length: Math.max(1, runner.length) });
    const current = runner.currentPrompt();
    if (!current) return finish();
    shownAt.current = performance.now();
    setPhase({ kind: 'prompt', current });
  }, [finish]);

  useEffect(() => {
    if (!loaded || runnerRef.current) return;
    let live = true;
    const db = getDb();
    void Promise.all([
      SessionRunner.start({
        db,
        scheduler,
        settings,
        skills: SKILLS,
        ...parseSessionOptions(routeState),
        drills: DRILLS,
        focus: parseFocus(new URLSearchParams(query), SKILLS),
        overlay,
      }),
      CelebrationTracker.begin({ db, skills: SKILLS }),
    ]).then(([runner, tracker]) => {
      if (!live) return;
      if (runner.isEmpty) return setPhase({ kind: 'empty' });
      runnerRef.current = runner;
      trackerRef.current = tracker;
      setEndsAt(runner.endsAt);
      void showCurrent();
    });
    return () => {
      live = false;
    };
  }, [loaded, settings, scheduler, query, routeState, showCurrent, overlay]);

  const advance = useCallback(() => {
    runnerRef.current?.next();
    void showCurrent();
  }, [showCurrent]);

  const onAnswer = async (answer: unknown) => {
    const runner = runnerRef.current;
    if (!runner || phase.kind !== 'prompt' || busy.current) return;
    const { current } = phase;
    busy.current = true;
    const responseMs = performance.now() - shownAt.current;
    const res = await runner.answer(answer, responseMs);
    const tally = trackerRef.current?.record({
      itemId: current.entry.itemId,
      skillId: current.entry.skillId,
      kind: current.entry.kind,
      guided: current.entry.guided,
      correct: res.result.correct,
      rating: res.rating,
      responseMs,
    });
    if (tally) setCombo(tally.combo);
    void playNotes([...res.sounds.expected, ...(res.sounds.given ?? [])], {
      muted: !settings.soundOn,
      volume: settings.volume,
    });
    setPhase({ kind: 'feedback', current, feedback: { answer, result: res.result } });
    busy.current = false;
    if (res.result.correct) window.setTimeout(advance, AUTO_ADVANCE_MS);
  };

  useEffect(() => {
    if (!compact || !sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compact, sheetOpen]);

  useEffect(() => {
    if (phase.kind !== 'feedback' || phase.feedback.result.correct) return;
    // The bar is pinned on screen, so focusing it must not scroll the neck away.
    continueRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, advance]);

  if (phase.kind === 'summary') return <SessionSummary celebration={phase.celebration} />;
  if (phase.kind === 'empty') return <EmptySession />;

  const current = phase.kind === 'loading' ? null : phase.current;
  const feedback = phase.kind === 'feedback' ? phase.feedback : null;
  const Drill = current?.drill.render;
  const guideLevel = (current?.guideLevel ?? 3) as GuideLevel;
  // The context panel follows guide fading: less at lower levels, hidden at 0.
  // On compact the drill places it as usual and the screen styles it as a sheet.
  const showContext = helpOpen && guideLevel > 0;
  // A drill may bring its own panel contents; the rest get the alphabet.
  const Panel = current?.drill.contextPanel;
  const aside = showContext ? (
    <aside className={styles.context} aria-label="Context" data-testid="context-panel">
      {current && Panel ? (
        <Panel
          prompt={current.prompt}
          guideLevel={guideLevel}
          guided={current.entry.guided}
          handedness={settings.handedness}
          tuning={getTuning(settings.tuning)}
          feedback={feedback}
        />
      ) : (
        <AlphabetPanel guideLevel={guideLevel} />
      )}
    </aside>
  ) : null;

  return (
    <main className={styles.screen} data-size-class={sizeClass}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.end}
          onClick={() => (runnerRef.current ? void finish() : navigate('/'))}
          aria-label="End session"
        >
          ✕
        </button>
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.length}
          aria-valuenow={progress.position}
          aria-label="Session progress"
        >
          <span style={{ width: `${(progress.position / progress.length) * 100}%` }} />
        </div>
        {endsAt && <TimeLeft endsAt={endsAt} />}
        <ComboCounter combo={combo} />
        <button
          type="button"
          className={styles.contextToggle}
          onClick={() => setHelpOpen((o) => !o)}
          aria-pressed={helpOpen}
        >
          {helpOpen ? 'Hide help' : 'Show help'}
        </button>
      </header>

      <div className={styles.body} data-testid="session">
        <section className={styles.drillArea}>
          {current && Drill ? (
            <Drill
              prompt={current.prompt}
              guideLevel={guideLevel}
              guided={current.entry.guided}
              handedness={settings.handedness}
              sizeClass={sizeClass}
              compactFrets={compactFrets}
              tuning={getTuning(settings.tuning)}
              feedback={feedback}
              onAnswer={(a: unknown) => void onAnswer(a)}
              aside={aside}
              blindMode={settings.blindMode}
            />
          ) : (
            <p className={styles.loading}>Preparing your session…</p>
          )}
          {/* Pinned to the bottom of the viewport (M1-28), so a wrong answer's
              Continue is never below the fold, whatever the drill. */}
          <div
            className={styles.feedbackBar}
            aria-live="polite"
            data-testid="feedback-bar"
            data-state={feedback ? (feedback.result.correct ? 'correct' : 'wrong') : undefined}
          >
            {feedback &&
              (feedback.result.correct ? (
                <p className={styles.correct} data-testid="feedback-correct">
                  ✓ {feedback.result.expected}
                </p>
              ) : (
                <>
                  <p className={styles.wrong} data-testid="feedback-wrong">
                    That was {feedback.result.expected}.
                    <span className={styles.again}> You'll see it again shortly.</span>
                  </p>
                  <button
                    type="button"
                    ref={continueRef}
                    className={styles.primary}
                    onClick={advance}
                    aria-keyshortcuts="Enter Space"
                  >
                    Continue
                  </button>
                </>
              ))}
          </div>
        </section>
      </div>
    </main>
  );
}

/** The default context panel: the musical alphabet and its half steps. */
function AlphabetPanel({ guideLevel }: { guideLevel: GuideLevel }) {
  return (
    <>
      <h2>Musical alphabet</h2>
      <ol className={styles.alphabet}>
        {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n) => (
          <li key={n} data-half-step-after={n === 'B' || n === 'E' ? 'true' : undefined}>
            {n}
          </li>
        ))}
      </ol>
      {guideLevel >= 2 && (
        <p>
          No sharp between <strong>B–C</strong> and <strong>E–F</strong>: they are a half step
          apart. Every other pair is a whole step.
        </p>
      )}
    </>
  );
}

/**
 * No item is due or new in what was asked for. Nothing is recorded: an empty
 * session earns no XP and extends no streak.
 */
function EmptySession() {
  return (
    <main className={styles.screen}>
      <div className={styles.empty} data-testid="session-empty">
        <h1>Nothing to practise right now</h1>
        <p>
          Nothing here is due for review or new to learn. Come back later, or pick another skill on
          Learn.
        </p>
        <Link to="/" className={styles.primary}>
          Done
        </Link>
      </div>
    </main>
  );
}
