import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { useAppStore } from '../app-store';
import { DRILLS } from '../drills/registry';
import type { AnyDrillType } from '../drills/types';
import type { Skill } from '../engine/model';
import { SKILLS } from '../engine/skills';
import { Logo } from '../shell/Logo';
import { useSizeClass } from '../shell/size-class';
import { PlacementTest } from './PlacementTest';
import { listOf, probedModules } from './retake';
import onboarding from '../onboarding/Onboarding.module.css';
import styles from './RetakeScreen.module.css';

/**
 * The placement test again, from Settings (design §3.4, §4 step 6): the same
 * adaptive test as onboarding, in the same two-pane layout, full screen. For
 * a learner who skipped it, or took it before more topics could be probed.
 * Retaking is safe: `savePlacement` never sets back what they already have.
 */
export function RetakeScreen({
  skills = SKILLS,
  drills = DRILLS,
}: {
  skills?: readonly Skill[];
  drills?: readonly AnyDrillType[];
}) {
  const loaded = useAppStore((s) => s.loaded);
  const load = useAppStore((s) => s.load);
  const sizeClass = useSizeClass();
  const modules = useMemo(() => probedModules(skills, drills), [skills, drills]);
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  // The test grades on the stored tap time, so wait for the settings.
  if (!loaded) return null;
  return (
    <main className={onboarding.flow} data-size-class={sizeClass}>
      <header className={onboarding.header}>
        <span className={onboarding.brand}>
          <Logo className={onboarding.logo} size={28} /> FretFree
        </span>
        <Link to="/settings" className={`${onboarding.link} ${styles.back}`}>
          Back to Settings
        </Link>
      </header>
      <div className={onboarding.panes}>
        <section className={onboarding.explain}>
          <h1>Retake the placement test</h1>
          <p>
            A short test that skips material you already know. Anything you answer quickly and
            correctly is marked as known, so your sessions move on to what’s new.
          </p>
          {modules.length > 0 && <p>It checks {listOf(modules)}.</p>}
          <p>
            It can’t make you lose progress. Whatever you answer, nothing you’ve already practised
            or mastered goes back, and your reviews stay on schedule.
          </p>
        </section>
        <div className={onboarding.choose}>
          <PlacementTest
            skills={skills}
            drills={drills}
            doneAction={
              <Link to="/learn" className={`${onboarding.primary} ${styles.button}`}>
                See your skills in Learn
              </Link>
            }
          />
        </div>
      </div>
    </main>
  );
}
