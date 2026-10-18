import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../app-store';
import { playNotes } from '../audio/audio';
import { DRILLS } from '../drills/registry';
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
  type PlacementState,
  type Probe,
} from './algorithm';
import { savePlacement, type PlacementSummary, type ProbeLog } from './save';
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
const defaultScheduler = createScheduler();

/**
 * The placement test (design §3.4, §4 step 6): about 3 minutes of adaptive
 * probes through the drills themselves, run full screen so each drill keeps
 * its session layout. Anything answered fluently is seeded as known when the
 * test ends (`savePlacement`). "Not sure" settles a probe without guessing,
 * and "Finish now" ends the test early, keeping what it has found.
 * `doneAction` shows under the result, and also if saving fails: the step is
 * optional, so the learner can always carry on. While probing, the rest of
 * the page is `inert`, so focus and the screen reader stay in the test.
 */
export function PlacementTest({
  doneAction,
  now = perfNow,
  clock = () => new Date(),
  rng = Math.random,
  skills = SKILLS,
  drills = DRILLS,
  db = getDb(),
  scheduler = defaultScheduler,
}: {
  doneAction?: ReactNode;
  now?: () => number;
  clock?: () => Date;
  rng?: () => number;
  skills?: readonly Skill[];
  drills?: readonly AnyDrillType[];
  db?: FretworkDB;
  scheduler?: Scheduler;
}) {
  const settings = useAppStore((s) => s.settings);
  const sizeClass = useSizeClass();
  const compactFrets = useCompactWindowFrets();
  const headingId = useId();
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  const [share, setShare] = useState(0);
  const state = useRef<PlacementState | null>(null);
  const logs = useRef<ProbeLog[]>([]);
  const startedAt = useRef(0);
  const shownAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  const result = useRef<HTMLParagraphElement>(null);
  const overlay = useRef<HTMLDivElement>(null);

  const picker = useMemo(() => createDrillPicker(skills, drills), [skills, drills]);
  const tuning = getTuning(settings.tuning);
  const targets = speedTargets(settings.latencyBaselineMs);
  const running = phase.kind === 'probe' || phase.kind === 'feedback';

  useEffect(() => () => clearTimeout(timer.current), []);
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
    if (phase.kind === 'done' || phase.kind === 'failed') result.current?.focus();
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
      });
      setPhase({ kind: 'done', summary });
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
    const probe = nextProbe(s, now() - startedAt.current);
    if (!probe) return void finish();
    const drill = picker.pick(probe.item);
    if (!drill) throw new Error(`No drill can test ${probe.item.id}`);
    const prompt = drill.makePrompt(probe.item, {
      tuning,
      accidentalPref: settings.accidentalPref,
      scopeLevel: drill.scope.minLevel,
      rng,
    });
    setPhase({ kind: 'probe', shown: { probe, drill, prompt } });
    shownAt.current = now();
  };

  const start = () => {
    state.current = startPlacement(
      placementGroups(skills, (i) => picker.canServe(i)),
      rng,
    );
    logs.current = [];
    startedAt.current = now();
    advance();
  };

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
            Placement test
          </h2>
          <progress
            className={styles.progress}
            max={1}
            value={share}
            aria-label="Placement test progress"
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
      {phase.kind === 'ready' && (
        <>
          <p className={onboarding.lead}>
            About {MINUTES} minutes of quick questions that get harder as you go. Answer what you
            know, and tap <strong>Not sure</strong> for anything you don’t. A lucky guess would only
            skip something worth practising.
          </p>
          <button type="button" className={onboarding.primary} onClick={start}>
            Start the test
          </button>
        </>
      )}
      {phase.kind === 'saving' && <p className={onboarding.lead}>Saving what you know…</p>}
      {phase.kind === 'done' && (
        <>
          <Result summary={phase.summary} skills={skills} ref={result} />
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
