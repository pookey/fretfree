import { describe, expect, it, vi } from 'vitest';
import { createCognito } from './cognito';

const CONFIG = { region: 'us-east-1', userPoolId: 'us-east-1_pool', userPoolClientId: 'client' };
const NOW = 1_800_000_000_000;

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fail = (type: string, message = '') =>
  new Response(JSON.stringify({ __type: type, message }), { status: 400 });

const challenge = (session: string) => ({
  ChallengeName: 'CUSTOM_CHALLENGE',
  Session: session,
  ChallengeParameters: { USERNAME: 'uuid-1', method: 'email-code-or-link' },
});
const signedIn = {
  AuthenticationResult: {
    IdToken: 'id',
    AccessToken: 'access',
    RefreshToken: 'refresh',
    ExpiresIn: 3600,
  },
};

function setup(...replies: Response[]) {
  const fetchFn = vi.fn<typeof fetch>();
  for (const r of replies) fetchFn.mockResolvedValueOnce(r);
  const cognito = createCognito(CONFIG, () => NOW, fetchFn);
  const sent = (i: number) => {
    const [url, init] = fetchFn.mock.calls[i]!;
    const headers = init!.headers as Record<string, string>;
    return {
      url,
      target: headers['x-amz-target'],
      body: JSON.parse(init!.body as string) as Record<string, unknown>,
    };
  };
  return { cognito, fetchFn, sent };
}

describe('Cognito custom auth', () => {
  it('opens a session with the email and answers to the username Cognito gives', async () => {
    const { cognito, sent } = setup(ok(challenge('s1')), ok(signedIn));
    const c = await cognito.begin('a@b.co');
    expect(c).toEqual({ session: 's1', username: 'uuid-1' });
    expect(sent(0)).toEqual({
      url: 'https://cognito-idp.us-east-1.amazonaws.com/',
      target: 'AWSCognitoIdentityProviderService.InitiateAuth',
      body: { AuthFlow: 'CUSTOM_AUTH', ClientId: 'client', AuthParameters: { USERNAME: 'a@b.co' } },
    });
    expect(await cognito.answer(c, '123456')).toEqual({
      kind: 'signed-in',
      tokens: {
        idToken: 'id',
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: NOW + 3600_000,
      },
    });
    expect(sent(1).body).toEqual({
      ChallengeName: 'CUSTOM_CHALLENGE',
      ClientId: 'client',
      Session: 's1',
      ChallengeResponses: { USERNAME: 'uuid-1', ANSWER: '123456' },
    });
  });

  it('falls back to the email when Cognito names no username', async () => {
    const { cognito } = setup(ok({ ChallengeName: 'CUSTOM_CHALLENGE', Session: 's1' }));
    expect(await cognito.begin('a@b.co')).toEqual({ session: 's1', username: 'a@b.co' });
  });

  it('reads a fresh challenge as a wrong answer with another try', async () => {
    const { cognito } = setup(ok(challenge('s2')));
    expect(await cognito.answer({ session: 's1', username: 'u' }, '000000')).toEqual({
      kind: 'retry',
      challenge: { session: 's2', username: 'uuid-1' },
    });
  });

  it('tells a spent session from an expired one', async () => {
    const { cognito } = setup(
      fail('NotAuthorizedException', 'Incorrect username or password.'),
      fail(
        'com.amazonaws.cognito#NotAuthorizedException',
        'Invalid session for the user, session is expired.',
      ),
    );
    const c = { session: 's1', username: 'u' };
    expect(await cognito.answer(c, '000000')).toEqual({ kind: 'failed' });
    expect(await cognito.answer(c, '000000')).toEqual({ kind: 'session-expired' });
  });

  it('throws on other errors and unreadable replies', async () => {
    const { cognito } = setup(
      fail('TooManyRequestsException'),
      new Response('', { status: 500 }),
      ok({}),
      ok({}),
    );
    const c = { session: 's1', username: 'u' };
    await expect(cognito.answer(c, '1')).rejects.toThrow('TooManyRequestsException');
    await expect(cognito.answer(c, '1')).rejects.toThrow('RespondToAuthChallenge');
    await expect(cognito.answer(c, '1')).rejects.toThrow('answer');
    await expect(cognito.begin('a@b.co')).rejects.toThrow('begin');
  });

  it('reports a network failure as offline', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(createCognito(CONFIG, () => NOW, fetchFn).begin('a@b.co')).rejects.toThrow(
      'network',
    );
  });

  it('refreshes tokens and revokes the refresh token', async () => {
    const { cognito, sent } = setup(
      ok({ AuthenticationResult: { IdToken: 'id2', AccessToken: 'access2', ExpiresIn: 60 } }),
      new Response('', { status: 200 }),
      fail('NotAuthorizedException', 'Refresh Token has been revoked'),
    );
    expect(await cognito.refresh('refresh')).toEqual({
      idToken: 'id2',
      accessToken: 'access2',
      expiresAt: NOW + 60_000,
    });
    expect(sent(0).body).toEqual({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: 'client',
      AuthParameters: { REFRESH_TOKEN: 'refresh' },
    });
    await cognito.revoke('refresh');
    expect(sent(1)).toMatchObject({
      target: 'AWSCognitoIdentityProviderService.RevokeToken',
      body: { ClientId: 'client', Token: 'refresh' },
    });
    await expect(cognito.refresh('refresh')).rejects.toThrow('NotAuthorizedException');
  });
});
