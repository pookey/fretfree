import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAppStore } from '../../app-store';
import { LearningLegend } from '../../components/learning-legend/LearningLegend';
import { DRILLS } from '../../drills/registry';
import { SKILLS, type CardRecord, type Goal, type SkillStatus } from '../../engine';
import type { StatusOverlay } from '../../engine/overlay';
import { latestOutcomes } from '../../engine/progress';
import { startWithSoundSkills } from '../../engine/start-with-sound';
import { GOAL_OPTIONS } from '../../onboarding/options';
import { testOutGroups, unmetPrerequisites } from '../../placement/test-out';
import { createDrillPicker } from '../../session/drill-picker';
import { ScreenLayout } from '../../shell/ScreenLayout';
import { useSizeClass } from '../../shell/size-class';
import { allCards, getDb, getSkillStates } from '../../storage';
import { useStatusOverlay } from '../settings/DeveloperTools';
import { MasteryRing } from './MasteryRing';
import { ModuleDetail } from './ModuleDetail';
import {
  MODULE_STATE_LABEL,
  buildMap,
  defaultModule,
  percent,
  skillStatuses,
  type ModuleView,
} from './map-model';
import styles from './Learn.module.css';

const PICKER = createDrillPicker(SKILLS, DRILLS);
// The developer switch (M1-36) exists in development builds only; production drops it.
const useOverlay: () => StatusOverlay | null = import.meta.env.DEV ? useStatusOverlay : () => null;

interface LearnData {
  stored: Map<string, SkillStatus>;
  cards: CardRecord[];
  outcomes: Map<string, boolean>;
}

/** `version`: bump it to load again, e.g. after a test-out. */
function useLearnData(version = 0): LearnData | null {
  const [data, setData] = useState<LearnData | null>(null);
  useEffect(() => {
    let live = true;
    const db = getDb();
    void Promise.all([getSkillStates(db), allCards(db), db.reviewLogs.toArray()]).then(
      ([states, cards, logs]) => {
        if (!live) return;
        setData({
          stored: new Map([...states.values()].map((s) => [s.skillId, s.status])),
          cards,
          outcomes: latestOutcomes(logs),
        });
      },
    );
    return () => {
      live = false;
    };
  }, [version]);
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
        <MasteryRing
          learning={view.learning}
          stable={view.mastery}
          state={view.state}
          label={module.title}
        />
        <span className={styles.moduleText}>
          <span className={styles.moduleTitle}>{module.title}</span>
          <span className={styles.moduleMeta}>
            {MODULE_STATE_LABEL[view.state]}
            {skills > 0 &&
              ` · ${view.masteredSkills}/${skills} skills mastered · ${percent(view.learning)}% learning · ${percent(view.mastery)}% stable`}
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * The first locked module, in the map's (goal) order, that has a test-out to
 * offer: a first skill locked by a prerequisite a drill can test. The same
 * check `TestOut` makes before it offers one in the module's detail.
 */
export function firstTestOut(
  map: readonly ModuleView[],
  statuses: ReadonlyMap<string, SkillStatus>,
): ModuleView | undefined {
  return map.find(
    (view) =>
      view.state === 'locked' &&
      view.skills.length > 0 &&
      testOutGroups(unmetPrerequisites(view.module, SKILLS, statuses), SKILLS, PICKER.canServe)
        .length > 0,
  );
}

/**
 * Learn (design §7): the module map with a mastery ring per module, ordered
 * by the learner's goal. Two panes on iPad — the map on the left, the picked
 * module's skill detail on the right; on compact the detail replaces the map.
 * Locked modules open like any other (soft unlocking, §3.4). The map's
 * header offers a test-out of the first locked module (M10-16): it opens that
 * module with its "Already know this?" offer in view and focused.
 */
export function LearnScreen() {
  const goal = useAppStore((s) => s.settings.goal);
  const startWithSound = useAppStore((s) => s.settings.startWithSound);
  // Gated as the session runner gates them ("start with sound" opens the ear track).
  const skills = useMemo(() => startWithSoundSkills(SKILLS, startWithSound), [startWithSound]);
  const update = useAppStore((s) => s.update);
  const loaded = useAppStore((s) => s.loaded);
  const sizeClass = useSizeClass();
  const compact = sizeClass === 'compact';
  const [params] = useSearchParams();
  const [version, setVersion] = useState(0);
  const data = useLearnData(version);
  const statuses = useMemo(() => data && skillStatuses(skills, data.stored), [skills, data]);
  const overlay = useOverlay();
  const map = useMemo(
    () =>
      buildMap({
        skills,
        goal,
        stored: data?.stored ?? new Map(),
        cards: data?.cards ?? [],
        outcomes: data?.outcomes,
        canServe: PICKER.canServe,
        overlay,
      }),
    [skills, goal, data, overlay],
  );
  const picked = map.find((m) => m.module.id === params.get('module'));
  const selected = picked ?? (compact ? undefined : defaultModule(map));
  const showMap = !compact || !selected;
  const testOut = loaded && statuses ? firstTestOut(map, statuses) : undefined;
  // The module whose test-out offer to bring into view once its detail shows.
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const detailPane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!jumpTo || selected?.module.id !== jumpTo) return;
    const offer = detailPane.current?.querySelector<HTMLElement>('[data-testid="test-out"]');
    if (!offer) return;
    offer.scrollIntoView({ block: 'nearest' });
    offer.querySelector<HTMLButtonElement>('button')?.focus();
    setJumpTo(null);
  }, [jumpTo, selected]);

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
            {testOut && (
              <p className={styles.testOutEntry} data-testid="learn-test-out">
                <span>Already play some of this?</span>
                <Link
                  to={{ search: `?module=${testOut.module.id}` }}
                  replace={!compact}
                  className={styles.testOutLink}
                  onClick={() => setJumpTo(testOut.module.id)}
                >
                  Test out of {testOut.module.title}
                </Link>
              </p>
            )}
            {/* Defined where the numbers first appear (copy audit, screens §9). */}
            <LearningLegend className={styles.legend} />
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
          <div className={styles.detailPane} ref={detailPane}>
            {compact && (
              <Link to="/learn" replace className={styles.back}>
                ← All modules
              </Link>
            )}
            <ModuleDetail
              view={selected}
              statuses={statuses ?? undefined}
              onChange={() => setVersion((v) => v + 1)}
            />
          </div>
        )}
      </div>
    </ScreenLayout>
  );
}
