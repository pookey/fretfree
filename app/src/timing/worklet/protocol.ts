/** The name the onset processor registers under, shared by the worklet and the driver. */
export const ONSET_PROCESSOR = 'fretwork-onset';

/** What the worklet posts for each onset. */
export interface OnsetMessage {
  /** When the attack began, in seconds on the AudioContext clock. */
  readonly time: number;
  /** Its spectral flux, normalised (roughly 0–1). */
  readonly strength: number;
}
