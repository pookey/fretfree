import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { Rating, State } from 'ts-fsrs';
import { createScheduler, type CardRecord, type Skill } from '../../../engine';
import { getDb, recordAnswer } from '../../../storage';
import { PROGRESS_PANELS } from '../registry';
import { Panel, TOPIC_TITLES, buildTopics, id, order, title } from './topics';

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

describe('buildTopics', () => {
  it('lists only started topics, in frontier order, with learning and stable counts', () => {
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
    expect(buildTopics(SKILLS, cards, outcomes, 21)).toEqual([
      { topic: 'C1', title: 'Octaves', itemCount: 5, learningCount: 1, stableCount: 1 },
      { topic: 'C3', title: 'Intervals', itemCount: 4, learningCount: 2, stableCount: 1 },
    ]);
  });

  it('shows a started topic with nothing learning yet as zero, not hidden', () => {
    const cards = [card('F2.string6#0', 'F2.string6', 0, State.New)];
    expect(buildTopics(SKILLS, cards, new Map(), 21)).toEqual([
      { topic: 'F2', title: 'Natural notes', itemCount: 5, learningCount: 0, stableCount: 0 },
    ]);
  });

  it('caps counts at the item count, ignores unknown skills and names unknown topics by ID', () => {
    const odd = skill('Z9.new', 'Z9', 9000, 1);
    const cards = [
      card('Z9.new#0', 'Z9.new'),
      card('Z9.new#stale', 'Z9.new'),
      card('gone#0', 'Gone.skill'),
    ];
    expect(buildTopics([odd], cards, new Map(), 21)).toEqual([
      { topic: 'Z9', title: 'Z9', itemCount: 1, learningCount: 1, stableCount: 0 },
    ]);
    expect(buildTopics(SKILLS, [], new Map())).toEqual([]);
  });

  it('names every topic the skill registry uses', async () => {
    const { SKILLS: registered } = await import('../../../engine');
    for (const s of registered) expect(TOPIC_TITLES[s.topic], s.topic).toBeTruthy();
  });
});

describe('Progress topics panel', () => {
  it('is registered after the mastery map, ahead of the stats', () => {
    const ids = PROGRESS_PANELS.map((p) => p.id);
    expect(ids.indexOf(id)).toBe(ids.indexOf('heatmap') + 1);
    expect(ids.indexOf('stats')).toBe(ids.indexOf(id) + 1);
    expect(title).toBe('Topics');
    expect(PROGRESS_PANELS.filter((p) => p.order === order)).toHaveLength(1);
  });

  it('starts empty, then lists a topic live as answers are stored', async () => {
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

    const row = await screen.findByTestId('topic-C3', {}, { timeout: 5000 });
    expect(within(row).getByRole('heading', { name: 'Intervals' })).toBeInTheDocument();
    expect(within(row).getByTestId('topic-counts')).toHaveTextContent(
      /^1 learning · 0 stable of \d+$/,
    );
    expect(within(row).getByRole('img')).toHaveAccessibleName(
      /^Intervals: [1-9]\d*% learning, 0% stable$/,
    );
    expect(screen.queryByText(/learned|mastered/i)).toBeNull();
  });
});
