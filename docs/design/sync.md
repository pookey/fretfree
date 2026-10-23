# Sync (M7)

Optional account sync for FretFree. Design §1 principle 8 still holds: everything works without an account, offline, on one device. Sync only adds a copy of the learner's progress on the server, so a second device can merge it in.

The contract lives in `app/src/storage/sync/`:

| File | What it is | Used by |
|---|---|---|
| `model.ts` | Which tables sync, how records are identified, the wire format. Pure, no Dexie | client, sync Lambda (M7-03) |
| `merge.ts` | One merge rule per table. Pure, property-tested | client, sync Lambda (M7-03) |
| `tracking.ts` | The Dexie middleware that records local changes, plus the local read/apply primitives | client sync engine (M7-05) |

## 1. Principles

- **Merge by design, not last-writer-wins on everything.** Review logs and gamification events are append-only, so their union is keyed by ID. Cards use whole-record last-writer-wins on `updatedAt`. Settings use per-field last-writer-wins. Streaks and day stats are derived data.
- **Every merge is a join.** It is commutative, associative and idempotent (`merge.test.ts` checks all three for every table on random versions). Devices and the server converge whatever order versions arrive in, and re-sending a batch is harmless.
- **No review log is ever lost.** A live review log beats any tombstone, so even a delete on one device can't remove a log from another (`merge.test.ts`, "never loses a review log").
- **The app doesn't change.** Rows keep the shape the repositories and screens read. Sync metadata lives beside them.

## 2. Records

A record is one row of one syncable table, identified by `(table, id)`:

```ts
interface SyncRecord {
  table: SyncTableName;
  id: string;                       // stable across devices
  updatedAt: number;                // ms, the writer's clock
  deleted: boolean;                 // a tombstone; data is null
  data: Record<string, unknown> | null;
  fields?: Record<string, number>;  // field-merged tables: each lww field's own timestamp
}
```

**IDs.** Tables with a natural key use it: `cards` by item ID, `dailyProgress` by date, `achievements` by badge ID, the `settings` and `gamification` singletons by `'singleton'`, and `confusions` by the JSON array `["E","F"]`. Tables keyed by a local auto-increment number (`reviewLogs`, `sessionLogs`, `gamificationEvents`) carry a `uid` on the row, which is their sync ID. It is random for new rows, and content-derived for rows from before sync (§4, Upgrade). It's on the row, not beside it, so it survives a JSON export and import. `data` never includes the local number or the `uid`.

**Wire format.** JSON, with dates tagged `{"$date": "<ISO>"}` as in the export file (`encodeSyncRecord` / `decodeSyncRecord`). `canonical()` is the same JSON with sorted keys. It breaks merge ties and detects changes identically on every device and on the server.

## 3. Merge rules

| Table | Merge | Rule |
|---|---|---|
| `reviewLogs`, `gamificationEvents` | record, append-only | Union by ID. Live beats tombstone; otherwise later `updatedAt` |
| `sessionLogs` | record, append-only | As above. A session is updated once, when it finishes |
| `cards` | record | Later `updatedAt` wins; a tombstone wins a tie |
| `skillStates` | record | Later `updatedAt` wins; a tombstone wins a tie |
| `settings` | fields | Each field last-writer-wins on its own timestamp |
| `gamification` | fields | `xpTotal`, `streakLongest`: max. The streak state (`streakCurrent`, `lastGoalMetDate`, `freezesHeld`, `streakRepairDeadline`, `streakBeforeBreak`) moves as one group on one timestamp. Preferences (`dailyGoalMinutes`, `weekendAmulet`): per field |
| `dailyProgress` | fields | `xp`, `minutes`: max. `goalMet`, `freezeUsed`: or. `questsCompleted`: union |
| `achievements` | fields | `unlockedAt`: the earliest |
| `confusions` | fields | `count`: max. `weight` and `lastAt` move together |

Every tie that timestamps leave open is broken by comparing canonical JSON, so the result never depends on argument order.

**Field-merged tables are never deleted by sync.** A live version beats a tombstone and two live versions merge field by field. A field's timestamp is its stamp in `fields`. Failing that, it is the record's `updatedAt` if the version holds the field. Otherwise the timestamp is "never": a version from before a field existed loses to any version that has it.

**Derived data.** Streaks, XP totals and day stats are computed by the gamification engine. Their merges converge, but a day practised on two devices while both were offline merges to the larger of the two totals, not the sum. After a pull the client engine (M7-05) re-derives them from the merged logs. `session-complete`, `quest-completed`, `goal-met` and `freeze-used` events carry each date's minutes and XP, and `applyDay` re-settles the streak over the merged `dailyProgress`. Every device then derives the same values from the same logs.

