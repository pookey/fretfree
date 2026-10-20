import { describe, expect, it } from 'vitest';
import { createPublicHandler } from './handler';

const handler = createPublicHandler({
  region: 'us-east-1',
  userPoolId: 'pool',
  userPoolClientId: 'client',
});

describe('public routes', () => {
  it('reports health', async () => {
    const res = await handler({ routeKey: 'GET /health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('serves the sign-in config, cacheable', async () => {
    const res = await handler({ routeKey: 'GET /config' });
    expect(JSON.parse(res.body)).toEqual({
      region: 'us-east-1',
      userPoolId: 'pool',
      userPoolClientId: 'client',
    });
    expect(res.headers['cache-control']).toMatch(/max-age/);
  });

  it('404s anything else', async () => {
    expect((await handler({ routeKey: 'GET /nope' })).statusCode).toBe(404);
  });
});
