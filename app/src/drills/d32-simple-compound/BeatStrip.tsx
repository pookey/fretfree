import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ENGINE_CONFIG } from '../../engine/config';
import { barLength, beats, clickMeter, pulseLength } from '../../theory';
import { getMetronome, type MetronomeOptions, type Metronome } from '../../timing/metronome';
import { signatureOf } from './logic';
import { beatStrip, stripLabel } from './text';
import styles from './BeatStrip.module.css';

export interface BeatStripProps {
  meter: string;
  /** The timing engine's shared click; tests pass a fake. */
  metronome?: Metronome;
}

/** The click for a meter: its accents, at a steady number of felt beats a minute. */
export function hearOptions(meter: string): MetronomeOptions {
  const ts = signatureOf(meter);
  const { feltBeatsPerMinute, bars } = ENGINE_CONFIG.simpleCompound;
  const pulsesPerBeat = beats(ts)[0]?.pulses ?? 1;
  return {
    meter: clickMeter(ts),
    bpm: feltBeatsPerMinute * pulsesPerBeat,
    countInBars: 0,
    // Silent from the bar after the last, so the run stops on that downbeat.
    fade: (click) => click.bar < bars,
  };
}

/**
 * A bar of a meter as its pulses, grouped into felt beats: each beat's start
 * is a large filled disc with its number, the pulses inside it small rings
 * with their count syllables, so the grouping reads by shape and position,
 * not colour (design §8). "Hear it" plays two bars on the timing engine's
 * click, accented on the felt beats, and lights each pulse as it sounds
 * (sound before symbol, design §12; research/02 rule 10).
 */
export function BeatStrip({ meter, metronome = getMetronome() }: BeatStripProps) {
  const [playing, setPlaying] = useState(false);
  const [lit, setLit] = useState<number | null>(null);
  const playingRef = useRef(false);
  const { bars } = ENGINE_CONFIG.simpleCompound;

  useEffect(() => {
    playingRef.current = playing;
    if (!playing) return;
    const offBeat = metronome.onBeat((click) => {
      if (click.bar >= bars) metronome.stop();
      else setLit(click.pulseInBar);
    });
    const offStop = metronome.onStop(() => setPlaying(false));
    return () => {
      offBeat();
      offStop();
      setLit(null);
    };
  }, [playing, metronome, bars]);

  // A run still playing stops with the strip (the next card).
  useEffect(
    () => () => {
      if (playingRef.current) metronome.stop();
    },
    [metronome],
  );

  const hear = async () => {
    if (playing) {
      metronome.stop();
      return;
    }
    setPlaying(true);
    if (!(await metronome.start(hearOptions(meter)))) setPlaying(false);
  };

  const groups = beatStrip(meter);
  const firstPulse = groups.map((_, b) => groups.slice(0, b).reduce((n, g) => n + g.length, 0));
  // Sized in eighths, so bars of the same length line up: 6/8 over 3/4.
  const ts = signatureOf(meter);
  const eighths = (f: { n: number; d: number }) => (f.n * 8) / f.d;
  const size = {
    '--eighths': eighths(barLength(ts)),
    '--span': eighths(pulseLength(ts)),
  } as CSSProperties;
  return (
    <div className={styles.strip} data-testid="d32-strip" data-meter={meter}>
      <span className={styles.meter} aria-hidden="true">
        {meter}
      </span>
      <div className={styles.beats} style={size} role="img" aria-label={stripLabel(meter)}>
        {groups.map((cells, b) => (
          <span key={b} className={styles.beat}>
            {cells.map((cell, p) => {
              const at = (firstPulse[b] ?? 0) + p;
              return (
                <span
                  key={p}
                  className={styles.cell}
                  data-start={cell.beatStart || undefined}
                  data-lit={lit === at || undefined}
                >
                  <span className={styles.mark} />
                  <span className={styles.label}>{cell.label}</span>
                </span>
              );
            })}
          </span>
        ))}
      </div>
      <button
        type="button"
        className={styles.hear}
        onClick={() => void hear()}
        aria-pressed={playing}
        aria-label={`Hear ${meter}`}
      >
        {playing ? 'Stop' : 'Hear it'}
      </button>
    </div>
  );
}
