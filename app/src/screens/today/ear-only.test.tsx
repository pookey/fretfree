import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { useAppStore } from '../../app-store';
import {
  DEFAULT_SETTINGS,
  ENGINE_CONFIG,
  SKILLS,
  createScheduler,
  sessionLength,
  type SkillStatus,
} from '../../engine';
import { DRILLS } from '../../drills/registry';
import type { AnyDrillType } from '../../drills/types';
import { getDb, getSettings, saveSettings } from '../../storage';
import { Card } from './cards/quick-drills';
import { earOnlyPlan } from './ear-only';

const scheduler = createScheduler({ enableFuzz: false });
const now = new Date('2026-10-18T09:00:00Z');
const old = new Date('2026-10-01T09:00:00Z');
const EAR = SKILLS.filter((s) => s.topic === 'I6').map((s) => s.id);
const item = (skillId: string, pick: (id: string) => boolean) =>
  SKILLS.find((s) => s.id === skillId)!
    .items()
    .find((i) => pick(i.id))!;
const dueEarFind = scheduler.seedKnownCard(
  item('I6.ear-find', (id) => id.startsWith('ear-find:')),
  old,
  1,
);
const dueInterval = scheduler.seedKnownCard(
  item('I6.intervals-fourths-fifths', () => true),
  old,
  1,
);
const notDueEar = scheduler.seedKnownCard(
  item('I6.chords-major-minor', () => true),
  now,
  30,
);
// C2's named finds: D15 serves them too, but they aren't ear practice.
const findSkill = SKILLS.find(
  (s) => s.topic === 'C2' && s.items().some((i) => i.id.startsWith('find:')),
)!;
const dueNamedFind = scheduler.seedKnownCard(
  item(findSkill.id, (id) => id.startsWith('find:')),
  old,
  1,
);
const none = new Map<string, SkillStatus>();
const practisingF1 = new Map<string, SkillStatus>([['F1.alphabet', 'practising']]);

describe('earOnlyPlan', () => {
  it('has nothing to offer a fresh learner before the ear track opens', () => {
    expect(earOnlyPlan(SKILLS, DRILLS, [], none, scheduler, now, false)).toEqual({
      kind: 'not-yet',
    });
  });

  it('runs the ear frontier once the first ear sets are open', () => {
    const plan = earOnlyPlan(SKILLS, DRILLS, [notDueEar], practisingF1, scheduler, now, false);
    expect(plan).toEqual({
      kind: 'ready',
      due: 0,
      focus: { skillIds: EAR, itemIds: [] },
      options: { minutes: 3, maxItems: sessionLength(3) },
    });
  });

  it('opens on day one for a learner who starts with sound', () => {
    expect(earOnlyPlan(SKILLS, DRILLS, [], none, scheduler, now, true)?.kind).toBe('ready');
  });

  it('reviews the due ear cards only, never C2’s named finds', () => {
    const plan = earOnlyPlan(
      SKILLS,
      DRILLS,
      [dueEarFind, dueInterval, notDueEar, dueNamedFind],
      none,
      scheduler,
      now,
      false,
    );
    expect(plan).toMatchObject({ kind: 'ready', due: 2, options: { reviewOnly: true } });
    if (plan?.kind !== 'ready') throw new Error('not ready');
    expect(plan.focus.skillIds).not.toContain(findSkill.id);
    expect(plan.focus.skillIds.every((id) => id.startsWith('I6.'))).toBe(true);
  });

  it('is null, never an empty focus, when no ear skill can be served', () => {
    const neck = SKILLS.filter((s) => s.topic !== 'I6');
    expect(earOnlyPlan(neck, DRILLS, [], practisingF1, scheduler, now, true)).toBeNull();
    expect(earOnlyPlan(SKILLS, [], [], practisingF1, scheduler, now, true)).toBeNull();
  });

  it('leaves out ear skills that list a mic drill: no guitar needed', () => {
    const mic = { ...DRILLS[0]!, id: 'sing-it', requiresMic: true } as AnyDrillType;
    const skills = SKILLS.map((s) =>
      s.id === 'I6.ear-find' ? { ...s, drillTypes: [...s.drillTypes, 'sing-it'] } : s,
    );
    const plan = earOnlyPlan(skills, [...DRILLS, mic], [], practisingF1, scheduler, now, false);
    if (plan?.kind !== 'ready') throw new Error('not ready');
    expect(plan.focus.skillIds).not.toContain('I6.ear-find');
    expect(plan.focus.skillIds.length).toBe(EAR.length - 1);
  });

  it('takes its length and topics from the config', () => {
    const plan = earOnlyPlan(SKILLS, DRILLS, [], practisingF1, scheduler, now, false, {
      ...ENGINE_CONFIG.quickDrills,
      earOnlyMinutes: 5 as never,
      earOnlyTopics: ['F3'] as never,
    });
    expect(plan).toMatchObject({
      kind: 'ready',
      focus: { skillIds: ['F3.markers', 'F3.repeat-12'] },
      options: { minutes: 5, maxItems: sessionLength(5) },
    });
  });
});

// The card reads and writes IndexedDB, which is slow when the machine is busy.
const SLOW = { timeout: 5000 };

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

describe('Quick drills card: Ear only', () => {
  beforeEach(async () => {
    const db = getDb();
    await Promise.all([db.cards.clear(), db.skillStates.clear(), db.settings.clear()]);
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, startWithSound: true }, loaded: true });
  });

  it('starts an ear-only session through the URL focus and route state', async () => {
    renderCard();
    const link = await screen.findByRole('link', { name: 'Ear only (no guitar)' }, SLOW);
    expect(screen.getByTestId('ear-only-copy')).toHaveTextContent(/nothing is due/i);
    await userEvent.click(link);
    expect(JSON.parse(screen.getByTestId('route-state').textContent!)).toEqual({
      minutes: 3,
      maxItems: sessionLength(3),
    });
    const focus = new URLSearchParams(screen.getByTestId('route-search').textContent!);
    expect(focus.getAll('skill')).toEqual(EAR);
  });

  it('reviews due ear items', async () => {
    await getDb().cards.bulkPut([dueEarFind, dueNamedFind]);
    renderCard();
    await screen.findByRole('link', { name: 'Ear only (no guitar)' }, SLOW);
    expect(screen.getByTestId('ear-only-copy')).toHaveTextContent('Reviews 1 ear item due now.');
  });

  it('says when the ear track has not opened yet', async () => {
    useAppStore.setState({ settings: DEFAULT_SETTINGS });
    renderCard();
    expect(await screen.findByTestId('ear-only-copy', {}, SLOW)).toHaveTextContent(
      'Ear only (no guitar) opens after your first session.',
    );
    expect(screen.queryByRole('link', { name: 'Ear only (no guitar)' })).toBeNull();
  });

  it('asks for sound when it is off, and turns it on', async () => {
    // Stored too: turning sound on saves over the stored settings, and a
    // store-only "start with sound" would revert and close the ear track.
    const settings = await saveSettings(getDb(), { startWithSound: true, soundOn: false });
    useAppStore.setState({ settings });
    renderCard();
    const turnOn = await screen.findByRole('button', { name: 'Turn sound on' }, SLOW);
    expect(screen.getByTestId('ear-only-copy')).toHaveTextContent('needs sound');
    expect(screen.queryByRole('link', { name: 'Ear only (no guitar)' })).toBeNull();
    await userEvent.click(turnOn);
    expect(
      await screen.findByRole('link', { name: 'Ear only (no guitar)' }, SLOW),
    ).toBeInTheDocument();
    expect((await getSettings(getDb())).soundOn).toBe(true);
  });
});
