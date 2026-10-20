/**
 * A `Metronome` for tests: no Tone, no clock. It starts at `startMs` on a
 * virtual audio clock, and each `tick()` schedules and sounds the next click,
 * so a drill's tests (D20, D31, the calibration) step through a run click by
 * click with exact times from the same tempo map the real one uses.
 */
import { NO_FADE, isAudible } from './fade';
import type { Click, ClickRule, Metronome, MetronomeOptions } from './metronome';
import {
  changeTempo,
  checkBpm,
  checkLayout,
  clickAt,
  countInPulses,
  pulseAtTime,
  pulseOfClick,
  tempoMap,
  timeAtPulse,
  type ClickInfo,
  type ClickLayout,
  type TempoMap,
} from './tempo';

export interface FakeMetronome extends Metronome {
  /** Schedules and sounds the next click (`onClick`, then `onBeat`); `null` when stopped. */
  tick(): Click | null;
  /** Ticks every click before `pulse`; returns them. */
  tickUntil(pulse: number): Click[];
  /** Makes the next `start()` resolve false, as when audio stays locked. */
  refuseNextStart(): void;
  readonly startCalls: number;
}

export function createFakeMetronome({ startMs = 1000 }: { startMs?: number } = {}): FakeMetronome {
  const clicks = new Set<(c: Click) => void>();
  const beats = new Set<(c: Click) => void>();
  const stops = new Set<() => void>();
  let run: { layout: ClickLayout; map: TempoMap; index: number } | null = null;
  let audible: (c: ClickInfo) => boolean = (c) => isAudible(c, NO_FADE);
  let refuse = false;
  let startCalls = 0;
  const ruleOf = (rule: ClickRule) =>
    typeof rule === 'function' ? rule : (c: ClickInfo) => isAudible(c, rule);
  const listen =
    <T>(set: Set<T>) =>
    (l: T) => {
      set.add(l);
      return () => set.delete(l);
    };
  const end = () => {
    if (!run) return;
    run = null;
    stops.forEach((l) => l());
  };

  const fake: FakeMetronome = {
    get running() {
      return run !== null;
    },
    get layout() {
      return run?.layout ?? null;
    },
    get tempo() {
      return run?.map ?? [];
    },
    get startCalls() {
      return startCalls;
    },
    start(options: MetronomeOptions) {
      startCalls += 1;
      const layout = checkLayout({
        meter: options.meter,
        subdivide: options.subdivide ?? 1,
        countInBars: options.countInBars ?? 1,
      });
      const bpm = checkBpm(options.bpm);
      end();
      if (refuse) {
        refuse = false;
        return Promise.resolve(false);
      }
      audible = ruleOf(options.fade ?? NO_FADE);
      run = { layout, map: tempoMap(bpm, startMs, -countInPulses(layout)), index: 0 };
      return Promise.resolve(true);
    },
    stop: end,
    setTempo(bpm) {
      checkBpm(bpm);
      if (!run) return null;
      const pulse = Math.ceil(pulseOfClick(run.layout, run.index));
      run.map = changeTempo(run.map, pulse, bpm);
      return pulse;
    },
    setFade(rule) {
      audible = ruleOf(rule);
    },
    timeAtPulse: (pulse) => (run ? timeAtPulse(run.map, pulse) : null),
    pulseAtTime: (ms) => (run ? pulseAtTime(run.map, ms) : null),
    onClick: listen(clicks),
    onBeat: listen(beats),
    onStop: listen(stops),
    tick() {
      if (!run) return null;
      const info = clickAt(run.layout, run.index);
      run.index += 1;
      const click: Click = {
        ...info,
        at: timeAtPulse(run.map, info.pulse),
        audible: audible(info),
      };
      clicks.forEach((l) => l(click));
      if (run) beats.forEach((l) => l(click));
      return click;
    },
    tickUntil(pulse) {
      const out: Click[] = [];
      while (run && pulseOfClick(run.layout, run.index) < pulse) out.push(fake.tick()!);
      return out;
    },
    refuseNextStart() {
      refuse = true;
    },
  };
  return fake;
}
