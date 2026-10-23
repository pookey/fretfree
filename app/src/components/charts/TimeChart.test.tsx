import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TimeChart, type TimeChartProps } from './TimeChart';

const dates = ['2026-10-20', '2026-10-21', '2026-10-22'];
const base: TimeChartProps = {
  kind: 'area',
  dates,
  label: 'Items you know',
  summary: 'Today: 5 learning.',
  format: (v) => String(v),
  series: [
    { id: 'stable', label: 'Stable', colour: 'var(--chart-stable)', values: [0, 1, 2] },
    { id: 'learning', label: 'Learning', colour: 'var(--chart-learning)', values: [2, 3, 3] },
  ],
  totalLabel: 'Total',
  testId: 'chart',
};

describe('<TimeChart>', () => {
  it('is an image named by its label and summary, with a legend for two series', () => {
    render(<TimeChart {...base} />);
    expect(screen.getByRole('img', { name: 'Items you know. Today: 5 learning.' })).toBeVisible();
    const legend = screen.getByRole('list');
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Stable', 'Learning']);
  });

  it('has the same numbers as a table, with the stack total', () => {
    render(<TimeChart {...base} />);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('DayStableLearningTotal');
    expect(rows[3]).toHaveTextContent('22 Oct235');
  });

  it('shows a tooltip for the day under the pointer and hides it on leave', () => {
    const { container } = render(<TimeChart {...base} />);
    const hit = container.querySelector('rect') as SVGRectElement;
    fireEvent.pointerMove(hit, { clientX: 0 });
    const tip = screen.getByTestId('chart-tooltip');
    expect(tip).toHaveTextContent('20 Oct');
    expect(tip).toHaveTextContent('Stable: 0');
    expect(tip).toHaveTextContent('Total: 2');
    fireEvent.pointerLeave(hit);
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });

  it('draws a single series line with markers, a reference line and no legend', () => {
    const { container } = render(
      <TimeChart
        {...base}
        kind="line"
        series={[{ id: 'ms', label: 'Median', colour: 'red', values: [3000, null, 2000] }]}
        reference={{ value: 2500, label: 'Target 2.5 s' }}
        totalLabel={undefined}
      />,
    );
    expect(container.querySelectorAll('circle')).toHaveLength(2);
    expect(screen.getByText('Target 2.5 s')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getAllByRole('row')[2]).toHaveTextContent('—');
  });

  it('draws bars, and a lone day of an area as a column', () => {
    const bars = render(
      <TimeChart
        {...base}
        kind="bar"
        series={[{ id: 'due', label: 'Due', colour: 'blue', values: [4, 0, 2] }]}
        formatDate={(d) => d.slice(-2)}
      />,
    );
    // Zero-height bars draw nothing.
    expect(bars.container.querySelectorAll('svg path')).toHaveLength(2);
    expect(screen.getAllByText('20').length).toBeGreaterThan(0);
    bars.unmount();

    const lone = render(
      <TimeChart
        {...base}
        dates={['2026-10-23']}
        series={base.series.map((s) => ({ ...s, values: [2] }))}
      />,
    );
    expect(lone.container.querySelectorAll('svg path')).toHaveLength(2);
  });
});
