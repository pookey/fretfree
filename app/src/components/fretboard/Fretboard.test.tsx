import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { Fretboard, type FretMarker } from './Fretboard';

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

  it('takes its tap targets’ accessible names from cellLabel when given', () => {
    render(
      <Fretboard
        fretRange={{ from: 0, to: 5 }}
        onTapCell={vi.fn()}
        cellLabel={(p) => `cell ${p.string}/${p.fret}`}
      />,
    );
    expect(screen.getByRole('button', { name: 'cell 6/5' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'string 6, fret 5' })).toBeNull();
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

  describe('recall prompts never show their answer (M1-25)', () => {
    const levels: GuideLevel[] = [0, 1, 2, 3];
    const markerText = (container: HTMLElement, style: string) =>
      [...container.querySelectorAll(`[data-testid="marker-${style}"] text`)].map(
        (t) => t.textContent,
      );
    const stringNames = (container: HTMLElement) =>
      [...container.querySelectorAll('[data-testid="string-name"]')].map((t) =>
        Number(t.getAttribute('data-string')),
      );

    it.each(levels)('never labels an unforced target at guide level %i', (level) => {
      const { container } = render(
        <Fretboard
          fretRange={{ from: 0, to: 12 }}
          guideLevel={level}
          markers={[{ string: 6, fret: 1, style: 'target', label: 'F' }]}
        />,
      );
      expect(markerText(container, 'target')).toEqual([]);
      expect(container.textContent).not.toContain('F');
    });

    it.each(levels)('labels a forced target (worked example) at guide level %i', (level) => {
      const { container } = render(
        <Fretboard
          fretRange={{ from: 0, to: 12 }}
          guideLevel={level}
          markers={[{ string: 6, fret: 3, style: 'target', label: 'G', forceLabel: true }]}
        />,
      );
      expect(markerText(container, 'target')).toEqual(['G']);
    });

    it.each(levels)('labels feedback markers at guide level %i', (level) => {
      const markers: FretMarker[] = [
        { string: 6, fret: 3, style: 'correct', label: 'G', forceLabel: true },
        { string: 6, fret: 5, style: 'wrong', label: 'A', forceLabel: true },
      ];
      const { container } = render(
        <Fretboard fretRange={{ from: 0, to: 12 }} guideLevel={level} markers={markers} />,
      );
      expect(markerText(container, 'correct')).toEqual(['G']);
      expect(markerText(container, 'wrong')).toEqual(['A']);
    });

    it('still labels non-target markers at level 3 beside an unlabelled target', () => {
      const { container } = render(
        <Fretboard
          fretRange={{ from: 0, to: 12 }}
          guideLevel={3}
          markers={[
            { string: 6, fret: 5, style: 'root', label: 'A' },
            { string: 5, fret: 7, style: 'tone', label: 'E' },
            { string: 4, fret: 7, style: 'target', label: 'A' },
          ]}
        />,
      );
      expect(markerText(container, 'root')).toEqual(['A']);
      expect(markerText(container, 'tone')).toEqual(['E']);
      expect(markerText(container, 'target')).toEqual([]);
    });

    it.each([0, 12])("hides the target string's name when the target is at fret %i", (fret) => {
      const { container } = render(
        <Fretboard
          fretRange={{ from: 0, to: 12 }}
          guideLevel={3}
          markers={[{ string: 5, fret, style: 'target' }]}
        />,
      );
      expect(stringNames(container)).toEqual([1, 2, 3, 4, 6]);
      expect(container.textContent).not.toContain('A');
    });

    it('keeps every string name for other frets and for a forced target at the nut', () => {
      const { container, rerender } = render(
        <Fretboard
          fretRange={{ from: 0, to: 12 }}
          guideLevel={2}
          markers={[{ string: 5, fret: 7, style: 'target' }]}
        />,
      );
      expect(stringNames(container)).toEqual([1, 2, 3, 4, 5, 6]);
      rerender(
        <Fretboard
          fretRange={{ from: 0, to: 12 }}
          guideLevel={2}
          markers={[{ string: 5, fret: 0, style: 'target', label: 'A', forceLabel: true }]}
        />,
      );
      expect(stringNames(container)).toEqual([1, 2, 3, 4, 5, 6]);
    });
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
