import { SYNC_LIMITS } from '../../../app/src/storage/sync/model';
import { json, jsonBody, type HttpEvent, type HttpResult } from '../shared/http';
import { deleteAccount } from './account';
import { parsePullQuery, pullRecords } from './pull';
import { decodePushBody, pushRecords } from './push';
import type { Backoff } from './retry';
import type { SyncTable } from './table';

export interface SyncDeps extends Backoff {
  table: SyncTable;
  /** Deletes the Cognito user with this `sub`. Succeeds if it's already gone. */
  deleteUser(userId: string): Promise<void>;
}

const closing = () => json(410, { error: 'account-closing' });
const busy = () => json(503, { error: 'busy' }, { 'retry-after': '1' });

/**
 * The sync API behind the JWT authoriser (docs/design/sync.md §5):
 * `POST /sync/push`, `GET /sync/pull` and `DELETE /account`. The user is the
 * token's `sub` claim and nothing else, so a request can only ever reach its
 * own partition, whatever its body or query says.
 */
export function createSyncHandler(deps: SyncDeps): (event: HttpEvent) => Promise<HttpResult> {
  return async (event) => {
    const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (typeof sub !== 'string' || sub === '') return json(401, { error: 'unauthorized' });

    switch (event.routeKey) {
      case 'POST /sync/push': {
        const raw = event.body ?? '';
        const bytes = Buffer.byteLength(raw, event.isBase64Encoded ? 'base64' : 'utf8');
        if (bytes > SYNC_LIMITS.maxBatchBytes) return json(413, { error: 'batch-too-large' });
        const body = decodePushBody(jsonBody(event));
        if ('error' in body) {
          const tooLarge = body.error === 'batch-too-large' || body.error === 'record-too-large';
          return json(tooLarge ? 413 : 400, { error: body.error });
        }
        const result = await pushRecords(deps.table, sub, body.records, deps);
        if (result.ok) return json(200, { ok: true });
        if (result.error === 'account-closing') return closing();
        if (result.error === 'busy') return busy();
        return json(413, { error: result.error });
      }
      case 'GET /sync/pull': {
        const query = parsePullQuery(event.queryStringParameters);
        if ('error' in query) return json(400, { error: query.error });
        const page = await pullRecords(deps.table, sub, query.cursor, query.limit);
        return page === 'account-closing' ? closing() : json(200, page);
      }
      case 'DELETE /account':
        await deleteAccount(deps.table, sub, deps.deleteUser, deps);
        return json(200, { ok: true });
      default:
        return json(404, { error: 'not-found' });
    }
  };
}
