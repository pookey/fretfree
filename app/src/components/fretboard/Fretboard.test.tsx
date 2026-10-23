import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { Fretboard, type FretMarker } from './Fretboard';
import styles from './Fretboard.module.css';

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

  describe('inlay shapes (design §3.8 neck skin)', () => {
    const STYLES = ['dots', 'blocks', 'trapezoids'] as const;
    const inlays = (container: HTMLElement) => [...container.querySelectorAll('[data-inlay]')];

    it('draws dots by default, with the pair at 12', () => {
      const { container } = render(<Fretboard fretRange={{ from: 0, to: 12 }} />);
      expect(container.querySelector('svg')).toHaveAttribute('data-inlay-style', 'dots');
      expect(inlays(container).map((i) => i.getAttribute('data-fret'))).toEqual([
        '3',
        '5',
        '7',
        '9',
        '12',
      ]);
      expect(container.querySelectorAll('[data-fret="12"][data-inlay] circle')).toHaveLength(2);
    });

    it.each(['blocks', 'trapezoids'] as const)(
      'draws %s as one paler plate per standard fret',
      (shape) => {
        const { container } = render(
          <Fretboard fretRange={{ from: 0, to: 12 }} inlayStyle={shape} />,
        );
        const plates = inlays(container);
        expect(plates.map((i) => i.getAttribute('data-fret'))).toEqual(['3', '5', '7', '9', '12']);
        for (const plate of plates) {
          expect(plate.tagName).toBe('polygon');
          expect(plate).toHaveAttribute('data-inlay', shape);
          expect(plate).toHaveClass(styles.inlay!, styles.inlayPlate!);
        }
      },
    );

    // The height of a plate's edge nearer the nut and of the far one.
    const edges = (handedness: 'left' | 'right') => {
      const { container } = render(
        <Fretboard
          fretRange={{ from: 0, to: 12 }}
          inlayStyle="trapezoids"
          handedness={handedness}
        />,
      );
      const pts = container
        .querySelector('[data-inlay][data-fret="5"]')!
        .getAttribute('points')!
        .split(' ')
        .map((p) => p.split(',').map(Number) as [number, number]);
      // Points run top-left, top-right, bottom-right, bottom-left.
      const [tl, tr, br, bl] = pts as [
        (typeof pts)[0],
        (typeof pts)[0],
        (typeof pts)[0],
        (typeof pts)[0],
      ];
      const leftH = bl[1] - tl[1];
      const rightH = br[1] - tr[1];
      return handedness === 'right' ? [leftH, rightH] : [rightH, leftH];
    };

    it.each(['right', 'left'] as const)(
      'narrows trapezoids towards the nut (%s-handed)',
      (handedness) => {
        const [nutSide, farSide] = edges(handedness);
        expect(nutSide).toBeLessThan(farSide!);
      },
    );

    it('keeps block plates square', () => {
      const { container } = render(
        <Fretboard fretRange={{ from: 0, to: 12 }} inlayStyle="blocks" />,
      );
      const ys = container
        .querySelector('[data-inlay][data-fret="7"]')!
        .getAttribute('points')!
        .split(' ')
        .map((p) => Number(p.split(',')[1]));
      expect(ys[0]).toBe(ys[1]);
      expect(ys[2]).toBe(ys[3]);
    });

    // Guide fading always wins over the skin (design §3.8): the shape never
    // decides whether inlays show.
    it.each(STYLES)('shows %s at every level, and hides them only at 0 in blind mode', (shape) => {
      for (const level of [0, 1, 2, 3] as GuideLevel[]) {
        for (const blindMode of [false, true]) {
          const { container, unmount } = render(
            <Fretboard
              fretRange={{ from: 0, to: 12 }}
              guideLevel={level}
              blindMode={blindMode}
              inlayStyle={shape}
            />,
          );
          const hidden = level === 0 && blindMode;
          expect(inlays(container), `level ${level}, blind ${blindMode}`).toHaveLength(
            hidden ? 0 : 5,
          );
          expect(container.querySelectorAll('circle, polygon')).toHaveLength(
            hidden ? 0 : shape === 'dots' ? 6 : 5,
          );
          unmount();
        }
      }
    });
  });

  it('marks itself as a neck, so the board scopes its marker colours to it', () => {
    const { container } = render(<Fretboard fretRange={{ from: 0, to: 5 }} />);
    expect(container.querySelector('svg')).toHaveAttribute('data-neck');
  });

  it('dims frets outside the active range', () => {
    render(<Fretboard fretRange={{ from: 0, to: 15 }} activeRange={{ from: 0, to: 12 }} />);
    expect(screen.getAllByTestId('dimmed-fret')).toHaveLength(3);
  });

  it("drops the string names' wood halo only when the nut is dimmed", () => {
    const { rerender } = render(
      <Fretboard fretRange={{ from: 0, to: 15 }} activeRange={{ from: 0, to: 12 }} />,
    );
    for (const name of screen.getAllByTestId('string-name')) {
      expect(name).not.toHaveClass(styles.stringNameDimmed!);
    }
    rerender(<Fretboard fretRange={{ from: 0, to: 15 }} activeRange={{ from: 3, to: 7 }} />);
    const names = screen.getAllByTestId('string-name');
    expect(names).toHaveLength(6);
    for (const name of names) expect(name).toHaveClass(styles.stringNameDimmed!);
  });

  it('outlines each marker group from guide level 2, round its visible cells', () => {
    const shape = [
      { string: 5, fret: 3, style: 'root', group: 'a' },
      { string: 4, fret: 2, style: 'tone', group: 'a' },
      { string: 2, fret: 1, style: 'tone', group: 'a' },
      { string: 1, fret: 9, style: 'tone', group: 'b' },
      { string: 3, fret: 5, style: 'tone' },
    ] as const;
    const { rerender } = render(
      <Fretboard fretRange={{ from: 0, to: 7 }} guideLevel={2} markers={shape} />,
    );
    // Group b lies off this window, and the ungrouped marker has no outline.
    const outline = screen.getByTestId('shape-outline');
    expect(outline).toHaveAttribute('data-group', 'a');
    const height = Number(outline.getAttribute('height'));
    const width = Number(outline.getAttribute('width'));
    // Strings 2–5: four 56-unit rows, inset 3 units each side.
    expect(height).toBe(4 * 56 - 6);
    expect(width).toBeGreaterThan(0);
    rerender(<Fretboard fretRange={{ from: 0, to: 7 }} guideLevel={1} markers={shape} />);
    expect(screen.queryByTestId('shape-outline')).toBeNull();
  });

  it('exposes handedness and window for layout tests', () => {
    const { container } = render(<Fretboard fretRange={{ from: 3, to: 7 }} handedness="left" />);
    const svg = container.querySelector('svg')!;
    expect(svg.dataset.handedness).toBe('left');
    expect(svg.dataset.fretFrom).toBe('3');
    expect(svg.querySelectorAll('[data-cell]')).toHaveLength(30);
  });
});

