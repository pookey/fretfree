/** Shared pieces of the item ID formats (`engine/items/<kind>.ts`). */

export const INT = '(0|[1-9]\\d*)';
export const OFFSET = '([+-][1-9]\\d*)';
export const PC = '([A-G][#b]?)';

export function count(n: number, what: string): number {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`Invalid ${what}: ${n}`);
  return n;
}

export function offset(n: number): string {
  if (!Number.isInteger(n) || n === 0) throw new RangeError(`Invalid offset: ${n}`);
  return n > 0 ? `+${n}` : `${n}`;
}

export function pitchClass(pc: string): string {
  if (!new RegExp(`^${PC}$`).test(pc)) throw new RangeError(`Invalid pitch class: ${pc}`);
  return pc;
}
