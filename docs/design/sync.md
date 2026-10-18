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

**IDs.** Tables with a natural key use it: `cards` by item ID, `dailyProgress` by date, `achievements` by badge ID, the `settings` and `gamification` singletons by `'singleton'`, and `confusions` by the JSON array `["E","F"]`. Tables keyed by a local auto-increment number (`reviewLogs`, `sessionLogs`, `gamificationEvents`) carry a random `uid` on the row, which is their sync ID. It's on the row, not beside it, so it survives a JSON export and import. `data` never includes the local number or the `uid`.

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

**Upgrade.** The v2 upgrade gives existing append-only rows a `uid`, then stamps and queues every existing row. The outbox is therefore complete from the start. On first sign-in, draining it uploads all the progress made before the account existed.

**Import.** A JSON import clears and refills the data tables through the middleware, so it is tracked like any other write. Rows that the file lacks become tombstones. Append-only rows ignore them, and they come back on the next pull. With an account, importing merges the file into the account; it never deletes review logs.

## 5. Protocol

Each signed-in user has one record set on the server. Every change to it takes the next value of a per-user sequence number, and that number is the cursor. The client treats the cursor as an opaque string.

### Push

`POST /sync/push` with `{ records: SyncRecord[] }`, at most `SYNC_LIMITS.maxBatchRecords` (500) records and `maxBatchBytes` (1 MB). For each record the server:

1. loads its stored version, if any;
2. stores `merge(stored, incoming)` with a new sequence number, **only if it differs** from the stored version.

Pushing the same batch twice changes nothing (idempotence). The reply is `{ ok: true }`. The client then calls `acknowledgePushed(records)`, which drops each outbox entry whose `updatedAt` is no newer than the pushed version. A change made during the push keeps its entry for the next push.

### Pull

`GET /sync/pull?cursor=<c>&limit=<n>` returns `{ records, cursor, more }`: records with a sequence number after `c`, oldest first, at most `n` (≤ 500). An empty cursor means "everything". The client calls `mergeIntoLocal(records)`, which in one untracked transaction:

1. merges each record with the local version and stores the result, with the merged `updatedAt` and `fields`;
2. leaves the record off the outbox if the result equals what the server sent. If the result differs, the server lacks a local change, so the record is queued to push.

Then the client saves the new cursor in `syncState` and repeats while `more` is true.

### A sync round (M7-05)

Push the outbox in batches, then pull to the end, then push whatever the pull queued. Run it on app start, on focus, on reconnect and after each session. It runs in the background: the UI reads Dexie and never waits on the network. A pull can return records the client just pushed. Merging them is a no-op.

**First sign-in** on a device with progress is just a sync round. The v2 upgrade queued every row, and pull merges in whatever the server already holds from other devices. Nothing is lost on either side.

**Switching account.** `syncState.account` names the account the cursor belongs to. Signing into a different one resets the cursor and re-queues every record. Signing out keeps the local data.

### Server notes (M7-03)

- The table is partitioned by user ID, taken from the JWT and never from the body. A record's sort key is `table#id`, and a GSI on the sequence number serves pulls.
- Allocate the sequence number with an atomic counter. Two concurrent pushes may interleave, but each stored write is a merge, so the order doesn't matter.
- The server never trusts client timestamps for authorisation. It only uses them to merge.
- `DELETE /account` removes every record and the counter.

## 6. Clocks

`updatedAt` is the writer's wall clock. If a device's clock runs ahead, its writes win last-writer-wins ties for as long as it stays ahead. Review logs, achievements, day stats and counters don't depend on timestamps, so a bad clock can at worst pick the wrong side for a setting or a card. The merge still converges.

## 7. Known limits

- `session-complete` events reference their session by the local `sessionLogs` number (`sessionId`), which differs on each device. Resolve it through the session's `uid` if a screen ever needs the link across devices.
- Same-day totals on two offline devices are a lower bound until the client re-derives them (§3).
