import { json, type HttpEvent, type HttpResult } from '../shared/http';

export interface PublicConfig {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
}

/**
 * The public routes: `GET /health` for the smoke test, and `GET /config`, which
 * tells the app which user pool and client to sign in with. The app then needs
 * only the API's address, so no deployment ID is built into it or committed.
 */
export function createPublicHandler(
  config: PublicConfig,
): (event: HttpEvent) => Promise<HttpResult> {
  return async (event) => {
    switch (event.routeKey) {
      case 'GET /health':
        return json(200, { ok: true });
      case 'GET /config':
        return json(200, config, { 'cache-control': 'public, max-age=300' });
      default:
        return json(404, { error: 'not-found' });
    }
  };
}

export const handler = createPublicHandler({
  region: process.env.AWS_REGION ?? '',
  userPoolId: process.env.USER_POOL_ID ?? '',
  userPoolClientId: process.env.USER_POOL_CLIENT_ID ?? '',
});
