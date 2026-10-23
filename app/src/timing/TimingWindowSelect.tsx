import { useAppStore } from '../app-store';
import { ENGINE_CONFIG } from '../engine/config';
import type { TimingWindow } from '../engine/model';

const TIMING_WINDOWS: { value: TimingWindow; label: string }[] = [
  { value: 'strict', label: 'Strict' },
  { value: 'standard', label: 'Standard' },
  { value: 'relaxed', label: 'Relaxed' },
];

export interface TimingWindowSelectProps {
  className?: string;
  'aria-describedby'?: string;
}

/**
 * The learner's rhythm timing window (`settings.timingWindow`), saved on
 * change: in Settings, and on D20's feedback after a failed rep. Wrap it in
 * a `<label>`.
 */
export function TimingWindowSelect({
  className,
  'aria-describedby': describedBy,
}: TimingWindowSelectProps) {
  const value = useAppStore((s) => s.settings.timingWindow);
  const update = useAppStore((s) => s.update);
  return (
    <select
      className={className}
      value={value}
      aria-describedby={describedBy}
      onChange={(e) => void update({ timingWindow: e.target.value as TimingWindow })}
    >
      {TIMING_WINDOWS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}: within {ENGINE_CONFIG.rhythm.windows[o.value].onTimeMs} ms
        </option>
      ))}
    </select>
  );
}
