import { useEffect, useRef, useState } from 'react';
import { getMetronome, type Metronome } from '../../timing/metronome';
import { d29HearOptions, hearPlan } from './logic';
import styles from './D29View.module.css';

export interface HearBarProps {
  /** The bar in the text form. */
  rhythm: string;
  meter: string;
  /** The button's accessible name: `Hear your bar`. */
  label: string;
  /** The timing engine's shared click; tests pass a fake. */
  metronome?: Metronome;
}

/**
 * Plays a bar on the timing engine's click: a bar of beats to count in, then
 * a click on each note (sound before symbol, design §12; research/02 rule 10).
 * A second tap stops it, as does the next card.
 */
export function HearBar({ rhythm, meter, label, metronome = getMetronome() }: HearBarProps) {
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);

  useEffect(() => {
    playingRef.current = playing;
    if (!playing) return;
    const { endPulse } = hearPlan(rhythm, meter);
    const offBeat = metronome.onBeat((click) => {
      if (!click.countIn && click.pulse >= endPulse) metronome.stop();
    });
    const offStop = metronome.onStop(() => setPlaying(false));
    return () => {
      offBeat();
      offStop();
    };
  }, [playing, metronome, rhythm, meter]);

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
    if (!(await metronome.start(d29HearOptions(rhythm, meter)))) setPlaying(false);
  };

  return (
    <button
      type="button"
      className={styles.hear}
      onClick={() => void hear()}
      aria-pressed={playing}
      aria-label={label}
    >
      {playing ? 'Stop' : label}
    </button>
  );
}
