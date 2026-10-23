import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { ENGINE_CONFIG, SKILLS, createScheduler, sessionLength } from '../../../engine';
import { DRILLS } from '../../../drills/registry';
import { getDb } from '../../../storage';
import { Card, warmupPlan } from './quick-drills';

const scheduler = createScheduler({ enableFuzz: false });
const now = new Date('2026-10-18T09:00:00Z');
const old = new Date('2026-10-01T09:00:00Z');
const item = (skillId: string, id: string) =>
  SKILLS.find((s) => s.id === skillId)!
    .items()
    .find((i) => i.id === id)!;
const dueNote = scheduler.seedKnownCard(item('F2.string6-naturals', 'note@s6f0'), old, 1);
const notDue = scheduler.seedKnownCard(item('F2.string6-naturals', 'note@s6f1'), now, 30);
const dueF1 = scheduler.seedKnownCard(SKILLS.find((s) => s.topic === 'F1')!.items()[0]!, old, 1);
const FRETBOARD = SKILLS.filter((s) => ['F2', 'F3', 'C1', 'C2'].includes(s.topic)).map((s) => s.id);

describe('warmupPlan', () => {
  it('reviews the due fretboard items only', () => {
    const plan = warmupPlan(SKILLS, DRILLS, [dueNote, notDue, dueF1], scheduler, now);
    expect(plan.due).toBe(1);
    expect(plan.focus).toEqual({ skillIds: FRETBOARD, itemIds: [] });
    expect(plan.options).toEqual({ minutes: 2, maxItems: sessionLength(2), reviewOnly: true });
  });

  it('runs the fretboard frontier when nothing is due', () => {
    const plan = warmupPlan(SKILLS, DRILLS, [notDue, dueF1], scheduler, now);
    expect(plan.due).toBe(0);
    expect(plan.options.reviewOnly).toBeUndefined();
    expect(plan.focus.skillIds).toEqual(FRETBOARD);
  });

  it('ignores due items no drill can serve', () => {
    expect(warmupPlan(SKILLS, [], [dueNote], scheduler, now).due).toBe(0);
  });

  it('takes its length and topics from the config', () => {
    const plan = warmupPlan(SKILLS, DRILLS, [dueNote], scheduler, now, {
      ...ENGINE_CONFIG.quickDrills,
      warmupMinutes: 5 as never,
      warmupTopics: ['F3'] as never,
    });
    expect(plan.due).toBe(0);
    expect(plan.options).toMatchObject({ minutes: 5, maxItems: sessionLength(5) });
    expect(plan.focus.skillIds).toEqual(['F3.markers', 'F3.repeat-12']);
  });
});

function SessionProbe() {
  const { search, state } = useLocation();
  return (
    <>
      <p data-testid="route-search">{search}</p>
      <pre data-testid="route-state">{JSON.stringify(state)}</pre>
    </>
  );
}

function renderCard() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Card />} />
        <Route path="/session" element={<SessionProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Quick drills card', () => {
  beforeEach(async () => {
    await getDb().cards.clear();
  });

  it('starts a frontier warm-up through route state when nothing is due', async () => {
    renderCard();
    expect(screen.getByRole('region', { name: 'Quick drills' })).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: '2-minute fretboard warm-up' });
    expect(screen.getByTestId('warmup-copy')).toHaveTextContent(/nothing is due/i);
    await userEvent.click(link);
    const state = JSON.parse(screen.getByTestId('route-state').textContent!);
    expect(state).toEqual({ minutes: 2, maxItems: sessionLength(2) });
    const focus = new URLSearchParams(screen.getByTestId('route-search').textContent!);
    expect(focus.getAll('skill')).toEqual(FRETBOARD);
  });

  it('starts a review-only warm-up when fretboard items are due', async () => {
    await getDb().cards.bulkPut([
      scheduler.seedKnownCard(item('F2.string6-naturals', 'note@s6f0'), old, 1),
      scheduler.seedKnownCard(item('F2.string6-naturals', 'note@s6f3'), old, 1),
    ]);
    renderCard();
    const link = await screen.findByRole('link', { name: '2-minute fretboard warm-up' });
    expect(screen.getByTestId('warmup-copy')).toHaveTextContent(
      'Reviews 2 fretboard cards due now.',
    );
    await userEvent.click(link);
    expect(JSON.parse(screen.getByTestId('route-state').textContent!)).toMatchObject({
      reviewOnly: true,
    });
  });

  it('says "card" for a single due review', async () => {
    await getDb().cards.put(
      scheduler.seedKnownCard(item('F2.string6-naturals', 'note@s6f0'), old, 1),
    );
    renderCard();
    expect(await screen.findByTestId('warmup-copy')).toHaveTextContent(
      'Reviews 1 fretboard card due now.',
    );
  });
});
