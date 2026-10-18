import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createScheduler } from '../../engine/scheduler';
import { buildHeatmap, forecastByString, type HeatCell } from './aggregate';
import { CellDetail } from './CellDetail';
import { OPEN_W, PAD_X } from '../fretboard/geometry';
import { FretboardHeatmap } from './FretboardHeatmap';
import { HeatmapLegend } from './HeatmapLegend';
import { HEAT_COLOURS } from './palette';
import { RetentionForecast } from './RetentionForecast';

const NOW = new Date('2026-10-18T12:00:00Z');
const scheduler = createScheduler({ enableFuzz: false });
const TARGETS = { targetMs: 2700, fluentTargetMs: 1700 };
const RANGE = { from: 0, to: 12 };

const cards = [
  scheduler.seedKnownCard({ id: 'note@s5f7', skillId: 't' }, NOW, 12),
  scheduler.seedKnownCard({ id: 'note@s6f3', skillId: 't' }, NOW, 0.5),
];
const logs = [
  {
    itemId: 'note@s6f3',
    skillId: 't',
    drillType: 'name-the-note',
    correct: true,
    responseMs: 4200,
    rating: 2 as const,
    hintUsed: false,
    answerGiven: 'G',
    at: NOW,
  },
];
const cells = buildHeatmap({
  cards,
  logs,
  fretRange: RANGE,
  targets: TARGETS,
  now: NOW,
  retrievability: scheduler.retrievability,
});
const cell = (s: number, f: number) =>
  cells.find((c) => c.string === s && c.fret === f) as HeatCell;

