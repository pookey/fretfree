import { staffConcept } from '../../engine/items/staff';
import { parseStaffFretItemId } from '../../engine/items/staff-fret';
import { R2_MAX_LEDGERS, positionNaturals } from '../../engine/skills/r2';
import type { GuideLevel, Item } from '../../engine/model';
import {
  TOP_LINE,
  fretForNote,
  inRange,
  isLine,
  midiAt,
  noteAt,
  parseReadingPosition,
  samePosition,
  staffNote,
  staffPosition,
  stringCount,
  type AccidentalPref,
  type FretRange,
  type Position,
  type ReadingPosition,
  type Tuning,
} from '../../theory';
import { displayPc } from '../../theory/pitch-display';
import type { PositionRange, StaffNote } from '../../components/staff';
import { compactWindowFrets, isShortLandscape } from '../../shell/size-class';
import { d2SpanWindow } from '../d2-find-the-note/logic';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D23_SCOPES, type D23Scope } from './meta';

export { D23_ID, D23_SCOPE, D23_SCOPES, d23CanTest, d23ConceptOf, type D23Scope } from './meta';

/**
 * D23 "Staff → fretboard by position" (design §6, §12; research/03 R2): one
 * note on the treble 8vb staff and a reading position; the learner taps where
 * the position plays it. The pure half of the drill. In a position each pitch
 * has one fret, which feedback names; a tap is right on that cell or on the
 * same pitch elsewhere in the drawn frets (9th position's other stretch,
 * `d23InPosition`). The same pitch outside them is out of position.
 */

/** The whole neck the drill draws (design §7 regular-wide). */
export const D23_NECK: FretRange = { from: 0, to: 15 };

/**
 * Every prompt draws the same staff range, R1's ±3 ledger lines plus a step,
 * so the staff and the neck under it stay put while a session interleaves
 * positions.
 */
export const D23_STAFF_RANGE: PositionRange = [
  -(2 * R2_MAX_LEDGERS + 2),
  TOP_LINE + 2 * R2_MAX_LEDGERS + 2,
];

