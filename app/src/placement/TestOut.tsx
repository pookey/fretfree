import { useId, useMemo, useState, type ComponentProps } from 'react';
import { Link } from 'react-router';
import { useAppStore } from '../app-store';
import { DRILLS } from '../drills/registry';
import type { AnyDrillType } from '../drills/types';
import { ENGINE_CONFIG } from '../engine/config';
import type { Module } from '../engine/frontier';
import { gatesOf, meetsGate, unmetGates } from '../engine/mastery';
import type { Skill, SkillStatus } from '../engine/model';
import { SKILLS } from '../engine/skills';
import { createDrillPicker } from '../session/drill-picker';
import { practiseHref } from '../session/focus';
import { PlacementTest } from './PlacementTest';
import { listOf } from './retake';
import type { PlacementSummary } from './save';
import {
  entrySkills,
  opensAfter,
  reportSentence,
  statusesAfter,
  testOutGroups,
  testOutReport,
} from './test-out';
import styles from './TestOut.module.css';

const PROBED_TOPICS: readonly string[] = ENGINE_CONFIG.placement.topics;

/** A skill the placement probe covers, so a test-out can prove it. */
function probeable(skill: Skill | undefined): boolean {
  return skill !== undefined && !skill.skipPlacement && PROBED_TOPICS.includes(skill.topic);
}

/**
 * The locked first skills a test-out works towards. A module opens with any
 * one of them, so one gated far down another track doesn't speak for the
 * module: the Ear module opens with its interval and ear → fretboard sets,
 * not with progression ear, which waits for Progressions (C9, which
 * placement doesn't probe; M4-16). So those whose every unmet gate
 * placement can probe, or every locked one when none can.
 */
function openers(
  module: Module,
  skills: readonly Skill[],
  statuses: ReadonlyMap<string, SkillStatus>,
): Skill[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const locked = entrySkills(module, skills).filter((s) => statuses.get(s.id) === 'locked');
  const provable = locked.filter((s) =>
    unmetGates(s, statuses).every((p) => probeable(byId.get(p))),
  );
  return provable.length > 0 ? provable : locked;
}

/** The prerequisites the openers still lack, in curriculum order: what the test-out probes. */
function needsOf(
  module: Module,
  skills: readonly Skill[],
  statuses: ReadonlyMap<string, SkillStatus>,
): string[] {
  const unmet = new Set(openers(module, skills, statuses).flatMap((s) => unmetGates(s, statuses)));
  return skills.filter((s) => unmet.has(s.id)).map((s) => s.id);
}

/** What one opener still waits for, by gate (M10-01): the titles to master and to be practising. */
export interface Waits {
  master: readonly string[];
  practise: readonly string[];
}

/**
 * What a locked module waits for: one set of gates per opener, since any one
 * opener opens it. An opener that needs everything another does and more
 * adds no new way in, so it's left out.
 */
function waitsFor(
  module: Module,
  skills: readonly Skill[],
  statuses: ReadonlyMap<string, SkillStatus>,
): Waits[] {
  const titles = (ids: readonly string[]) =>
    skills.filter((s) => ids.includes(s.id)).map((s) => s.title);
  const sets = openers(module, skills, statuses).map((skill) => {
    const gates = gatesOf(skill);
    const unmet = (gate: 'mastered' | 'practising') =>
      gates[gate].filter((p) => !meetsGate(gate, statuses.get(p)));
    return { master: titles(unmet('mastered')), practise: titles(unmet('practising')) };
  });
  // Mastering a skill meets a gate on practising it too.
  const within = (a: Waits, b: Waits) =>
    a.master.every((t) => b.master.includes(t)) &&
    a.practise.every((t) => b.practise.includes(t) || b.master.includes(t));
  // Keep the first of two identical sets; drop any set strictly wider than another.
  return sets.filter(
    (b, i) => !sets.some((a, j) => j !== i && within(a, b) && (j < i || !within(b, a))),
  );
}

/** "A, B or C". */
function orList(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}

/** "you’ve mastered A and are practising B", joining each gate's titles with `join`. */
function gatesClause(
  { master, practise: all }: Waits,
  join: (words: readonly string[]) => string,
  and: string,
): string {
  // A skill to master needn't be listed again as one to be practising.
  const practise = all.filter((t) => !master.includes(t));
  return [
    master.length > 0 && `you’ve mastered ${join(master)}`,
    practise.length > 0 && `${master.length > 0 ? 'are' : 'you’re'} practising ${join(practise)}`,
  ]
    .filter(Boolean)
    .join(` ${and} `);
}

/**
 * "Chords opens once you’ve mastered 3rds and are practising Sharp keys."
 * Any one opener opens the module (rule 16: say only what's true), so its
 * gates are alternatives: "and" only within one opener, "or" between openers
 * that each wait for one thing ("Ear opens once you’re practising The musical
 * alphabet or Natural notes on string 6"). Where some opener waits for more
 * than one thing, an "or" between "and"s would read ambiguously, so it names
 * only the nearest opener's gates: the fewest, then the fewest to master
 * (mastery takes reviews over days; practising starts in a session), then
 * the earliest.
 */
