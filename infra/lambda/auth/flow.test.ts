import { describe, expect, it } from 'vitest';
import type { HttpEvent } from '../shared/http';
import { SIGN_IN } from './config';
import type { SignInEmail } from './email';
import { createStartHandler } from './start';
import { memoryStore } from './store';
import { createTriggerHandler, defineChallenge, type TriggerEvent } from './triggers';

/** POST /auth/start and the Cognito triggers on one store and one clock. */
function rig() {
  const store = memoryStore();
  const clock = { ms: 1_700_000_000_000 };
  const sent: { to: string; message: SignInEmail }[] = [];
  const users = new Set<string>();
  const mail = { failNext: false };
  const start = createStartHandler({
    store,
    now: () => clock.ms,
    siteUrl: 'https://fretfree.app',
    brand: 'Fret Free',
    ensureUser: async (email) => void users.add(email),
    sendEmail: async (to, message) => {
      if (mail.failNext) {
        mail.failNext = false;
        throw new Error('SES is down');
      }
      sent.push({ to, message });
    },
  });
  const triggers = createTriggerHandler({ store, now: () => clock.ms });
  const request = (body: unknown, ip = '203.0.113.9') =>
    start({
      routeKey: 'POST /auth/start',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      requestContext: { http: { sourceIp: ip } },
    } satisfies HttpEvent);
  const answer = async (email: string, challengeAnswer: string) => {
    const event: TriggerEvent = {
      triggerSource: 'VerifyAuthChallengeResponse_Authentication',
      request: { userAttributes: { email }, challengeAnswer },
      response: {},
    };
    return (await triggers(event)).response.answerCorrect;
  };
  /** The code and link token from the last email. */
  const lastEmail = () => {
    const { message } = sent.at(-1)!;
    const code = /(\d{6}) is your/.exec(message.subject)![1]!;
    const link = new URL(/https:\S+/.exec(message.text)![0]);
    const token = new URLSearchParams(link.hash.slice(1)).get('token')!;
    return { code, token, link };
  };
  const advance = (seconds: number) => (clock.ms += seconds * 1000);
  return { store, sent, users, mail, request, answer, lastEmail, advance, triggers };
}

