import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MovedNotice, movedTo } from './MovedNotice';

vi.mock('../storage/download-export', () => ({
  downloadExport: vi.fn(() => Promise.resolve('fretwork-2026-10-18.json')),
}));

describe('movedTo', () => {
  it('maps the old hosted domain to the new one', () => {
    expect(movedTo('guitar.dwellsee.com')).toBe('https://fretfree.app');
  });

  it('leaves every other host alone, including self-hosted copies', () => {
    expect(movedTo('fretfree.app')).toBeNull();
    expect(movedTo('localhost')).toBeNull();
    expect(movedTo('guitar.example.com')).toBeNull();
    expect(movedTo('constructor')).toBeNull();
  });
});

describe('<MovedNotice>', () => {
  it('explains the move and how to bring progress along', () => {
    render(<MovedNotice target="https://fretfree.app" />);
    const notice = screen.getByRole('complementary', { name: 'Moved to fretfree.app' });
    expect(notice).toHaveTextContent('This app has moved to fretfree.app');
    expect(notice).toHaveTextContent('Progress → Your data → Import data');
    expect(screen.getByRole('link', { name: 'Open fretfree.app' })).toHaveAttribute(
      'href',
      'https://fretfree.app',
    );
  });

  it('exports progress and says what to do next', async () => {
    const { downloadExport } = await import('../storage/download-export');
    render(<MovedNotice target="https://fretfree.app" />);
    await userEvent.click(screen.getByRole('button', { name: 'Export my progress' }));
    expect(downloadExport).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved fretwork-2026-10-18.json. Now open fretfree.app and import it.',
    );
  });
});
