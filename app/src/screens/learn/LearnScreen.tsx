import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAppStore } from '../../app-store';
import { SKILLS, type CardRecord, type Goal, type SkillStatus } from '../../engine';
import { GOAL_OPTIONS } from '../../onboarding/options';
import { ScreenLayout } from '../../shell/ScreenLayout';
import { useSizeClass } from '../../shell/size-class';
import { allCards, getDb, getSkillStates } from '../../storage';
import { MasteryRing } from './MasteryRing';
import { ModuleDetail } from './ModuleDetail';
import { MODULE_STATE_LABEL, buildMap, defaultModule, percent, type ModuleView } from './map-model';
import styles from './Learn.module.css';

interface LearnData {
  stored: Map<string, SkillStatus>;
  cards: CardRecord[];
}

function useLearnData(): LearnData | null {
  const [data, setData] = useState<LearnData | null>(null);
  useEffect(() => {
    let live = true;
    const db = getDb();
    void Promise.all([getSkillStates(db), allCards(db)]).then(([states, cards]) => {
      if (!live) return;
      setData({ stored: new Map([...states.values()].map((s) => [s.skillId, s.status])), cards });
    });
    return () => {
      live = false;
    };
  }, []);
  return data;
}

function ModuleCard({
  view,
  selected,
  replace,
}: {
  view: ModuleView;
  selected: boolean;
  replace: boolean;
}) {
  const { module } = view;
  const skills = view.skills.length;
  return (
    <li>
      <Link
        to={{ search: `?module=${module.id}` }}
        replace={replace}
        className={styles.moduleCard}
        data-state={view.state}
        data-testid={`module-${module.id}`}
        aria-current={selected ? 'true' : undefined}
      >
        <MasteryRing fraction={view.mastery} state={view.state} label={module.title} />
        <span className={styles.moduleText}>
          <span className={styles.moduleTitle}>{module.title}</span>
          <span className={styles.moduleMeta}>
            {MODULE_STATE_LABEL[view.state]}
            {skills > 0 && ` · ${view.masteredSkills}/${skills} skills · ${percent(view.mastery)}%`}
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Learn (design §7): the module map with a mastery ring per module, ordered
 * by the learner's goal. Two panes on iPad — the map on the left, the picked
 * module's skill detail on the right; on compact the detail replaces the map.
 * Locked modules open like any other (soft unlocking, §3.4).
 */
export function LearnScreen() {
  const goal = useAppStore((s) => s.settings.goal);
  const update = useAppStore((s) => s.update);
  const sizeClass = useSizeClass();
  const compact = sizeClass === 'compact';
  const [params] = useSearchParams();
  const data = useLearnData();
  const map = useMemo(
    () =>
      buildMap({
        skills: SKILLS,
        goal,
        stored: data?.stored ?? new Map(),
        cards: data?.cards ?? [],
      }),
    [goal, data],
  );
  const picked = map.find((m) => m.module.id === params.get('module'));
  const selected = picked ?? (compact ? undefined : defaultModule(map));
  const showMap = !compact || !selected;

  return (
    <ScreenLayout title="Learn">
      <div className={styles.learn} data-size-class={sizeClass} data-loaded={data !== null}>
        {showMap && (
          <section className={styles.map} aria-label="Modules">
            <label className={styles.goal}>
              <span>Ordered for your goal</span>
              <select
                value={goal}
                data-testid="goal-select"
                onChange={(e) => void update({ goal: e.target.value as Goal })}
              >
                {GOAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <ul className={styles.modules}>
              {map.map((view) => (
                <ModuleCard
                  key={view.module.id}
                  view={view}
                  selected={view === selected}
                  replace={!compact}
                />
              ))}
            </ul>
          </section>
        )}
        {selected && (
          <div className={styles.detailPane}>
            {compact && (
              <Link to="/learn" className={styles.back}>
                ← All modules
              </Link>
            )}
            <ModuleDetail view={selected} />
          </div>
        )}
      </div>
    </ScreenLayout>
  );
}
