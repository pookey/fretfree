import { DROP_D_TUNING, STANDARD_TUNING, type Tuning } from './fretboard';

export const TUNINGS: readonly Tuning[] = [STANDARD_TUNING, DROP_D_TUNING];

export function getTuning(id: string): Tuning {
  return TUNINGS.find((t) => t.id === id) ?? STANDARD_TUNING;
}
