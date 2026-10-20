/**
 * One owner for the global Tone Transport at a time (M4-06 review). The
 * progression player and the metronome each reset its position, tempo and
 * loop, so whichever claims it last wins and the one before is told to stop
 * at once, instead of running on with a Transport that was changed under it.
 *
 * Play-along (a progression with the click) will share one claim rather than
 * take two; that is the follow-up this leaves room for.
 */

export interface TransportLease {
  readonly owner: string;
  /** Whether this lease still holds the Transport. */
  readonly active: boolean;
  /** Give the Transport back. Idempotent; does nothing once another owner has it. */
  release(): void;
}

let holder: { owner: string; revoke: () => void; lease: TransportLease } | null = null;

/**
 * Take the Transport for `owner`. The previous holder's `onRevoke` runs first,
 * synchronously, so it can clear its events before the new owner resets the
 * Transport. `onRevoke` is not called on `release()`.
 */
export function claimTransport(owner: string, onRevoke: () => void): TransportLease {
  const previous = holder;
  holder = null;
  previous?.revoke();
  const lease: TransportLease = {
    owner,
    get active() {
      return holder?.lease === lease;
    },
    release() {
      if (holder?.lease === lease) holder = null;
    },
  };
  holder = { owner, revoke: onRevoke, lease };
  return lease;
}

/** Who holds the Transport, if anyone. */
export function transportOwner(): string | null {
  return holder?.owner ?? null;
}
