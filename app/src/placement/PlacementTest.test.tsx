import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generatorParameters, type Grade } from 'ts-fsrs';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useAppStore } from '../app-store';
import { lazyView, resolveView } from '../drills/lazy-view';
import { getDrill, preloadDrill } from '../drills/registry';
import {
  DEFAULT_SETTINGS,
  createScheduler,
  parseNoteItemId,
  type Scheduler,
  type Skill,
} from '../engine';
import { getSkill } from '../engine/skills';
import { FretworkDB, getDb, getSkillStates } from '../storage';
import { noteAt } from '../theory';
import * as step from '../onboarding/steps/placement';
import { PlacementTest } from './PlacementTest';

// One small skill through D1 only: string 6's 8 natural `note@` items, so
// the test asks 3 probes and needs all 3 fluent.
const SKILLS = [getSkill('F2.string6-naturals') as Skill];
const DRILLS = [getDrill('name-the-note')!];

// The component preloads its drills' views on mount; these tests tap Start at once.
// Loading the chunks can pass the 10 s hook default under a loaded verify.
beforeAll(() => preloadDrill(DRILLS[0]!), 60_000);

let db: FretworkDB;
let n = 0;
let t: number;

beforeEach(() => {
  db = new FretworkDB(`placement-ui-${n++}`);
  t = 0;
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, soundOn: false }, loaded: true });
});
afterEach(async () => {
  await db.delete();
});

const NOW = new Date('2026-10-18T09:00:00Z');

function renderTest({
  scheduler = createScheduler({ enableFuzz: false }) as Scheduler | null,
  drills = DRILLS,
} = {}) {
  return render(
    <PlacementTest
      doneAction={<button type="button">Continue</button>}
      now={() => t}
      clock={() => NOW}
      rng={() => 0.5}
      skills={SKILLS}
      drills={drills}
      db={db}
      scheduler={scheduler ?? undefined}
    />,
  );
}

const dialog = () => screen.getByRole('dialog', { name: 'Placement test' });

/** The current probe's note, from its item ID. */
function probeNote(): string {
  const id = screen.getByTestId('placement-probe').dataset.item!;
  return noteAt(parseNoteItemId(id)!).pc;
}

function choose(note: string) {
  const group = within(dialog()).getByRole('group', { name: 'Name the highlighted note' });
  fireEvent.click(within(group).getByRole('button', { name: note }));
}

async function answerRight() {
  const id = screen.getByTestId('placement-probe').dataset.item;
  choose(probeNote());
  expect(await screen.findByTestId('feedback-correct')).toBeInTheDocument();
  // Correct answers move on by themselves.
  await waitFor(() => expect(screen.queryByTestId('placement-probe')?.dataset.item).not.toBe(id), {
    timeout: 3000,
  });
}

