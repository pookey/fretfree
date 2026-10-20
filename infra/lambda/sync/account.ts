import { COUNTER_SK, SYNC_SERVER } from './config';
import { waitToRetry, type Backoff } from './retry';
import { deleteBatch, deleteItem, markClosing, querySortKeys, type SyncTable } from './table';

/** BatchWriteItem takes at most 25 requests. */
const DELETE_BATCH = 25;

/**
 * `DELETE /account`: removes every record of the user, then the Cognito user,
 * then the counter. Safe to retry after a failure at any step.
 *
 * It first marks the counter as closing, which fails every later push and
 * pull, and fails any push transaction already in flight (its counter
 * condition breaks). So nothing can write behind the delete as it pages
 * through the partition. The mark goes last, once the user is gone; a retry
 * after a partial failure finds it still set and finishes the job.
 */
export async function deleteAccount(
  t: SyncTable,
  userId: string,
  deleteUser: (userId: string) => Promise<void>,
  backoff: Backoff,
): Promise<void> {
  await markClosing(t, userId);
  let startKey: Parameters<typeof querySortKeys>[2];
  do {
    const page = await querySortKeys(t, userId, startKey);
    const sks = page.sks.filter((sk) => sk !== COUNTER_SK);
    for (let i = 0; i < sks.length; i += DELETE_BATCH) {
      await deleteAll(t, userId, sks.slice(i, i + DELETE_BATCH), backoff);
    }
    startKey = page.next;
  } while (startKey);
  await deleteUser(userId);
  await deleteItem(t, userId, COUNTER_SK);
}

/** One batch delete, retrying whatever DynamoDB leaves unprocessed. */
async function deleteAll(
  t: SyncTable,
  userId: string,
  sks: string[],
  backoff: Backoff,
): Promise<void> {
  let left = sks;
  for (let attempt = 0; left.length > 0; attempt++) {
    if (attempt >= SYNC_SERVER.maxAttempts) throw new Error('Account delete was throttled');
    if (attempt > 0) await waitToRetry(backoff, attempt);
    left = await deleteBatch(t, userId, left);
  }
}