**Cards.** Per-card last-writer-wins can drop the effect of one device's review on the FSRS state when both devices reviewed the same card offline. Both review logs are kept, so a later version can replay a card's logs. Convergence doesn't need it.

## 4. Local bookkeeping (schema v2)

`db.ts` version 2 adds a unique `uid` index to the three append-only tables and three stores. None of them syncs, exports or imports (`TABLE_NAMES` leaves them out).

| Store | Key | Holds |
|---|---|---|
| `syncMeta` | `[table+id]` | `updatedAt`, `fields`, `deleted` (1 = tombstone) for every record this device has had |
| `outbox` | `[table+id]` | Records changed locally since their last push, with the `updatedAt` they were queued at |
| `syncState` | `'singleton'` | `account`, the server `cursor`, `lastSyncedAt` (M7-05) |

**Tracking.** The `syncTracking` middleware sees every write to a syncable table: add, put, update, delete and clear. In the same transaction it stamps `syncMeta` and queues the record in `outbox`, widening the transaction to include them. A rewrite that changes nothing is skipped. A delete leaves a tombstone. `updatedAt` is `max(now, previous + 1)`, so it rises even if the clock steps back. Field-merged tables stamp only the fields or groups that changed. The repositories need no changes.

**Upgrade.** The v2 upgrade gives existing append-only rows a **legacy uid** (`legacyUids` in `model.ts`), then stamps and queues every existing row. A legacy uid is a hash of the row's synced content plus its occurrence among identical rows in local key order, not a random ID. So the same pre-sync history gets the same uids on every device. One device may upgrade in place while another imports a v1 export of it (the Safari → installed app path in onboarding), or one v1 backup may be restored onto two devices. Either way, sync keeps one copy of each log. Rows created after the upgrade get random uids. The outbox is therefore complete from the start. On first sign-in, draining it uploads all the progress made before the account existed.

**Import.** A JSON import clears and refills the data tables through the middleware, so it is tracked like any other write.

- **Uids.** Rows from a v2 file keep their `uid`. Rows from a v1 file have none, so `importData` gives them their legacy uid, the same one a v1 database gets on upgrade.
- **Missing rows.** Rows the file lacks become tombstones. Append-only rows ignore them and come back on the next pull. With an account, importing merges the file into the account; it never deletes review logs.
- **Restored values win.** The clear removes each row before the file's version is added, so every field and group of a re-added record is stamped "now". The backup's settings, streak group and cards therefore win last-writer-wins over newer values in the account. That is intended: an import is an explicit restore. Counters and logs still merge (max, union), so nothing earned elsewhere is lost.

## 5. Protocol

Each signed-in user has one record set on the server. Every change to it takes the next value of a per-user sequence number, and that number is the cursor. The client treats the cursor as an opaque string.

### Push

`POST /sync/push` with `{ records: SyncRecord[] }`, at most `SYNC_LIMITS.maxBatchRecords` (500) records and `maxBatchBytes` (1 MB). For each record the server:

1. loads its stored version and that version's sequence number, if any;
2. computes `merge(stored, incoming)`, and skips the record if the result equals the stored version (`canonical()`);
3. otherwise writes it **atomically with a new sequence number**, conditioned on nothing having changed since step 1, and retries from step 1 on a conflict (see Server notes).

Pushing the same batch twice changes nothing (idempotence). The server writes a push in chunks (Server notes) and replies `{ ok: true }` only once every chunk has committed. The client then calls `acknowledgePushed(records)`, which drops each outbox entry whose `updatedAt` is no newer than the pushed version. A change made during the push keeps its entry for the next push.

### Pull

`GET /sync/pull?cursor=<c>&limit=<n>` returns `{ records, cursor, more }`: records with a sequence number after `c`, oldest first, at most `n` (≤ 500). An empty cursor means "everything". The client calls `mergeIntoLocal(records)`, which in one untracked transaction:

1. merges each record with the local version and stores the result, with the merged `updatedAt` and `fields`;
2. leaves the record off the outbox if the result equals what the server sent. If the result differs, the server lacks a local change, so the record is queued to push.

Then the client saves the new cursor in `syncState` and repeats while `more` is true.

### A sync round (M7-05)

Push the outbox in batches, then pull to the end, then push whatever the pull queued. Run it on app start, on focus, on reconnect and after each session. It runs in the background: the UI reads Dexie and never waits on the network. A pull can return records the client just pushed. Merging them is a no-op.

