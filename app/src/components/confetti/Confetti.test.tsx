import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Confetti } from './Confetti';
import { CONFETTI_COLOURS, confettiPieces } from './pieces';
import { prefersReducedMotion } from './reduced-motion';

function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function mockReducedMotion(matches: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mq),
  );
  return {
    set(next: boolean) {
      mq.matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('confettiPieces', () => {
  it('is deterministic for a seeded rng and stays in range', () => {
    const a = confettiPieces(30, seeded(7));
    expect(confettiPieces(30, seeded(7))).toEqual(a);
    expect(a).toHaveLength(30);
    for (const p of a) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(100);
      expect(CONFETTI_COLOURS).toContain(p.colour);
      expect(p.durationMs).toBeGreaterThanOrEqual(1800);
    }
    // Shapes rotate, so the burst never relies on colour alone.
    expect(new Set(a.map((p) => p.shape))).toEqual(new Set(['circle', 'square', 'triangle']));
    expect(confettiPieces(-3, Math.random)).toEqual([]);
  });

  it('keeps the colour pick in range when rng returns its upper bound', () => {
    expect(confettiPieces(1, () => 0.9999999999).every((p) => p.colour === '#cc79a7')).toBe(true);
  });
});

describe('<Confetti>', () => {
  it('fires once when active, hidden from assistive tech, then clears', () => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    render(<Confetti active count={12} rng={seeded()} />);
    const layer = screen.getByTestId('confetti');
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer.children).toHaveLength(12);
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByTestId('confetti')).toBeNull();
  });

  it('renders nothing when inactive', () => {
    mockReducedMotion(false);
    render(<Confetti active={false} />);
    expect(screen.queryByTestId('confetti')).toBeNull();
  });

  it('renders nothing under reduced motion, and reacts to the setting changing', () => {
    const media = mockReducedMotion(true);
    render(<Confetti active count={5} rng={seeded()} />);
    expect(screen.queryByTestId('confetti')).toBeNull();
    act(() => media.set(false));
    expect(screen.getByTestId('confetti')).toBeInTheDocument();
    act(() => media.set(true));
    expect(screen.queryByTestId('confetti')).toBeNull();
  });

  it('treats a missing matchMedia as motion allowed', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});
