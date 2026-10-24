import {
  beamGroups,
  eventStarts,
  fracToNumber,
  parseRhythm,
  parseTimeSignature,
  pulseLength,
  rhythmLength,
} from '../../theory';

/**
 * The layout of one bar on the drill's rhythm staff, in SVG units: one
 * staff line with the notes on it, stems up, eighths beamed by the meter's
 * beats (`beamGroups`). A rhythm staff, not five lines and a clef: the form
 * is the point, and reading pitches is Track R's (design §12). Each bar is
 * its own SVG so bars wrap onto a new line as notation does, and so each is
 * its own ≥44pt tap target.
 */

export const SHEET_H = 100;
export const LINE_Y = 60;
/** The barline's reach above and below the line. */
export const BAR_REACH = 16;
export const STEM_TOP = 30;
export const VOLTA_Y = 10;

/** Width per pulse: a quarter in x/4, an eighth in x/8. */
const PULSE_W: Record<number, number> = { 2: 60, 4: 32, 8: 18 };
const PAD_L = 8;
const PAD_R = 8;
const TIME_W = 30;
const REPEAT_W = 16;
/** Room added before every note after the first, so short notes don't touch. */
const NOTE_GAP = 5;
/** From a note's start to its head's centre. */
const HEAD_IN = 9;
export const HEAD_RX = 6.4;
/** The stem sits on the head's right edge. */
export const STEM_DX = 5.6;

export interface DrawnNote {
  /** The head's centre. */
  x: number;
  hollow: boolean;
  stem: boolean;
  /** Flags on an eighth that isn't beamed. */
  flags: number;
  dots: number;
}

export interface BarLayout {
  width: number;
  notes: DrawnNote[];
  /** Beams as stem x pairs. */
  beams: [number, number][];
  /** Where the notes start, after the time signature and a begin repeat. */
  noteStart: number;
}

export interface BarSigns {
  timeSignature?: boolean;
  repeatStart?: boolean;
  repeatEnd?: boolean;
}

export function layoutBar(rhythm: string, meter: string, signs: BarSigns = {}): BarLayout {
  const ts = parseTimeSignature(meter);
  const events = parseRhythm(rhythm);
  const pulse = fracToNumber(pulseLength(ts));
  const unit = PULSE_W[ts.bottom] ?? 32;
  const noteStart = PAD_L + (signs.timeSignature ? TIME_W : 0) + (signs.repeatStart ? REPEAT_W : 0);
  const starts = eventStarts(events).map((s) => fracToNumber(s) / pulse);
  // Spaced by time, so a short pickup is a narrow bar, as notation draws it.
  const content = Math.max(
    36,
    (fracToNumber(rhythmLength(events)) / pulse) * unit + 6 + (events.length - 1) * NOTE_GAP,
  );
  const width = Math.round(noteStart + content + PAD_R + (signs.repeatEnd ? REPEAT_W : 0));

  const beamed = new Set<number>();
  const groups = beamGroups(events, ts);
  for (const g of groups) for (const i of g) beamed.add(i);
  const notes = events.map((e, i): DrawnNote => {
    const x = noteStart + (starts[i] ?? 0) * unit + i * NOTE_GAP + HEAD_IN;
    return {
      x,
      hollow: e.value <= 2,
      stem: e.value >= 2,
      flags: e.value >= 8 && !beamed.has(i) ? Math.log2(e.value) - 2 : 0,
      dots: e.dots ?? 0,
    };
  });
  const beams = groups.map((g): [number, number] => [
    (notes[g[0] as number]?.x ?? 0) + STEM_DX,
    (notes[g[g.length - 1] as number]?.x ?? 0) + STEM_DX,
  ]);
  return { width, notes, beams, noteStart };
}
