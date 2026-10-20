import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { useAppStore } from '../../../app-store';
import { useSizeClass } from '../../../shell/size-class';
import { METER_PRESETS, type MeterPresetName } from '../../../timing/meter';
import { METRONOME_CONFIG } from './config';
import { getMetronomeController, type Beat, type MetronomeController } from './controller';
import {
  ACCENT_LABELS,
  METER_NAMES,
  accentFor,
  accentStyles,
  beatCells,
  type AccentStyle,
  type BeatCell,
} from './logic';
import styles from './Metronome.module.css';

const { minBpm, maxBpm, steps } = METRONOME_CONFIG;

/** A click this soon (ms) after a pointer down on Tap tempo is that press, already counted. */
const POINTER_CLICK_MS = 1000;

const UNIT_NAMES: Record<number, string> = {
  2: 'half',
  4: 'quarter',
  8: 'eighth',
  16: 'sixteenth',
};

export interface MetronomeProps {
  /** Default: the app's metronome tool, which keeps its run between visits. */
  controller?: MetronomeController;
}

/**
 * The metronome (design §7 Tools): the timing engine's click (§12), with a
 * tempo slider and ± steps, tap tempo, meter and accent presets, a count-in
 * and a beat light that follows the sound, not the schedule. iPad first: the
 * beat and tempo beside the settings; one column on compact.
 */
export function Metronome({ controller: given }: MetronomeProps) {
  const controller = given ?? getMetronomeController();
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const soundOn = useAppStore((s) => s.settings.soundOn);
  const layout = useSizeClass() === 'compact' ? 'stack' : 'split';
  const cells = useMemo(() => beatCells(state.meter, state.accent), [state.meter, state.accent]);
  const pointerAt = useRef<number | null>(null);

  useEffect(() => controller.openView(), [controller]);

  const unit = UNIT_NAMES[METER_PRESETS[state.meter].unit];

  return (
    <div className={styles.metronome} data-layout={layout}>
      <section className={styles.panel} data-area="beat" aria-label="Tempo">
        <BeatLight cells={cells} beat={state.beat} running={state.running} />
        <p className={styles.bpm}>
          <output data-testid="metronome-bpm" htmlFor="metronome-tempo">
            {state.bpm}
          </output>{' '}
          <span className={styles.bpmUnit}>BPM</span>
        </p>
        <p className={styles.muted}>{unit} notes per minute</p>
        <div className={styles.tempo}>
          <input
            id="metronome-tempo"
            className={styles.slider}
            type="range"
            min={minBpm}
            max={maxBpm}
            step={1}
            value={state.bpm}
            aria-label="Tempo"
            aria-valuetext={`${state.bpm} BPM`}
            onChange={(e) => controller.set({ bpm: Number(e.target.value) })}
          />
          <div className={styles.steps}>
            {[...steps]
              .reverse()
              .map((n) => -n)
              .concat(steps)
              .map((delta) => (
                <button
                  key={delta}
                  type="button"
                  className={styles.step}
                  disabled={delta < 0 ? state.bpm <= minBpm : state.bpm >= maxBpm}
                  onClick={() => controller.set({ bpm: state.bpm + delta })}
                >
                  {delta < 0 ? `−${-delta}` : `+${delta}`}{' '}
                  <span className="visually-hidden">BPM</span>
                </button>
              ))}
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => controller.toggle()}>
            {state.running ? 'Stop' : 'Start'}
          </button>
          <button
            type="button"
            className={styles.tap}
            // Pointer taps count on the way down, where the beat is; keys and
            // assistive tech arrive as a click. A click is that pointer's own
            // only if it follows soon after, so a cancelled press (a scroll,
            // a drag off) never swallows the next key press.
            onPointerDown={(e) => {
              pointerAt.current = e.timeStamp;
              controller.tap(e.timeStamp);
            }}
            onPointerCancel={() => {
              pointerAt.current = null;
            }}
            onClick={(e) => {
              const down = pointerAt.current;
              pointerAt.current = null;
              if (down === null || e.timeStamp - down > POINTER_CLICK_MS)
                controller.tap(e.timeStamp);
            }}
          >
            Tap tempo
          </button>
        </div>
        {!soundOn && (
          <p className={styles.muted} role="note">
            Sound is off in Settings, so the click is silent. The beat light still runs.
          </p>
        )}
      </section>

      <section className={styles.panel} data-area="settings" aria-label="Click settings">
        <Choices
          legend="Meter"
          name="metronome-meter"
          value={state.meter}
          options={METER_NAMES.map((m) => ({ value: m, label: m }))}
          onChange={(meter: MeterPresetName) => controller.set({ meter })}
        />
        <Choices
          legend="Accent"
          name="metronome-accent"
          value={accentFor(state.meter, state.accent)}
          options={accentStyles(state.meter).map((a) => ({
            value: a,
            label: accentLabel(state.meter, a),
          }))}
          onChange={(accent: AccentStyle) => controller.set({ accent })}
        />
        <Choices
          legend="Clicks per beat"
          name="metronome-subdivide"
          value={String(state.subdivide)}
          options={['1', '2', '3', '4'].map((n) => ({ value: n, label: n }))}
          onChange={(n) => controller.set({ subdivide: Number(n) })}
        />
        <Choices
          legend="Count-in"
          name="metronome-count-in"
          value={String(state.countInBars)}
          options={[
            { value: '0', label: 'Off' },
            { value: '1', label: '1 bar' },
            { value: '2', label: '2 bars' },
          ]}
          onChange={(n) => controller.set({ countInBars: Number(n) })}
        />
        <label className={styles.pin}>
          <input
            type="checkbox"
            checked={state.pinned}
            onChange={(e) => controller.set({ pinned: e.target.checked })}
          />
          <span>
            Keep clicking outside Tools
            <span className={styles.muted}>Otherwise the click stops when you leave Tools.</span>
          </span>
        </label>
      </section>
    </div>
  );
}