export function opensOnceText(title: string, waits: readonly Waits[]): string {
  const size = (w: Waits) => w.master.length + w.practise.length;
  const sets = waits.filter((w) => size(w) > 0);
  if (sets.length === 0) return `${title} opens once you’ve mastered what it builds on.`;
  if (sets.length > 1 && sets.every((w) => size(w) === 1)) {
    const merged = {
      master: sets.flatMap((w) => w.master),
      practise: sets.flatMap((w) => w.practise),
    };
    return `${title} opens once ${gatesClause(merged, orList, 'or')}.`;
  }
  const nearer = (a: Waits, b: Waits) =>
    size(a) < size(b) || (size(a) === size(b) && a.master.length < b.master.length);
  const nearest = sets.reduce((a, b) => (nearer(b, a) ? b : a));
  return `${title} opens once ${gatesClause(nearest, listOf, 'and')}.`;
}

/**
 * "Already know this? Test out" on a locked module's detail (design §3.4,
 * research/02 rule 7). The gate stays: the module opens on mastery of what it
 * builds on, and this lets an experienced player prove that mastery now
 * instead of waiting a week of spaced reviews. It runs the placement probe
 * on the module's unmet prerequisites, at the test-out bar (every probe
 * fluent), saves through the placement path, and reports per module what it
 * found. A partial or failed test-out lowers nothing.
 *
 * `statuses` are the derived skill statuses (`skillStatuses`); the offer
 * waits for them, and shows only while a first skill is locked by a
 * prerequisite a drill can test. Once started, the test and its result stay
 * put while `onSaved` lets the screen reload what it shows; if the module is
 * still locked, "Test out again" brings the offer back for what's left.
 */
export function TestOut({
  module,
  offer,
  statuses,
  onSaved,
  skills = SKILLS,
  drills = DRILLS,
  probe,
}: {
  module: Module;
  /** The module is locked: offer the test. */
  offer: boolean;
  statuses: ReadonlyMap<string, SkillStatus> | undefined;
  onSaved?: () => void;
  skills?: readonly Skill[];
  drills?: readonly AnyDrillType[];
  /** Passed on to `PlacementTest` (its clock, rng, db and scheduler), for tests. */
  probe?: Pick<ComponentProps<typeof PlacementTest>, 'now' | 'clock' | 'rng' | 'db' | 'scheduler'>;
}) {
  const loaded = useAppStore((s) => s.loaded);
  const headingId = useId();
  // What the test started from. The screen reloads its statuses once the
  // result is saved; the result compares against these.
  const [started, setStarted] = useState<{
    statuses: ReadonlyMap<string, SkillStatus>;
    skillIds: readonly string[];
  } | null>(null);
  const [returned, setReturned] = useState(false);
  const picker = useMemo(() => createDrillPicker(skills, drills), [skills, drills]);
  const needs = useMemo(
    () => (statuses ? needsOf(module, skills, statuses) : []),
    [module, skills, statuses],
  );
  const probed = useMemo(
    () => testOutGroups(needs, skills, (i) => picker.canServe(i)).map((g) => g.id),
    [needs, skills, picker],
  );

  const again = () => {
    setStarted(null);
    setReturned(true);
  };

  if (started) {
    const renderResult = (summary: PlacementSummary) => {
      const opened = opensAfter(module, skills, started.statuses, summary);
      const first = entrySkills(module, skills)[0];
      return (
        <>
          <ul className={styles.report} aria-label="What the test found">
            {testOutReport(summary, skills).map((line) => (
              <li key={line.module} data-result={line.result}>
                {reportSentence(line)}
              </li>
            ))}
          </ul>
          {opened ? (
            <p>
              <strong>{module.title} is open.</strong> Its first skills now join your sessions, and
              what you knew comes back as check-ups, not as new cards.
            </p>
          ) : (
            <p>
              {opensOnceText(
                module.title,
                waitsFor(module, skills, statusesAfter(skills, started.statuses, summary)),
              )}{' '}
              What you passed still counts, and nothing you’d already earned went back.
            </p>
          )}
          {opened && first && (
            <Link to={practiseHref(first.id)} className={styles.primary}>
              Start a {module.title} session
            </Link>
          )}
          {/* Still locked: the offer comes back, scoped to what's left. */}
          {!opened && offer && probed.length > 0 && (
            <button type="button" className={styles.secondary} onClick={again}>
              Test out again
            </button>
          )}
        </>
      );
    };
    return (
      <section className={styles.testOut} aria-labelledby={headingId} data-testid="test-out">
        <h3 id={headingId}>Test out</h3>
        <PlacementTest
          {...probe}
          skills={skills}
          drills={drills}
          testOut={{ skillIds: started.skillIds, renderResult, onSaved }}
        />
      </section>
    );
  }

  if (!offer || !loaded || !statuses || probed.length === 0) return null;
  const titles = probed.map((id) => skills.find((s) => s.id === id)?.title ?? id);
  const opensOnce = opensOnceText(module.title, waitsFor(module, skills, statuses));
  return (
    <section className={styles.testOut} aria-labelledby={headingId} data-testid="test-out">
      <h3 id={headingId}>Already know this?</h3>
      <p>
        {opensOnce} Already there? Prove it now instead of waiting for the reviews: a short test of{' '}
        {listOf(titles)}.
      </p>
      <p className={styles.muted}>
        Every answer has to be quick and correct. Anything you miss stays to practise, and nothing
        you’ve already earned goes back.
      </p>
      <button
        type="button"
        className={styles.primary}
        onClick={() => setStarted({ statuses, skillIds: probed })}
        // Back from "Test out again": focus stays on the action.
        autoFocus={returned}
      >
        Test out
      </button>
    </section>
  );
}
