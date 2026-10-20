/**
 * The metronome tool's state, outside its view (design §7 Tools). `ToolScreen`
 * unmounts the view when the learner opens another tool, so the run lives
 * here, in one module-level controller in the metronome chunk, and the view
 * only renders it.
 *
 * Where the click keeps going: anywhere in Tools (the index, the tuner, back
 * to the metronome). Leaving Tools stops it, unless the learner pins it on;
 * then it runs app-wide until stopped, and a small control (`MiniControl`)
 * stands in for the view so it can always be stopped.
 *
 * The click is the timing engine's shared metronome (`timing/metronome.ts`).
 * Anything else that starts it (a calibration, a timing drill) stops this run,
 * by design; the controller sees that through `onStop`.
 */
import { currentOutputLatencyMs } from '../../../timing/device';
import type { MeterPresetName } from '../../../timing/meter';
import { getMetronome, type Click, type Metronome } from '../../../timing/metronome';
import { METRONOME_CONFIG } from './config';
import { addTap, clampBpm, clickMeter, inTools, tapTempo, type AccentStyle } from './logic';

/** The pulse sounding now, as the beat indicator shows it. */
export interface Beat {
  /** Pulse within the bar, from 0. */
  pulse: number;
  bar: number;
  countIn: boolean;
  /** When it sounded, audio-clock ms. */
  at: number;
}

export interface MetronomeState {
  bpm: number;
  meter: MeterPresetName;
  /** As the learner chose it; `accentFor` says how it applies to this meter. */
  accent: AccentStyle;
  /** Clicks per pulse, 1–4. */
  subdivide: number;
  /** Bars of count-in, 0–2. */
  countInBars: number;
  /** Keep clicking outside Tools. */
  pinned: boolean;
  /** A run is going, or starting. */
  running: boolean;
  /** The pulse heard last; `null` when stopped. */
  beat: Beat | null;
  /** Whether the full view is on screen; the mini control shows when it isn't. */
  viewOpen: boolean;
}

export type Settings = Pick<
  MetronomeState,
  'bpm' | 'meter' | 'accent' | 'subdivide' | 'countInBars' | 'pinned'
>;

export interface MetronomeController {
  getState(): MetronomeState;
  subscribe(listener: () => void): () => void;
  /** Starts the click. Call it from a tap: it unlocks audio. False if audio stays locked. */
  start(): Promise<boolean>;
  stop(): void;
  toggle(): void;
  /** Change any setting; a running click follows at once (a new meter restarts it). */
  set(settings: Partial<Settings>): void;
  /** A tap-tempo tap at `at` (ms, the event's `timeStamp`). */
  tap(at: number): void;
  /** The view mounted; returns its unmount. */
  openView(): () => void;
}

export interface ControllerDeps {
  metronome: Metronome;
  /** The context's output latency now, ms: the beat light waits this long to match the sound. */
  outputLatencyMs: () => number;
  pathname: () => string;
  base: string;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
}

export const DEFAULT_SETTINGS: Settings = {
  bpm: METRONOME_CONFIG.defaultBpm,
  meter: '4/4',
  accent: 'beats',
  subdivide: 1,
  countInBars: 1,
  pinned: false,
};

/** The click grid of some settings: a running click restarts when it changes. */
const gridOf = (s: Settings) => JSON.stringify([clickMeter(s.meter, s.accent), s.subdivide]);

export function createMetronomeController(deps: ControllerDeps): MetronomeController {
  const { metronome } = deps;
  const listeners = new Set<() => void>();
  let state: MetronomeState = { ...DEFAULT_SETTINGS, running: false, beat: null, viewOpen: false };
  /** Whether the metronome's current run is ours. */
  let own = false;
  /** Bumped by every start and stop, so a start that lost a race does nothing. */
  let generation = 0;
  let taps: number[] = [];
  let watch: unknown = null;
  const pendingBeats = new Set<unknown>();

  const update = (next: Partial<MetronomeState>) => {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };

  const clearBeats = () => {
    pendingBeats.forEach((id) => deps.clearTimeout(id));
    pendingBeats.clear();
  };

  const unwatch = () => {
    if (watch !== null) deps.clearInterval(watch);
    watch = null;
  };

  const leftTools = () => !state.pinned && !inTools(deps.pathname(), deps.base);

  /** While an unpinned click runs, stop it once the learner is out of Tools. */
  const rewatch = () => {
    unwatch();
    if (!state.running || state.pinned) return;
    watch = deps.setInterval(() => {
      if (leftTools()) controller.stop();
    }, METRONOME_CONFIG.routeCheckMs);
  };

  const ended = () => {
    own = false;
    unwatch();
    clearBeats();
    update({ running: false, beat: null });
  };

  metronome.onStop(() => {
    // A start of ours stops the run before it; it is still running then.
    if (own) ended();
  });

  metronome.onBeat((click: Click) => {
    if (!own || click.accent === 'sub') return;
    const beat: Beat = {
      pulse: Math.floor(click.pulseInBar),
      bar: click.bar,
      countIn: click.countIn,
      at: click.at,
    };
    // The click leaves the speaker one output latency after it is scheduled.
    const id = deps.setTimeout(() => {
      pendingBeats.delete(id);
      if (own) update({ beat });
    }, deps.outputLatencyMs());
    pendingBeats.add(id);
  });

  const run = async (countInBars: number): Promise<boolean> => {
    const mine = ++generation;
    own = false;
    clearBeats();
    update({ running: true, beat: null });
    const bpm = state.bpm;
    const ok = await metronome.start({
      meter: clickMeter(state.meter, state.accent),
      bpm,
      subdivide: state.subdivide,
      countInBars,
    });
    if (mine !== generation) return false;
    if (!ok) {
      update({ running: false });
      return false;
    }
    own = true;
    // A tempo set while audio was unlocking couldn't reach the click then.
    if (state.bpm !== bpm) metronome.setTempo(state.bpm);
    rewatch();
    return true;
  };

  const controller: MetronomeController = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => run(state.countInBars),
    stop() {
      generation += 1;
      // A start still unlocking audio is ours too: stopping overtakes it.
      if (own || state.running) metronome.stop();
      ended();
    },
    toggle() {
      if (state.running) controller.stop();
      else void controller.start();
    },
    set(settings) {
      const next = { ...state, ...settings };
      next.bpm = clampBpm(next.bpm);
      const restart = gridOf(next) !== gridOf(state);
      const retempo = next.bpm !== state.bpm;
      const repin = next.pinned !== state.pinned;
      update(next);
      if (!state.running) return;
      // The meter can't change mid-run: restart, without a second count-in.
      if (restart) void run(0);
      else if (retempo && own) metronome.setTempo(state.bpm);
      if (repin) {
        if (leftTools()) controller.stop();
        else rewatch();
      }
    },
    tap(at) {
      taps = addTap(taps, at);
      const bpm = tapTempo(taps);
      if (bpm !== null) controller.set({ bpm });
    },
    openView() {
      update({ viewOpen: true });
      return () => {
        update({ viewOpen: false });
        // The route has already changed when the view unmounts.
        if (state.running && leftTools()) controller.stop();
      };
    },
  };
  return controller;
}

let shared: MetronomeController | null = null;

/** The app's metronome tool: one run, kept while the learner moves around Tools. */
export function getMetronomeController(): MetronomeController {
  return (shared ??= createMetronomeController({
    metronome: getMetronome(),
    outputLatencyMs: currentOutputLatencyMs,
    pathname: () => window.location.pathname,
    base: import.meta.env.BASE_URL,
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id as number),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id as number),
  }));
}
