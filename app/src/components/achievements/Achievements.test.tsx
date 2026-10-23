import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ACHIEVEMENTS } from '../../engine/gamification/achievements';
import { FretworkDB } from '../../storage/db';
import { getUnlockedAchievements, saveGamification } from '../../storage/gamification-repo';
import { putSkillState, saveSettings } from '../../storage/repository';
import { useAppStore } from '../../app-store';
import { DEFAULT_SETTINGS } from '../../engine/model';
import { Rating } from 'ts-fsrs';
import { AchievementList } from './AchievementList';
import { AchievementToast, TOAST_MS } from './AchievementToast';
import { BadgeIcon } from './BadgeIcon';
import { useAchievementUnlocks } from './useAchievementUnlocks';

const byId = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;
const at = new Date('2026-10-18T09:00:00Z');
const fixedNow = () => at;

describe('<BadgeIcon>', () => {
  it('draws a distinct shape per category and outlines locked badges', () => {
    const { container } = render(
      <>
        <BadgeIcon category="mastery" unlocked />
        <BadgeIcon category="speed" unlocked={false} />
        <BadgeIcon category="streak" unlocked />
      </>,
    );
    const [mastery, speed, streak] = container.querySelectorAll('svg');
    expect(mastery!.querySelector('circle')).not.toBeNull();
    expect(speed!.querySelector('polygon')?.getAttribute('points')).toBe('20,4 36,34 4,34');
    expect(streak!.querySelector('polygon')?.getAttribute('points')).toBe('20,3 37,20 20,37 3,20');
    expect(speed).toHaveAttribute('data-unlocked', 'false');
  });
});