describe('POST /auth/start', () => {
  it('creates the user and sends one email with a code and a link', async () => {
    const r = rig();
    const res = await r.request({ email: ' Ada@Example.com ' });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body)).toEqual({ ok: true, expiresIn: SIGN_IN.ttlSeconds });
    expect([...r.users]).toEqual(['ada@example.com']);
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0]!.to).toBe('ada@example.com');
    const { link } = r.lastEmail();
    expect(link.origin + link.pathname).toBe('https://fretfree.app/account/verify');
    expect(new URLSearchParams(link.hash.slice(1)).get('email')).toBe('ada@example.com');
  });

  it('answers the same for a new and an existing address', async () => {
    const r = rig();
    const first = await r.request({ email: 'ada@example.com' });
    r.advance(SIGN_IN.resendCooldownSeconds);
    const again = await r.request({ email: 'ada@example.com' });
    expect(again).toEqual(first);
  });

  it('rejects a missing or malformed address without sending', async () => {
    const r = rig();
    for (const body of [{}, { email: 'nope' }, 'not json', { email: 7 }]) {
      const res = await r.request(body);
      expect(res.statusCode).toBe(400);
    }
    expect(r.sent).toHaveLength(0);
  });

  it('makes a second request wait for the cooldown', async () => {
    const r = rig();
    await r.request({ email: 'ada@example.com' });
    r.advance(10);
    const res = await r.request({ email: 'ada@example.com' });
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe(String(SIGN_IN.resendCooldownSeconds - 10));
    expect(r.sent).toHaveLength(1);
  });

  it('sends one email when two requests race, and makes the other wait', async () => {
    const r = rig();
    const [a, b] = await Promise.all([
      r.request({ email: 'ada@example.com' }),
      r.request({ email: 'ada@example.com' }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([202, 429]);
    expect(r.sent).toHaveLength(1);
    // The stored issue is the one that was emailed.
    expect(await r.answer('ada@example.com', r.lastEmail().code)).toBe(true);
  });

  it('starts no cooldown when the email fails to send', async () => {
    const r = rig();
    r.mail.failNext = true;
    await expect(r.request({ email: 'ada@example.com' })).rejects.toThrow('SES is down');
    expect(r.store.records.size).toBe(0);
    expect((await r.request({ email: 'ada@example.com' })).statusCode).toBe(202);
    expect(await r.answer('ada@example.com', r.lastEmail().code)).toBe(true);
  });

  it('limits emails per address per window', async () => {
    const r = rig();
    const statuses: number[] = [];
    for (let i = 0; i < SIGN_IN.emailsPerAddressPerHour + 1; i++) {
      statuses.push((await r.request({ email: 'ada@example.com' })).statusCode);
      r.advance(SIGN_IN.resendCooldownSeconds);
    }
    expect(statuses.at(-1)).toBe(429);
    expect(r.sent).toHaveLength(SIGN_IN.emailsPerAddressPerHour);
  });

  it('limits requests per IP across addresses', async () => {
    const r = rig();
    for (let i = 0; i < SIGN_IN.requestsPerIpPerHour; i++) {
      expect((await r.request({ email: `user${i}@example.com` })).statusCode).toBe(202);
    }
    expect((await r.request({ email: 'one-more@example.com' })).statusCode).toBe(429);
    expect((await r.request({ email: 'one-more@example.com' }, '198.51.100.1')).statusCode).toBe(
      202,
    );
  });
});

describe('verifying an answer', () => {
  it('signs in with the code, once', async () => {
    const r = rig();
    await r.request({ email: 'ada@example.com' });
    const { code } = r.lastEmail();
    expect(await r.answer('ada@example.com', code)).toBe(true);
    expect(await r.answer('ada@example.com', code)).toBe(false);
  });

  it('signs in with the link token, and then the code no longer works', async () => {
    const r = rig();
    await r.request({ email: 'ada@example.com' });
    const { code, token } = r.lastEmail();
    expect(await r.answer('Ada@Example.com', token)).toBe(true);
    expect(await r.answer('ada@example.com', code)).toBe(false);
  });

  it('expires after the TTL', async () => {
    const r = rig();
    await r.request({ email: 'ada@example.com' });
    const { code } = r.lastEmail();
    r.advance(SIGN_IN.ttlSeconds);
    expect(await r.answer('ada@example.com', code)).toBe(false);
  });

  it('stops checking after a few attempts, even with the right code', async () => {
    const r = rig();
    await r.request({ email: 'ada@example.com' });
    const { code } = r.lastEmail();
    for (let i = 0; i < SIGN_IN.maxAttempts; i++) {
      expect(await r.answer('ada@example.com', '000000')).toBe(false);
    }
    expect(await r.answer('ada@example.com', code)).toBe(false);
  });

  it('keeps the link working after the code attempts run out', async () => {
    const r = rig();
    await r.request({ email: 'ada@example.com' });
    const { token } = r.lastEmail();
    // Someone who knows only the address sends wrong codes until the code is dead.
    for (let i = 0; i < SIGN_IN.maxAttempts + 3; i++) {
      expect(await r.answer('ada@example.com', '000000')).toBe(false);
    }
    expect(await r.answer('ada@example.com', token)).toBe(true);
  });

  it("doesn't spend code attempts on wrong link tokens", async () => {
    const r = rig();
    await r.request({ email: 'ada@example.com' });
    const { code } = r.lastEmail();
    for (let i = 0; i < SIGN_IN.maxAttempts + 3; i++) {
      expect(await r.answer('ada@example.com', `not-the-token-${i}`)).toBe(false);
    }
    expect(await r.answer('ada@example.com', code)).toBe(true);
  });

  it('expires the link too', async () => {
    const r = rig();
    await r.request({ email: 'ada@example.com' });
    const { token } = r.lastEmail();
    r.advance(SIGN_IN.ttlSeconds);
    expect(await r.answer('ada@example.com', token)).toBe(false);
  });

  it('only accepts the newest email', async () => {
    const r = rig();
    await r.request({ email: 'ada@example.com' });
    const old = r.lastEmail();
    r.advance(SIGN_IN.resendCooldownSeconds);
    await r.request({ email: 'ada@example.com' });
    const fresh = r.lastEmail();
    if (old.code !== fresh.code) expect(await r.answer('ada@example.com', old.code)).toBe(false);
    expect(await r.answer('ada@example.com', old.token)).toBe(false);
    expect(await r.answer('ada@example.com', fresh.code)).toBe(true);
  });

  it("can't use one address's code for another", async () => {
    const r = rig();
    await r.request({ email: 'ada@example.com' });
    const { code, token } = r.lastEmail();
    expect(await r.answer('eve@example.com', code)).toBe(false);
    expect(await r.answer('eve@example.com', token)).toBe(false);
  });

  it('fails without an address or an answer', async () => {
    const r = rig();
    expect(await r.answer('', '123456')).toBe(false);
    expect(await r.answer('ada@example.com', '')).toBe(false);
  });

  it('lets only one of two racing correct answers through', async () => {
    const r = rig();
    await r.request({ email: 'ada@example.com' });
    const { code, token } = r.lastEmail();
    const results = await Promise.all([
      r.answer('ada@example.com', code),
      r.answer('ada@example.com', token),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('defineChallenge', () => {
  const custom = (challengeResult: boolean) => ({
    challengeName: 'CUSTOM_CHALLENGE',
    challengeResult,
  });

  it('starts with the custom challenge', () => {
    expect(defineChallenge([])).toEqual({
      challengeName: 'CUSTOM_CHALLENGE',
      issueTokens: false,
      failAuthentication: false,
    });
  });

  it('issues tokens after a correct answer', () => {
    expect(defineChallenge([custom(false), custom(true)])).toEqual({
      issueTokens: true,
      failAuthentication: false,
    });
  });

  it('retries a wrong answer, up to the session limit', () => {
    const wrong = Array.from({ length: SIGN_IN.maxAnswersPerSession - 1 }, () => custom(false));
    expect(defineChallenge(wrong).challengeName).toBe('CUSTOM_CHALLENGE');
    expect(defineChallenge([...wrong, custom(false)])).toEqual({
      issueTokens: false,
      failAuthentication: true,
    });
  });

  it('fails any other flow, such as a password', () => {
    expect(
      defineChallenge([{ challengeName: 'PASSWORD_VERIFIER', challengeResult: true }]),
    ).toEqual({
      issueTokens: false,
      failAuthentication: true,
    });
  });
});

describe('createTriggerHandler', () => {
  it('answers Define and Create, and refuses unknown triggers', async () => {
    const { triggers } = rig();
    const define = await triggers({
      triggerSource: 'DefineAuthChallenge_Authentication',
      request: { session: [] },
      response: {},
    });
    expect(define.response).toMatchObject({ challengeName: 'CUSTOM_CHALLENGE' });
    const create = await triggers({
      triggerSource: 'CreateAuthChallenge_Authentication',
      request: {},
      response: {},
    });
    expect(create.response).toEqual({
      publicChallengeParameters: { method: 'email-code-or-link' },
      privateChallengeParameters: {},
      challengeMetadata: 'EMAIL_CODE_OR_LINK',
    });
    await expect(
      triggers({ triggerSource: 'PreSignUp_SignUp', request: {}, response: {} }),
    ).rejects.toThrow(/Unexpected trigger/);
  });
});
