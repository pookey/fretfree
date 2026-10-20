import { json, type HttpEvent, type HttpResult } from '../shared/http';

/**
 * Placeholder for the sync API (M7-03 replaces this file): `POST /sync/push`,
 * `GET /sync/pull` and `DELETE /account`, all behind the JWT authoriser. The
 * stack (lib/sync-stack.ts) gives it TABLE_NAME, SEQ_INDEX and USER_POOL_ID, read
 * and write on the table, and cognito-idp:AdminDeleteUser on the pool. The user
 * ID is the token's `sub` claim, never anything from the body.
 */
export async function handler(_event: HttpEvent): Promise<HttpResult> {
  return json(501, { error: 'not-implemented' });
}
