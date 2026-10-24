/**
 * "Your account is deleted" (M7-06), for a delete that finished away from the
 * Progress panel. Kept in session storage, which clearing this device leaves
 * alone, so it survives the restart into onboarding after a clear. The first
 * page load to read it takes it out of storage, so it shows once: a later
 * reload doesn't repeat it.
 */
export type DeletedNotice = 'kept' | 'cleared';

export const DELETED_NOTICE_KEY = 'fretwork.account.deletedNotice';

const listeners = new Set<() => void>();
/** This page load's notice; undefined until storage has been read. */
let current: DeletedNotice | null | undefined;

function take(): DeletedNotice | null {
  try {
    const value = sessionStorage.getItem(DELETED_NOTICE_KEY);
    sessionStorage.removeItem(DELETED_NOTICE_KEY);
    return value === 'kept' || value === 'cleared' ? value : null;
  } catch {
    return null;
  }
}

export function loadDeletedNotice(): DeletedNotice | null {
  if (current === undefined) current = take();
  return current;
}

/** Shows `notice` now, and on the next page load if this one ends first (a restart). */
export function saveDeletedNotice(notice: DeletedNotice | null): void {
  current = notice;
  try {
    if (notice) sessionStorage.setItem(DELETED_NOTICE_KEY, notice);
    else sessionStorage.removeItem(DELETED_NOTICE_KEY);
  } catch {
    // Storage is blocked: the notice lasts this page load only.
  }
  listeners.forEach((l) => l());
}

export function subscribeDeletedNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
