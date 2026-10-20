/**
 * Event times onto the audio clock, pure. A tap's `event.timeStamp` is on the
 * page clock (`performance.now()`), but clicks are scheduled on the
 * AudioContext's `currentTime`, so the two must be lined up.
 *
 * `currentTime` moves in steps, a render block at a time, and stands still
 * between them. Sampled against the page clock, `context − page` is a
 * sawtooth whose peaks are the moments a block starts: the upper envelope of
 * the recent samples tracks the audio clock with no more jitter than a
 * sample's own. Its constant bias is part of what the calibration measures.
 */

export interface ClockSync {
  /** Record that the audio clock read `contextMs` when the page clock read `pageMs`. */
  observe(contextMs: number, pageMs: number): void;
  /** `pageMs` on the audio clock; `null` before any sample. */
  toContextMs(pageMs: number): number | null;
}

/** Samples older than `windowMs` (page clock) drop out, so slow drift is followed. */
export function createClockSync(windowMs = 1000): ClockSync {
  const samples: { pageMs: number; offset: number }[] = [];
  return {
    observe(contextMs, pageMs) {
      samples.push({ pageMs, offset: contextMs - pageMs });
      while (samples.length > 1 && samples[0]!.pageMs < pageMs - windowMs) samples.shift();
    },
    toContextMs(pageMs) {
      if (samples.length === 0) return null;
      let offset = -Infinity;
      for (const s of samples) offset = Math.max(offset, s.offset);
      return pageMs + offset;
    },
  };
}

/** What the clock needs from an AudioContext and from the page. */
export interface ClockSources {
  /** The context's `currentTime`, in seconds; `null` while there is no context. */
  contextSeconds(): number | null;
  /** `performance.now()`. */
  pageMs(): number;
}

/**
 * A `ClockSync` fed by sampling both clocks: on every `sample()` and, while
 * started, on a short interval, so there are always recent samples when a tap
 * arrives.
 */
export interface AudioClock {
  start(): void;
  stop(): void;
  sample(): void;
  /** Take a fresh sample, then map `pageMs`. `null` while there is no context. */
  toContextMs(pageMs: number): number | null;
}

export function createAudioClock(
  sources: ClockSources,
  { intervalMs = 15, windowMs = 1000 }: { intervalMs?: number; windowMs?: number } = {},
): AudioClock {
  let sync = createClockSync(windowMs);
  let timer: ReturnType<typeof setInterval> | null = null;
  const sample = () => {
    const seconds = sources.contextSeconds();
    if (seconds !== null) sync.observe(seconds * 1000, sources.pageMs());
  };
  return {
    start() {
      if (timer !== null) return;
      sync = createClockSync(windowMs);
      sample();
      timer = setInterval(sample, intervalMs);
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
    sample,
    toContextMs(pageMs) {
      sample();
      return sync.toContextMs(pageMs);
    },
  };
}
