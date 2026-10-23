import { liveQuery } from 'dexie';
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../../app-store';
import { LearningLegend } from '../../../components/learning-legend/LearningLegend';
import { ENGINE_CONFIG, SKILLS, type CardRecord, type Skill } from '../../../engine';
import { MODULES, moduleRank, type Module } from '../../../engine/frontier';
import type { Goal } from '../../../engine/model';
import { latestOutcomes, progressBySkill } from '../../../engine/progress';
import { allCards, getDb } from '../../../storage';
import { MasteryRing } from '../../learn/MasteryRing';
import type { PanelProps } from '../registry';
import styles from './topics.module.css';

export const id = 'topics';
export const order = 8;
export const title = 'Modules';

/**
 * Names for the curriculum's topic IDs (research/03), shown only under a
 * module that holds more than one topic. Unknown IDs show as themselves.
 */
export const TOPIC_TITLES: Readonly<Record<string, string>> = {
  F1: 'Notes and steps',
  F2: 'Natural notes',
  F3: 'Fret markers',
  F4: 'Rhythm',
  C1: 'Octaves',
  C2: 'All notes',
  C3: 'Intervals',
  C4: 'Major scale',
  C5: 'Chord building',
  C6: 'CAGED',
  C7: 'Pentatonic',
  C8: 'Diatonic harmony',
  C9: 'Common progressions',
  C10: 'Capo and transposition',
  I1: 'Triads on string sets',
  I2: 'Arpeggios',
  I3: 'Key signatures',
  I4: 'Minor keys',
  I5: 'Chord function',
  I6: 'Ear training',
  I7: 'Scale positions',
  TAB: 'Reading tab',
  T1: 'Time signatures',
  T2: 'Simple and compound meter',
  T4: 'Meter by ear',
  T7: 'Odd meters',
};

/** Card counts: all of them, those learning (stable ones included) and those stable. */
interface Counts {
  itemCount: number;
  /** Cards learning or stable (M1-34's definition, `engine/progress`). */
  learningCount: number;
  /** Cards whose FSRS stability has reached the mastery threshold. */
  stableCount: number;
}

export interface TopicView extends Counts {
  topic: string;
  title: string;
}

export interface ModuleProgressView extends Counts {
  /** The Learn module's ID, or the topic ID of a topic no module holds. */
  id: string;
  /** Learn's module title, so Progress and Learn use one name (M10-09). */
  title: string;
  /** The module's topics, when it holds more than one; otherwise empty. */
  topics: TopicView[];
}

const zero = (): Counts => ({ itemCount: 0, learningCount: 0, stableCount: 0 });

function add(into: Counts, from: Counts): void {
  into.itemCount += from.itemCount;
  into.learningCount += from.learningCount;
  into.stableCount += from.stableCount;
}

/**
 * Learning and stable counts per started module, titled as on Learn: one with
 * a card in any of its topics. A started module counts every skill it holds,
 * as its Learn ring does, and lists its topics underneath when it has more
 * than one. Modules follow Learn's order for the learner's `goal`
 * (`moduleRank`), then their first skill's frontier order. Counts are
 * capped per skill at its item count, as on the Learn map, and cards of
 * skills that no longer exist are ignored. A topic no module holds stands as
 * its own group.
 */
