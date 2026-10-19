/** The name the pitch processor registers under, shared by the worklet and the driver. */
export const PITCH_PROCESSOR = 'fretwork-pitch';

/** What the worklet posts for each analysis frame. */
export interface PitchMessage {
  /** Detected fundamental in Hz; 0 when unvoiced. */
  readonly frequency: number;
  /** pitchy's clarity, 0–1. */
  readonly clarity: number;
  /** End of the analysed window, in seconds on the AudioContext clock. */
  readonly time: number;
}
