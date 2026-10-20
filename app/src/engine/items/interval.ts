import { isIntervalName, type IntervalName } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';
import { count, INT } from './helpers';

declare module '../model' {
  interface ItemRefs {
    interval: {
      kind: 'interval' | 'interval-name';
      interval: IntervalName;
      from: number;
      to: number;
    };
  }
}

const INTERVAL_ITEM = new RegExp(`^(interval|interval-name):([A-Za-z0-9]+)@s${INT}→s${INT}$`);

/**
 * `interval:M3@s6→s5`: tap the M3 above a root on string 6, on string 5
 * (name → position). `interval-name:M3@s6→s5` is the reverse: name the
 * interval two dots on strings 6 and 5 make (position → name).
 */
export function intervalItemId(
  kind: 'interval' | 'interval-name',
  interval: IntervalName,
  from: number,
  to: number,
): string {
  if (!isIntervalName(interval)) throw new RangeError(`Invalid interval: ${String(interval)}`);
  return `${kind}:${interval}@s${count(from, 'string')}→s${count(to, 'string')}`;
}

export function parseIntervalItemId(id: string): {
  kind: 'interval' | 'interval-name';
  interval: IntervalName;
  from: number;
  to: number;
} | null {
  const m = INTERVAL_ITEM.exec(id);
  if (!m || !isIntervalName(m[2] as string)) return null;
  return {
    kind: m[1] as 'interval' | 'interval-name',
    interval: m[2] as IntervalName,
    from: Number(m[3]),
    to: Number(m[4]),
  };
}

export default {
  kinds: ['interval', 'interval-name'],
  id: (ref) => intervalItemId(ref.kind, ref.interval, ref.from, ref.to),
  parse: parseIntervalItemId,
} satisfies ItemKind<ItemRefs['interval']>;