export function buildModules(
  skills: readonly Skill[],
  cards: readonly CardRecord[],
  outcomes: ReadonlyMap<string, boolean>,
  stabilityDays: number = ENGINE_CONFIG.mastery.stabilityDays,
  { modules = MODULES, goal = 'general' }: { modules?: readonly Module[]; goal?: Goal } = {},
): ModuleProgressView[] {
  const moduleOf = new Map(modules.flatMap((m) => m.topics.map((t) => [t, m] as const)));
  const groupOf = (topic: string) => moduleOf.get(topic)?.id ?? topic;
  const started = new Set(
    cards.flatMap((c) => {
      const topic = skills.find((s) => s.id === c.skillId)?.topic;
      return topic === undefined ? [] : [groupOf(topic)];
    }),
  );
  const progress = progressBySkill(cards, outcomes, stabilityDays);
  const byModule = new Map<string, ModuleProgressView & { order: number }>();
  const byTopic = new Map<string, TopicView>();
  for (const skill of skills) {
    const group = groupOf(skill.topic);
    if (!started.has(group)) continue;
    const itemCount = skill.items().length;
    const p = progress.get(skill.id);
    const counts = {
      itemCount,
      learningCount: Math.min(itemCount, p?.learning ?? 0),
      stableCount: Math.min(itemCount, p?.stable ?? 0),
    };
    const module = moduleOf.get(skill.topic);
    const view = byModule.get(group) ?? {
      id: group,
      title: module?.title ?? TOPIC_TITLES[skill.topic] ?? skill.topic,
      ...zero(),
      topics: [],
      order: skill.order,
    };
    add(view, counts);
    view.order = Math.min(view.order, skill.order);
    byModule.set(group, view);
    if (module && module.topics.length > 1) {
      let topic = byTopic.get(skill.topic);
      if (!topic) {
        topic = { topic: skill.topic, title: TOPIC_TITLES[skill.topic] ?? skill.topic, ...zero() };
        byTopic.set(skill.topic, topic);
        view.topics.push(topic);
      }
      add(topic, counts);
    }
  }
  return [...byModule.values()]
    .sort((a, b) => {
      // A topic no module holds ranks last (an infinite rank), so compare
      // ranks without subtracting them.
      const [ra, rb] = [moduleRank(a.id, goal), moduleRank(b.id, goal)];
      return ra === rb ? a.order - b.order : ra < rb ? -1 : 1;
    })
    .map(({ order: _order, topics, ...view }) => ({
      ...view,
      // In the module's own order (Learn's), not the order skills came in.
      topics: topics.sort(
        (a, b) =>
          (moduleOf.get(a.topic)?.topics.indexOf(a.topic) ?? 0) -
          (moduleOf.get(b.topic)?.topics.indexOf(b.topic) ?? 0),
      ),
    }));
}

function countsText(c: Counts): string {
  return `${c.learningCount} learning · ${c.stableCount} stable of ${c.itemCount}`;
}

const share = (n: number, of: number) => (of === 0 ? 0 : n / of);

async function loadTopicData() {
  const db = getDb();
  const [cards, logs] = await Promise.all([allCards(db), db.reviewLogs.toArray()]);
  return { cards, outcomes: latestOutcomes(logs) };
}

/**
 * Every module the learner has started, titled as on Learn, with learning and
 * stable counts (design §7 Progress, research/02 rule 15), so interval and
 * octave work shows here and not only on the notes heatmap. "Learning ·
 * Stable", never "learned": one good session isn't retention (illusion of
 * competence). The legend says what the two words mean.
 */
export function Panel({ revision }: PanelProps) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadTopicData>> | null>(null);
  const goal = useAppStore((s) => s.settings.goal);

  useEffect(() => {
    const sub = liveQuery(loadTopicData).subscribe({
      next: setData,
      error: (e: unknown) => console.error('Loading topic progress failed', e),
    });
    return () => sub.unsubscribe();
  }, [revision]);

  const modules = useMemo(
    () => (data ? buildModules(SKILLS, data.cards, data.outcomes, undefined, { goal }) : []),
    [data, goal],
  );

  return (
    <div data-testid="topics-panel" data-loaded={data !== null}>
      {data && modules.length === 0 ? (
        <p className={styles.empty}>Practise a session to see each module’s progress here.</p>
      ) : (
        <>
          <LearningLegend className={styles.legend} />
          <ul className={styles.list}>
            {modules.map((m) => (
              <li key={m.id} className={styles.topic} data-testid={`progress-module-${m.id}`}>
                <MasteryRing
                  learning={share(m.learningCount, m.itemCount)}
                  stable={share(m.stableCount, m.itemCount)}
                  state="open"
                  label={m.title}
                />
                <div>
                  <h3 className={styles.title}>{m.title}</h3>
                  <p className={styles.meta} data-testid="topic-counts">
                    {countsText(m)}
                  </p>
                  {m.topics.length > 0 && (
                    <ul className={styles.parts} aria-label={`${m.title} topics`}>
                      {m.topics.map((t) => (
                        <li key={t.topic} data-testid={`topic-${t.topic}`}>
                          {t.title}: <span data-testid="topic-part-counts">{countsText(t)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
