import { NATURAL_PCS, noteAt, type Position } from '../../theory';
import { noteItemId, type Item } from '../model';

export const FRETS_0_12 = Array.from({ length: 13 }, (_, f) => f);

export function noteItems(skillId: string, positions: readonly Position[]): Item[] {
  return positions.map((p) => ({ id: noteItemId(p), skillId }));
}

export function naturalsOnString(string: number): Position[] {
  return FRETS_0_12.map((fret) => ({ string, fret })).filter((p) =>
    NATURAL_PCS.includes(noteAt(p).pc),
  );
}

/** Generate items once, on first use. */
export function memo<T>(fn: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= fn());
}
