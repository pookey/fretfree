import type { GuideLevel } from '../../engine/model';

/**
 * Whether the session draws the context panel (design §7: it "follows guide
 * fading ... and is hidden at level 0"). Decided here once, for every drill's
 * panel and the default one: drills only fill the panel, and fade its
 * contents from the level they are given.
 *
 * `guideLevel` is the prompt's level from the runner, which is already 3 for
 * a worked example (a guided rep), so a new item's first rep shows its panel
 * even when its skill has faded to level 0.
 */
export function contextPanelShown(open: boolean, guideLevel: GuideLevel): boolean {
  return open && guideLevel > 0;
}
