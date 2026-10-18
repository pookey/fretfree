import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimeLeft, timeLeftLabel } from './TimeLeft';

afterEach(() => {
  vi.useRealTimers();
});

describe('timeLeftLabel', () => {
  it('rounds up to whole minutes, then counts down the last one', () => {
    expect(timeLeftLabel(10 * 60_000)).toBe('10 min left');
    expect(timeLeftLabel(4 * 60_000 + 1)).toBe('5 min left');
    expect(timeLeftLabel(60_000)).toBe('1 min left');
    expect(timeLeftLabel(59_999)).toBe('Under 1 min');
    expect(timeLeftLabel(0)).toBe('Last one');
    expect(timeLeftLabel(-5_000)).toBe('Last one');
  });
});

describe('TimeLeft', () => {
  it('ticks down as a timer', () => {
    vi.useFakeTimers();
    const start = new Date('2026-10-18T09:00:00Z');
    vi.setSystemTime(start);
    render(<TimeLeft endsAt={new Date(start.getTime() + 2 * 60_000)} />);
    const timer = screen.getByRole('timer', { name: 'Time left in session' });
    expect(timer).toHaveTextContent('2 min left');
    act(() => vi.advanceTimersByTime(61_000));
    expect(timer).toHaveTextContent('Under 1 min');
    act(() => vi.advanceTimersByTime(60_000));
    expect(timer).toHaveTextContent('Last one');
    expect(timer).toHaveAttribute('data-over', 'true');
  });
});
