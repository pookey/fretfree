import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { Rating, State } from 'ts-fsrs';
import { createScheduler, type CardRecord, type Skill } from '../../../engine';
import { getDb, recordAnswer } from '../../../storage';
import { PROGRESS_PANELS } from '../registry';
import { MODULES } from '../../../engine/frontier';
import { Panel, TOPIC_TITLES, buildModules, id, order, title } from './topics';

const scheduler = createScheduler({ enableFuzz: false });
const NOW = new Date('2026-10-19T12:00:00Z');

function skill(id: string, topic: string, skillOrder: number, items: number): Skill {
  return {
    id,
    topic,
    order: skillOrder,
    title: id,
    prerequisites: [],
    drillTypes: [],
    items: () => Array.from({ length: items }, (_, i) => ({ id: `${id}#${i}`, skillId: id })),
  };
}

function card(itemId: string, skillId: string, stability = 2, state = State.Review): CardRecord {
  const c = scheduler.newCard({ id: itemId, skillId }, NOW);
  return { ...c, fsrs: { ...c.fsrs, stability, state } };
}

const SKILLS = [
  skill('C3.thirds', 'C3', 1300, 4),
  skill('C1.octaves', 'C1', 1100, 3),
  skill('C1.double-octaves', 'C1', 1120, 2),
  skill('F2.string6', 'F2', 200, 5),
];

afterEach(async () => {
  const db = getDb();
  await Promise.all([db.cards.clear(), db.reviewLogs.clear()]);
});

describe('buildModules', () => {
  it('lists only started modules, titled as on Learn, in frontier order', () => {
    const cards = [
      card('C3.thirds#0', 'C3.thirds'),
      card('C3.thirds#1', 'C3.thirds', 30),
      card('C1.octaves#0', 'C1.octaves'),
      card('C1.double-octaves#0', 'C1.double-octaves', 30),
    ];
    const outcomes = new Map([
      ['C3.thirds#0', true],
      ['C1.octaves#0', false], // a miss drops it out of learning
    ]);
    expect(buildModules(SKILLS, cards, outcomes, 21)).toEqual([
      {
        id: 'notes-2',
        title: 'Whole neck',
        itemCount: 5,
        learningCount: 1,
        stableCount: 1,
        // Whole neck holds two topics, so its started one is listed under it.
        topics: [{ topic: 'C1', title: 'Octaves', itemCount: 5, learningCount: 1, stableCount: 1 }],
      },
      // Intervals is one topic: its module row says it all.
      {
        id: 'intervals',
        title: 'Intervals',
        itemCount: 4,
        learningCount: 2,
        stableCount: 1,
        topics: [],
      },
    ]);
  });

  it('counts every topic of a started module, in the module’s own order', () => {
    const skills = [
      skill('F3.markers', 'F3', 300, 2),
      skill('F1.alphabet', 'F1', 100, 3),
      skill('F2.string6', 'F2', 200, 5),
    ];
    const cards = [card('F2.string6#0', 'F2.string6', 0, State.New)];
    const [neck] = buildModules(skills, cards, new Map(), 21);
    expect(neck).toMatchObject({ id: 'notes-1', title: 'Neck basics', itemCount: 10 });
    expect(neck?.topics.map((t) => [t.title, t.itemCount, t.learningCount])).toEqual([
      ['Notes and steps', 3, 0],
      ['Natural notes', 5, 0],
      ['Fret markers', 2, 0],
    ]);
  });

  it('caps counts at the item count, ignores unknown skills and names unknown topics by ID', () => {
    const odd = skill('Z9.new', 'Z9', 9000, 1);
    const cards = [
      card('Z9.new#0', 'Z9.new'),
      card('Z9.new#stale', 'Z9.new'),
      card('gone#0', 'Gone.skill'),
    ];
    expect(buildModules([odd], cards, new Map(), 21)).toEqual([
      { id: 'Z9', title: 'Z9', itemCount: 1, learningCount: 1, stableCount: 0, topics: [] },
    ]);
    expect(buildModules(SKILLS, [], new Map())).toEqual([]);
  });

  it('names every topic the skill registry uses, and every one sits in a Learn module', async () => {
    const { SKILLS: registered } = await import('../../../engine');
    const held = new Set(MODULES.flatMap((m) => m.topics));
    for (const s of registered) {
      expect(TOPIC_TITLES[s.topic], s.topic).toBeTruthy();
      expect(held.has(s.topic), s.topic).toBe(true);
    }
  });
});

