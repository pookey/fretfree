import { describe, expect, it, vi } from 'vitest';
import { createSilentModeGuard, silentWavUri, type SessionEnv } from './session';

/** A session whose setter works, or (as on the user's iPhone) is ignored. */
function session(sticks = true) {
  let type = 'auto';
  const set = vi.fn((t: string) => {
    if (sticks) type = t;
  });
  return {
    set,
    get type() {
      return type;
    },
    set type(t: string) {
      set(t);
    },
  };
}

function track(play: () => Promise<void> = () => Promise.resolve()) {
  const t = {
    paused: true,
    loop: false,
    src: '',
    attrs: {} as Record<string, string>,
    play: vi.fn(() => {
      t.paused = false;
      return play().catch((err: unknown) => {
        t.paused = true;
        throw err;
      });
    }),
    pause: vi.fn(() => {
      t.paused = true;
    }),
    setAttribute(name: string, value: string) {
      t.attrs[name] = value;
    },
  };
  return t;
}

function guard(env: SessionEnv) {
  return createSilentModeGuard(() => env);
}

describe('silent mode guard', () => {
  it('uses the playback session where the setter takes', () => {
    const s = session();
    const createTrack = vi.fn(() => track());
    const g = guard({ audioSession: s, createTrack });
    expect(g.keepPlaying()).toBe('session');
    expect(s.type).toBe('playback');
    expect(createTrack).not.toHaveBeenCalled();
  });

  it('falls back to a looping silent track where the setter is ignored', () => {
    const t = track();
    const nameTrack = vi.fn();
    const g = guard({ audioSession: session(false), createTrack: () => t, nameTrack });
    expect(g.keepPlaying()).toBe('track');
    expect(t.play).toHaveBeenCalledTimes(1);
    expect(t.loop).toBe(true);
    expect(t.src).toMatch(/^data:audio\/wav;base64,/);
    expect(t.attrs.playsinline).toBe('');
    expect(nameTrack).toHaveBeenCalledTimes(1);
    // Already playing: the next tap leaves it be.
    expect(g.keepPlaying()).toBe('track');
    expect(t.play).toHaveBeenCalledTimes(1);
  });

  it('falls back to the silent track where there is no audio session', () => {
    const t = track();
    expect(guard({ createTrack: () => t }).keepPlaying()).toBe('track');
    expect(t.play).toHaveBeenCalledTimes(1);
  });

  it('falls back when the setter throws', () => {
    const t = track();
    const throwing = {
      get type() {
        return 'auto';
      },
      set type(_: string) {
        throw new Error('Not allowed');
      },
    };
    expect(guard({ audioSession: throwing, createTrack: () => t }).keepPlaying()).toBe('track');
  });

  it('does nothing where neither exists', () => {
    expect(guard({}).keepPlaying()).toBe('none');
  });

  it('tries the track again on the next tap after a refused play()', async () => {
    let refuse = true;
    const t = track(() =>
      refuse ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(),
    );
    const g = guard({ createTrack: () => t });
    g.keepPlaying();
    await vi.waitFor(() => expect(t.paused).toBe(true));
    refuse = false;
    g.keepPlaying();
    expect(t.play).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    expect(t.paused).toBe(false);
  });

  it('survives a play() that throws synchronously', () => {
    const t = track();
    t.play.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(guard({ createTrack: () => t }).keepPlaying()).toBe('track');
  });

  it('lets go on release: the track pauses and the session goes back to auto', () => {
    const s = session();
    const g = guard({ audioSession: s });
    g.keepPlaying();
    g.release();
    expect(s.type).toBe('auto');

    const t = track();
    const g2 = guard({ createTrack: () => t });
    g2.keepPlaying();
    g2.release();
    expect(t.pause).toHaveBeenCalled();
    expect(t.paused).toBe(true);
  });

  it('holds play-and-record while the mic listens, then restores playback', () => {
    const s = session();
    const g = guard({ audioSession: s });
    g.keepPlaying();
    const endA = g.holdMic();
    const endB = g.holdMic();
    expect(s.type).toBe('play-and-record');
    // A tap while listening leaves capture's session alone.
    expect(g.keepPlaying()).toBe('none');
    expect(s.type).toBe('play-and-record');
    endA();
    endA();
    expect(s.type).toBe('play-and-record');
    endB();
    expect(s.type).toBe('playback');
  });

  it('restores auto after the mic when sound was turned off meanwhile', () => {
    const s = session();
    const g = guard({ audioSession: s });
    g.keepPlaying();
    const end = g.holdMic();
    g.release();
    expect(s.type).toBe('play-and-record');
    end();
    expect(s.type).toBe('auto');
  });
});

describe('silentWavUri', () => {
  it('is a valid half-second of 8-bit silence', () => {
    const uri = silentWavUri();
    const bytes = Uint8Array.from(atob(uri.split(',')[1]!), (c) => c.charCodeAt(0));
    const text = (at: number, n: number) => String.fromCharCode(...bytes.slice(at, at + n));
    const view = new DataView(bytes.buffer);
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 8)).toBe('WAVEfmt ');
    expect(text(36, 4)).toBe('data');
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint32(40, true)).toBe(4000);
    expect(bytes.length).toBe(44 + 4000);
    expect(bytes.slice(44).every((b) => b === 128)).toBe(true);
  });
});
