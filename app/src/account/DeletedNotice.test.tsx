import { afterEach, describe, expect, it } from 'vitest';
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

  it('survives the restart after a clear, in session storage', () => {
    sessionStorage.setItem(DELETED_NOTICE_KEY, 'cleared');
    render(<DeletedNotice />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your account is deleted, and so is the progress on this device.',
    );
  });

  it('ignores anything else stored under its key', () => {
    sessionStorage.setItem(DELETED_NOTICE_KEY, 'nonsense');
    expect(loadDeletedNotice()).toBeNull();
  });
});
