import {
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../app-store';
import { playNotes } from '../audio/audio';
import { DrillLoadFailed } from '../drills/DrillLoadFailed';
import { DRILLS, drillReady, preloadDrill } from '../drills/registry';
import type { AnyDrillType, DrillFeedback } from '../drills/types';
import { ENGINE_CONFIG } from '../engine/config';
import { gradeAnswer, speedTargets } from '../engine/grading';
import type { Skill } from '../engine/model';
import { createScheduler, type Scheduler } from '../engine/scheduler';
import { SKILLS } from '../engine/skills';
import { createDrillPicker } from '../session/drill-picker';
import { useCompactWindowFrets, useSizeClass } from '../shell/size-class';
import { getDb, type FretworkDB } from '../storage';
import { getTuning } from '../theory';
import {
  answerProbe,
  nextProbe,
  placementGroups,
  probeOutcome,
  progress,
  startPlacement,
  type GroupInput,
  type PlacementState,
  type Probe,
} from './algorithm';
import { savePlacement, type PlacementSummary, type ProbeLog } from './save';
import { testOutGroups, withWeakItems } from './test-out';
import onboarding from '../onboarding/Onboarding.module.css';
import styles from './PlacementTest.module.css';

const CFG = ENGINE_CONFIG.placement;
const MINUTES = Math.round(CFG.budgetMs / 60_000);
const AUTO_ADVANCE_MS = 700;
/** Probes are recall tests: inlays only, never labels (design §3.5 level 1). */
const PROBE_GUIDE_LEVEL = 1;

interface Shown {
  probe: Probe;
  drill: AnyDrillType;
  prompt: unknown;
}

type Phase =
  | { kind: 'ready' }
  | { kind: 'probe'; shown: Shown }
  | { kind: 'feedback'; shown: Shown; feedback: DrillFeedback<unknown> }
  | { kind: 'saving' }
  | { kind: 'done'; summary: PlacementSummary }
  | { kind: 'failed' };

const perfNow = () => performance.now();

/** A test-out of a locked module (M2-16): the probe scoped to the skills it needs. */
export interface TestOutScope {
  /** The prerequisite skills to probe (`unmetPrerequisites`). */
  skillIds: readonly string[];
  /** The result in place of the placement test's, under the same focus target. */
  renderResult: (summary: PlacementSummary) => ReactNode;
  /** Called once the result is saved, e.g. to reload what the screen shows. */
  onSaved?: (summary: PlacementSummary) => void;
}

/**
 * The placement test (design §3.4, §4 step 6): about 3 minutes of adaptive
 * probes through the drills themselves, run full screen so each drill keeps
 * its session layout. Anything answered fluently is seeded as known when the
 * test ends (`savePlacement`). "Not sure" settles a probe without guessing,
 * and "Finish now" ends the test early, keeping what it has found.
 * `doneAction` shows under the result, and also if saving fails: the step is
 * optional, so the learner can always carry on. While probing, the rest of
 * the page is `inert`, so focus and the screen reader stay in the test.
 * Unless `scheduler` is given, cards are scheduled with the learner's refit
 * FSRS weights, as sessions do (a retake can run long after a refit).
 *
 * With `testOut`, it probes only the given skills, starts at once, and holds
 * them to the test-out bar (`ENGINE_CONFIG.placement.testOut`): every probe
 * fluent, and a skill that passes is mastered.
 */
export function PlacementTest({
  doneAction,
  now = perfNow,
  clock = () => new Date(),
  rng = Math.random,
  skills = SKILLS,
  drills = DRILLS,
  db = getDb(),
  scheduler: given,
  testOut,
}: {
  doneAction?: ReactNode;
  now?: () => number;
  clock?: () => Date;
  rng?: () => number;
  skills?: readonly Skill[];
  drills?: readonly AnyDrillType[];
  db?: FretworkDB;
  scheduler?: Scheduler;
  testOut?: TestOutScope;
}) {
  const settings = useAppStore((s) => s.settings);
  const fsrsWeights = settings.fsrsParams?.w;
  const fitted = useMemo(() => createScheduler({ weights: fsrsWeights }), [fsrsWeights]);
  const scheduler = given ?? fitted;
  const sizeClass = useSizeClass();
  const compactFrets = useCompactWindowFrets();
  const headingId = useId();
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  const [share, setShare] = useState(0);
  // Set while a probe waits for its drill view to download.
  const [loadingView, setLoadingView] = useState(false);
  const state = useRef<PlacementState | null>(null);
  const logs = useRef<ProbeLog[]>([]);
  const startedAt = useRef(0);
  const shownAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  const result = useRef<HTMLParagraphElement>(null);
  const testOutResult = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);

  const picker = useMemo(() => createDrillPicker(skills, drills), [skills, drills]);
  const tuning = getTuning(settings.tuning);
  const targets = speedTargets(settings.latencyBaselineMs);
  const running = phase.kind === 'probe' || phase.kind === 'feedback';
  const tiers = testOut ? CFG.testOut.tiers : CFG.tiers;
  const budgetMs = testOut ? CFG.testOut.budgetMs : CFG.budgetMs;
  const title = testOut ? 'Test out' : 'Placement test';

  useEffect(() => () => clearTimeout(timer.current), []);
  // Drill views load on demand: fetch them before the first probe needs one,
  // so a probe's response time never includes a download.
  const viewsReady = useMemo(
    () => Promise.all(drills.map((d) => preloadDrill(d))).catch(() => undefined),
    [drills],
  );
  useEffect(() => {
    if (!running) return;
    // The overlay is portalled to <body>; everything beside it goes inert.
    const others = [...document.body.children].filter(
      (el) => el !== overlay.current && !el.hasAttribute('inert'),
    );
    for (const el of others) el.setAttribute('inert', '');
    heading.current?.focus();
    return () => {
      for (const el of others) el.removeAttribute('inert');
    };
  }, [running]);
  useEffect(() => {
    if (phase.kind === 'done' || phase.kind === 'failed')
      (testOutResult.current ?? result.current)?.focus();
  }, [phase.kind]);

  const finish = async () => {
    clearTimeout(timer.current);
    const s = state.current;
    if (!s) return;
    state.current = null;
    setPhase({ kind: 'saving' });
    try {
      const summary = await savePlacement(db, {
        state: s,
        logs: logs.current,
        skills,
        scheduler,
        targets,
        now: clock(),
        masterKnown: testOut !== undefined,
      });
      setPhase({ kind: 'done', summary });
      testOut?.onSaved?.(summary);
    } catch (e) {
      console.error('Placement test not saved', e);
      setPhase({ kind: 'failed' });
    }
  };

  const advance = () => {
    clearTimeout(timer.current);
    const s = state.current;
    if (!s) return;
    setShare(progress(s));
    const probe = nextProbe(s, now() - startedAt.current, budgetMs);
    if (!probe) return void finish();
    const drill = picker.pick(probe.item);
    if (!drill) throw new Error(`No drill can test ${probe.item.id}`);
    const prompt = drill.makePrompt(probe.item, {
      tuning,
      accidentalPref: settings.accidentalPref,
      scopeLevel: drill.scope.minLevel,
      rng,
    });
    const show = () => {
      setPhase({ kind: 'probe', shown: { probe, drill, prompt } });
      shownAt.current = now();
    };
    if (drillReady(drill)) return show();
    // The views haven't downloaded yet (a first launch before the precache
    // has them): wait, so the download stays out of the probe's response time.
    setLoadingView(true);
    void preloadDrill(drill)
      .catch(() => undefined)
      .then(() => {
        setLoadingView(false);
        if (state.current === s) show();
      });
  };

  const begin = (groups: readonly GroupInput[]) => {
    state.current = startPlacement(groups, rng, tiers);
    logs.current = [];
    startedAt.current = now();
    advance();
  };

  const start = () => begin(placementGroups(skills, (i) => picker.canServe(i)));

  // A test-out was asked for by a tap on "Test out": no second start button.
  // It also asks every item whose own card is still weak (`withWeakItems`).
  const autoStart = useRef(testOut !== undefined);
  useEffect(() => {
    if (!autoStart.current || !testOut) return;
    autoStart.current = false;
    const groups = testOutGroups(testOut.skillIds, skills, (i) => picker.canServe(i));
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    Promise.all([db.cards.bulkGet(ids), viewsReady]).then(
      ([cards]) =>
        begin(
          withWeakItems(
            groups,
            cards.filter((c) => c !== undefined),
          ),
        ),
      (e: unknown) => {
        console.error('Test-out not started', e);
        setPhase({ kind: 'failed' });
      },
    );
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAnswer = (answer: unknown) => {
    if (phase.kind !== 'probe' || !state.current) return;
    const { shown } = phase;
    const { drill, prompt, probe } = shown;
    const elapsed = now() - shownAt.current;
    const check = drill.check(prompt, answer);
    const responseMs = drill.gradedResponseMs?.(prompt, answer, elapsed) ?? elapsed;
    const rating = gradeAnswer({ correct: check.correct, responseMs }, targets);
    logs.current.push({
      item: probe.item,
      drillType: drill.id,
      correct: check.correct,
      responseMs,
      rating,
      answerGiven: drill.describeAnswer(answer),
      at: clock(),
    });
    state.current = answerProbe(state.current, probe, probeOutcome(rating));
    const feedback = { answer, result: check };
    const sounds = drill.sounds(prompt, feedback);
    void playNotes([...sounds.expected, ...(sounds.given ?? [])], {
      muted: !settings.soundOn,
      volume: settings.volume,
    });
    setPhase({ kind: 'feedback', shown, feedback });
    if (check.correct) timer.current = setTimeout(advance, AUTO_ADVANCE_MS);
  };

  const notSure = () => {
    if (phase.kind !== 'probe' || !state.current) return;
    state.current = answerProbe(state.current, phase.shown.probe, 'wrong');
    advance();
  };

  if (running) {
    const { shown } = phase;
    const feedback = phase.kind === 'feedback' ? phase.feedback : null;
    const Drill = shown.drill.render;
    return createPortal(
      <div
        ref={overlay}
        className={styles.overlay}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        data-size-class={sizeClass}
      >
        <header className={styles.header}>
          <h2 id={headingId} ref={heading} tabIndex={-1}>
            {title}
          </h2>
          <progress
            className={styles.progress}
            max={1}
            value={share}
            aria-label={`${title} progress`}
          />
          <button type="button" className={onboarding.link} onClick={() => void finish()}>
            Finish now
          </button>
        </header>
        <div
          className={styles.drillArea}
          data-testid="placement-probe"
          data-item={shown.probe.item.id}
        >
          <DrillLoadFailed
            key={shown.drill.id}
            title={shown.drill.title}
            buttonClassName={onboarding.primary}
          >
            <Suspense fallback={<p role="status">Loading {shown.drill.title}…</p>}>
              <Drill
                key={`${shown.probe.group.id}:${shown.probe.item.id}`}
                prompt={shown.prompt}
                guideLevel={PROBE_GUIDE_LEVEL}
                guided={false}
                handedness={settings.handedness}
                sizeClass={sizeClass}
                compactFrets={compactFrets}
                tuning={tuning}
                feedback={feedback}
                onAnswer={onAnswer}
                blindMode={settings.blindMode}
              />
            </Suspense>
          </DrillLoadFailed>
          <div className={styles.feedbackBar} aria-live="polite">
            {!feedback && (
              <button type="button" className={styles.secondary} onClick={notSure}>
                Not sure
              </button>
            )}
            {feedback?.result.correct && (
              <p className={styles.correct} data-testid="feedback-correct">
                ✓ {feedback.result.expected}
              </p>
            )}
            {feedback && !feedback.result.correct && (
              <>
                <p className={styles.wrong} data-testid="feedback-wrong">
                  That was {feedback.result.expected}.
                </p>
                <button type="button" className={onboarding.primary} onClick={advance} autoFocus>
                  Continue
                </button>
              </>
            )}
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <div className={styles.placement}>
      {phase.kind === 'ready' && !testOut && (
        <>
          <p className={onboarding.lead}>
            About {MINUTES} minutes of quick questions that get harder as you go. Answer what you
            know, and tap <strong>Not sure</strong> for anything you don’t. A lucky guess would only
            skip something worth practising.
          </p>
          <button
            type="button"
            className={onboarding.primary}
            onClick={start}
            disabled={loadingView}
          >
            Start the test
          </button>
          {loadingView && (
            <p role="status" className={onboarding.lead}>
              Loading…
            </p>
          )}
        </>
      )}
      {phase.kind === 'saving' && <p className={onboarding.lead}>Saving what you know…</p>}
      {phase.kind === 'done' && (
        <>
          {testOut ? (
            <div ref={testOutResult} tabIndex={-1} data-testid="test-out-result">
              {testOut.renderResult(phase.summary)}
            </div>
          ) : (
            <Result summary={phase.summary} skills={skills} ref={result} />
          )}
          {doneAction}
        </>
      )}
      {phase.kind === 'failed' && (
        <>
          <p
            className={onboarding.lead}
            ref={result}
            tabIndex={-1}
            role="alert"
            data-testid="placement-result"
          >
            Your answers couldn’t be saved, so nothing was skipped. Carry on: your sessions find
            what you know as you practise.
          </p>
          {doneAction}
        </>
      )}
    </div>
  );
}

function Result({
  summary,
  skills,
  ref,
}: {
  summary: PlacementSummary;
  skills: readonly Skill[];
  ref: Ref<HTMLParagraphElement>;
}) {
  const days = ENGINE_CONFIG.fsrs.seededStabilityDays;
  if (summary.knownSkills.length === 0) {
    return (
      <p className={onboarding.lead} ref={ref} tabIndex={-1} data-testid="placement-result">
        Nothing to skip yet, and that’s fine: your sessions start at the beginning, with an example
        for every new idea.
      </p>
    );
  }
  return (
    <>
      <p className={onboarding.lead} ref={ref} tabIndex={-1} data-testid="placement-result">
        You already know {summary.knownSkills.length === 1 ? 'this' : 'these'}. Sessions skip ahead,
        and check {summary.seeded} of those facts again in about {days} days to make sure they
        stick.
      </p>
      <ul className={styles.known} aria-label="Already known">
        {summary.knownSkills.map((id) => (
          <li key={id}>{skills.find((s) => s.id === id)?.title ?? id}</li>
        ))}
      </ul>
    </>
  );
}
