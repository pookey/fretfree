import { afterEach, describe, expect, it } from 'vitest';
import { getPitchSource, setPitchSourceFactory } from '../../../mic/source';
import { FAKE_PITCH_KEY, installFakePitchForE2E, type TunerTestHooks } from './e2e-hook';

const storage = (value: string | null) => () => ({ getItem: () => value });

afterEach(() => setPitchSourceFactory(null));

describe('installFakePitchForE2E', () => {
  it('stays off for learners', () => {
    const target: TunerTestHooks = {};
    expect(installFakePitchForE2E(target, storage(null))).toBe(false);
    expect(installFakePitchForE2E(target, storage('0'))).toBe(false);
    expect(
      installFakePitchForE2E(target, () => {
        throw new Error('SecurityError');
      }),
    ).toBe(false);
    expect(installFakePitchForE2E(target)).toBe(false);
    expect(target).toEqual({});
  });

  it('makes the app’s pitch source a fake the specs can play into, once', () => {
    const target: TunerTestHooks = {};
    expect(installFakePitchForE2E(target, storage('1'))).toBe(true);
    const fake = target.fretworkFakePitch;
    expect(getPitchSource()).toBe(fake);
    expect(target.fretworkTones).toEqual([]);
    expect(installFakePitchForE2E(target, storage('1'))).toBe(true);
    expect(target.fretworkFakePitch).toBe(fake);
  });

  it('reads the key from localStorage by default', () => {
    const target: TunerTestHooks = {};
    localStorage.setItem(FAKE_PITCH_KEY, '1');
    expect(installFakePitchForE2E(target)).toBe(true);
    localStorage.removeItem(FAKE_PITCH_KEY);
  });
});
