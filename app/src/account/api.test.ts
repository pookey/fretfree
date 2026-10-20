import { describe, expect, it, vi } from 'vitest';
import { AccountApiError, createAccountApi } from './api';
import { HOSTED_API_URL, syncApiUrl } from './endpoint';

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers });

const CONFIG = { region: 'us-east-1', userPoolId: 'us-east-1_pool', userPoolClientId: 'client' };

describe('syncApiUrl', () => {
  it('is the hosted API unless the build says otherwise', () => {
    expect(syncApiUrl(undefined)).toBe(HOSTED_API_URL);
    expect(syncApiUrl('https://api.example.test/')).toBe('https://api.example.test');
  });

  it('turns accounts off when set empty', () => {
    expect(syncApiUrl('')).toBeNull();
    expect(syncApiUrl('  ')).toBeNull();
  });
});

describe('account API', () => {
  it('fetches the pool and client IDs once, without credentials', async () => {
    const fetchFn = vi.fn(async () => reply(200, CONFIG));
    const api = createAccountApi('https://api.test', fetchFn);
    expect(await api.config()).toEqual(CONFIG);
    expect(await api.config()).toEqual(CONFIG);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.test/config',
      expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }),
    );
  });

  it('asks again after a failed config fetch', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(reply(200, { region: 'us-east-1' }))
      .mockResolvedValueOnce(reply(200, CONFIG));
    const api = createAccountApi('https://api.test', fetchFn);
    await expect(api.config()).rejects.toThrow(new AccountApiError('network'));
    await expect(api.config()).rejects.toThrow('config');
    expect(await api.config()).toEqual(CONFIG);
  });

  it('posts the email and reads 202 as sent', async () => {
    const fetchFn = vi.fn(async () => reply(202, { ok: true, expiresIn: 900 }));
    const api = createAccountApi('https://api.test', fetchFn);
    expect(await api.start('a@b.co')).toEqual({ kind: 'sent', expiresIn: 900 });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.test/auth/start',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'a@b.co' }) }),
    );
  });

  it('reads 202 without an expiry as an unknown one', async () => {
    const api = createAccountApi('https://api.test', async () => reply(202, {}));
    expect(await api.start('a@b.co')).toEqual({ kind: 'sent', expiresIn: 0 });
  });

  it('maps 400 invalid-email and 429 rate limits', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(400, { error: 'invalid-email' }))
      .mockResolvedValueOnce(reply(429, { error: 'rate-limited', retryAfter: 42.2 }))
      .mockResolvedValueOnce(reply(429, undefined, { 'retry-after': '120' }))
      .mockResolvedValueOnce(reply(429, undefined));
    const api = createAccountApi('https://api.test', fetchFn);
    expect(await api.start('x')).toEqual({ kind: 'invalid-email' });
    expect(await api.start('a@b.co')).toEqual({ kind: 'rate-limited', retryAfter: 43 });
    expect(await api.start('a@b.co')).toEqual({ kind: 'rate-limited', retryAfter: 120 });
    expect(await api.start('a@b.co')).toEqual({ kind: 'rate-limited', retryAfter: 60 });
  });

  it('throws on anything else, with the status', async () => {
    const api = createAccountApi(
      'https://api.test',
      async () => new Response('<html>', { status: 502 }),
    );
    await expect(api.start('a@b.co')).rejects.toMatchObject({ message: 'start', status: 502 });
  });
});