**First sign-in** on a device with progress is just a sync round. The v2 upgrade queued every row, and pull merges in whatever the server already holds from other devices. Nothing is lost on either side.

**Switching account.** `syncState.account` names the account the cursor belongs to. Signing into a different one resets the cursor and re-queues every record. Signing out keeps the local data.

### The client engine (M7-05)

`storage/sync/engine.ts` is loaded on demand after first paint, and stays idle until the learner signs in.

- **Account.** `syncState.account` holds the access token's `sub` (the email if the token can't be read), so a deleted and re-created account with the same email counts as a new one.
- **Batches.** The outbox is pushed in batches within `SYNC_LIMITS`. A 400 or 413 refuses a whole batch, so the engine splits it in half until the record the server can't take is alone. That record leaves the outbox, and the rest go through. A later local change queues it again.
- **Errors.** No network is *offline*. A 503 waits for its `retry-after`. Anything else is an *error*, retried with backoff (30 s, doubling, at most 15 min). A 410 (`account-closing`) signs out on this device and keeps local data. `stopSync()` ends syncing at once, for an account delete (M7-06).
- **Restaging.** Pulled cards, review logs and skill states go through `RESTAGES` (`export-import.ts`), in schema-version order, before they merge. A moved row keeps its ID and gets `updatedAt + 1`. A retired skill's state becomes a tombstone, and its stages' states are added unless this device has them. Every restaged record is queued, so the server ends up holding the restaged version.
- **Re-derivation.** After a pull that brought gamification records, `deriveGamification` works from the merged logs. `xpTotal` is at least the sum of the logged answer and quest XP. A day's XP and minutes are at least the sums logged for that date, and a day whose combined minutes reach the goal counts as met. The streak is the more generous of two settlements: the merged state settled forward, and a replay of every day from the first goal met. The replay restores a streak that a stale device broke without practising (§3.7). The forward settlement keeps a streak the replay can't see. Re-derivation logs no events: they happened, and were logged, on the device that settled them.
- **Status.** The account panel shows `getSyncStatus()`: last synced, offline, or an error.

### Server notes (M7-03)

- The table is partitioned by user ID, taken from the JWT and never from the body. A record's sort key is `table#id`. Pulls are served by a **local secondary index** on the sequence number (partition key user ID, sort key `seq`), queried with `ConsistentRead: true`. Don't use a GSI: GSIs replicate asynchronously and can't be read consistently. A pull could then see seq 11 before seq 10 has arrived, move its cursor past 10 and never fetch that record. That is the same gap the atomic write closes.
- **Sequence numbers and writes commit together, in order.** A separate atomic counter is not enough, for two reasons:
  - *Cursor gap.* Push A takes seq 10 and push B takes seq 11, but B commits first. A pull in between returns 11 and moves the cursor past 10, so that device never pulls A's record.
  - *Lost update.* Two concurrent pushes of the same record both load the stored version and each write their own merge. The later write drops the other's change.

  So each write is one DynamoDB `TransactWriteItems`:
  1. update the per-user counter item from `S` to `S + k`, conditioned on it still being `S`;
  2. put each changed record with its new seq (`S + 1` … `S + k`), conditioned on its stored seq being the one read in step 1, or on `attribute_not_exists` for a new record.

  One transaction holds the counter plus at most 99 records, so the server splits a push (up to 500 records) into chunks of up to 99. Each chunk is its own counter-conditioned transaction. The reply is `ok` only after every chunk has committed. If a later chunk fails, the client keeps its outbox and re-pushes the whole batch, which is safe: merges are idempotent, so the chunks that already committed change nothing the second time. On `TransactionCanceledException` (a `ConditionalCheckFailed` or a conflict), re-read and re-merge, then retry. The counter condition serialises each user's writes, so commit order equals sequence order, and a pull that reads `seq > cursor` can never skip a record. Contention is per user only, which is small.
- Optionally, a pull serves records only up to the counter value read when the pull began. That gives each page a consistent end even while pushes land.
- The server never trusts client timestamps for authorisation. It only uses them to merge.
- `DELETE /account` removes every record and the counter.

## 6. Clocks

`updatedAt` is the writer's wall clock. If a device's clock runs ahead, its writes win last-writer-wins ties for as long as it stays ahead. Review logs, achievements, day stats and counters don't depend on timestamps, so a bad clock can at worst pick the wrong side for a setting or a card. The merge still converges.

## 7. Known limits

- `session-complete` events reference their session by the local `sessionLogs` number (`sessionId`), which differs on each device. Resolve it through the session's `uid` if a screen ever needs the link across devices.
- Same-day totals on two offline devices are a lower bound until the client re-derives them (§3).
