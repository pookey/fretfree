import type { Settings } from '../engine';
import { isRefitDue, refitSteps, type RefitConfig } from '../engine/refit';
import { ENGINE_CONFIG } from '../engine/config';
import { getSettings, reviewCount, saveSettings, type FretworkDB } from '../storage';

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Refit the learner's FSRS weights from the review log when it has grown
 * enough (research/02 rule 1, engine/refit.ts), and persist them in
 * settings. Runs one optimiser step per task so the UI stays responsive.
 * Returns the saved settings, or `null` when nothing changed.
 */
export async function refitIfDue(
  db: FretworkDB,
  now: Date,
  opts: { cfg?: RefitConfig; yieldTo?: () => Promise<void> } = {},
): Promise<Settings | null> {
  const cfg = opts.cfg ?? ENGINE_CONFIG.refit;
  const yieldTo = opts.yieldTo ?? nextTask;
  const [settings, count] = await Promise.all([getSettings(db), reviewCount(db)]);
  if (!isRefitDue(settings.fsrsParams, count, cfg)) return null;
  const steps = refitSteps(await db.reviewLogs.toArray(), now, cfg);
  for (;;) {
    const r = steps.next();
    if (r.done) {
      return r.value ? saveSettings(db, { fsrsParams: r.value }) : null;
    }
    await yieldTo();
  }
}
