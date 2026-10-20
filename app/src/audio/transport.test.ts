import { describe, expect, it, vi } from 'vitest';
import { claimTransport, transportOwner } from './transport';

describe('claimTransport', () => {
  it('hands the Transport to the latest claimant, stopping the one before first', () => {
    const order: string[] = [];
    const first = claimTransport('progression', () => order.push('progression revoked'));
    expect(transportOwner()).toBe('progression');
    expect(first.active).toBe(true);
    const second = claimTransport('metronome', () => order.push('metronome revoked'));
    expect(order).toEqual(['progression revoked']);
    expect(first.active).toBe(false);
    expect(second).toMatchObject({ owner: 'metronome', active: true });
    // A stale release leaves the new owner alone.
    first.release();
    expect(transportOwner()).toBe('metronome');
    second.release();
    second.release();
    expect(transportOwner()).toBeNull();
    expect(order).toEqual(['progression revoked']);
  });

  it('lets a revoked owner claim again from inside its revoke', () => {
    const revoke = vi.fn();
    claimTransport('a', revoke);
    const b = claimTransport('b', () => undefined);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(b.active).toBe(true);
    b.release();
  });
});
