import { describe, expect, it } from 'vitest';
import { codeError, linkError, startError, waitFor } from './copy';

describe('sign-in copy', () => {
  it('says how long to wait in seconds, then minutes', () => {
    expect(waitFor(1)).toBe('1 second');
    expect(waitFor(42)).toBe('42 seconds');
    expect(waitFor(60)).toBe('60 seconds');
    expect(waitFor(61)).toBe('2 minutes');
    expect(waitFor(120)).toBe('2 minutes');
  });

  it('explains each failure to send', () => {
    expect(startError({ kind: 'sent', pending: {} as never })).toBeNull();
    expect(startError({ kind: 'invalid-email' })).toMatch(/doesn’t look like an email/);
    expect(startError({ kind: 'rate-limited', retryAfter: 1800 })).toMatch(/30 minutes/);
    expect(startError({ kind: 'error', trouble: 'offline' })).toMatch(/online/);
    expect(startError({ kind: 'error', trouble: 'server' })).toMatch(/our side/);
  });

  it('covers wrong, used, expired and spent codes', () => {
    expect(codeError({ kind: 'signed-in', account: {} as never })).toBeNull();
    const wrong = codeError({ kind: 'wrong', attemptsLeft: 3 });
    expect(wrong).toMatch(/didn’t work/);
    expect(wrong).toMatch(/each code works once/);
    expect(wrong).toMatch(/3 tries left/);
    expect(codeError({ kind: 'wrong', attemptsLeft: 1 })).toMatch(/1 try left/);
    expect(codeError({ kind: 'too-many' })).toMatch(/Open the link in the same email/);
    expect(codeError({ kind: 'expired' })).toMatch(/expired: codes last 15 minutes/);
    expect(codeError({ kind: 'invalid-code' })).toMatch(/6-digit code/);
    expect(codeError({ kind: 'no-pending' })).toMatch(/email first/);
    expect(codeError({ kind: 'error', trouble: 'offline' })).toMatch(/online/);
  });

  it('explains a link that didn’t work', () => {
    expect(linkError({ kind: 'signed-in', account: {} as never })).toBeNull();
    expect(linkError({ kind: 'link-failed' })).toMatch(/already been used or has expired/);
    expect(linkError({ kind: 'error', trouble: 'server' })).toMatch(/our side/);
  });
});
