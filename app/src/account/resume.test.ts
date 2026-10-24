// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resumeAccountDeletion, watchAccountDeletion } from './resume';
import { saveDeletion } from './store';
import { TOKENS } from './test-fakes';

afterEach(() => {
  saveDeletion(null);
  localStorage.clear();
});

/** A deletion module whose flow records each resume. */
function fakeModule() {
  const resume = vi.fn(async () => undefined);
  const load = vi.fn(async () => ({
    getAccountDeletion: () => ({
      resume,
      status: () => ({ phase: 'idle' as const }),
      subscribe: () => () => undefined,
      request: async () => undefined,
      dismiss: () => undefined,
    }),
  }));
  return { load, resume };
}

const waiting = () =>
  saveDeletion({ email: 'a@b.co', tokens: TOKENS, keepLocal: false, requestedAt: 0 });

describe('watchAccountDeletion', () => {
  it('resumes a delete from before the page load at once', async () => {
    waiting();
    const { load, resume } = fakeModule();
    const stop = watchAccountDeletion(load);
    await vi.waitFor(() => expect(resume).toHaveBeenCalledOnce());
    stop();
  });

  it('joins a delete another tab starts, once', async () => {
    const { load, resume } = fakeModule();
    const stop = watchAccountDeletion(load);
    expect(load).not.toHaveBeenCalled();
    waiting();
    await vi.waitFor(() => expect(resume).toHaveBeenCalledOnce());
    // Its own later writes (a refreshed token) don't start another.
    waiting();
    await new Promise((r) => setTimeout(r, 10));
    expect(resume).toHaveBeenCalledOnce();
    stop();
    saveDeletion(null);
    waiting();
    await new Promise((r) => setTimeout(r, 10));
    expect(resume).toHaveBeenCalledOnce();
  });
});

describe('resumeAccountDeletion', () => {
  it('loads nothing when no delete is waiting', async () => {
    const load = vi.fn();
    await resumeAccountDeletion(load);
    expect(load).not.toHaveBeenCalled();
  });

  it('resumes a waiting delete', async () => {
    saveDeletion({ email: 'a@b.co', tokens: TOKENS, keepLocal: true, requestedAt: 0 });
    const resume = vi.fn(async () => undefined);
    await resumeAccountDeletion(async () => ({
      getAccountDeletion: () => ({
        resume,
        status: () => ({ phase: 'idle' }),
        subscribe: () => () => undefined,
        request: async () => undefined,
        dismiss: () => undefined,
      }),
    }));
    expect(resume).toHaveBeenCalledOnce();
  });

  it('shrugs off a chunk that fails to load', async () => {
    saveDeletion({ email: 'a@b.co', tokens: TOKENS, keepLocal: true, requestedAt: 0 });
    await expect(
      resumeAccountDeletion(() => Promise.reject(new Error('chunk'))),
    ).resolves.toBeUndefined();
  });
});
