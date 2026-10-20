/**
 * The timing engine (M8-01, design §12): the one metronome, onset input and
 * timing grade for every rhythm and meter drill (D20, D27, D30, D31) and the
 * Tools metronome. Don't build another click.
 *
 * ## Clock
 * Every time is **ms on the audio clock** (`AudioContext.currentTime × 1000`
 * of Tone's context). Clicks are scheduled on it, the mic's onsets are timed
 * on it, and taps are mapped onto it from `event.timeStamp`. Positions on the
 * click grid are **pulses** from the first beat after the count-in (pulse 0;
 * the count-in is negative). A pulse is the counted unit, the one the tempo is
 * in: quarters in 4/4, eighths in 6/8 and 7/8.
 *
 * ## Metronome (`metronome.ts`)
 * ```ts
 * const m = getMetronome(); // shared by the whole app
 * await m.start({ meter: METER_PRESETS['7/8 (2+2+3)'], bpm: 180, countInBars: 1 }); // from a tap
 * m.onClick((c) => …);  // ahead of time: c.at is when it sounds, c.accent, c.bar, c.countIn, c.audible
 * m.onBeat((c) => …);   // on the frame it sounds: beat lights
 * m.setTempo(120);      // from the first pulse not yet scheduled
 * m.setFade(fadeLadder(meter)[rung]); // drop clicks (D31); dropped clicks stay on the grid
 * m.timeAtPulse(8);     // a target time, through tempo changes
 * m.stop();
 * ```
 * Accents per meter (`meter.ts`): the bar's downbeat, then each felt beat of
 * a compound or odd grouping. It runs on the Tone Transport, claimed from the
 * progression player (`audio/transport.ts`): starting one stops the other.
 * The fade ladder and `fadeStep` (`fade.ts`) are what D31 climbs.
 *
 * ## Onsets (`onsets.ts`, `mic-onsets.ts`)
 * An `OnsetSource` emits `{ at, kind: 'tap' | 'mic', strength }`. Taps:
 * `createToneTapSource()` then `source.attach(padElement)` (pointer down,
 * Space, Enter). The mic: `createMicOnsetSource()`, a spectral-flux detector
 * in an AudioWorklet; call `start()` from the learner's tap. Tests and e2e:
 * `createFakeOnsetSource()` and `createFakeMetronome()`.
 *
 * ## Latency (`latency.ts`, `device.ts`)
 * Raw onsets are late by the output latency and the learner's own offset.
 * `withLatency(source, () => liveCompensation(kind, settings.timingOffsets), listener)`
 * hands on onsets with both taken off. The tap-to-click calibration
 * (`calibrate.ts`, Settings → Guides and timing) measures the offset per
 * input and saves it to `settings.timingOffsets`.
 *
 * ## Grading (`grade.ts`)
 * ```ts
 * const { offsets, extras } = alignOnsets(targetsMs, compensatedOnsetsMs);
 * const rating = gradeTiming(offsets, ENGINE_CONFIG.timing.grade, { extras: extras.length });
 * const summary = summariseTiming(offsets); // bias: + dragging, − rushing
 * ```
 * On time within ±`onTimeMs` (config `engine/config/timing.ts`), mapped to
 * Again/Hard/Good/Easy in the shape of design §3.2. A drill may pass its own
 * windows (D20: `{ ...cfg, onTimeMs: 30 }`).
 */
export * from './meter';
export * from './tempo';
export * from './fade';
export * from './grade';
export * from './latency';
export * from './clock';
export * from './onsets';
export * from './metronome';
export * from './mic-onsets';
export * from './device';
export * from './calibrate';
export * from './fake-metronome';