describe('<Fretboard> ♯/♭ labels (M10-18)', () => {
  const halfStepDown = {
    id: 'eb',
    name: 'Half step down',
    notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'],
  };

  it('names open strings with glyphs in the learner’s spelling, spoken in words', () => {
    const { container, rerender } = render(
      <Fretboard tuning={halfStepDown} fretRange={{ from: 0, to: 5 }} accidentalPref="flat" />,
    );
    const names = () =>
      [...container.querySelectorAll('[data-testid="string-name"]')].map((t) => t.textContent);
    expect(names()).toEqual(['E♭', 'B♭', 'G♭', 'D♭', 'A♭', 'E♭']);
    expect(screen.getAllByRole('img', { name: 'E flat' })).toHaveLength(2);
    rerender(
      <Fretboard tuning={halfStepDown} fretRange={{ from: 0, to: 5 }} accidentalPref="sharp" />,
    );
    expect(names()).toEqual(['D♯', 'A♯', 'F♯', 'C♯', 'G♯', 'D♯']);
  });

  it('shows guide-level note and degree labels with glyphs, spoken in words', () => {
    render(
      <Fretboard
        fretRange={{ from: 0, to: 5 }}
        guideLevel={3}
        markers={[
          { string: 1, fret: 2, style: 'tone', label: 'F#' },
          { string: 2, fret: 1, style: 'third', label: 'b3' },
          { string: 3, fret: 2, style: 'root', label: 'A' },
        ]}
      />,
    );
    expect(screen.getByRole('img', { name: 'F sharp' })).toHaveTextContent(/^F♯$/);
    expect(screen.getByRole('img', { name: 'flat 3' })).toHaveTextContent(/^♭3$/);
    // A natural reads as written, so it keeps its plain text.
    expect(screen.getByTestId('marker-root')).not.toHaveAttribute('role');
    expect(screen.getByTestId('marker-root')).toHaveTextContent(/^A$/);
  });

  it('keeps a caller’s spoken label and says revealed cells in words', () => {
    render(
      <Fretboard
        fretRange={{ from: 0, to: 5 }}
        markers={[{ string: 1, fret: 1, style: 'third', label: '♭3', spokenLabel: 'minor 3rd' }]}
        onTapCell={() => {}}
        revealNotes
      />,
    );
    expect(screen.getByRole('img', { name: 'minor 3rd' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'string 1, fret 2, F sharp' })).toBeInTheDocument();
  });

  it('rings an emphasised marker on top of its own degree shape', () => {
    const { container } = render(
      <Fretboard
        fretRange={{ from: 0, to: 5 }}
        markers={[
          { string: 3, fret: 2, style: 'fifth', label: '5', forceLabel: true, emphasis: true },
          { string: 2, fret: 3, style: 'fifth', label: '5', forceLabel: true },
        ]}
      />,
    );
    const [ringed, plain] = screen.getAllByTestId('marker-fifth');
    expect(ringed).toHaveAttribute('data-emphasis', 'true');
    expect(ringed).toHaveClass(styles.emphasis!);
    expect(ringed!.querySelector('polygon')).not.toBeNull();
    expect(ringed).toHaveTextContent('5');
    expect(plain).not.toHaveAttribute('data-emphasis');
    expect(container.querySelectorAll(`.${styles.emphasis}`)).toHaveLength(1);
  });
});
