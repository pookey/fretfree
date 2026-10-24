import { loadDeletion, subscribe } from './store';

type DeletionModule = Pick<typeof import('./delete-client'), 'getAccountDeletion'>;
type Load = () => Promise<DeletionModule>;

const loadFlow: Load = () => import('./delete-client');

/**
 * Carries on with an account delete that is waiting (M7-06), so it is sent
 * until the server confirms it whichever screen the learner opens. The flow
 * loads only when a delete is waiting, and its own `finished` step says it
 * is done, or restarts a cleared device.
 */
export async function resumeAccountDeletion(load: Load = loadFlow): Promise<void> {
  if (!loadDeletion()) return;
  try {
    await (await load()).getAccountDeletion()?.resume();
  } catch {
    // Its code didn't load (a navigation cut it off): the next start tries again.
  }
}

/**
 * From app start: resumes a delete from before this page load, and joins one
 * another tab starts, so this tab also stops on a working screen when it
 * ends. Returns a function that stops watching.
 */
export function watchAccountDeletion(load: Load = loadFlow): () => void {
  void resumeAccountDeletion(load);
  let waiting = loadDeletion() !== null;
  return subscribe(() => {
    const now = loadDeletion() !== null;
    if (now && !waiting) void resumeAccountDeletion(load);
    waiting = now;
  });
}
