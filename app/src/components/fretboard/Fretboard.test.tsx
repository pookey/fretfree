import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Fretboard } from './Fretboard';

describe('<Fretboard>', () => {
  it('renders one hit cell per string and fret with accessible labels', () => {
    const onTap = vi.fn();
    render(<Fretboard fretRange={{ from: 0, to: 12 }} onTapCell={onTap} revealNotes />);
    const cells = screen.getAllByRole('button');
    expect(cells).toHaveLength(6 * 13);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'string 5, fret 7, E' }));
    expect(onTap).toHaveBeenCalledWith({ string: 5, fret: 7 });
  });

  it('hides note names from cell labels during quizzes and supports keyboard taps', () => {
    const onTap = vi.fn();
    render(<Fretboard fretRange={{ from: 0, to: 5 }} onTapCell={onTap} />);
    const cell = screen.getByRole('button', { name: 'string 6, fret 5' });
    fireEvent.keyDown(cell, { key: 'Enter' });
    fireEvent.keyDown(cell, { key: 'x' });
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('is not interactive without a tap handler', () => {
    render(<Fretboard fretRange={{ from: 0, to: 5 }} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows labels according to the guide level', () => {
    const markers = [
      { string: 6, fret: 5, style: 'root' as const, label: 'A' },
      { string: 5, fret: 7, style: 'tone' as const, label: 'E' },
      { string: 4, fret: 7, style: 'target' as const, label: 'A', forceLabel: true },
    ];
    const { container, rerender } = render(
      <Fretboard fretRange={{ from: 0, to: 12 }} markers={markers} guideLevel={3} />,
    );
    const labels = () =>
      [...container.querySelectorAll('[data-testid^="marker-"] text')].map((t) => t.textContent);
    expect(labels()).toEqual(['A', 'E', 'A']);
    rerender(<Fretboard fretRange={{ from: 0, to: 12 }} markers={markers} guideLevel={2} />);
    expect(labels()).toEqual(['A', 'A']);
    rerender(<Fretboard fretRange={{ from: 0, to: 12 }} markers={markers} guideLevel={1} />);
    expect(labels()).toEqual(['A']);
  });

  it('hides inlays only at level 0 in blind mode, and skips off-window markers', () => {
    const { container, rerender } = render(
      <Fretboard
        fretRange={{ from: 0, to: 12 }}
        guideLevel={0}
        markers={[{ string: 1, fret: 14, style: 'tone' }]}
      />,
    );
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(0);
    rerender(<Fretboard fretRange={{ from: 0, to: 12 }} guideLevel={0} blindMode />);
    expect(container.querySelectorAll('circle')).toHaveLength(0);
  });

  it('dims frets outside the active range', () => {
    render(<Fretboard fretRange={{ from: 0, to: 15 }} activeRange={{ from: 0, to: 12 }} />);
    expect(screen.getAllByTestId('dimmed-fret')).toHaveLength(3);
  });

  it('exposes handedness and window for layout tests', () => {
    const { container } = render(<Fretboard fretRange={{ from: 3, to: 7 }} handedness="left" />);
    const svg = container.querySelector('svg')!;
    expect(svg.dataset.handedness).toBe('left');
    expect(svg.dataset.fretFrom).toBe('3');
    expect(svg.querySelectorAll('[data-cell]')).toHaveLength(30);
  });
});
