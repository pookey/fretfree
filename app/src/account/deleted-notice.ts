/**
 * "Your account is deleted" (M7-06), for a delete that finished away from the
 * Progress panel. Kept in session storage, which clearing this device leaves
 * alone, so it survives the restart into onboarding after a clear.
 */
export type DeletedNotice = 'kept' | 'cleared';

export const DELETED_NOTICE_KEY = 'fretwork.account.deletedNotice';

const listeners = new Set<() => void>();
let memory: DeletedNotice | null = null;

export function loadDeletedNotice(): DeletedNotice | null {
  try {
    const value = sessionStorage.getItem(DELETED_NOTICE_KEY);
    return value === 'kept' || value === 'cleared' ? value : null;
  } catch {
    return memory;
  }
}

export function saveDeletedNotice(notice: DeletedNotice | null): void {
  memory = notice;
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
