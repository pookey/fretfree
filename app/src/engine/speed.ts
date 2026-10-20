import { ENGINE_CONFIG } from './config';

/**
 * Whether an answer from `drillType` says anything about answer speed: false
 * for a timing drill (`ENGINE_CONFIG.speed.timingDrills`), whose
 * `responseMs` is a timing error. Answers with no drill recorded count.
 */
export function isSpeedEvidence(
  drillType: string | undefined,
  timingDrills: readonly string[] = ENGINE_CONFIG.speed.timingDrills,
): boolean {
  return drillType === undefined || !timingDrills.includes(drillType);
}