export interface D23Prompt {
  itemId: string;
  /** The sounding pitch on the staff: `G3`. */
  note: string;
  /** Its staff place (0 = bottom line). */
  staff: number;
  position: ReadingPosition;
  /** The one cell the position plays the note on. */
  target: Position;
  /** The frets the position plays, drawn undimmed: its four frets plus any stretch it uses. */
  region: FretRange;
  scope: D23Scope;
  /** Frets that take taps: the region, or the whole neck at the wider scope. */
  activeRange: FretRange;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** The answer is the tapped cell. */
export type D23Answer = Position;

export function d23ScopeFor(level: number): D23Scope {
  const i = Math.max(0, Math.min(D23_SCOPES.length - 1, Math.round(level)));
  return D23_SCOPES[i] as D23Scope;
}

/**
 * The frets a position plays R2's notes on: its four frets, widened to any
 * stretch one of them needs (5th position reaches back to fret 4).
 */
export function d23Region(position: ReadingPosition, tuning: Tuning): FretRange {
  const frets = positionNaturals(position, tuning).map((n) => n.at.fret);
  return {
    from: Math.min(position.frets.from, ...frets),
    to: Math.max(position.frets.to, ...frets),
  };
}

export function d23MakePrompt(item: Item, ctx: DrillContext): D23Prompt {
  const ref = parseStaffFretItemId(item.id);
  const position = ref && parseReadingPosition(ref.position);
  const target = ref && position && fretForNote(ref.note, position, { tuning: ctx.tuning });
  if (!ref || !position || !target) throw new Error(`D23 cannot test item ${item.id}`);
  const scope = d23ScopeFor(ctx.scopeLevel);
  const region = d23Region(position, ctx.tuning);
  return {
    itemId: item.id,
    note: ref.note,
    staff: staffPosition(ref.note),
    position,
    target,
    region,
    scope,
    activeRange: scope === 'neck' ? D23_NECK : region,
    tuning: ctx.tuning,
    accidentalPref: ctx.accidentalPref,
  };
}

/** True if a tap on this cell is an answer (cells outside the live frets are inert). */
export function d23IsLive(prompt: D23Prompt, pos: Position): boolean {
  return (
    pos.string >= 1 &&
    pos.string <= stringCount(prompt.tuning) &&
    inRange(pos.fret, prompt.activeRange)
  );
}

function nameAt(prompt: D23Prompt, pos: Position): string {
  return noteAt(pos, prompt.tuning, prompt.accidentalPref).name;
}

/** The staff place of the note a cell plays, spelled by the learner's preference. */
function placeAt(prompt: D23Prompt, pos: Position): number {
  return staffPosition(nameAt(prompt, pos));
}

/**
 * True if the cell plays the asked pitch inside the position's drawn frets.
 * Usually that is only the target, but 9th position's frets reach both ways
 * (8–13), so F3, G4 and C5 each have a second cell there: s6f13, s2f8 and
 * s2f13, the other stretch. A learner who read the staff right and stayed in
 * the position is right either way (M8-10 review); feedback still names the
 * position's own cell and finger.
 */
export function d23InPosition(prompt: D23Prompt, pos: Position): boolean {
  return (
    pos.string >= 1 &&
    pos.string <= stringCount(prompt.tuning) &&
    inRange(pos.fret, prompt.region) &&
    midiAt(pos, prompt.tuning) === staffNote(prompt.note).midi
  );
}

/**
 * How a wrong tap went wrong:
 * - `same-note`: the right pitch on another cell, out of position;
 * - `misread`: another natural, so the staff was misread (a line for the
 *   space beside it, most often);
 * - `sharp`: a sharp or flat, which no R2 note is: the fret was missed.
 */
export type D23Miss = 'same-note' | 'misread' | 'sharp';

export function d23Miss(prompt: D23Prompt, answer: Position): D23Miss {
  const midi = midiAt(answer, prompt.tuning);
  if (midi === staffNote(prompt.note).midi) return 'same-note';
  return staffNote(nameAt(prompt, answer)).alt === 0 ? 'misread' : 'sharp';
}

export function d23Check(prompt: D23Prompt, answer: D23Answer): DrillCheck {
  const expected = `${displayPc(prompt.note)}, string ${prompt.target.string}, fret ${prompt.target.fret}`;
  const concept = staffConcept(prompt.staff);
  if (samePosition(answer, prompt.target) || d23InPosition(prompt, answer)) {
    return { correct: true, expected, concept };
  }
  // A natural on another staff place is a misread of the staff: log it
  // against that place. A miss to a sharp, or the right note out of
  // position, is a slip on the neck, not a reading confusion.
  if (d23IsLive(prompt, answer) && d23Miss(prompt, answer) === 'misread') {
    const place = placeAt(prompt, answer);
    if (place !== prompt.staff) {
      return { correct: false, expected, concept, confusedWith: staffConcept(place) };
    }
  }
  return { correct: false, expected, concept };
}

export function d23DescribeAnswer(answer: D23Answer): string {
  return `s${answer.string}f${answer.fret}`;
}

/** The note on the staff, and the one tapped when it was wrong (research/02 rule 10). */
export function d23Sounds(prompt: D23Prompt, fb: DrillFeedback<D23Answer>): DrillSounds {
  const expected = [prompt.note];
  return fb.result.correct ? { expected } : { expected, given: [nameAt(prompt, fb.answer)] };
}

export function d23FeedbackPositions(
  prompt: D23Prompt,
  fb: DrillFeedback<D23Answer>,
): { expected: Position[]; given: Position[] } {
  if (!fb.result.correct) return { expected: [prompt.target], given: [fb.answer] };
  // A right tap on the other stretch's cell shows both of the position's cells.
  const expected = samePosition(fb.answer, prompt.target)
    ? [prompt.target]
    : [prompt.target, fb.answer];
  return { expected, given: [] };
}

/** "open position", "5th position": the position's name inside a sentence. */
export function d23PositionName(position: ReadingPosition): string {
  return position.fret === 0 ? 'open position' : position.label;
}

const FINGERS = ['index', 'middle', 'ring', 'little'] as const;

/**
 * Which finger plays a fret in a position (one finger per fret, the index on
 * the position's fret): "the open string", "the ring finger", "the index
 * finger, reaching back a fret".
 */
export function d23Finger(position: ReadingPosition, fret: number): string {
  if (fret === 0) return 'the open string';
  const offset = fret - Math.max(position.fret, 1);
  if (offset < 0) return 'the index finger, reaching back a fret';
  if (offset >= FINGERS.length) return 'the little finger, reaching up a fret';
  return `the ${FINGERS[offset] as string} finger`;
}

/** "G3 in 5th position is string 4, fret 5, the index finger." */
export function d23Where(prompt: D23Prompt): string {
  const { note, position, target } = prompt;
  return `${displayPc(note)} in ${d23PositionName(position)} is string ${target.string}, fret ${target.fret}, ${d23Finger(position, target.fret)}.`;
}

function capitalise(s: string): string {
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

/** Where a misread note sits against the one on the staff: "on the space just above". */
function misreadPlace(place: number, staff: number): string {
  const steps = place - staff;
  const way = steps > 0 ? 'above' : 'below';
  if (Math.abs(steps) === 1) return `on the ${isLine(place) ? 'line' : 'space'} just ${way}`;
  if (Math.abs(steps) === 7) return `an octave ${way}`;
  return `${Math.abs(steps)} steps ${way} on the staff`;
}

/**
 * One line of feedback: the note, the position's cell and the finger that
 * plays it, so sight, name and sound come together (rule 10). A wrong tap
 * says which way it went wrong.
 */
export function d23Explain(prompt: D23Prompt, fb: DrillFeedback<D23Answer>): string {
  const where = d23Where(prompt);
  if (fb.result.correct) {
    if (samePosition(fb.answer, prompt.target)) return where;
    const { string, fret } = fb.answer;
    return `${where} String ${string}, fret ${fret} plays it too, ${d23Finger(prompt.position, fret)}.`;
  }
  const { string, fret } = fb.answer;
  const tapped = displayPc(nameAt(prompt, fb.answer));
  const head = `You tapped string ${string}, fret ${fret}`;
  switch (d23Miss(prompt, fb.answer)) {
    case 'same-note':
      return `${head}: ${tapped} too, but ${d23PositionName(prompt.position)} plays it on string ${prompt.target.string}, fret ${prompt.target.fret}.`;
    case 'misread': {
      const place = placeAt(prompt, fb.answer);
      return `${head}, which is ${tapped}, ${misreadPlace(place, prompt.staff)}. ${where}`;
    }
    case 'sharp':
      return `${head}, which is ${tapped}. ${where}`;
  }
}

/** The position's name and frets for the prompt line: "5th position, frets 5–8". */
export function d23PositionCaption(prompt: D23Prompt): string {
  const { position } = prompt;
  return `${capitalise(d23PositionName(position))}, frets ${position.frets.from}–${position.frets.to}`;
}

/**
 * The notes on the staff: the one asked about, styled as asked while open and
 * correct once answered. A wrong tap adds the tapped note beside it, in its
 * own column, so the misread is seen next to the note, with any sharp it
 * carries (rule 10). Not for the same pitch out of position: the staff can't
 * show where it is played. Every note on the 15-fret neck, G5 at the top,
 * fits `D23_STAFF_RANGE`.
 */
export function d23StaffNotes(prompt: D23Prompt, fb: DrillFeedback<D23Answer> | null): StaffNote[] {
  const asked: StaffNote = {
    pitches: [prompt.note],
    value: 'w',
    style: fb?.result.correct ? 'correct' : 'target',
  };
  if (!fb || fb.result.correct || d23Miss(prompt, fb.answer) === 'same-note') return [asked];
  return [asked, { pitches: [nameAt(prompt, fb.answer)], value: 'w', style: 'wrong' }];
}

/**
 * The neck's guide level. Guides fade as usual (design §3.5): no guide
 * level marks a cell, so nothing shows the answer before the tap, except the
 * worked example's target marker (research/02 rules 4 and 8).
 */
export function d23NeckGuideLevel(guideLevel: GuideLevel, opts: { guided: boolean }): GuideLevel {
  return opts.guided ? 3 : guideLevel;
}

// --- Compact window -------------------------------------------------------

/**
 * Width the staff takes beside the neck on a phone on its side, in rem
 * (D23View.module.css: 11rem tall at one note's 100 × 138 aspect, plus the
 * 0.75rem column gap).
 */
export const D23_SIDE_STAFF_REM = (11 * 100) / 138 + 0.75;

/**
 * The compact window's width in frets. On a phone on its side the staff sits
 * beside the neck, so the window shrinks to what still fits at 44pt cells.
 */
export function d23CompactFrets(
  compactFrets: number | undefined,
  width: number,
  height: number,
  remPx = 16,
): number | undefined {
  if (compactFrets === undefined || !isShortLandscape(width, height)) return compactFrets;
  const staff = Math.ceil(D23_SIDE_STAFF_REM * remPx);
  return Math.min(compactFrets, compactWindowFrets(width - staff, height));
}

/**
 * The compact window: it opens on the position's region, which the prompt
 * names anyway, so it gives nothing away.
 */
export function d23InitialWindow(prompt: D23Prompt, size?: number): FretRange {
  return d2SpanWindow([prompt.region.from, prompt.region.to], D23_NECK, size);
}

/**
 * The frets drawn on iPad portrait: 13, for 44pt cells, sliding up the neck
 * so a high position's region is on screen.
 */
export function d23RegularFrets(prompt: D23Prompt): FretRange {
  const to = Math.min(D23_NECK.to, Math.max(12, prompt.region.to));
  return { from: to - 12, to };
}