describe('<FretboardHeatmap>', () => {
  it('draws a tile per practised cell, coloured by band and flagged when slow', () => {
    render(<FretboardHeatmap cells={cells} fretRange={RANGE} />);
    const tiles = screen.getAllByTestId('heat-tile');
    expect(tiles).toHaveLength(2);
    const s5f7 = tiles.find((t) => t.getAttribute('data-cell') === 's5f7')!;
    expect(s5f7).toHaveAttribute('data-band', '2');
    expect(s5f7).toHaveAttribute('data-slow', 'false');
    expect(s5f7.style.fill).not.toBe('');
    const s6f3 = tiles.find((t) => t.getAttribute('data-cell') === 's6f3')!;
    expect(s6f3).toHaveAttribute('data-band', '0');
    expect(s6f3).toHaveAttribute('data-slow', 'true');
  });

  it('makes every cell a labelled button that selects on tap or Enter', () => {
    const onSelect = vi.fn();
    render(<FretboardHeatmap cells={cells} fretRange={RANGE} onSelect={onSelect} />);
    const neck = screen.getByRole('group', { name: 'Fretboard mastery map' });
    expect(within(neck).getAllByRole('button')).toHaveLength(6 * 13);
    fireEvent.click(
      screen.getByRole('button', { name: 'string 5, fret 7, E: stable for 12 days' }),
    );
    expect(onSelect).toHaveBeenCalledWith({ string: 5, fret: 7 });
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'string 6, fret 3, G: stable for under a day, slow' }),
      { key: 'Enter' },
    );
    expect(onSelect).toHaveBeenLastCalledWith({ string: 6, fret: 3 });
    fireEvent.keyDown(screen.getByRole('button', { name: /string 1, fret 0/ }), { key: 'x' });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('outlines the selected cell and labels the strings', () => {
    const { container } = render(
      <FretboardHeatmap cells={cells} fretRange={RANGE} selected={{ string: 5, fret: 7 }} />,
    );
    expect(screen.getByTestId('heat-selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /string 5, fret 7/, pressed: true })).toBeVisible();
    expect(container.querySelectorAll('text')).not.toHaveLength(0);
  });

  it('spells cell labels with the accidental preference, matching the detail', () => {
    render(<FretboardHeatmap cells={cells} fretRange={RANGE} accidentalPref="flat" />);
    expect(
      screen.getByRole('button', { name: 'string 5, fret 1, Bb: not practised yet' }),
    ).toBeInTheDocument();
  });

  it('mirrors for left-handed players and falls back to plain labels for missing cells', () => {
    render(<FretboardHeatmap cells={[]} fretRange={RANGE} handedness="left" />);
    const neck = screen.getByRole('group', { name: 'Fretboard mastery map' });
    expect(neck).toHaveAttribute('data-handedness', 'left');
    expect(neck.getAttribute('viewBox')).toMatch(/^0 /);
    expect(screen.getByRole('button', { name: 'string 3, fret 4' })).toBeInTheDocument();
    expect(screen.queryAllByTestId('heat-tile')).toHaveLength(0);
  });
});

describe('<FretboardHeatmap> fit and scroll', () => {
  /** Give the scroll box a layout jsdom lacks, for as long as the test runs. */
  function layout(scrollWidth: number, clientWidth: number) {
    const proto = HTMLElement.prototype;
    const sw = vi.spyOn(proto, 'scrollWidth', 'get').mockReturnValue(scrollWidth);
    const cw = vi.spyOn(proto, 'clientWidth', 'get').mockReturnValue(clientWidth);
    return () => {
      sw.mockRestore();
      cw.mockRestore();
    };
  }

  it('keeps every hit cell at 44pt or more at its minimum width', () => {
    render(<FretboardHeatmap cells={cells} fretRange={RANGE} />);
    const neck = screen.getByRole('group', { name: 'Fretboard mastery map' });
    const minWidth = parseFloat(neck.style.minWidth);
    const scale = minWidth / Number(neck.getAttribute('viewBox')!.split(' ')[2]);
    const widths = within(neck)
      .getAllByRole('button')
      .map((b) => Number(b.getAttribute('width')) * scale);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(44);
    // The open-string column reaches over the end padding, so it isn't the narrowest.
    const open = screen.getByRole('button', { name: /^string 1, fret 0\b/ });
    expect(Number(open.getAttribute('width'))).toBe(OPEN_W + PAD_X);
    // 12 frets fit an iPad portrait panel (about 698pt) at that width.
    expect(minWidth).toBeLessThanOrEqual(680);
    for (let fret = 1; fret <= 12; fret++) {
      expect(screen.getByTestId(`heat-fret-${fret}`)).toHaveTextContent(String(fret));
    }
  });

  it('says nothing about scrolling when the neck fits', () => {
    const restore = layout(700, 700);
    render(<FretboardHeatmap cells={cells} fretRange={RANGE} />);
    restore();
    const edges = screen.getByTestId('heatmap-scroll').parentElement!;
    expect(edges).toHaveAttribute('data-more-left', 'false');
    expect(edges).toHaveAttribute('data-more-right', 'false');
    expect(screen.queryByTestId('heatmap-scroll-hint')).toBeNull();
  });

  it('fades the side with more neck and hints at scrolling when it does not fit', () => {
    const restore = layout(865, 720);
    render(<FretboardHeatmap cells={cells} fretRange={{ from: 0, to: 15 }} />);
    const scroll = screen.getByTestId('heatmap-scroll');
    const edges = scroll.parentElement!;
    expect(scroll.scrollLeft).toBe(0);
    expect(edges).toHaveAttribute('data-more-right', 'true');
    expect(edges).toHaveAttribute('data-more-left', 'false');
    expect(screen.getByTestId('heatmap-scroll-hint')).toHaveTextContent(
      'Scroll sideways to see the rest of the neck →',
    );

    scroll.scrollLeft = 145;
    fireEvent.scroll(scroll);
    restore();
    expect(edges).toHaveAttribute('data-more-right', 'false');
    expect(edges).toHaveAttribute('data-more-left', 'true');
    expect(screen.getByTestId('heatmap-scroll-hint')).toHaveTextContent(
      '← Scroll sideways to see the rest of the neck',
    );
  });

  it('starts a left-handed neck scrolled to the nut, on the right', () => {
    const restore = layout(865, 720);
    render(<FretboardHeatmap cells={cells} fretRange={{ from: 0, to: 15 }} handedness="left" />);
    restore();
    const scroll = screen.getByTestId('heatmap-scroll');
    expect(scroll.scrollLeft).toBe(865);
    expect(scroll.parentElement).toHaveAttribute('data-more-left', 'true');
  });

  it('re-measures when its box resizes', () => {
    const observers: ResizeObserverCallback[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          observers.push(cb);
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const { unmount } = render(<FretboardHeatmap cells={cells} fretRange={RANGE} />);
    const edges = screen.getByTestId('heatmap-scroll').parentElement!;
    expect(edges).toHaveAttribute('data-more-right', 'false');
    const restore = layout(800, 600);
    act(() => observers.forEach((cb) => cb([], {} as ResizeObserver)));
    restore();
    expect(edges).toHaveAttribute('data-more-right', 'true');
    unmount();
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('<HeatmapLegend>', () => {
  it('lists the sequential bands in order plus the empty and slow cues', () => {
    render(<HeatmapLegend bounds={[1, 7, 21, 90]} targetMs={2700} />);
    const scale = screen.getByRole('list', { name: /memory stability/i });
    const items = within(scale).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual([
      'Under 1 day',
      '1–7 days',
      '7–21 days',
      '21–90 days',
      '90 days or more',
    ]);
    expect(items).toHaveLength(HEAT_COLOURS.length);
    const legend = screen.getByTestId('heatmap-legend');
    expect(legend).toHaveTextContent('Not practised yet');
    expect(legend).toHaveTextContent('slow (median answer over 2.7s)');
  });
});

describe('<CellDetail>', () => {
  const props = { now: NOW, targetMs: 2700, forecastDays: 7 };

  it('prompts for a tap before anything is selected', () => {
    render(<CellDetail cell={null} {...props} />);
    expect(screen.getByTestId('heat-cell-detail')).toHaveTextContent('Tap a cell');
  });

  it('shows a practised cell’s stats', () => {
    render(<CellDetail cell={cell(6, 3)} {...props} accidentalPref="flat" />);
    const detail = screen.getByTestId('heat-cell-detail');
    expect(within(detail).getByRole('heading')).toHaveTextContent('String 6, fret 3 · G');
    expect(screen.getByTestId('heat-stability')).toHaveTextContent('under a day');
    expect(screen.getByTestId('heat-median')).toHaveTextContent('4.2s (target 2.7s)');
    expect(screen.getByTestId('heat-answers')).toHaveTextContent('1 of 1 right');
    expect(screen.getByTestId('heat-forecast')).toHaveTextContent(/^\d+%$/);
    expect(detail).toHaveTextContent('Recall now');
    expect(detail).toHaveTextContent('Next review');
  });

  it('says so when a cell has no answers or isn’t practised', () => {
    const { rerender } = render(<CellDetail cell={cell(5, 7)} {...props} />);
    expect(screen.getByTestId('heat-median')).toHaveTextContent('—');
    rerender(<CellDetail cell={cell(1, 1)} {...props} />);
    expect(screen.getByTestId('heat-cell-detail')).toHaveTextContent('String 1, fret 1 · F');
    expect(screen.getByTestId('heat-cell-detail')).toHaveTextContent('Not practised yet');
  });
});

describe('<RetentionForecast>', () => {
  it('forecasts each practised string', () => {
    const forecasts = forecastByString({
      cards,
      now: NOW,
      retrievability: scheduler.retrievability,
    });
    render(<RetentionForecast forecasts={forecasts} forecastDays={7} />);
    expect(screen.getByTestId('forecast-string-5')).toHaveTextContent(
      /^You'll remember ~\d+% of string 5 next week\. \(1 fact practised\)$/,
    );
    expect(screen.getByTestId('forecast-string-6')).toBeInTheDocument();
    expect(screen.queryByTestId('forecast-string-1')).toBeNull();
  });

  it('pluralises and explains the empty state', () => {
    const { rerender } = render(
      <RetentionForecast forecasts={[{ string: 4, practised: 3, recall: 0.8 }]} forecastDays={7} />,
    );
    expect(screen.getByTestId('forecast-string-4')).toHaveTextContent('(3 facts practised)');
    rerender(
      <RetentionForecast
        forecasts={[{ string: 4, practised: 0, recall: null }]}
        forecastDays={7}
      />,
    );
    expect(screen.getByTestId('retention-forecast')).toHaveTextContent(/Practise a session/);
  });
});
