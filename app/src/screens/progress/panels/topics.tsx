import { liveQuery } from 'dexie';
import { useEffect, useMemo, useState } from 'react';
import { ENGINE_CONFIG, SKILLS, type CardRecord, type Skill } from '../../../engine';
import { latestOutcomes, progressBySkill } from '../../../engine/progress';
import { allCards, getDb } from '../../../storage';
import { MasteryRing } from '../../learn/MasteryRing';
import type { PanelProps } from '../registry';
import styles from './topics.module.css';

export const id = 'topics';
export const order = 8;
export const title = 'Topics';

/** Short names for the curriculum's topic IDs (research/03). Unknown IDs show as themselves. */
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
  C9: 'Progressions',
  C10: 'Capo and transposition',
  I1: 'Triads on string sets',
  I2: 'Arpeggios',
  I3: 'Keys',
  I4: 'Minor keys',
  I5: 'Chord function',
  I6: 'Ear training',
  I7: 'Scale positions',
  TAB: 'Reading tab',
};

export interface TopicView {
  topic: string;
  title: string;
  itemCount: number;
  /** Items learning or stable (M1-34's definition, `engine/progress`). */
  learningCount: number;
  /** Items whose FSRS stability has reached the mastery threshold. */
  stableCount: number;
}

/**
 * Learning and stable counts per started topic: one with at least one card.
 * Topics follow their first skill's frontier order. Counts are capped per
 * skill at its item count, as on the Learn map, and cards of skills that no
 * longer exist are ignored.
 */
export function buildTopics(
  skills: readonly Skill[],
  cards: readonly CardRecord[],
  outcomes: ReadonlyMap<string, boolean>,
  stabilityDays: number = ENGINE_CONFIG.mastery.stabilityDays,
): TopicView[] {
  const started = new Set(
    cards.flatMap((c) => skills.find((s) => s.id === c.skillId)?.topic ?? []),
  );
  const progress = progressBySkill(cards, outcomes, stabilityDays);
  const byTopic = new Map<string, TopicView & { order: number }>();
  for (const skill of skills) {
    if (!started.has(skill.topic)) continue;
    const itemCount = skill.items().length;
    const p = progress.get(skill.id);
    const view = byTopic.get(skill.topic) ?? {
      topic: skill.topic,
      title: TOPIC_TITLES[skill.topic] ?? skill.topic,
      itemCount: 0,
      learningCount: 0,
      stableCount: 0,
      order: skill.order,
    };
    view.itemCount += itemCount;
    view.learningCount += Math.min(itemCount, p?.learning ?? 0);
    view.stableCount += Math.min(itemCount, p?.stable ?? 0);
    view.order = Math.min(view.order, skill.order);
    byTopic.set(skill.topic, view);
  }
  return [...byTopic.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...view }) => view);
}

async function loadTopicData() {
  const db = getDb();
  const [cards, logs] = await Promise.all([allCards(db), db.reviewLogs.toArray()]);
  return { cards, outcomes: latestOutcomes(logs) };
}

/**
 * Every topic the learner has started, with learning and stable counts
 * (design §7 Progress, research/02 rule 15), so interval and octave work
 * shows here and not only on the notes heatmap. "Learning · Stable", never
 * "learned": one good session isn't retention (illusion of competence).
 */
export function Panel({ revision }: PanelProps) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadTopicData>> | null>(null);

  useEffect(() => {
    const sub = liveQuery(loadTopicData).subscribe({
      next: setData,
      error: (e: unknown) => console.error('Loading topic progress failed', e),
    });
    return () => sub.unsubscribe();
  }, [revision]);

  const topics = useMemo(
    () => (data ? buildTopics(SKILLS, data.cards, data.outcomes) : []),
    [data],
  );

  return (
    <div data-testid="topics-panel" data-loaded={data !== null}>
      {data && topics.length === 0 ? (
        <p className={styles.empty}>Practise a session to see each topic’s progress here.</p>
      ) : (
        <ul className={styles.list}>
          {topics.map((t) => (
            <li key={t.topic} className={styles.topic} data-testid={`topic-${t.topic}`}>
              <MasteryRing
                learning={t.itemCount === 0 ? 0 : t.learningCount / t.itemCount}
                stable={t.itemCount === 0 ? 0 : t.stableCount / t.itemCount}
                state="open"
                label={t.title}
              />
              <div>
                <h3 className={styles.title}>{t.title}</h3>
                <p className={styles.meta} data-testid="topic-counts">
                  {t.learningCount} learning · {t.stableCount} stable of {t.itemCount}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
