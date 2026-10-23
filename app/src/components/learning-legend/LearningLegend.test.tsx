import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ENGINE_CONFIG } from '../../engine';
import { LearningLegend, legendLines } from './LearningLegend';

describe('legendLines', () => {
  it('takes its thresholds from the mastery config', () => {
    const lines = legendLines({ stabilityDays: 21, itemShare: 0.85 });
    expect(lines.map((l) => l.term)).toEqual(['Learning', 'Stable', 'Mastered']);
    expect(lines[1]?.meaning).toBe('you’d still recall the card 21 days from now.');
    expect(lines[2]?.meaning).toMatch(/^85% of a skill’s cards are stable/);
  });
});

describe('<LearningLegend>', () => {
  it('defines learning, stable and mastered in one line each, in cards', () => {
    render(<LearningLegend />);
    const legend = screen.getByRole('note', { name: 'What the numbers mean' });
    const terms = within(legend).getAllByRole('term');
    expect(terms.map((t) => t.textContent)).toEqual(['Learning', 'Stable', 'Mastered']);
    const meanings = within(legend).getAllByRole('definition');
    expect(meanings).toHaveLength(3);
    expect(meanings[0]).toHaveTextContent('you got the card right last time.');
    expect(meanings[1]).toHaveTextContent(
      `you’d still recall the card ${ENGINE_CONFIG.mastery.stabilityDays} days from now.`,
    );
    expect(meanings[2]).toHaveTextContent(
      `${Math.round(ENGINE_CONFIG.mastery.itemShare * 100)}% of a skill’s cards are stable`,
    );
    // One unit word: never item, fact or note.
    expect(legend).not.toHaveTextContent(/\b(items?|facts?|notes?)\b/);
  });

  it('marks each term by shape, hidden from assistive tech', () => {
    const { container } = render(<LearningLegend className="extra" />);
    const marks = container.querySelectorAll('svg[aria-hidden="true"]');
    expect([...marks].map((m) => m.getAttribute('data-level'))).toEqual([
      'learning',
      'stable',
      'mastered',
    ]);
    expect(screen.getByTestId('learning-legend')).toHaveClass('extra');
  });
});
