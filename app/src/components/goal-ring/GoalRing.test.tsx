import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GoalRing } from './GoalRing';
import { goalProgress } from './progress';

describe('<GoalRing>', () => {
  it('is an image named for VoiceOver, with the minutes in the middle', () => {
    render(<GoalRing progress={goalProgress(6, 10)} />);
    const ring = screen.getByRole('img', { name: 'Daily goal: 6 of 10 minutes' });
    expect(ring).toHaveAttribute('data-progress', '0.60');
    expect(ring).toHaveAttribute('data-met', 'false');
    expect(ring).toHaveTextContent('6/10min');
  });

  it('draws no arc before any practice', () => {
    const { container } = render(<GoalRing progress={goalProgress(0, 10)} />);
    expect(container.querySelectorAll('circle')).toHaveLength(1);
  });

  it('shows a tick, not just a colour, when the goal is met', () => {
    const { container } = render(<GoalRing progress={goalProgress(12, 10)} size="small" />);
    expect(screen.getByRole('img', { name: 'Daily goal met: 12 of 10 minutes' })).toHaveAttribute(
      'data-met',
      'true',
    );
    expect(container.querySelector('path')).not.toBeNull();
    expect(container.querySelectorAll('circle')).toHaveLength(2);
  });

  it('leaves the minutes out of the small sidebar ring', () => {
    render(<GoalRing progress={goalProgress(6, 10)} size="small" />);
    expect(screen.getByRole('img')).toHaveTextContent('');
  });
});

// Motion and reduced motion are checked in a real browser (e2e/m1-11.spec.ts).
describe('goal ring colours', async () => {
  // WCAG 1.4.11: the arc needs 3:1 against the card and the track around it.
  const LIGHT = '@media (prefers-color-scheme: light)';
  function vars(css: string): Record<string, string> {
    return Object.fromEntries(
      [...css.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]),
    );
  }
  function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  }
  function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  }

  // Vitest stubs CSS imports to '', so read the real files. (The app's
  // tsconfig has no Node types, hence the untyped specifier.)
  const nodeFs = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as {
    readFileSync(path: URL, encoding: 'utf8'): string;
  };
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const [darkTokens, lightTokens] = read('../../styles/tokens.css').split(LIGHT).map(vars);
  const lightStreak = vars(read('./streak-tokens.css').split(LIGHT)[1]!);
  const schemes: Record<string, Record<string, string>> = {
    dark: { ...darkTokens, '--streak-on-card': darkTokens!['--streak']! },
    light: { ...darkTokens, ...lightTokens, ...lightStreak },
  };

  for (const [name, t] of Object.entries(schemes)) {
    it(`meets WCAG AA contrast in the ${name} scheme`, () => {
      expect(Object.keys(t).length).toBeGreaterThan(10);
      const fill = t['--streak-on-card']!;
      for (const bg of ['--bg-raised', '--surface', '--border']) {
        expect(contrast(fill, t[bg]!), `${fill} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
      // The streak count and the minutes text need 4.5:1.
      for (const bg of ['--bg-raised', '--surface']) {
        expect(contrast(fill, t[bg]!)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t['--text']!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t['--text-muted']!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
