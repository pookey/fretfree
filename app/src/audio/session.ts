/**
 * Sound through iOS silent mode (M4-14). iOS gives Web Audio the "ambient"
 * audio session, which silent mode (Control Centre's bell, the iPhone's
 * switch or Action button) mutes. Granting the mic used to "fix" it, as
 * capture moves Safari to play-and-record.
 *
 * So, inside a tap, ask for the "playback" session (Safari 17+), and read it
 * back: on the user's iPhone the setter was silently ignored. Where it doesn't
 * take, a looping silent <audio> track moves the page to media playback, which
 * silent mode leaves alone. Both do nothing on browsers without silent mode.
 */

export type SessionType =
  'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record';

/** What `keepPlaying` used: the session setting, the silent track, or nothing yet. */
export type PlaybackRoute = 'session' | 'track' | 'none';

interface SilentTrack {
  readonly paused: boolean;
  loop: boolean;
  src: string;
  play(): Promise<void> | void;
  pause(): void;
  setAttribute(name: string, value: string): void;
}

/** The browser APIs this needs; injectable for tests. */
export interface SessionEnv {
  audioSession?: { type: string };
  createTrack?: () => SilentTrack;
  /** Names the Now Playing entry the silent track may create. */
  nameTrack?: () => void;
}

function browserEnv(): SessionEnv {
  const nav = globalThis.navigator as (Navigator & { audioSession?: { type: string } }) | undefined;
  return {
    audioSession: nav?.audioSession,
    createTrack:
      typeof document === 'undefined' ? undefined : () => document.createElement('audio'),
    nameTrack: () => {
      const MediaMetadataCtor = globalThis.MediaMetadata as typeof MediaMetadata | undefined;
      if (nav?.mediaSession && MediaMetadataCtor) {
        nav.mediaSession.metadata = new MediaMetadataCtor({ title: 'FretFree' });
      }
    },
  };
}

/** Half a second of 8-bit, 8 kHz silence as a WAV data URI. */
export function silentWavUri(): string {
  const samples = 4000;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i);
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true); // sample rate
  view.setUint32(28, 8000, true); // bytes per second
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, samples, true);
  bytes.fill(128, 44); // 8-bit PCM is unsigned: 128 is silence
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/** Set the session type, and say whether it took. False where there's no session. */
function setSession(env: SessionEnv, type: SessionType): boolean {
  const session = env.audioSession;
  if (!session) return false;
  try {
    session.type = type;
    return session.type === type;
  } catch {
    return false;
  }
}

export interface SilentModeGuard {
  /**
   * Make sound play through silent mode. Call it inside a tap: iOS starts the
   * silent track only in a gesture. Cheap to call on every tap.
   */
  keepPlaying(): PlaybackRoute;
  /** Stop holding the session: sound is off, or the page is hidden. */
  release(): void;
  /** The mic is listening: capture needs play-and-record. Returns the release. */
  holdMic(): () => void;
}

export function createSilentModeGuard(env: () => SessionEnv = browserEnv): SilentModeGuard {
  let track: SilentTrack | null = null;
  let mics = 0;
  /** Whether sound should get through silent mode: set by `keepPlaying`, cleared by `release`. */
  let wanted = false;

  const playTrack = (e: SessionEnv): boolean => {
    if (!track) {
      const made = e.createTrack?.();
      if (!made) return false;
      made.src = silentWavUri();
      made.loop = true;
      made.setAttribute('playsinline', '');
      made.setAttribute('x-webkit-airplay', 'deny');
      track = made;
      e.nameTrack?.();
    }
    if (track.paused) {
      try {
        // A refusal (outside a gesture, say) leaves it paused for the next tap.
        void Promise.resolve(track.play()).catch(() => undefined);
      } catch {
        /* Same: try again on the next tap. */
      }
    }
    return true;
  };

  return {
    keepPlaying() {
      const e = env();
      wanted = true;
      // Capture's play-and-record session already ignores silent mode.
      if (mics > 0) return 'none';
      if (setSession(e, 'playback')) return 'session';
      return playTrack(e) ? 'track' : 'none';
    },
    release() {
      wanted = false;
      track?.pause();
      if (mics === 0) setSession(env(), 'auto');
    },
    holdMic() {
      mics++;
      setSession(env(), 'play-and-record');
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        mics--;
        if (mics === 0) setSession(env(), wanted ? 'playback' : 'auto');
      };
    },
  };
}

/** The app's one guard: the audio unlock and the mic drivers share it. */
export const silentMode = createSilentModeGuard();
