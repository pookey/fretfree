import { useId, useMemo, useState, type ComponentProps } from 'react';
import { Link } from 'react-router';
import { useAppStore } from '../app-store';
import { DRILLS } from '../drills/registry';
import type { AnyDrillType } from '../drills/types';
import type { Module } from '../engine/frontier';
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
  testOutGroups,
  testOutReport,
  unmetPrerequisites,
} from './test-out';
import styles from './TestOut.module.css';

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
 * put while `onSaved` lets the screen reload what it shows.
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
  const picker = useMemo(() => createDrillPicker(skills, drills), [skills, drills]);
  const needs = useMemo(
    () => (statuses ? unmetPrerequisites(module, skills, statuses) : []),
    [module, skills, statuses],
  );
  const probed = useMemo(
    () => testOutGroups(needs, skills, (i) => picker.canServe(i)).map((g) => g.id),
    [needs, skills, picker],
  );

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
              what you knew comes back as check-ups, not lessons.
            </p>
          ) : (
            <p>
              {module.title} opens once those are mastered. What you passed still counts, and
              nothing you’d already earned went back.
            </p>
          )}
          {opened && first && (
            <Link to={practiseHref(first.id)} className={styles.primary}>
              Start a {module.title} session
            </Link>
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
  return (
    <section className={styles.testOut} aria-labelledby={headingId} data-testid="test-out">
      <h3 id={headingId}>Already know this?</h3>
      <p>
        {module.title} opens once you’ve mastered what it builds on. If you already have, prove it
        now instead of waiting for the reviews: a short test of {listOf(titles)}.
      </p>
      <p className={styles.muted}>
        Every answer has to be quick and correct. Anything you miss stays to practise, and nothing
        you’ve already earned goes back.
      </p>
      <button
        type="button"
        className={styles.primary}
        onClick={() => setStarted({ statuses, skillIds: probed })}
      >
        Test out
      </button>
    </section>
  );
}
