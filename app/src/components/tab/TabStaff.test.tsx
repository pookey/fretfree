import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DROP_D_TUNING } from '../../theory';
import type { GuideLevel } from '../../engine/model';
import { TabStaff, type TabNote } from './TabStaff';

const PHRASE: TabNote[] = [
  { string: 3, fret: 5 },
  { string: 3, fret: 7 },
  { string: 2, fret: 5 },
  { string: 2, fret: 12 },
];

const attr = (els: Element[], name: string) => els.map((e) => e.getAttribute(name));

describe('<TabStaff>', () => {
  it('draws six lines, string 1 on top', () => {
    render(<TabStaff />);
    const lines = screen.getAllByTestId('tab-line');
    expect(attr(lines, 'data-string')).toEqual(['1', '2', '3', '4', '5', '6']);
    const ys = lines.map((l) => Number(l.getAttribute('y1')));
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(screen.getByRole('group', { name: 'Tab' })).toBeInTheDocument();
  });

  it('draws the fret numbers on their lines with VoiceOver labels', () => {
    render(<TabStaff notes={PHRASE} label="Riff" />);
    const notes = screen.getAllByRole('img');
    expect(notes.map((n) => n.getAttribute('aria-label'))).toEqual([
      'string 3, fret 5',
      'string 3, fret 7',
      'string 2, fret 5',
      'string 2, fret 12',
    ]);
    expect(notes.map((n) => n.textContent)).toEqual(['5', '7', '5', '12']);
    const lineY = (s: number) =>
      screen
        .getAllByTestId('tab-line')
        .find((l) => l.getAttribute('data-string') === String(s))!
        .getAttribute('y1');
    expect(notes[0]!.querySelector('text')!.getAttribute('y')).toBe(lineY(3));
    expect(notes[2]!.querySelector('text')!.getAttribute('y')).toBe(lineY(2));
    // Left to right in playing order.
    const xs = notes.map((n) => Number(n.querySelector('text')!.getAttribute('x')));
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(screen.getByRole('group', { name: 'Riff' })).toBeInTheDocument();
  });

  it('hides a fret that is the answer', () => {
    render(<TabStaff notes={[{ string: 4, fret: 2, hideFret: true }]} />);
    const note = screen.getByRole('img', { name: 'string 4, fret hidden' });
    expect(note).toHaveTextContent('?');
    expect(note).not.toHaveTextContent('2');
  });

  it('centres a few notes in the minimum columns', () => {
    const { container } = render(<TabStaff notes={[{ string: 1, fret: 0 }]} minColumns={5} />);
    expect(container.querySelector('svg')).toHaveAttribute('data-columns', '5');
    const sparse = Number(screen.getByRole('img').querySelector('text')!.getAttribute('x'));
    const { container: full } = render(<TabStaff notes={PHRASE.concat(PHRASE[0]!)} />);
    const third = full.querySelectorAll('[data-testid="tab-note"] text')[2]!;
    expect(sparse).toBe(Number(third.getAttribute('x')));
  });

  it('marks the cursor note with a style, a caret and aria-current', () => {
    render(<TabStaff notes={PHRASE} cursor={1} />);
    const notes = screen.getAllByTestId('tab-note');
    expect(attr(notes, 'data-style')).toEqual(['plain', 'current', 'plain', 'plain']);
    expect(notes[1]).toHaveAttribute('aria-current', 'step');
    expect(notes[0]).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('tab-cursor')).toHaveAttribute('data-column', '1');
  });

  it('draws no caret for a cursor past the phrase', () => {
    render(<TabStaff notes={PHRASE} cursor={4} />);
    expect(screen.queryByTestId('tab-cursor')).toBeNull();
  });

  it('distinguishes note highlights by shape as well as colour', () => {
    const notes: TabNote[] = [
      { string: 1, fret: 1, style: 'correct' },
      { string: 1, fret: 2, style: 'wrong' },
      { string: 1, fret: 3, style: 'ghost' },
      { string: 1, fret: 4, style: 'current' },
    ];
    render(<TabStaff notes={notes} cursor={0} />);
    const [correct, wrong, ghost, current] = screen.getAllByTestId('tab-note');
    // An explicit style wins over the cursor.
    expect(correct).toHaveAttribute('data-style', 'correct');
    expect(correct!.querySelector('circle')).not.toBeNull();
    expect(wrong!.querySelector('rect')!.getAttribute('transform')).toMatch(/^rotate\(45/);
    expect(ghost!.querySelector('rect')).not.toBeNull();
    expect(current).toHaveAttribute('data-style', 'current');
  });

  it('highlights and flashes lines', () => {
    render(
      <TabStaff
        lineMarks={[
          { string: 2, style: 'selected' },
          { string: 3, style: 'correct' },
          { string: 4, style: 'wrong' },
        ]}
      />,
    );
    const lines = screen.getAllByTestId('tab-line');
    expect(attr(lines, 'data-mark')).toEqual([null, 'selected', 'correct', 'wrong', null, null]);
    expect(lines[1]!.getAttribute('class')).toMatch(/selectedLine/);
    expect(lines[2]!.getAttribute('class')).toMatch(/correctLine/);
    expect(lines[3]!.getAttribute('class')).toMatch(/wrongLine/);
  });

  describe('picking a line', () => {
    it('makes each line a button that reports its string', () => {
      const onPick = vi.fn();
      render(<TabStaff onPickLine={onPick} lineMarks={[{ string: 3, style: 'selected' }]} />);
      const buttons = screen.getAllByRole('button');
      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
        'string 1, e',
        'string 2, B',
        'string 3, G',
        'string 4, D',
        'string 5, A',
        'string 6, E',
      ]);
      fireEvent.pointerDown(screen.getByRole('button', { name: 'string 5, A' }));
      expect(onPick).toHaveBeenCalledWith(5);
      expect(screen.getByRole('button', { name: 'string 3, G' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: 'string 1, e' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('works from the keyboard', () => {
      const onPick = vi.fn();
      render(<TabStaff onPickLine={onPick} />);
      const line = screen.getByRole('button', { name: 'string 2, B' });
      fireEvent.keyDown(line, { key: 'Enter' });
      fireEvent.keyDown(line, { key: ' ' });
      fireEvent.keyDown(line, { key: 'x' });
      expect(onPick).toHaveBeenCalledTimes(2);
      expect(onPick).toHaveBeenLastCalledWith(2);
    });

    it('gives every line a band at least 44pt tall at the smallest scale', () => {
      const { container } = render(<TabStaff onPickLine={() => {}} />);
      const svg = container.querySelector('svg')!;
      const minWidth = parseFloat(svg.style.minWidth);
      const viewWidth = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
      for (const b of screen.getAllByRole('button')) {
        expect(Number(b.getAttribute('height')) * (minWidth / viewWidth)).toBeGreaterThanOrEqual(
          44,
        );
      }
    });

    it('is not interactive without a handler', () => {
      render(<TabStaff notes={PHRASE} />);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('keeps faded names out of the button labels', () => {
      render(<TabStaff onPickLine={() => {}} guideLevel={1} />);
      expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
        'string 1, e',
        'string 2',
        'string 3',
        'string 4',
        'string 5',
        'string 6, E',
      ]);
    });
  });

  describe('guide fading', () => {
    const names = (level: GuideLevel) => {
      const { unmount } = render(<TabStaff guideLevel={level} />);
      const out = screen.queryAllByTestId('tab-line-name').map((n) => n.textContent);
      unmount();
      return out;
    };

    it('fades the string names away', () => {
      expect(names(3)).toEqual(['e1', 'B2', 'G3', 'D4', 'A5', 'E6']);
      expect(names(2)).toEqual(['e', 'B', 'G', 'D', 'A', 'E']);
      expect(names(1)).toEqual(['e', 'E']);
      expect(names(0)).toEqual([]);
    });

    it('never hides the fret numbers', () => {
      for (const level of [0, 1, 2, 3] as GuideLevel[]) {
        const { unmount } = render(<TabStaff notes={PHRASE} guideLevel={level} />);
        expect(screen.getAllByRole('img')).toHaveLength(4);
        unmount();
      }
    });
  });

  it('names the lines from the tuning', () => {
    render(<TabStaff tuning={DROP_D_TUNING} guideLevel={2} />);
    expect(screen.getAllByTestId('tab-line-name').map((n) => n.textContent)).toEqual([
      'e',
      'B',
      'G',
      'D',
      'A',
      'D',
    ]);
  });
});
