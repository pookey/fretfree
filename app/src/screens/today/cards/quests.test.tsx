import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Rating } from 'ts-fsrs';
import fixSlips from '../../../engine/gamification/quests/fix-slips';
import fluent from '../../../engine/gamification/quests/fluent';
import newGround from '../../../engine/gamification/quests/new-ground';
import { FretworkDB, getEvents, logEvent } from '../../../storage';
import { Card } from './quests';

const now = new Date(2026, 9, 18, 18, 0);
const templates = [fixSlips, fluent, newGround];
let db: FretworkDB;
let n = 0;

beforeEach(async () => {
  db = new FretworkDB(`quests-card-test-${n++}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

/** A fluent, unguided first answer to a new item, as the runner stores it. */
async function learn(itemId: string, minute: number): Promise<void> {
  const at = new Date(2026, 9, 18, 9, minute);
  await db.reviewLogs.add({
    itemId,
    skillId: 'F2.string6-naturals',
    drillType: 'name-the-note',
    correct: true,
    responseMs: 600,
    rating: Rating.Easy,
    hintUsed: false,
    answerGiven: 'A',
    at,
  });
  await logEvent(
    db,
    {
      type: 'answer',
      itemId,
      skillId: 'F2.string6-naturals',
      correct: true,
      rating: Rating.Easy,
      kind: 'new',
      xp: 12,
    },
    at,
  );
}

const renderCard = () => render(<Card db={db} templates={templates} now={() => now} />);

describe('Today daily quests', () => {
  it("lists the day's three quests with their progress and bonus", async () => {
    renderCard();
    const section = screen.getByRole('region', { name: 'Daily quests' });
    expect(await within(section).findAllByTestId('quest')).toHaveLength(3);
    expect(screen.getByTestId('quests-tally')).toHaveTextContent('0 of 3 done');
    const bar = screen.getByRole('progressbar', { name: 'Learn 3 new items' });
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
    expect(bar).toHaveAttribute('aria-valuetext', '0 of 3');
    const quest = bar.closest('li')!;
    expect(quest).toHaveAttribute('data-done', 'false');
    expect(within(quest).getByText('+20 XP')).toBeInTheDocument();
    expect(within(quest).getByRole('heading', { level: 3 })).toHaveTextContent('Learn 3 new items');
  });

  it('completes a quest as practice lands, announcing its bonus XP once', async () => {
    renderCard();
    expect(await screen.findAllByTestId('quest')).toHaveLength(3);
    for (const [i, id] of ['a', 'b', 'c'].entries()) await learn(id, i);

    const bar = screen.getByRole('progressbar', { name: 'Learn 3 new items' });
    await expect.poll(() => bar.getAttribute('aria-valuetext')).toBe('Done');
    expect(bar.closest('li')).toHaveAttribute('data-done', 'true');
    expect(screen.getByTestId('quests-tally')).toHaveTextContent('1 of 3 done');
    // Fluent recall of 3 different items is progress toward 5.
    expect(screen.getByRole('progressbar', { name: 'Recall 5 items fluently' })).toHaveAttribute(
      'aria-valuenow',
      '3',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Quest complete: Learn 3 new items. +20 XP.',
    );
    const logged = await getEvents(db, { type: 'quest-completed' });
    expect(logged.map((e) => e.type === 'quest-completed' && e.questId)).toEqual(['new-ground']);
  });

  it('shows a quest completed earlier as done, without announcing it again', async () => {
    for (const [i, id] of ['a', 'b', 'c'].entries()) await learn(id, i);
    const first = renderCard();
    await expect.poll(() => screen.queryByRole('status')?.textContent).toMatch(/Quest complete/);
    first.unmount();

    renderCard();
    const bar = await screen.findByRole('progressbar', { name: 'Learn 3 new items' });
    await expect.poll(() => bar.getAttribute('aria-valuetext')).toBe('Done');
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(await getEvents(db, { type: 'quest-completed' })).toHaveLength(1);
  });
});
