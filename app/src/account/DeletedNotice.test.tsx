import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeletedNotice } from './DeletedNotice';
import { DELETED_NOTICE_KEY, loadDeletedNotice, saveDeletedNotice } from './deleted-notice';

afterEach(() => saveDeletedNotice(null));

describe('DeletedNotice', () => {
  it('shows nothing until a delete finishes away from Progress', () => {
    const { container } = render(<DeletedNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says the account is deleted and the progress kept, until dismissed', async () => {
    render(<DeletedNotice />);
    act(() => saveDeletedNotice('kept'));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your account is deleted. Your progress is still here on this device.',
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(loadDeletedNotice()).toBeNull();
  });

  it('keeps a notice in session storage for the restart after a clear', () => {
    saveDeletedNotice('cleared');
    expect(sessionStorage.getItem(DELETED_NOTICE_KEY)).toBe('cleared');
  });

  it('shows a notice from before a restart once, and not again on a later reload', async () => {
    sessionStorage.setItem(DELETED_NOTICE_KEY, 'cleared');
    // A fresh page load: the modules start over.
    vi.resetModules();
    const fresh = await import('./DeletedNotice');
    const store = await import('./deleted-notice');
    render(<fresh.DeletedNotice />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your account is deleted, and so is the progress on this device.',
    );
    expect(sessionStorage.getItem(DELETED_NOTICE_KEY)).toBeNull();
    vi.resetModules();
    expect((await import('./deleted-notice')).loadDeletedNotice()).toBeNull();
    store.saveDeletedNotice(null);
  });

  it('ignores anything else stored under its key', async () => {
    sessionStorage.setItem(DELETED_NOTICE_KEY, 'nonsense');
    vi.resetModules();
    expect((await import('./deleted-notice')).loadDeletedNotice()).toBeNull();
  });
});