describe('Progress topics panel', () => {
  it('is registered after the mastery map and its over-time charts, ahead of the stats', () => {
    const ids = PROGRESS_PANELS.map((p) => p.id);
    expect(ids.indexOf(id)).toBe(ids.indexOf('coming-up') + 1);
    expect(ids.indexOf('stats')).toBe(ids.indexOf(id) + 1);
    expect(title).toBe('Modules');
    expect(PROGRESS_PANELS.filter((p) => p.order === order)).toHaveLength(1);
  });

  it('starts empty, then lists a module live as answers are stored, with the legend', async () => {
    render(<Panel revision={0} onDataChanged={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId('topics-panel')).toHaveAttribute('data-loaded', 'true'),
    );
    expect(screen.getByText(/Practise a session/)).toBeInTheDocument();

    const now = new Date();
    const itemId = 'interval-name:M3@s6→s5';
    const reviewed = scheduler.review(
      scheduler.newCard({ id: itemId, skillId: 'C3.thirds' }, now),
      Rating.Good,
      now,
    );
    await act(() =>
      recordAnswer(getDb(), {
        card: reviewed,
        log: {
          itemId,
          skillId: 'C3.thirds',
          drillType: 'interval-namer',
          correct: true,
          responseMs: 1500,
          rating: Rating.Good,
          hintUsed: false,
          answerGiven: 'M3',
          at: now,
        },
      }),
    );

    const row = await screen.findByTestId('progress-module-intervals', {}, { timeout: 5000 });
    expect(within(row).getByRole('heading', { name: 'Intervals' })).toBeInTheDocument();
    expect(within(row).getByTestId('topic-counts')).toHaveTextContent(
      /^1 learning · 0 stable of \d+$/,
    );
    expect(within(row).getByRole('img')).toHaveAccessibleName(
      /^Intervals: [1-9]\d*% learning, 0% stable$/,
    );
    // Counts never claim learned or mastered; only the legend defines mastered.
    expect(within(screen.getByRole('list')).queryByText(/learned|mastered/i)).toBeNull();
    const legend = screen.getByRole('note', { name: 'What the numbers mean' });
    expect(
      within(legend)
        .getAllByRole('term')
        .map((t) => t.textContent),
    ).toEqual(['Learning', 'Stable', 'Mastered']);
  });

  it('titles each module row as Learn does, with its topics underneath', async () => {
    const now = new Date();
    for (const [itemId, skillId] of [
      ['octave:s6f3→s4', 'C1.octaves'],
      ['interval-name:M3@s6→s5', 'C3.thirds'],
    ] as const) {
      await recordAnswer(getDb(), {
        card: scheduler.review(scheduler.newCard({ id: itemId, skillId }, now), Rating.Good, now),
        log: {
          itemId,
          skillId,
          drillType: 'test',
          correct: true,
          responseMs: 1500,
          rating: Rating.Good,
          hintUsed: false,
          answerGiven: '',
          at: now,
        },
      });
    }
    render(<Panel revision={0} onDataChanged={() => {}} />);
    const neck = await screen.findByTestId('progress-module-notes-2', {}, { timeout: 5000 });
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['Whole neck', 'Intervals']);
    const learn = new Set(MODULES.map((m) => m.title));
    for (const t of titles) expect(learn.has(t!), t!).toBe(true);
    const topics = within(neck).getByRole('list', { name: 'Whole neck topics' });
    expect(within(topics).getByTestId('topic-C1')).toHaveTextContent(
      /^Octaves: 1 learning · 0 stable of \d+$/,
    );
    expect(within(topics).getByTestId('topic-C2')).toHaveTextContent(
      /^All notes: 0 learning · 0 stable of \d+$/,
    );
  });
});
