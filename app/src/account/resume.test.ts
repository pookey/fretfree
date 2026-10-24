// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resumeAccountDeletion } from './resume';
import { saveDeletion } from './store';
import { TOKENS } from './test-fakes';

afterEach(() => {
  saveDeletion(null);
  localStorage.clear();
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