describe('PlacementTest', () => {
  it('explains itself, then runs the probes full screen', () => {
    renderTest();
    expect(screen.getByText(/About 3 minutes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('placement-probe').dataset.item).toMatch(/^note@s6f\d+$/);
    expect(
      within(dialog()).getByRole('progressbar', { name: 'Placement test progress' }),
    ).toBeInTheDocument();
  });

  it('seeds a skill answered fluently and names it in the result', async () => {
    renderTest();
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));
    await answerRight();
    await answerRight();
    choose(probeNote());
    const result = await screen.findByTestId('placement-result');
    expect(result).toHaveTextContent(/You already know this/);
    expect(result).toHaveTextContent(/check 8 of those cards again in about 10 days/);
    expect(screen.getByRole('list', { name: 'Already known' })).toHaveTextContent(
      'Natural notes on string 6',
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await db.cards.count()).toBe(8);
    // Only D1 runs here, so the skill's 7 `find:` items stay unseeded: practising, not mastered.
    expect((await getSkillStates(db)).get('F2.string6-naturals')).toMatchObject({
      status: 'practising',
      guideLevel: 1,
    });
    expect(await db.reviewLogs.count()).toBe(3);
  });

  it('waits for a drill view still downloading, keeping it out of the response time', async () => {
    // A first launch before the precache has the views chunk.
    const d1 = DRILLS[0]!;
    const D1View = await resolveView(d1.render);
    let arrive!: () => void;
    const slow = {
      ...d1,
      render: lazyView(() => new Promise<typeof D1View>((r) => (arrive = () => r(D1View)))),
    };
    renderTest({ drills: [slow] });
    const start = screen.getByRole('button', { name: 'Start the test' });
    fireEvent.click(start);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Saying so, with Start disabled, rather than seeming to ignore the tap.
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(start).toBeDisabled();
    t = 10_000; // a slow download, which must not count against the answer
    arrive();
    expect(await screen.findByRole('dialog', { name: 'Placement test' })).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    await answerRight();
    await answerRight();
    choose(probeNote());
    expect(await screen.findByTestId('placement-result')).toHaveTextContent(
      /You already know this/,
    );
  });

  it('counts a slow answer as not yet known', async () => {
    renderTest();
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));
    // Correct but well past the speed target.
    t = 10_000;
    choose(probeNote());
    expect(await screen.findByTestId('placement-result')).toHaveTextContent(/Nothing to skip yet/);
    expect(await db.cards.count()).toBe(0);
    expect((await db.reviewLogs.toArray()).map((l) => l.correct)).toEqual([true]);
  });

  it('shows the right answer after a wrong one, and waits for Continue', async () => {
    renderTest();
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));
    const note = probeNote();
    choose(note === 'C' ? 'D' : 'C');
    expect(await screen.findByTestId('feedback-wrong')).toHaveTextContent(`That was ${note}.`);
    // A 3-of-3 group is settled by one miss, so Continue ends the test.
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Continue' }));
    expect(await screen.findByTestId('placement-result')).toHaveTextContent(/Nothing to skip yet/);
    expect(await db.cards.count()).toBe(0);
  });

  it('lets the learner say "Not sure" without guessing, and logs no answer for it', async () => {
    renderTest();
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Not sure' }));
    expect(await screen.findByTestId('placement-result')).toHaveTextContent(/Nothing to skip yet/);
    expect(await db.reviewLogs.count()).toBe(0);
  });

  it('can finish early, keeping what it found', async () => {
    renderTest();
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));
    await answerRight();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Finish now' }));
    expect(await screen.findByTestId('placement-result')).toBeInTheDocument();
    expect(await db.reviewLogs.count()).toBe(1);
  });

  it('makes the page behind the test inert while probing, and restores it after', async () => {
    const { container } = renderTest();
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));
    // The dialog is portalled to <body>, beside the page, so focus can't leave it.
    expect(dialog().parentElement).toBe(document.body);
    expect(container).toHaveAttribute('inert');
    expect(dialog()).not.toHaveAttribute('inert');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Placement test' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Finish now' }));
    const result = await screen.findByTestId('placement-result');
    expect(container).not.toHaveAttribute('inert');
    // Focus moves in an effect after the result renders, so wait for it.
    await waitFor(() => expect(document.activeElement).toBe(result));
  });

  it('lets the learner carry on when saving fails', async () => {
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('QuotaExceededError'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderTest();
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));
    await answerRight();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Finish now' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn’t be saved, so nothing was skipped/);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('ends when the time budget runs out', async () => {
    renderTest();
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));
    choose(probeNote());
    expect(await screen.findByTestId('feedback-correct')).toBeInTheDocument();
    // The answer was instant; the time runs out before the next probe.
    t = 180_000;
    expect(await screen.findByTestId('placement-result', {}, { timeout: 3000 })).toHaveTextContent(
      /Nothing to skip yet/,
    );
  });
});

describe('the placement onboarding step', () => {
  beforeEach(async () => {
    await getDb().cards.clear();
  });

  it('is last, skippable and explained', () => {
    expect(step.order).toBeGreaterThan(60);
    expect(step.skippable).toBe(true);
    render(<>{step.explanation}</>);
    expect(screen.getByText(/check-up in about 10 days/)).toBeInTheDocument();
  });

  it('moves on with Continue once the test is done', async () => {
    const onNext = vi.fn();
    render(<step.Step onNext={onNext} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));
    // The first probe waits for the drill views to download.
    fireEvent.click(await screen.findByRole('button', { name: 'Finish now' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(onNext).toHaveBeenCalledOnce();
  });
  it('reviews existing cards with the learner’s refit FSRS weights', async () => {
    // Weights unlike the defaults, as a refit (engine/refit.ts) would store them.
    const w = [...generatorParameters().w];
    w[8] = w[8]! + 0.6;
    useAppStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        soundOn: false,
        fsrsParams: {
          w,
          accepted: true,
          reviewCount: 1200,
          fittedAt: NOW,
          defaultLogLoss: 0.4,
          logLoss: 0.3,
        },
      },
    });
    // The learner already has a month-old card on every item D1 can probe.
    const month = new Date(NOW.getTime() - 30 * 86_400_000);
    const own = SKILLS[0]!
      .items()
      .filter((i) => i.id.startsWith('note@'))
      .map((i) => createScheduler().seedKnownCard(i, month, 20));
    await db.cards.bulkPut(own);
    // No `scheduler`: the test builds its own from the settings.
    renderTest({ scheduler: null });
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));
    const id = screen.getByTestId('placement-probe').dataset.item!;
    choose(probeNote());
    expect(await screen.findByTestId('feedback-correct')).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Finish now' }));
    expect(await screen.findByTestId('placement-result')).toBeInTheDocument();

    const [log] = await db.reviewLogs.toArray();
    const card = own.find((c) => c.itemId === id)!;
    const fittedReview = createScheduler({ weights: w }).review(
      card,
      log!.rating as Grade,
      log!.at,
    );
    const defaultReview = createScheduler().review(card, log!.rating as Grade, log!.at);
    expect(fittedReview.fsrs.stability).not.toBe(defaultReview.fsrs.stability);
    expect(await db.cards.get(id)).toEqual(fittedReview);
  });
});
