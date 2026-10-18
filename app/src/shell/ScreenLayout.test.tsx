import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScreenLayout } from './ScreenLayout';

const size = { w: window.innerWidth, h: window.innerHeight };
function resize(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
  window.dispatchEvent(new Event('resize'));
}

function renderLayout() {
  return render(
    <ScreenLayout title="Today" contextTitle="Why daily practice" context={<p>Short and often</p>}>
      <p>Main</p>
    </ScreenLayout>,
  );
}

describe('<ScreenLayout>', () => {
  afterEach(() => resize(size.w, size.h));

  it('shows the context panel alongside on iPad', () => {
    resize(1194, 834);
    renderLayout();
    expect(screen.getByTestId('context-panel')).toHaveTextContent('Short and often');
    expect(screen.queryByRole('button', { name: /why daily practice/i })).toBeNull();
  });

  it('turns the context panel into a sheet on compact', () => {
    resize(393, 659);
    renderLayout();
    expect(screen.queryByTestId('context-panel')).toBeNull();
    expect(screen.queryByTestId('context-sheet')).toBeNull();

    const toggle = screen.getByRole('button', { name: 'Show why daily practice' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const sheet = screen.getByRole('complementary', { name: 'Why daily practice' });
    expect(sheet).toHaveTextContent('Short and often');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', sheet.id);
    expect(toggle).toHaveTextContent('Hide why daily practice');
    // Focus moves into the sheet, and back to the toggle when it closes.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('context-sheet')).toBeNull();
    expect(document.activeElement).toBe(toggle);

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('context-sheet')).toBeNull();
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.queryByTestId('context-sheet')).toBeNull();
  });

  it('ignores other keys while the sheet is open', () => {
    resize(393, 659);
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Show why daily practice' }));
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByTestId('context-sheet')).toBeInTheDocument();
  });

  it('renders without a context panel', () => {
    resize(393, 659);
    render(<ScreenLayout>Main</ScreenLayout>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