describe('<AchievementToast>', () => {
  afterEach(() => vi.useRealTimers());

  it('renders nothing with no unlocks', () => {
    render(<AchievementToast achievements={[]} onDismiss={() => {}} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('announces one unlock with its competence copy', () => {
    render(<AchievementToast achievements={[byId('string-6-master')]} onDismiss={() => {}} />);
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Achievement unlocked');
    expect(toast).toHaveTextContent('String 6 master');
    expect(toast).toHaveTextContent('every natural note on the low E string');
  });

  it('names the Garage finish a badge unlocks, after its competence copy', () => {
    render(<AchievementToast achievements={[byId('whole-neck')]} onDismiss={() => {}} />);
    const toast = screen.getByRole('status');
    const line = within(toast).getByTestId('garage-unlock');
    expect(line).toHaveTextContent('Unlocks the Gold leaf finish in the Garage');
    expect(within(line).getByText('Gold leaf').tagName).toBe('EM');
    expect(within(line).queryByRole('link')).toBeNull();
    // The competence comes first, the finish second.
    expect(toast.textContent!.indexOf('every note on every string')).toBeLessThan(
      toast.textContent!.indexOf('Unlocks the'),
    );
  });

  it('adds no Garage line to a badge that unlocks nothing', () => {
    render(<AchievementToast achievements={[byId('streak-7')]} onDismiss={() => {}} />);
    expect(screen.getByRole('status')).not.toHaveTextContent('Garage');
    expect(screen.queryByTestId('garage-unlock')).toBeNull();
  });

  it('lists several unlocks and dismisses on tap', () => {
    const onDismiss = vi.fn();
    render(
      <AchievementToast
        achievements={[byId('streak-7'), byId('streak-30')]}
        onDismiss={onDismiss}
      />,
    );
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('2 achievements unlocked');
    expect(within(toast).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('dismisses itself after a while', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<AchievementToast achievements={[byId('speed-demon')]} onDismiss={onDismiss} />);
    act(() => vi.advanceTimersByTime(TOAST_MS - 1));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe('<AchievementList>', () => {
  it('shows every badge, marking the earned ones with their date', () => {
    render(
      <AchievementList
        definitions={ACHIEVEMENTS}
        unlocked={
          new Map([
            ['whole-neck', at],
            ['streak-7', at],
          ])
        }
      />,
    );
    expect(screen.getByTestId('achievement-tally')).toHaveTextContent(
      `2 of ${ACHIEVEMENTS.length} unlocked`,
    );
    const list = screen.getByRole('list', { name: 'Achievements' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(ACHIEVEMENTS.length);
    const neck = screen.getByTestId('achievement-whole-neck');
    expect(neck).toHaveAttribute('data-unlocked', 'true');
    expect(neck).toHaveTextContent('Unlocked');
    expect(neck.querySelector('time')).toHaveAttribute('datetime', at.toISOString());
    const speed = screen.getByTestId('achievement-speed-demon');
    expect(speed).toHaveAttribute('data-unlocked', 'false');
    expect(speed).toHaveTextContent('Not yet');
  });
});

describe('<AchievementList> Garage unlocks', () => {
  it('names the finish under each badge that unlocks one, earned or not', () => {
    render(<AchievementList definitions={ACHIEVEMENTS} unlocked={new Map([['whole-neck', at]])} />);
    expect(
      within(screen.getByTestId('achievement-whole-neck')).getByTestId('garage-unlock'),
    ).toHaveTextContent('Unlocks the Gold leaf finish in the Garage');
    expect(
      within(screen.getByTestId('achievement-speed-demon')).getByTestId('garage-unlock'),
    ).toHaveTextContent('Unlocks the Lightning sparkle finish in the Garage');
    expect(screen.getAllByTestId('garage-unlock')).toHaveLength(6);
    expect(screen.getByTestId('achievement-streak-7')).not.toHaveTextContent('Garage');
  });
});

describe('useAchievementUnlocks', () => {
  let db: FretworkDB;
  let n = 0;

  beforeEach(async () => {
    db = new FretworkDB(`achievement-hook-test-${n++}`);
    await db.open();
  });

  afterEach(async () => {
    useAppStore.setState({ settings: DEFAULT_SETTINGS });
    await db.delete();
  });

  function Probe() {
    const { unlocked, dismiss } = useAchievementUnlocks({ db, now: fixedNow });
    return <AchievementToast achievements={unlocked} onDismiss={dismiss} />;
  }

  it('unlocks what is already earned on mount, then what is earned later', async () => {
    await saveGamification(db, { streakLongest: 7 });
    render(<Probe />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('7-day streak'));
    expect((await getUnlockedAchievements(db)).get('streak-7')).toEqual(at);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).toBeNull();

    // A session finishing marks a skill mastered: the live query picks it up.
    await act(() =>
      putSkillState(db, {
        skillId: 'F2.string6-naturals',
        status: 'mastered',
        guideLevel: 0,
        rollingAccuracy: 0.95,
      }),
    );
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('String 6 master'));
    expect(screen.getByRole('status')).not.toHaveTextContent('7-day streak');
  });

  it('times speed demon against the loaded settings’ tap time', async () => {
    // 1.5 s answers: too slow for the default 700 ms tap time, fluent for 1,100 ms.
    await db.reviewLogs.bulkAdd(
      Array.from({ length: 30 }, (_, i) => ({
        itemId: `note@s6f${i % 13}`,
        skillId: 'F2.string6-naturals',
        drillType: 'name-the-note',
        correct: true,
        responseMs: 1500,
        rating: Rating.Good,
        hintUsed: false,
        answerGiven: 'E',
        at: new Date(at.getTime() + i * 1000),
      })),
    );
    render(<Probe />);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 1100 } }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Speed demon'));
  });

  it('is not woken by a settings write, such as the refit at session end', async () => {
    const reads = vi.spyOn(db.skillStates, 'toArray');
    render(<Probe />);
    await waitFor(() => expect(reads).toHaveBeenCalled());
    await act(() => new Promise((r) => setTimeout(r, 50)));
    const settled = reads.mock.calls.length;
    await act(async () => {
      await saveSettings(db, { latencyBaselineMs: 900, soundOn: false });
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(reads).toHaveBeenCalledTimes(settled);
  });

  it('does not toast badges unlocked before it mounted', async () => {
    await saveGamification(db, { streakLongest: 7 });
    await db.achievements.put({ id: 'streak-7', unlockedAt: at });
    render(<Probe />);
    // Let the live query settle, then confirm nothing was announced.
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
