import { loadDeletion } from './store';

type DeletionModule = Pick<typeof import('./delete-client'), 'getAccountDeletion'>;

/**
 * Carries on with an account delete asked for before this page load (M7-06),
 * from app start, so it is sent until the server confirms it whichever
 * screen the learner opens. The flow loads only when a delete is waiting.
 */
export async function resumeAccountDeletion(
  load: () => Promise<DeletionModule> = () => import('./delete-client'),
): Promise<void> {
  if (!loadDeletion()) return;
  try {
    await (await load()).getAccountDeletion()?.resume();
  } catch {
    // Its code didn't load (a navigation cut it off): the next start tries again.
  }
}