function accentLabel(meter: MeterPresetName, style: AccentStyle): string {
  const groups = METER_PRESETS[meter].groups;
  return style === 'beats' ? `${ACCENT_LABELS.beats} (${groups.join('+')})` : ACCENT_LABELS[style];
}

/**
 * One pulse per cell, the lit one sounding now. Accents differ by size and
 * shape as well as colour: a large disc on the downbeat, a diamond on each
 * felt beat, a small dot on the rest. The count-in lights cells as outlines.
 */
function BeatLight({
  cells,
  beat,
  running,
}: {
  cells: readonly BeatCell[];
  beat: Beat | null;
  running: boolean;
}) {
  const count = beat ? String(beat.pulse + 1) : running ? '…' : '–';
  return (
    <div
      className={styles.beats}
      data-testid="metronome-beats"
      data-pulse={beat?.pulse ?? ''}
      data-count-in={beat?.countIn ?? false}
      data-at={beat?.at ?? ''}
      aria-hidden
    >
      <p className={styles.countLabel}>{beat?.countIn ? 'Count-in' : ' '}</p>
      <p className={styles.count}>{count}</p>
      <div className={styles.cells}>
        {cells.map((c) => (
          <span
            key={c.pulse}
            className={styles.cell}
            data-accent={c.accent}
            data-group-start={c.groupStart && c.pulse > 0}
            data-lit={beat?.pulse === c.pulse ? (beat.countIn ? 'count-in' : 'on') : undefined}
          />
        ))}
      </div>
    </div>
  );
}

interface Option<T extends string> {
  value: T;
  label: ReactNode;
}

/** A row of radio chips, ≥44pt each. */
function Choices<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className={styles.choices}>
      <legend className={styles.label}>{legend}</legend>
      <div className={styles.chips}>
        {options.map((o) => (
          <label key={o.value} className={styles.chip}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
