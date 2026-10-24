import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { getDb } from '../storage';
import { saveAccount, saveDeletion } from './store';
import { TOKENS } from './test-fakes';
import { AccountOfferCard } from './TodayCard';

async function sessions(finished: number, unfinished = 0) {
  const db = getDb();
  for (let i = 0; i < finished + unfinished; i++) {
    await db.sessionLogs.add({
      startedAt: new Date(2026, 9, i + 1),
      endedAt: i < finished ? new Date(2026, 9, i + 1, 0, 10) : null,
      itemsSeen: 10,
      accuracy: 0.9,
    } as never);
  }
}

function renderCard() {
  const view = render(
    <MemoryRouter>
      <AccountOfferCard />
    </MemoryRouter>,
  );
  return { ...view, user: userEvent.setup() };
}

const offer = () => screen.findByRole('region', { name: 'Save your progress across devices' });

beforeEach(async () => {
  await getDb().sessionLogs.clear();
});

afterEach(() => {
  saveAccount(null);
  saveDeletion(null);
  localStorage.clear();
  // Drop the store's cached values too, as a clear in another tab would.
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
});

describe('Today’s account offer', () => {
  it('waits for a few finished sessions', async () => {
    await sessions(2, 3);
    const { container } = renderCard();
    // Let the session count load.
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it('offers to save progress after three sessions, linking to the Progress panel', async () => {
    await sessions(3);
    renderCard();
    const card = await offer();
    expect(card).toHaveTextContent('It’s optional');
    expect(screen.getByRole('link', { name: 'Save my progress' })).toHaveAttribute(
      'href',
      '/progress#account',
    );
  });

  it('hides for good on "Not now"', async () => {
    await sessions(3);
    const { user, unmount } = renderCard();
    await user.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('region')).toBeNull();
    unmount();
    const { container } = renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it('stays away once signed in', async () => {
    await sessions(3);
    saveAccount({ email: 'a@b.co', tokens: TOKENS, signedInAt: 1 });
    const { container } = renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it('stays away while an account delete is waiting to finish, then comes back', async () => {
    await sessions(3);
    saveDeletion({ email: 'a@b.co', tokens: TOKENS, keepLocal: true, requestedAt: 1 });
    const { container } = renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
    act(() => saveDeletion(null));
    expect(await offer()).toBeVisible();
  });
});
